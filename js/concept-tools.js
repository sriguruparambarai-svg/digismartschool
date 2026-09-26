/* DigiSmart concept class toolbox.
   Each tool draws on the chalkboard (SVG, viewBox 640x480) and may add buttons/sliders to the side panel.
   Signature: tool(h, ctl, p, api) -> optional cleanup function
     h   = drawing helpers bound to the board
     ctl = panel element for this screen's buttons/sliders
     p   = the "board" object from the lesson file (tool settings)
     api = { setAsk(obj) }  lets a tool take over the Space key / Ask button
   New tools: add a function below and a one-line entry in ConceptTools.catalogue. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const CX = 320, CY = 240, R = 130, SC = 26; // circle tools: 130px = 5 cm

  function helpers(svg) {
    const el = (tag, attrs = {}, parent = svg) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(n);
      return n;
    };
    const txt = (x, y, s, cls = "t", parent = svg, extra = {}) => {
      const t = el("text", Object.assign({ x, y, class: cls }, extra), parent);
      t.textContent = s;
      return t;
    };
    const setLine = (n, a, b) => {
      n.setAttribute("x1", a.x); n.setAttribute("y1", a.y);
      n.setAttribute("x2", b.x); n.setAttribute("y2", b.y);
    };
    const svgPoint = e => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    const makeDrag = (node, onMove) => {
      node.addEventListener("pointerdown", e => {
        e.preventDefault();
        node.setPointerCapture(e.pointerId);
        const move = ev => onMove(svgPoint(ev));
        const up = () => {
          node.removeEventListener("pointermove", move);
          node.removeEventListener("pointerup", up);
          node.removeEventListener("pointercancel", up);
        };
        node.addEventListener("pointermove", move);
        node.addEventListener("pointerup", up);
        node.addEventListener("pointercancel", up);
        onMove(svgPoint(e));
      });
    };
    const markPath = (P, u, t, s = 16) =>
      `M${P.x + s * u.x} ${P.y + s * u.y} L${P.x + s * u.x + s * t.x} ${P.y + s * u.y + s * t.y} L${P.x + s * t.x} ${P.y + s * t.y}`;
    const rightMark = (P, u, t, parent = svg, s = 16) => el("path", { d: markPath(P, u, t, s), class: "mark" }, parent);
    const drawCircle = () => {
      el("circle", { cx: CX, cy: CY, r: R, class: "cl" });
      el("circle", { cx: CX, cy: CY, r: 5, class: "odot" });
      txt(CX - 26, CY + 8, "O");
    };
    const wrapText = (textEl, s, x, maxChars, lineGap) => {
      textEl.innerHTML = "";
      const rows = []; let row = "";
      for (const w of String(s).split(" ")) {
        if ((row + " " + w).trim().length > maxChars && row) { rows.push(row); row = w; }
        else row = (row + " " + w).trim();
      }
      rows.push(row);
      rows.forEach((r, k) => {
        const ts = el("tspan", { x, dy: k === 0 ? -(rows.length - 1) * lineGap / 2 : lineGap }, textEl);
        ts.textContent = r;
      });
    };
    return { el, txt, setLine, makeDrag, markPath, rightMark, drawCircle, wrapText };
  }

  function button(parent, label, fn, cls = "btn") {
    const b = document.createElement("button");
    b.className = cls; b.textContent = label; b.onclick = fn;
    parent.appendChild(b);
    return b;
  }
  function readout(parent) {
    const d = document.createElement("div");
    d.className = "readout";
    parent.appendChild(d);
    return d;
  }
  const cm = px => (px / SC).toFixed(1);
  const deg = r => Math.round(r * 180 / Math.PI);

  const tools = {
    /* Fallback: heading + lines written on the board */
    plainBoard(h, ctl, p) {
      if (p.heading) h.txt(24, 50, p.heading, "t big g");
      (p.lines || []).forEach((l, i) => {
        const t = h.el("text", { x: 320, y: 150 + i * 80, class: "t big", "text-anchor": "middle" });
        h.wrapText(t, l, 320, 34, 36);
      });
    },

    /* Wheel rolling on a road: one point of contact */
    rollingWheel(h, ctl, p) {
      h.el("line", { x1: 20, y1: 400, x2: 620, y2: 400, class: "cl" });
      h.txt(26, 432, p.road || "road", "t d");
      const wr = 90, g = h.el("g"), sp = h.el("g", {}, g);
      h.el("circle", { cx: 0, cy: 0, r: wr, class: "cl", style: "stroke-width:7" }, g);
      h.el("circle", { cx: 0, cy: 0, r: wr - 14, class: "cl thin dim" }, g);
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        h.el("line", { x1: 0, y1: 0, x2: (wr - 14) * Math.cos(a), y2: (wr - 14) * Math.sin(a), class: "cl thin" }, sp);
      }
      h.el("circle", { cx: 0, cy: 0, r: 7, class: "dot" }, g);
      const dot = h.el("circle", { cx: 0, cy: 400, r: 9, class: "dot pulse", opacity: 0 });
      const lab = h.txt(0, 450, p.label || "only one point touches", "t g", undefined, { "text-anchor": "middle", opacity: 0 });
      let x = 150, raf = 0;
      const place = () => {
        g.setAttribute("transform", `translate(${x},${400 - wr})`);
        sp.setAttribute("transform", `rotate(${(x - 150) / wr * 180 / Math.PI})`);
        dot.setAttribute("cx", x); lab.setAttribute("x", Math.min(500, Math.max(140, x)));
      };
      place();
      button(ctl, p.button || "Roll the wheel", () => {
        cancelAnimationFrame(raf);
        dot.setAttribute("opacity", 1); lab.setAttribute("opacity", 1);
        const t0 = performance.now();
        const step = now => {
          const k = Math.min(1, (now - t0) / 3200);
          x = 150 + 340 * k; place();
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      });
      return () => cancelAnimationFrame(raf);
    },

    /* Stone in a sling: released stone flies along the tangent */
    sling(h, ctl, p) {
      const O = { x: 300, y: 240 }, Rs = 120;
      h.el("circle", { cx: O.x, cy: O.y, r: Rs, class: "cl thin dim dash" });
      h.el("circle", { cx: O.x, cy: O.y, r: 8, class: "dot" });
      h.txt(O.x - 70, O.y + 8, p.centre || "hand");
      const layer = h.el("g");
      const str = h.el("line", { class: "cl thin" });
      const stone = h.el("circle", { r: 13, class: "stone" });
      let th = -Math.PI / 2, mode = "spin", rel = null, s = 0, trail = null, raf = 0, last = performance.now();
      const speed = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1.4 : 3.2;
      const put = q => { stone.setAttribute("cx", q.x); stone.setAttribute("cy", q.y); };
      function explain() {
        const P = rel.p, v = rel.v, u = { x: (O.x - P.x) / Rs, y: (O.y - P.y) / Rs };
        h.setLine(h.el("line", { class: "cl" }, layer), O, P);
        h.setLine(h.el("line", { class: "gold thin" }, layer), { x: P.x - v.x * 700, y: P.y - v.y * 700 }, { x: P.x + v.x * 700, y: P.y + v.y * 700 });
        h.rightMark(P, u, v, layer, 18);
        h.txt(P.x + u.x * 40 + v.x * 34, P.y + u.y * 40 + v.y * 34, "90°", "t p", layer, { "text-anchor": "middle" });
        h.txt(20, 40, p.message || "It flies along the tangent", "t big g", layer);
      }
      function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (mode === "spin") {
          th += dt * speed;
          const q = { x: O.x + Rs * Math.cos(th), y: O.y + Rs * Math.sin(th) };
          h.setLine(str, O, q); put(q);
        } else if (mode === "fly") {
          s += dt * 330;
          const q = { x: rel.p.x + rel.v.x * s, y: rel.p.y + rel.v.y * s };
          put(q); h.setLine(trail, rel.p, q);
          if (s > 360) { mode = "done"; explain(); }
        }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      button(ctl, p.button || "Let go", () => {
        if (mode !== "spin") return;
        const q = { x: O.x + Rs * Math.cos(th), y: O.y + Rs * Math.sin(th) };
        rel = { p: q, v: { x: -Math.sin(th), y: Math.cos(th) } };
        s = 0; mode = "fly"; str.setAttribute("opacity", 0);
        trail = h.el("line", { class: "gold dash" }, layer);
      });
      button(ctl, p.again || "Swing again", () => {
        layer.innerHTML = ""; str.setAttribute("opacity", 1); mode = "spin";
      }, "btn ghost");
      return () => cancelAnimationFrame(raf);
    },

    /* Drag a line across a circle: secant / tangent / no common point */
    lineVsCircle(h, ctl) {
      h.drawCircle();
      let d = 60;
      const dl = h.el("line", { class: "cl thin dash" });
      const dlab = h.txt(0, 0, "d", "t d");
      const ln = h.el("line", { x1: 30, x2: 610, class: "blue" });
      const hit = h.el("line", { x1: 30, x2: 610, class: "hit" });
      const p1 = h.el("circle", { r: 9, class: "dot" }), p2 = h.el("circle", { r: 9, class: "dot" });
      const status = h.txt(20, 458, "", "t big");
      const lab = document.createElement("label");
      lab.textContent = "Distance of the line from the centre";
      ctl.appendChild(lab);
      const sl = document.createElement("input");
      Object.assign(sl, { type: "range", min: 0, max: 200, step: 1 });
      sl.setAttribute("aria-label", "Distance of the line from the centre");
      ctl.appendChild(sl);
      const out = readout(ctl);
      function upd() {
        if (Math.abs(d - R) < 6) d = R;
        const y = CY - d;
        for (const n of [ln, hit]) { n.setAttribute("y1", y); n.setAttribute("y2", y); }
        h.setLine(dl, { x: CX, y: CY }, { x: CX, y });
        dlab.setAttribute("x", CX + 10); dlab.setAttribute("y", (CY + y) / 2 + 6);
        let kind;
        if (d < R) {
          const w = Math.sqrt(R * R - d * d);
          p1.setAttribute("cx", CX - w); p1.setAttribute("cy", y); p1.setAttribute("opacity", 1);
          p2.setAttribute("cx", CX + w); p2.setAttribute("cy", y); p2.setAttribute("opacity", 1);
          ln.setAttribute("class", "blue");
          status.textContent = "2 points: secant";
          kind = "<strong>Cuts at 2 points.</strong> This line is a secant (வெட்டுக்கோடு).";
        } else if (d === R) {
          p1.setAttribute("cx", CX); p1.setAttribute("cy", y); p1.setAttribute("opacity", 1);
          p2.setAttribute("opacity", 0);
          ln.setAttribute("class", "gold");
          status.textContent = "1 point: tangent!";
          kind = "<strong>Touches at exactly 1 point.</strong> This line is a tangent (தொடுகோடு).";
        } else {
          p1.setAttribute("opacity", 0); p2.setAttribute("opacity", 0);
          ln.setAttribute("class", "far");
          status.textContent = "No common point";
          kind = "<strong>No common point.</strong> The line misses the circle.";
        }
        sl.value = d;
        out.innerHTML = `${kind}<br>Distance d = ${cm(d)} cm, radius r = 5.0 cm`;
      }
      h.makeDrag(hit, q => { d = Math.max(0, Math.min(200, Math.round(CY - q.y))); upd(); });
      sl.oninput = () => { d = +sl.value; upd(); };
      upd();
    },

    /* Drag P around the circle: radius and tangent always at 90° */
    tangentAtPoint(h, ctl, p) {
      h.drawCircle();
      h.txt(20, 44, p.heading || "Radius OP ⊥ tangent", "t big g");
      let a = -Math.PI / 3;
      const tan = h.el("line", { class: "gold" }), rad = h.el("line", { class: "cl" });
      const mk = h.el("path", { class: "mark" });
      const dg = h.txt(0, 0, "90°", "t p", undefined, { "text-anchor": "middle" });
      const pl = h.txt(0, 0, "P", "t big", undefined, { "text-anchor": "middle" });
      const hd = h.el("circle", { r: 12, class: "handle" });
      const hit = h.el("circle", { r: 30, class: "hitc" });
      const out = readout(ctl);
      function upd() {
        const P = { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
        const u = { x: -Math.cos(a), y: -Math.sin(a) }, t = { x: -u.y, y: u.x };
        h.setLine(tan, { x: P.x - t.x * 320, y: P.y - t.y * 320 }, { x: P.x + t.x * 320, y: P.y + t.y * 320 });
        h.setLine(rad, { x: CX, y: CY }, P);
        mk.setAttribute("d", h.markPath(P, u, t, 18));
        dg.setAttribute("x", P.x + u.x * 42 + t.x * 38); dg.setAttribute("y", P.y + u.y * 42 + t.y * 38 + 8);
        pl.setAttribute("x", P.x - u.x * 30); pl.setAttribute("y", P.y - u.y * 30 + 10);
        for (const n of [hd, hit]) { n.setAttribute("cx", P.x); n.setAttribute("cy", P.y); }
        out.innerHTML = "Angle between radius OP and the tangent: <strong>90°</strong>";
      }
      h.makeDrag(hit, q => { a = Math.atan2(q.y - CY, q.x - CX); upd(); });
      upd();
    },

    /* Drag P inside / on / outside: 0, 1 or 2 tangents; PA = PB */
    tangentsFromPoint(h, ctl) {
      h.drawCircle();
      let P = { x: 575, y: 240 };
      const g = h.el("g");
      const hd = h.el("circle", { r: 12, class: "handle" });
      const pl = h.txt(0, 0, "P", "t big");
      const hit = h.el("circle", { r: 30, class: "hitc" });
      const status = h.txt(20, 458, "", "t big");
      const out = readout(ctl);
      function upd() {
        g.innerHTML = "";
        let dx = P.x - CX, dy = P.y - CY, d = Math.hypot(dx, dy), on = false;
        if (Math.abs(d - R) < 7 && d > 0) { P = { x: CX + dx * R / d, y: CY + dy * R / d }; d = R; on = true; }
        for (const n of [hd, hit]) { n.setAttribute("cx", P.x); n.setAttribute("cy", P.y); }
        pl.setAttribute("x", P.x + 16); pl.setAttribute("y", P.y - 14);
        if (on) {
          const t = { x: -dy / d, y: dx / d };
          h.setLine(h.el("line", { class: "gold" }, g), { x: P.x - t.x * 320, y: P.y - t.y * 320 }, { x: P.x + t.x * 320, y: P.y + t.y * 320 });
          status.textContent = "On the circle: 1 tangent";
          out.innerHTML = "P is <strong>on the circle</strong>. Only <strong>one</strong> tangent can be drawn.";
        } else if (d < R) {
          status.textContent = "Inside: no tangent";
          out.innerHTML = "P is <strong>inside</strong> the circle. <strong>No</strong> tangent can be drawn. Every line through P cuts the circle.";
        } else {
          const al = Math.acos(R / d), ph = Math.atan2(dy, dx);
          const A = { x: CX + R * Math.cos(ph + al), y: CY + R * Math.sin(ph + al) };
          const B = { x: CX + R * Math.cos(ph - al), y: CY + R * Math.sin(ph - al) };
          h.setLine(h.el("line", { class: "cl dash thin" }, g), { x: CX, y: CY }, P);
          for (const [X, name] of [[A, "A"], [B, "B"]]) {
            h.setLine(h.el("line", { class: "cl thin" }, g), { x: CX, y: CY }, X);
            h.setLine(h.el("line", { class: "gold" }, g), P, X);
            const u = { x: (CX - X.x) / R, y: (CY - X.y) / R };
            const L = Math.hypot(P.x - X.x, P.y - X.y);
            h.rightMark(X, u, { x: (P.x - X.x) / L, y: (P.y - X.y) / L }, g);
            h.txt(X.x - u.x * 26 - 8, X.y - u.y * 26 + 8, name, "t big", g);
            h.txt((P.x + X.x) / 2 - u.x * 22 - 20, (P.y + X.y) / 2 - u.y * 22 + 6, cm(L) + " cm", "t g", g);
          }
          const len = cm(Math.sqrt(d * d - R * R)), aob = deg(2 * al), apb = 180 - aob;
          status.textContent = "Outside: 2 tangents, PA = PB";
          out.innerHTML = `<strong>PA = ${len} cm</strong> and <strong>PB = ${len} cm</strong><br>` +
            `∠APB = ${apb}° and ∠AOB = ${aob}°. Together: <strong>180°</strong>`;
        }
      }
      h.makeDrag(hit, q => { P = { x: Math.max(12, Math.min(628, q.x)), y: Math.max(12, Math.min(468, q.y)) }; upd(); });
      upd();
    },

    /* Right triangle O-T-P with a tangent, then formula steps one by one */
    tangentLengthSteps(h, ctl, p) {
      const O = { x: 210, y: 280 }, T = { x: 210, y: 170 }, P = { x: 474, y: 170 };
      h.el("circle", { cx: O.x, cy: O.y, r: 110, class: "cl dim" });
      h.el("circle", { cx: O.x, cy: O.y, r: 5, class: "odot" });
      h.setLine(h.el("line", { class: "cl" }), O, T);
      h.setLine(h.el("line", { class: "gold" }), T, P);
      h.setLine(h.el("line", { class: "cl dash thin" }), O, P);
      h.rightMark(T, { x: 0, y: 1 }, { x: 1, y: 0 });
      h.txt(O.x - 30, O.y + 8, "O"); h.txt(T.x - 10, T.y - 14, "T", "t big"); h.txt(P.x + 10, P.y + 8, "P", "t big");
      h.txt(O.x - 70, 232, (p.r || 5) + " cm");
      h.txt(318, 156, (p.t || 12) + " cm ?", "t g");
      h.txt(356, 252, (p.d || 13) + " cm", "t d");
      stepLines(h, ctl, p.steps || [], 344, 300, 36);
    },

    /* Just formula steps written one by one (no figure) */
    formulaSteps(h, ctl, p) {
      if (p.heading) h.txt(24, 50, p.heading, "t big g");
      stepLines(h, ctl, p.steps || [], 60, 120, 52);
    },

    /* Two pulleys with a belt: the straight parts are tangents */
    beltPulleys(h, ctl, p) {
      const C1 = { x: 190, y: 240 }, r1 = 105, C2 = { x: 480, y: 240 }, r2 = 52, D = C2.x - C1.x;
      const nx = (r1 - r2) / D, ny = Math.sqrt(1 - nx * nx);
      for (const [C, r, teeth] of [[C1, r1, 24], [C2, r2, 12]]) {
        h.el("circle", { cx: C.x, cy: C.y, r, class: "cl", style: "stroke-width:5" });
        for (let k = 0; k < teeth; k++) {
          const a = k * 2 * Math.PI / teeth;
          h.setLine(h.el("line", { class: "cl thin dim" }), { x: C.x + (r - 8) * Math.cos(a), y: C.y + (r - 8) * Math.sin(a) }, { x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) });
        }
        h.el("circle", { cx: C.x, cy: C.y, r: 6, class: "odot" });
      }
      for (const s of [-1, 1]) {
        const n = { x: nx, y: s * ny };
        const T1 = { x: C1.x + r1 * n.x, y: C1.y + r1 * n.y }, T2 = { x: C2.x + r2 * n.x, y: C2.y + r2 * n.y };
        h.setLine(h.el("line", { class: "gold", style: "stroke-width:6" }), T1, T2);
        h.setLine(h.el("line", { class: "cl thin" }), C1, T1);
        h.setLine(h.el("line", { class: "cl thin" }), C2, T2);
        const L = Math.hypot(T2.x - T1.x, T2.y - T1.y), t = { x: (T2.x - T1.x) / L, y: (T2.y - T1.y) / L };
        h.rightMark(T1, { x: -n.x, y: -n.y }, t);
        h.rightMark(T2, { x: -n.x, y: -n.y }, { x: -t.x, y: -t.y });
      }
      h.txt(20, 44, p.heading || "Cycle chain: straight parts are tangents", "t big g");
      h.txt(150, 458, p.left || "big wheel", "t d");
      h.txt(440, 458, p.right || "small wheel", "t d");
    },

    /* Rapid-fire questions with countdown and reveal */
    quickQuestions(h, ctl, p, api) {
      const qs = p.questions || [], secs = p.seconds || 6;
      let i = 0, timer = null;
      const num = h.txt(24, 48, "", "t d");
      const q = h.el("text", { x: 320, y: 180, class: "t huge", "text-anchor": "middle" });
      const cnt = h.txt(320, 290, "", "t huge p", undefined, { "text-anchor": "middle" });
      const a = h.txt(320, 380, "", "t huge g", undefined, { "text-anchor": "middle" });
      const reveal = () => { clearInterval(timer); timer = null; cnt.textContent = ""; a.textContent = qs[i][1]; go.textContent = "Next question"; };
      function show() {
        clearInterval(timer);
        num.textContent = `Question ${i + 1} of ${qs.length}`;
        h.wrapText(q, qs[i][0], 320, 22, 52); a.textContent = "";
        let n = secs; cnt.textContent = n;
        go.textContent = "Show answer now";
        timer = setInterval(() => { n--; if (n <= 0) reveal(); else cnt.textContent = n; }, 1000);
      }
      const go = button(ctl, "Start quick questions", () => {
        if (!qs.length) return;
        if (timer) { reveal(); return; }
        if (a.textContent) {
          if (i < qs.length - 1) { i++; show(); }
          else { num.textContent = ""; h.wrapText(q, p.outro || "Well done! Say the facts once more.", 320, 22, 52); a.textContent = ""; go.textContent = "Start again"; i = -1; }
          return;
        }
        if (i < 0) i = 0;
        show();
      });
      h.wrapText(q, p.intro || "Say the facts together first", 320, 22, 52);
      api.setAsk({ start: () => go.click(), stop: () => clearInterval(timer) });
      return () => clearInterval(timer);
    }
  };

  function stepLines(h, ctl, steps, x, y0, gap) {
    let i = 0;
    const b = button(ctl, "Next step", () => {
      if (i >= steps.length) return;
      const last = i === steps.length - 1;
      h.txt(x, y0 + i * gap, steps[i], last ? "t g big" : "t");
      i++;
      if (i >= steps.length) b.textContent = "All steps shown";
    });
  }

  /* One line per tool: used later when AI writes new chapters, so it only picks tools that exist */
  const catalogue = {
    plainBoard: "Heading and up to 4 short lines written on the board. Settings: heading, lines[]",
    rollingWheel: "Wheel rolls on a road; one contact point. Settings: road, label, button",
    sling: "Stone swung in a sling, released, flies along the tangent. Settings: centre, message, button, again",
    lineVsCircle: "Drag a line across a circle: secant, tangent or no common point. No settings",
    tangentAtPoint: "Drag P around a circle; radius and tangent always meet at 90°. Settings: heading",
    tangentsFromPoint: "Drag P inside/on/outside a circle: 0, 1 or 2 tangents, PA = PB, angles add to 180°. No settings",
    tangentLengthSteps: "Right triangle O-T-P with tangent PT, then formula steps one by one. Settings: r, d, t, steps[]",
    formulaSteps: "Formula steps written one by one, no figure. Settings: heading, steps[]",
    beltPulleys: "Two pulleys with a belt; straight parts are tangents. Settings: heading, left, right",
    quickQuestions: "Rapid-fire questions with countdown and reveal. Settings: questions[[q,a]], seconds, intro, outro"
  };

  window.ConceptTools = { helpers, tools, catalogue };
})();
