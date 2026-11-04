/* js/notebook-check.js — Notebook check screen (Nov 2026)
   Shared by My School's Academics (principal) and the Teacher App (office staff),
   so both see exactly the same check screen.
   NotebookCheck(el, api)  — api(action, data) must return a Promise of the /api/teacher-app answer.
   Flow: pick a class → pick a subject (teacher shown) → the server picks children at random →
   mark each notebook Corrected / Partly / Not corrected / Didn't bring → Save. */
(function () {
  "use strict";
  var CSS = ".nbk{display:flex;flex-direction:column;gap:12px;font-size:15px}" +
    ".nbk .nbh{font-family:Cinzel,serif;color:#6B0F1A;font-size:1.02rem;margin:4px 0 0;font-weight:700}" +
    ".nbk .nbsm{font-size:.82rem;color:#6E5A4E}" +
    ".nbk .nbchips{display:flex;flex-wrap:wrap;gap:7px}" +
    ".nbk .nbchip{min-height:42px;padding:4px 14px;border-radius:999px;border:1.5px solid #EDD9A3;background:#FFFBF4;color:#2A1A14;font-weight:800;cursor:pointer;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.15;font-family:inherit}" +
    ".nbk .nbchip small{font-size:.7rem;font-weight:700;color:#6E5A4E}" +
    ".nbk .nbchip.on{background:#6B0F1A;border-color:#6B0F1A;color:#fff}.nbk .nbchip.on small{color:#F5E6C8}" +
    ".nbk .nbchip.full{border-color:#2E7D4F}" +
    ".nbk .nbsubs{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}" +
    ".nbk .nbsub{text-align:left;background:#FFFBF4;border:1.5px solid #EDD9A3;border-left:5px solid #C9A84C;border-radius:12px;padding:10px 12px;cursor:pointer;font-family:inherit;color:#2A1A14}" +
    ".nbk .nbsub b{display:block;font-size:.95rem}.nbk .nbsub span{font-size:.8rem;color:#6E5A4E}" +
    ".nbk .nbsub.full{border-left-color:#2E7D4F}.nbk .nbsub.on{background:#FFF3C4;border-color:#C9A84C}" +
    ".nbk .nbcard{background:#FFFBF4;border:1px solid #EDD9A3;border-radius:14px;padding:12px 14px}" +
    ".nbk .nbkid{border-top:1px solid #EDD9A3;padding:10px 0}.nbk .nbkid:first-of-type{border-top:none}" +
    ".nbk .nbkid .nm{font-weight:900}.nbk .nbkid .nm small{font-weight:600;color:#6E5A4E}" +
    ".nbk .nbres{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:7px}" +
    "@media (max-width:480px){.nbk .nbres{grid-template-columns:repeat(2,minmax(0,1fr))}}" +
    ".nbk .nbres button{min-height:44px;border-radius:10px;border:1.5px solid #EDD9A3;background:#fff;font-weight:800;font-size:.82rem;cursor:pointer;font-family:inherit;color:#2A1A14}" +
    ".nbk .nbres button.on.r-corrected{background:#2E7D4F;border-color:#2E7D4F;color:#fff}" +
    ".nbk .nbres button.on.r-partly{background:#F2CC74;border-color:#8A6418;color:#3A2A00}" +
    ".nbk .nbres button.on.r-not_corrected{background:#A3241B;border-color:#A3241B;color:#fff}" +
    ".nbk .nbres button.on.r-not_brought{background:#6E5A4E;border-color:#6E5A4E;color:#fff}" +
    ".nbk .nbnote{width:100%;margin-top:6px;min-height:38px;border:1.5px solid #EDD9A3;border-radius:8px;padding:6px 9px;font-family:inherit;font-size:.88rem;box-sizing:border-box}" +
    ".nbk .nbrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
    ".nbk .nbbtn{min-height:44px;border-radius:10px;padding:8px 16px;font-weight:900;cursor:pointer;font-family:inherit;border:1.5px solid #6B0F1A;background:#fff;color:#6B0F1A}" +
    ".nbk .nbbtn.pri{background:#6B0F1A;color:#E8C96A}.nbk .nbbtn:disabled{opacity:.5;cursor:default}" +
    ".nbk select.nbsel,.nbk input.nbin{min-height:42px;border:1.5px solid #EDD9A3;border-radius:8px;padding:4px 8px;font-family:inherit;font-size:.9rem;background:#fff}" +
    ".nbk .nbmsg{font-weight:800;font-size:.88rem}.nbk .nbmsg.bad{color:#A3241B}.nbk .nbmsg.ok{color:#2E7D4F}" +
    ".nbk .nberr{background:#FBE7E3;border:1px solid #A3241B;color:#5E120C;border-radius:12px;padding:11px 14px;font-weight:700}" +
    ".nbk .nbtodo{background:#FCF1D9;border:1px solid #D9A13B;border-radius:12px;padding:10px 13px;font-size:.88rem}";
  var RES = [["corrected", "✓ Corrected"], ["partly", "Partly"], ["not_corrected", "✗ Not corrected"], ["not_brought", "Didn't bring"]];
  function h(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

  window.NotebookCheck = function (el, api) {
    if (!document.getElementById("nbk-css")) { var s = document.createElement("style"); s.id = "nbk-css"; s.textContent = CSS; document.head.appendChild(s); }
    var S = { data: null, cls: "", sub: "", pick: null, marks: {}, extra: [], msg: "", msgOk: false, busy: false };

    async function loadClasses() {
      el.innerHTML = '<div class="nbk"><div class="nbsm">Loading classes…</div></div>';
      var d = await api("nb_classes");
      if (!d || !d.success) { el.innerHTML = '<div class="nbk"><div class="nberr">' + h((d && d.error) || "Could not load the classes.") + '</div><div><button type="button" class="nbbtn" data-nb="retry">Try again</button></div></div>'; wire(); return; }
      S.data = d;
      var names = d.classes.map(function (c) { return c.class_name; });
      if (names.indexOf(S.cls) === -1) {
        // open on the first class that still has notebooks to check this week
        var todo = d.classes.find(function (c) { return c.subjects.some(function (s) { return s.done_week < d.per_week; }); });
        S.cls = (todo || d.classes[0] || {}).class_name || "";
      }
      draw();
    }
    function cls() { return S.data && S.data.classes.find(function (c) { return c.class_name === S.cls; }); }
    async function openSub(sub) {
      S.sub = sub; S.pick = null; S.marks = {}; S.extra = []; S.msg = ""; draw();
      var d = await api("nb_pick", { class_name: S.cls, subject: sub });
      if (S.sub !== sub) return;
      S.pick = d && d.success ? d : { error: (d && d.error) || "Could not pick the children." };
      draw();
    }
    function rolls() { return S.pick && S.pick.pick ? S.pick.pick.concat(S.extra.filter(function (r) { return S.pick.pick.indexOf(r) === -1; })) : S.extra.slice(); }
    function kidName(r) { var k = S.pick && (S.pick.kids || []).find(function (x) { return String(x.roll) === String(r); }); return k ? k.name : ""; }

    function draw() {
      var d = S.data, c = cls(), html = '<div class="nbk">';
      if (!d.classes.length) {
        el.innerHTML = html + '<div class="nbtodo">No classes yet. Add each teacher\'s classes and subjects in <b>School Admin → My Teachers</b> first — the check uses them to know whose notebook it is.</div></div>'; return;
      }
      html += '<div class="nbsm">Check <b>' + d.per_week + '</b> notebook' + (d.per_week > 1 ? 's' : '') + ' for each class and subject every week. Children are picked at random, so teachers cannot guess whose notebook comes next.</div>';
      html += '<div class="nbchips">' + d.classes.map(function (x) {
        var full = x.subjects.filter(function (s) { return s.done_week >= d.per_week; }).length;
        return '<button type="button" class="nbchip' + (x.class_name === S.cls ? ' on' : '') + (full === x.subjects.length ? ' full' : '') + '" data-nbc="' + h(x.class_name) + '">' + h(x.class_name) + '<small>' + (full === x.subjects.length ? '✓ all done' : full + ' of ' + x.subjects.length + ' done') + '</small></button>';
      }).join("") + '</div>';
      if (c) {
        html += '<div class="nbh">' + h(c.class_name) + ' — pick a subject</div><div class="nbsubs">' + c.subjects.map(function (s) {
          var full = s.done_week >= d.per_week;
          return '<button type="button" class="nbsub' + (full ? ' full' : '') + (s.subject === S.sub ? ' on' : '') + '" data-nbs="' + h(s.subject) + '"><b>' + h(s.subject) + '</b><span>' + h(s.teacher) + ' · ' + (full ? '✓ ' : '') + s.done_week + ' of ' + d.per_week + ' this week</span></button>';
        }).join("") + '</div>';
      }
      if (S.sub && c) {
        html += '<div class="nbcard">';
        if (!S.pick) html += '<div class="nbsm">Picking children…</div>';
        else if (S.pick.error) html += '<div class="nberr">' + h(S.pick.error) + '</div>';
        else {
          var p = S.pick, list = rolls();
          html += '<div class="nbh" style="margin-top:0">' + h(p.class_name) + ' · ' + h(p.subject) + ' <span class="nbsm">— teacher ' + h(p.teacher) + '</span></div>';
          if (!p.kids.length) html += '<div class="nbtodo" style="margin-top:8px">This class has no children list here, so add the roll numbers you want to check below.</div>';
          else html += '<div class="nbsm" style="margin:4px 0 6px">Ask these children for their ' + h(p.subject) + ' notebook and look at the last few pages.' + ((p.checked_today || []).length ? ' Already checked today: roll ' + h(p.checked_today.join(", ")) + '.' : '') + '</div>';
          list.forEach(function (r) {
            var m = S.marks[r] || {};
            html += '<div class="nbkid"><div class="nm">Roll ' + h(r) + (kidName(r) ? ' <small>· ' + h(kidName(r)) + '</small>' : '') + '</div><div class="nbres">' +
              RES.map(function (x) { return '<button type="button" class="r-' + x[0] + (m.result === x[0] ? ' on' : '') + '" data-nbr="' + h(r) + '" data-v="' + x[0] + '" aria-pressed="' + (m.result === x[0]) + '">' + x[1] + '</button>'; }).join("") +
              '</div>' + (m.result && m.result !== "corrected" ? '<input class="nbnote" maxlength="200" data-nbn="' + h(r) + '" placeholder="Note (optional), e.g. last 3 days not corrected" value="' + h(m.note || "") + '" aria-label="Note for roll ' + h(r) + '"/>' : '') + '</div>';
          });
          var others = (p.kids || []).filter(function (k) { return list.indexOf(String(k.roll)) === -1; });
          html += '<div class="nbrow" style="margin-top:8px">' + (others.length
            ? '<label class="nbsm" for="nbadd">Check one more:</label><select class="nbsel" id="nbadd"><option value="">Choose a child</option>' + others.map(function (k) { return '<option value="' + h(k.roll) + '">Roll ' + h(k.roll) + (k.name ? ' · ' + h(k.name) : '') + '</option>'; }).join("") + '</select>'
            : (!p.kids.length ? '<label class="nbsm" for="nbaddr">Roll number:</label><input class="nbin" id="nbaddr" maxlength="10" style="width:90px"/><button type="button" class="nbbtn" data-nb="addroll">Add</button>' : '')) + '</div>';
          var n = list.filter(function (r) { return S.marks[r] && S.marks[r].result; }).length;
          html += '<div class="nbrow" style="margin-top:12px"><button type="button" class="nbbtn pri" data-nb="save"' + (n && !S.busy ? '' : ' disabled') + '>' + (S.busy ? 'Saving…' : 'Save ' + n + ' notebook' + (n === 1 ? '' : 's')) + '</button>' +
            '<button type="button" class="nbbtn" data-nb="repick">Pick other children</button></div>';
        }
        html += '</div>';
      }
      html += '<div class="nbmsg ' + (S.msgOk ? 'ok' : 'bad') + '" role="status">' + h(S.msg) + '</div>';
      el.innerHTML = html + '</div>';
      wire();
    }
    function wire() {
      el.querySelectorAll("[data-nbc]").forEach(function (b) { b.onclick = function () { S.cls = b.getAttribute("data-nbc"); S.sub = ""; S.pick = null; S.msg = ""; draw(); }; });
      el.querySelectorAll("[data-nbs]").forEach(function (b) { b.onclick = function () { openSub(b.getAttribute("data-nbs")); }; });
      el.querySelectorAll("[data-nbr]").forEach(function (b) { b.onclick = function () {
        var r = b.getAttribute("data-nbr"), v = b.getAttribute("data-v"), m = S.marks[r] || {};
        S.marks[r] = m.result === v ? { note: m.note } : { result: v, note: m.note || "" }; S.msg = ""; draw(); }; });
      el.querySelectorAll("[data-nbn]").forEach(function (t) { t.oninput = function () { var r = t.getAttribute("data-nbn"); S.marks[r] = S.marks[r] || {}; S.marks[r].note = t.value; }; });
      var add = el.querySelector("#nbadd"); if (add) add.onchange = function () { if (add.value) { S.extra.push(add.value); draw(); } };
      el.querySelectorAll("[data-nb]").forEach(function (b) { b.onclick = async function () {
        var k = b.getAttribute("data-nb");
        if (k === "retry") return loadClasses();
        if (k === "repick") { var any = Object.keys(S.marks).some(function (r) { return S.marks[r] && S.marks[r].result; }); if (any && !confirm("Your marks on this screen are not saved yet. Pick other children anyway?")) return; return openSub(S.sub); }
        if (k === "addroll") { var v = String((el.querySelector("#nbaddr") || {}).value || "").trim(); if (v && rolls().indexOf(v) === -1) { S.extra.push(v); draw(); } return; }
        if (k === "save") {
          var rows = rolls().filter(function (r) { return S.marks[r] && S.marks[r].result; }).map(function (r) { return { roll: r, name: kidName(r), result: S.marks[r].result, note: S.marks[r].note || "" }; });
          if (!rows.length) return;
          S.busy = true; draw();
          var d = await api("nb_save", { class_name: S.cls, subject: S.sub, rows: rows });
          S.busy = false;
          if (!d || !d.success) { S.msg = (d && d.error) || "Could not save. Please try again."; S.msgOk = false; draw(); return; }
          var sc = d.score || {}, sub = S.sub;
          var nd = await api("nb_classes"); if (nd && nd.success) S.data = nd;
          S.sub = ""; S.pick = null; S.marks = {}; S.extra = [];
          S.msg = "✓ Saved " + d.saved + " notebook" + (d.saved === 1 ? "" : "s") + " for " + S.cls + " " + sub + (sc.seen ? " — " + sc.corrected + " corrected, " + sc.partly + " partly, " + sc.not_corrected + " not corrected" : "") + ". Pick the next subject."; S.msgOk = true;
          draw();
        }
      }; });
    }
    loadClasses();
    return { reload: loadClasses };
  };
})();
