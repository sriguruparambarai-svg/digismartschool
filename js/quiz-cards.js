/* js/quiz-cards.js — DigiSmart (Oct 2026)
   Answer cards for the CLASS QUIZ in Social, Science, English and Hindi Class.
   Same phone scanner and live link as Science Mystery's quick check:
     projector opens a 4-digit code → teacher's phone opens card-scanner.html
     with that code → each child's card (card number = roll number) and the
     letter they chose appear here.
   Everything still works without a phone: the teacher just taps Most / Half / Few.
   Only card numbers and letters travel — names come from the school's own
   student list (js/class-roster.js) and are never saved with the results. */
(function () {
  if (window.QC) return;
  var LETTERS = 'ABCD';
  var LIVE = { code: '', timer: null, answers: {}, q: -1, styled: false };

  function call(body) {
    return fetch('/api/live-answers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); }

  function styles() {
    if (LIVE.styled) return;
    LIVE.styled = true;
    var st = document.createElement('style');
    st.textContent =
      '.qc-opts{max-width:760px;margin:0 auto 14px;text-align:left;}' +
      '.qc-opt{display:flex;align-items:center;gap:12px;background:rgba(201,168,76,0.08);border:1.5px solid rgba(201,168,76,0.45);' +
        'border-radius:12px;padding:9px 14px;margin-bottom:8px;font-size:clamp(0.95rem,1.8vw,1.25rem);color:#f5ead6;}' +
      '.qc-opt .qc-l{flex:0 0 34px;height:34px;border-radius:50%;background:var(--gold,#C9A84C);color:#2a1505;' +
        'display:flex;align-items:center;justify-content:center;font-weight:900;}' +
      '.qc-opt .qc-t{flex:1;}' +
      '.qc-opt .qc-n{font-weight:900;color:var(--gold,#C9A84C);min-width:28px;text-align:right;}' +
      '.qc-opt.right{border-color:#4cc27a;background:rgba(60,150,80,0.22);}' +
      '.qc-opt.dim{opacity:0.45;}' +
      '.qc-live{font-size:0.82rem;color:var(--sandal,#E8C99A);margin:10px auto 0;max-width:760px;}' +
      '.qc-live b{color:var(--gold,#C9A84C);letter-spacing:2px;font-size:1rem;}' +
      '.qc-sug{outline:3px solid #ffd76a;outline-offset:2px;}' +
      '.qc-kids{max-width:760px;margin:12px auto 0;text-align:left;font-size:0.85rem;color:#f5ead6;}' +
      '.qc-kids h4{color:var(--gold,#C9A84C);margin-bottom:6px;font-size:0.9rem;}' +
      '.qc-kids span{display:inline-block;background:rgba(232,201,154,.1);border:1px solid rgba(201,168,76,.35);' +
        'border-radius:8px;padding:2px 8px;margin:0 6px 6px 0;font-weight:700;}' +
      '.qc-kids span.low{border-color:#e08a7a;color:#f3c0b4;}' +
      '.qc-kids small{opacity:.7;margin-right:4px;}';
    document.head.appendChild(st);
  }

  window.QC = {
    /* Extra words for the quiz prompt: 3 choices per question, one of them the answer. */
    promptAddon: ' Also give each question exactly 3 short answer CHOICES for answer cards in "o": ' +
      'the correct answer (word for word the same as "a") and 2 believable wrong answers from the same lesson. ' +
      'Choices in the same language as the question. ' +
      'Reply ONLY with JSON: [{"q":"question","a":"short answer","o":["choice","choice","choice"]}] — exactly 5 items, nothing else.',

    /* Turns the AI's "o" list into shuffled choices + the right letter (k).
       A question whose choices don't contain the answer just has none — the
       chorus quiz still works for it. */
    prepare: function (item, raw) {
      var a = String(item.a || '');
      var o = Array.isArray(raw && raw.o) ? raw.o : [];
      o = o.map(function (x) { return String(x || '').trim().substring(0, 120); }).filter(Boolean);
      var seen = {}, uniq = [];
      o.forEach(function (x) { var n = norm(x); if (n && !seen[n]) { seen[n] = 1; uniq.push(x); } });
      var hasA = uniq.some(function (x) { return norm(x) === norm(a); });
      if (!hasA && uniq.length >= 2) { uniq = [a].concat(uniq.slice(0, 2)); hasA = true; }
      if (!hasA || uniq.length < 3) return item;
      uniq = uniq.slice(0, 3).map(function (x) { return norm(x) === norm(a) ? a : x; });   // right choice reads exactly like the answer
      for (var i = uniq.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)); var t = uniq[i]; uniq[i] = uniq[j]; uniq[j] = t;
      }
      var k = 0;
      uniq.forEach(function (x, n) { if (norm(x) === norm(a)) k = n; });
      item.o = uniq; item.k = k;
      return item;
    },

    has: function (item) { return !!(item && Array.isArray(item.o) && item.o.length >= 2 && typeof item.k === 'number'); },

    /* Opens the 4-digit class code once per quiz (only if some question has choices). */
    open: function (questions) {
      styles();
      LIVE.answers = {}; LIVE.q = -1;
      if (!(questions || []).some(QC.has)) return Promise.resolve('');
      if (LIVE.code) return Promise.resolve(LIVE.code);
      return call({ action: 'create' })
        .then(function (d) { if (d && d.code) LIVE.code = String(d.code); return LIVE.code; })
        .catch(function () { return ''; });
    },

    /* HTML for the choices + the phone line, placed under the question. */
    html: function (item) {
      if (!QC.has(item)) return '';
      var out = '<div class="qc-opts" id="qc-opts">' + item.o.map(function (o, n) {
        return '<div class="qc-opt" data-n="' + n + '"><span class="qc-l">' + LETTERS.charAt(n) + '</span>' +
               '<span class="qc-t">' + esc(o) + '</span><span class="qc-n"></span></div>';
      }).join('') + '</div>';
      if (LIVE.code) {
        out += '<div class="qc-live">📷 Answer cards: on the phone open ' + esc(location.host) +
               '/card-scanner.html — code <b>' + esc(LIVE.code) + '</b> <span id="qc-live-n"></span></div>';
      }
      return out;
    },

    /* Tells the phone which question is being asked and starts listening. */
    ask: function (i, total, title, item) {
      clearTimeout(LIVE.timer); LIVE.timer = null;
      LIVE.answers = {}; LIVE.q = i;
      if (!LIVE.code || !QC.has(item)) return;
      call({ action: 'state_set', code: LIVE.code, state: { q: i, phase: 'ask', total: total || 0, title: title || '' } }).catch(function () {});
      var tick = function () {
        if (LIVE.q !== i) return;
        call({ action: 'answers_get', code: LIVE.code, q: i }).then(function (d) {
          if (LIVE.q !== i) return;
          LIVE.answers = (d && d.answers) || {};
          var n = Object.keys(LIVE.answers).length, el = document.getElementById('qc-live-n');
          if (el) el.textContent = n ? (n === 1 ? '· 1 card answered' : '· ' + n + ' cards answered') : '';
        }).catch(function () {}).then(function () {
          if (LIVE.q === i && LIVE.timer !== 'stop') LIVE.timer = setTimeout(tick, 2000);
        });
      };
      tick();
    },

    /* Show Answer: final read of the cards, mark the right choice, show counts,
       and highlight the suggested rating button (rateBox holds the 3 buttons,
       each with data-r="3|2|1"). */
    reveal: function (i, item, rateBox) {
      clearTimeout(LIVE.timer); LIVE.timer = 'stop';
      if (!QC.has(item)) return Promise.resolve();
      var done = function () {
        var opts = document.querySelectorAll('#qc-opts .qc-opt');
        var cards = LIVE.answers || {}, nums = Object.keys(cards);
        var per = { A: 0, B: 0, C: 0, D: 0 };
        nums.forEach(function (k) { per[cards[k]] = (per[cards[k]] || 0) + 1; });
        for (var x = 0; x < opts.length; x++) {
          var n = parseInt(opts[x].getAttribute('data-n'), 10);
          opts[x].classList.add(n === item.k ? 'right' : 'dim');
          if (nums.length) opts[x].querySelector('.qc-n').textContent = per[LETTERS.charAt(n)] || 0;
        }
        if (!nums.length) return;
        var right = per[LETTERS.charAt(item.k)] || 0, pct = Math.round(100 * right / nums.length);
        var sug = pct >= 70 ? 3 : (pct >= 40 ? 2 : 1);
        if (rateBox) {
          var b = rateBox.querySelector('[data-r="' + sug + '"]');
          if (b) b.classList.add('qc-sug');
        }
        var el = document.getElementById('qc-live-n');
        if (el) el.textContent = '· Cards: ' + right + ' of ' + nums.length + ' right (' + pct + '%)';
      };
      if (!LIVE.code) { done(); return Promise.resolve(); }
      call({ action: 'state_set', code: LIVE.code, state: { q: i, phase: 'reveal' } }).catch(function () {});
      return call({ action: 'answers_get', code: LIVE.code, q: i })
        .then(function (d) { if (d && d.answers) LIVE.answers = d.answers; })
        .catch(function () {})
        .then(done);
    },

    /* Adds the card results to a result record, if any cards were read. */
    record: function (rec, item) {
      var cards = LIVE.answers || {};
      if (QC.has(item) && Object.keys(cards).length) {
        rec.correct = LETTERS.charAt(item.k);
        rec.cards = cards;
      }
      LIVE.answers = {};
      return rec;
    },

    /* End of quiz: tell the phone, and show each child's score (names from the
       school's student list when there is one). Fills the element with id boxId. */
    finish: function (results, cls, boxId) {
      clearTimeout(LIVE.timer); LIVE.timer = 'stop'; LIVE.q = -1;
      if (LIVE.code) call({ action: 'state_set', code: LIVE.code, state: { q: -1, phase: 'done' } }).catch(function () {});
      var sc = {};
      (results || []).forEach(function (r) {
        if (!r.cards || !r.correct) return;
        for (var k in r.cards) { sc[k] = sc[k] || { r: 0, n: 0 }; sc[k].n++; if (r.cards[k] === r.correct) sc[k].r++; }
      });
      var keys = Object.keys(sc);
      var box = document.getElementById(boxId);
      if (!box || !keys.length) return;
      keys.sort(function (a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0); });
      var draw = function (names, why) {
        names = names || {};
        var low = [];
        var chips = keys.map(function (k) {
          var s = sc[k], isLow = s.n && (s.r / s.n) < 0.5;
          if (isLow) low.push(names[k] || ('Card ' + k));
          return '<span class="' + (isLow ? 'low' : '') + '"><small>' + esc(k) + '</small>' +
                 esc(names[k] || '') + ' ' + s.r + '/' + s.n + '</span>';
        }).join('');
        box.innerHTML = '<div class="qc-kids"><h4>Each child (card number = roll number)</h4>' + chips +
          (low.length ? '<div style="margin-top:6px;color:#f3c0b4;">Needs another look: ' + low.map(esc).join(', ') + '</div>' : '') +
          (why ? '<div style="margin-top:6px;opacity:.7;">' + esc(why) + '</div>' : '') + '</div>';
      };
      draw({}, '');
      if (window.dssRoster && cls) {
        window.dssRoster(cls).then(function (r) { draw(r.names, r.error); }).catch(function () {});
      }
    }
  };
})();
