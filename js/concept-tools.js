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
      t.textContent = String(s).replace(/\*\*/g, ""); // bold marks only work in the side panel
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
      for (const w of String(s).replace(/\*\*/g, "").split(" ")) {
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

  /* Safe reading of tool settings (the AI may send text, blanks or odd values) */
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const clampInt = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(num(v, d))));
  const str = v => (v == null ? "" : String(v)).trim();
  const fmt = v => { const r = Math.round(v * 100) / 100; return (r < 0 ? "−" : "") + Math.abs(r); };

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

    /* Dot pictures that grow step by step: triangular, square, oblong numbers; or one array */
    dotPattern(h, ctl, p) {
      const kind = ["triangle", "square", "oblong", "array", "pairs"].includes(p.kind) ? p.kind : "square";
      if (str(p.heading)) h.txt(20, 44, str(p.heading), "t big g");
      const layer = h.el("g");

      if (kind === "array") {
        let R = clampInt(p.rows, 1, 12, 3), C = clampInt(p.cols, 1, 12, 4);
        const draw = () => {
          layer.innerHTML = "";
          const d = Math.min(44, 520 / Math.max(1, C - 1), 260 / Math.max(1, R - 1));
          const x0 = 320 - (C - 1) * d / 2, y0 = 240 - (R - 1) * d / 2;
          const rr = Math.max(4, Math.min(12, d * 0.3));
          for (let r = 0; r < R; r++) for (let c = 0; c < C; c++)
            h.el("circle", { cx: x0 + c * d, cy: y0 + r * d, r: rr, class: r % 2 ? "odot" : "dot" }, layer);
          h.txt(320, 440, `${R} rows × ${C} in each row = ${R * C}`, "t big", layer, { "text-anchor": "middle" });
        };
        draw();
        button(ctl, "Turn it around", () => { [R, C] = [C, R]; draw(); });
        return;
      }

      if (kind === "pairs") {
        /* A number as dots in 2 rows: even = every dot has a partner, odd = 1 left over */
        let n = clampInt(p.number, 1, 30, 7);
        const status = h.txt(320, 440, "", "t big", layer, { "text-anchor": "middle" });
        const dots = h.el("g", {}, layer);
        const out = readout(ctl);
        const draw = () => {
          dots.innerHTML = "";
          const cols = Math.ceil(n / 2), d = Math.min(56, 520 / Math.max(1, cols - 1)), rr = Math.max(6, Math.min(16, d * 0.3));
          const x0 = 320 - (cols - 1) * d / 2, y1 = 190, y2 = 190 + Math.max(56, d);
          for (let i = 0; i < n; i++) {
            const col = Math.floor(i / 2), top = i % 2 === 0, last = i === n - 1 && n % 2 === 1;
            h.el("circle", { cx: x0 + col * d, cy: top ? y1 : y2, r: rr, class: "dot", style: last ? "fill:var(--chalk-pink)" : "" }, dots);
          }
          for (let c = 0; c < Math.floor(n / 2); c++)
            h.setLine(h.el("line", { class: "cl thin dim" }, dots), { x: x0 + c * d, y: y1 + rr }, { x: x0 + c * d, y: y2 - rr });
          if (n % 2) h.txt(x0 + (cols - 1) * d, y1 - 30, "left over", "t p", dots, { "text-anchor": "middle" });
          const pairs = Math.floor(n / 2);
          status.textContent = n % 2 ? `${n} is ODD` : `${n} is EVEN`;
          out.innerHTML = n % 2
            ? `<strong>${n} = ${pairs} pairs + 1 left over.</strong> One dot has no partner, so ${n} is odd.`
            : `<strong>${n} = ${pairs} pairs.</strong> Every dot has a partner, so ${n} is even.`;
        };
        draw();
        button(ctl, "+1", () => { if (n < 30) { n++; draw(); } });
        button(ctl, "−1", () => { if (n > 1) { n--; draw(); } }, "btn ghost");
        return;
      }

      const N = clampInt(p.steps, 1, 7, 5);
      let shown = 1;
      const shape = k => {
        const pts = [];
        if (kind === "triangle") for (let r = 0; r < k; r++) for (let c = 0; c <= r; c++) pts.push({ x: c - r / 2 + (k - 1) / 2, y: r, layer: r });
        else if (kind === "square") for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) pts.push({ x: c, y: r, layer: Math.max(r, c) });
        else for (let r = 0; r < k; r++) for (let c = 0; c <= k; c++) pts.push({ x: c, y: r, layer: Math.max(r, c - 1) });
        return pts;
      };
      const widthU = k => (kind === "oblong" ? k : k - 1);
      const gap = 36;
      let sumW = 0; for (let k = 1; k <= N; k++) sumW += widthU(k);
      const d = Math.max(8, Math.min(34, 250 / Math.max(1, N - 1), sumW ? (560 - gap * (N - 1)) / sumW : 34));
      const rr = Math.max(3, Math.min(9, d * 0.32));
      const bottom = 340;
      const counts = [];
      const draw = () => {
        layer.innerHTML = "";
        let x = (640 - (d * sumW + gap * (N - 1))) / 2;
        counts.length = 0;
        for (let k = 1; k <= N; k++) {
          const pts = shape(k), w = widthU(k) * d, top = bottom - (k - 1) * d;
          if (k <= shown) {
            pts.forEach(pt => h.el("circle", { cx: x + pt.x * d, cy: top + pt.y * d, r: rr, class: pt.layer % 2 ? "odot" : "dot" }, layer));
            h.txt(x + w / 2, bottom + 40, String(pts.length), "t big", layer, { "text-anchor": "middle" });
            counts.push(pts.length);
          }
          x += w + gap;
        }
        h.txt(320, 440, counts.join(", ") + (shown < N ? ", …" : ""), "t big g", layer, { "text-anchor": "middle" });
      };
      draw();
      button(ctl, "Next picture", () => { if (shown < N) { shown++; draw(); } });
      button(ctl, "Start again", () => { shown = 1; draw(); }, "btn ghost");
    },

    /* Number line with jumps shown one at a time */
    numberLine(h, ctl, p) {
      if (str(p.heading)) h.txt(20, 44, str(p.heading), "t big g");
      const den = clampInt(p.denominator, 1, 12, 1);
      const jumps = (Array.isArray(p.jumps) ? p.jumps : []).map(Number).filter(Number.isFinite).slice(0, 8);
      const start = num(p.start, 0);
      const pos = [start]; jumps.forEach(j => pos.push(pos[pos.length - 1] + j));
      const marks = (Array.isArray(p.marks) ? p.marks : []).map(Number).filter(Number.isFinite).slice(0, 8);
      const all = pos.concat(marks);
      let lo = Math.floor(Math.min(num(p.min, Math.min(...all)), ...all));
      let hi = Math.ceil(Math.max(num(p.max, Math.max(...all)), ...all));
      if (hi - lo < 1) hi = lo + 1;
      let tick = den > 1 ? 1 / den : (num(p.step, 0) > 0 ? num(p.step, 1) : [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find(s => (hi - lo) / s <= 20) || 1000);
      while ((hi - lo) / tick > 48) tick *= 2;
      const X = v => 50 + (v - lo) / (hi - lo) * 540, Y = 330;
      const label = v => {
        if (den > 1) { const n = Math.round(v * den); return n % den === 0 ? fmt(n / den) : `${n < 0 ? "−" : ""}${Math.abs(n)}/${den}`; }
        return fmt(v);
      };
      h.setLine(h.el("line", { class: "cl" }), { x: 30, y: Y }, { x: 610, y: Y });
      h.el("path", { d: `M610 ${Y} l-12 -7 M610 ${Y} l-12 7 M30 ${Y} l12 -7 M30 ${Y} l12 7`, class: "cl" });
      const nT = Math.round((hi - lo) / tick);
      for (let i = 0; i <= nT; i++) {
        const v = lo + i * tick, whole = Math.abs(v - Math.round(v)) < 1e-9;
        h.setLine(h.el("line", { class: "cl thin" }), { x: X(v), y: Y - (whole ? 12 : 7) }, { x: X(v), y: Y + (whole ? 12 : 7) });
        if (nT <= 20 || whole) h.txt(X(v), Y + 38, label(v), Math.abs(v) < 1e-9 ? "t g" : v < 0 ? "t p" : "t", undefined, { "text-anchor": "middle" });
      }
      marks.forEach(m => {
        h.el("circle", { cx: X(m), cy: Y, r: 8, class: "dot" });
        // Only write the number on top if it is not already written under the line
        const k = (m - lo) / tick, onTick = Math.abs(k - Math.round(k)) < 1e-6;
        const labelledBelow = onTick && (nT <= 20 || Math.abs(m - Math.round(m)) < 1e-9);
        if (!labelledBelow) h.txt(X(m), Y - 22, label(m), "t g", undefined, { "text-anchor": "middle" });
      });
      const layer = h.el("g");
      const out = readout(ctl);
      let i = 0;
      const draw = () => {
        layer.innerHTML = "";
        h.el("circle", { cx: X(start), cy: Y, r: 9, class: "odot" }, layer);
        h.txt(X(start), Y + 70, "start", "t d", layer, { "text-anchor": "middle" });
        let expr = label(start);
        for (let k = 0; k < i; k++) {
          const a = pos[k], b = pos[k + 1], xa = X(a), xb = X(b);
          const lift = 40 + Math.min(110, Math.abs(xb - xa) * 0.35), top = Y - lift;
          h.el("path", { d: `M${xa} ${Y - 6} Q${(xa + xb) / 2} ${top} ${xb} ${Y - 6}`, class: "gold thin" }, layer);
          const dir = xb >= xa ? -1 : 1;
          h.el("path", { d: `M${xb} ${Y - 6} l${dir * 10} -12 M${xb} ${Y - 6} l${dir * 13} 2`, class: "gold thin" }, layer);
          const j = jumps[k], js = (j >= 0 ? "+" : "−") + label(Math.abs(j));
          h.txt((xa + xb) / 2, top + (lift > 60 ? 18 : 4) - 8, js, "t g", layer, { "text-anchor": "middle" });
          h.el("circle", { cx: xb, cy: Y, r: 9, class: "dot" }, layer);
          expr += (j >= 0 ? " + " : " − ") + label(Math.abs(j));
        }
        out.innerHTML = jumps.length
          ? (i ? `<strong>${expr} = ${label(pos[i])}</strong>` : `Start at <strong>${label(start)}</strong>. Press Next jump.`)
          : `Numbers from <strong>${label(lo)}</strong> to <strong>${label(hi)}</strong>`;
      };
      draw();
      if (jumps.length) {
        button(ctl, "Next jump", () => { if (i < jumps.length) { i++; draw(); } });
        button(ctl, "Start again", () => { i = 0; draw(); }, "btn ghost");
      }
    },

    /* Singapore bar model: parts appear one at a time; '?' marks the unknown */
    barModel(h, ctl, p) {
      if (str(p.heading)) h.txt(20, 44, str(p.heading), "t big g");
      const bars = (Array.isArray(p.bars) ? p.bars : []).slice(0, 3).map(b => {
        b = b && typeof b === "object" ? b : {};
        const parts = (Array.isArray(b.parts) ? b.parts : []).slice(0, 12).map(x => {
          if (typeof x !== "object" || x === null) x = { v: x };
          const raw = x.v != null ? x.v : x.value;
          const v = num(raw, 1);
          const lab = x.label != null ? str(x.label) : str(raw);
          return { v: v > 0 ? v : 1, label: lab, unknown: lab === "?" || x.unknown === true };
        });
        return { name: str(b.name), parts, total: str(b.total) };
      }).filter(b => b.parts.length);
      if (!bars.length) { tools.plainBoard(h, ctl, { heading: str(p.heading), lines: ["Bar model"] }); return; }
      const maxSum = Math.max(...bars.map(b => b.parts.reduce((s, x) => s + x.v, 0)));
      const hasNames = bars.some(b => b.name);
      const x0 = hasNames ? 150 : 60, W = 600 - x0, unit = W / maxSum, bh = 56;
      const rowGap = Math.min(130, 330 / bars.length);
      const y0 = 110 + Math.max(0, (330 - rowGap * bars.length) / 2);
      const order = [];
      bars.forEach((b, bi) => b.parts.forEach((pt, pi) => order.push([bi, pi])));
      let shown = 0;
      const layer = h.el("g");
      const draw = () => {
        layer.innerHTML = "";
        const visible = new Set(order.slice(0, shown).map(o => o.join(",")));
        bars.forEach((b, bi) => {
          const y = y0 + bi * rowGap;
          if (b.name) h.txt(x0 - 14, y + bh / 2 + 9, b.name, "t", layer, { "text-anchor": "end" });
          let x = x0, allShown = true;
          b.parts.forEach((pt, pi) => {
            const w = pt.v * unit;
            if (visible.has(bi + "," + pi)) {
              h.el("rect", { x, y, width: w, height: bh, class: pt.unknown ? "barq" : "barp" }, layer);
              const fs = w < 40 ? "t d" : pt.unknown ? "t big p" : "t big";
              h.txt(x + w / 2, y + bh / 2 + 10, pt.label, fs, layer, { "text-anchor": "middle" });
            } else allShown = false;
            x += w;
          });
          if (b.total && allShown) {
            const yb = y + bh + 8, xe = x;
            h.el("path", { d: `M${x0} ${yb} q0 12 12 12 L${(x0 + xe) / 2 - 10} ${yb + 12} q10 0 10 10 q0 -10 10 -10 L${xe - 12} ${yb + 12} q12 0 12 -12`, class: "gold thin" }, layer);
            h.txt((x0 + xe) / 2, yb + 46, b.total, b.total === "?" ? "t big p" : "t g", layer, { "text-anchor": "middle" });
          }
        });
      };
      draw();
      button(ctl, "Next part", () => { if (shown < order.length) { shown++; draw(); } });
      button(ctl, "Show all", () => { shown = order.length; draw(); }, "btn ghost");
    },

    /* Drag the corners: angles, sides, angle sum 180°, triangle type, triangle inequality */
    dragTriangle(h, ctl, p) {
      if (str(p.heading)) h.txt(20, 44, str(p.heading), "t big g");
      const show = ["angles", "sides", "both"].includes(p.show) ? p.show : "both";
      const S = 40; // 40px = 1 cm
      const V = { A: { x: 160, y: 392 }, B: { x: 480, y: 392 }, C: { x: 236, y: 140 } };
      const g = h.el("g");
      const out = readout(ctl);
      const handles = {};
      ["A", "B", "C"].forEach(k => {
        handles[k] = [h.el("circle", { r: 11, class: "handle" }), h.el("circle", { r: 30, class: "hitc" })];
        h.makeDrag(handles[k][1], q => {
          V[k] = { x: Math.round(Math.max(20, Math.min(620, q.x)) / 4) * 4, y: Math.round(Math.max(76, Math.min(460, q.y)) / 4) * 4 };
          upd();
        });
      });
      const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
      const len = v => Math.hypot(v.x, v.y);
      const unitv = v => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };
      function upd() {
        g.innerHTML = "";
        const { A, B, C } = V;
        h.el("polygon", { points: `${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`, class: "tri" }, g);
        const G = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
        const ang = {};
        [["A", A, B, C], ["B", B, C, A], ["C", C, A, B]].forEach(([k, P, U, W]) => {
          const u = unitv(sub(U, P)), w = unitv(sub(W, P));
          ang[k] = Math.acos(Math.max(-1, Math.min(1, u.x * w.x + u.y * w.y))) * 180 / Math.PI;
          const lab = unitv(sub(P, G));
          h.txt(P.x + lab.x * 26, P.y + lab.y * 26 + 10, k, "t big", g, { "text-anchor": "middle" });
          if (show !== "sides") {
            const r = 30, cross = u.x * w.y - u.y * w.x;
            h.el("path", { d: `M${P.x + r * u.x} ${P.y + r * u.y} A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${P.x + r * w.x} ${P.y + r * w.y}`, class: "mark" }, g);
          }
        });
        let a = Math.round(ang.A), b = Math.round(ang.B), c = 180 - a - b;
        const degs = { A: a, B: b, C: c };
        if (show !== "sides") {
          [["A", A, B, C], ["B", B, C, A], ["C", C, A, B]].forEach(([k, P, U, W]) => {
            const bis = unitv({ x: unitv(sub(U, P)).x + unitv(sub(W, P)).x, y: unitv(sub(U, P)).y + unitv(sub(W, P)).y });
            h.txt(P.x + bis.x * 58, P.y + bis.y * 58 + 8, degs[k] + "°", "t p", g, { "text-anchor": "middle" });
          });
        }
        const sides = { AB: len(sub(A, B)) / S, BC: len(sub(B, C)) / S, CA: len(sub(C, A)) / S };
        if (show !== "angles") {
          [["AB", A, B], ["BC", B, C], ["CA", C, A]].forEach(([k, P, Q]) => {
            const m = { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 }, o = unitv(sub(m, G));
            h.txt(m.x + o.x * 30, m.y + o.y * 30 + 8, sides[k].toFixed(1) + " cm", "t g", g, { "text-anchor": "middle" });
          });
        }
        ["A", "B", "C"].forEach(k => handles[k].forEach(n => { n.setAttribute("cx", V[k].x); n.setAttribute("cy", V[k].y); }));
        const L = Object.values(sides).map(s => Math.round(s * 10) / 10).sort((x, y) => x - y);
        const same = (x, y) => Math.abs(x - y) < 0.05;
        const bySide = same(L[0], L[2]) ? "equilateral" : (same(L[0], L[1]) || same(L[1], L[2])) ? "isosceles" : "scalene";
        const big = Math.max(a, b, c);
        const byAngle = big === 90 ? "right-angled" : big > 90 ? "obtuse-angled" : "acute-angled";
        let html = "";
        if (show !== "sides") html += `<strong>${a}° + ${b}° + ${c}° = 180°</strong><br>`;
        if (show !== "angles") html += `Two shorter sides: ${L[0].toFixed(1)} + ${L[1].toFixed(1)} = <strong>${(L[0] + L[1]).toFixed(1)} cm</strong>, longer than ${L[2].toFixed(1)} cm<br>`;
        html += `This is ${show === "angles" ? "an <strong>" + byAngle : show === "sides" ? "a <strong>" + bySide : "an <strong>" + byAngle + ", " + bySide} triangle</strong>.`;
        out.innerHTML = html.replace("an <strong>obtuse", "an <strong>obtuse").replace("a <strong>isosceles", "an <strong>isosceles").replace("a <strong>equilateral", "an <strong>equilateral").replace("an <strong>right", "a <strong>right").replace("an <strong>scalene", "a <strong>scalene");
      }
      upd();
    },

    /* Drag one arm to make any angle; shows measure and type */
    angleMaker(h, ctl, p) {
      if (str(p.heading)) h.txt(20, 44, str(p.heading), "t big g");
      const O = { x: 320, y: 250 }, L = 190;
      let a = Math.max(0, Math.min(360, num(p.start, 50)));
      h.setLine(h.el("line", { class: "cl" }), O, { x: O.x + L, y: O.y });
      h.el("circle", { cx: O.x, cy: O.y, r: 6, class: "odot" });
      const g = h.el("g");
      const arm = h.el("line", { class: "gold" });
      const hd = h.el("circle", { r: 12, class: "handle" }), hit = h.el("circle", { r: 32, class: "hitc" });
      const status = h.txt(20, 458, "", "t big");
      const out = readout(ctl);
      const pt = (deg, r) => ({ x: O.x + r * Math.cos(deg * Math.PI / 180), y: O.y - r * Math.sin(deg * Math.PI / 180) });
      function upd() {
        g.innerHTML = "";
        const E = pt(a, L);
        h.setLine(arm, O, E);
        for (const n of [hd, hit]) { n.setAttribute("cx", E.x); n.setAttribute("cy", E.y); }
        if (a === 90) {
          h.el("path", { d: `M${O.x + 24} ${O.y} L${O.x + 24} ${O.y - 24} L${O.x} ${O.y - 24}`, class: "mark" }, g);
        } else if (a > 0 && a < 360) {
          const s = pt(0, 56), e = pt(a, 56);
          h.el("path", { d: `M${s.x} ${s.y} A56 56 0 ${a > 180 ? 1 : 0} 0 ${e.x} ${e.y}`, class: "mark" }, g);
        } else if (a === 360) {
          h.el("circle", { cx: O.x, cy: O.y, r: 56, class: "mark" }, g);
        }
        const lp = pt(a / 2, 96);
        h.txt(lp.x, lp.y + 8, a + "°", "t big p", g, { "text-anchor": "middle" });
        const type = a === 0 ? "Zero angle" : a < 90 ? "Acute angle" : a === 90 ? "Right angle" : a < 180 ? "Obtuse angle"
          : a === 180 ? "Straight angle" : a < 360 ? "Reflex angle" : "Complete angle";
        status.textContent = type;
        const rule = a === 0 ? "0°" : a < 90 ? "between 0° and 90°" : a === 90 ? "exactly 90°" : a < 180 ? "between 90° and 180°"
          : a === 180 ? "exactly 180°" : a < 360 ? "between 180° and 360°" : "exactly 360°, one full turn";
        out.innerHTML = `<strong>${a}°</strong> is a <strong>${type.toLowerCase()}</strong>: ${rule}.`;
      }
      h.makeDrag(hit, q => {
        let d = Math.atan2(O.y - q.y, q.x - O.x) * 180 / Math.PI;
        if (d < 0) d += 360;
        d = Math.round(d);
        for (const snap of [0, 90, 180, 270, 360]) if (Math.abs(d - snap) <= 3) d = snap;
        if (d === 0 && a > 300) d = 360;
        a = d; upd();
      });
      upd();
    },

    /* Labelled points joined as lines, rays, segments and named angles; every point can be dragged */
    geometryBoard(h, ctl, p) {
      if (str(p.heading)) h.txt(20, 44, str(p.heading), "t big g");
      const GX = u => 60 + u * 52, GY = u => 420 - u * 50;          // grid units -> board
      const UX = x => (x - 60) / 52, UY = y => (420 - y) / 50;      // board -> grid units
      const pts = {};
      const src = p.points && typeof p.points === "object" ? p.points : {};
      Object.keys(src).slice(0, 8).forEach(k => {
        const name = str(k).slice(0, 3);
        const v = src[k];
        const x = num(Array.isArray(v) ? v[0] : v && v.x, NaN), y = num(Array.isArray(v) ? v[1] : v && v.y, NaN);
        if (name && Number.isFinite(x) && Number.isFinite(y))
          pts[name] = { x: GX(Math.max(0, Math.min(10, x))), y: GY(Math.max(0, Math.min(7, y))) };
      });
      const items = (Array.isArray(p.items) ? p.items : []).slice(0, 8).filter(it => it && typeof it === "object").map(it => ({
        type: ["line", "ray", "segment", "angle"].includes(it.type) ? it.type : "segment",
        from: str(it.from), to: str(it.to), at: str(it.at), showLength: it.showLength === true
      })).filter(it => it.type === "angle" ? pts[it.at] && pts[it.from] && pts[it.to] : pts[it.from] && pts[it.to] && it.from !== it.to);
      if (!Object.keys(pts).length) { tools.plainBoard(h, ctl, { heading: str(p.heading), lines: ["Geometry board"] }); return; }

      const BOX = { x1: 16, x2: 624, y1: 66, y2: 464 };
      const g = h.el("g"), labels = h.el("g");
      const out = readout(ctl);
      const unitv = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
      const toEdge = (P, d) => {
        let t = Infinity;
        if (d.x > 1e-9) t = Math.min(t, (BOX.x2 - P.x) / d.x); else if (d.x < -1e-9) t = Math.min(t, (BOX.x1 - P.x) / d.x);
        if (d.y > 1e-9) t = Math.min(t, (BOX.y2 - P.y) / d.y); else if (d.y < -1e-9) t = Math.min(t, (BOX.y1 - P.y) / d.y);
        return { x: P.x + d.x * t, y: P.y + d.y * t };
      };
      const arrow = (E, d, cls) => {
        const a = 0.45, s = 16, c = Math.cos(a), sn = Math.sin(a);
        const b1 = { x: -(d.x * c - d.y * sn) * s, y: -(d.x * sn + d.y * c) * s };
        const b2 = { x: -(d.x * c + d.y * sn) * s, y: -(-d.x * sn + d.y * c) * s };
        h.el("path", { d: `M${E.x + b1.x} ${E.y + b1.y} L${E.x} ${E.y} L${E.x + b2.x} ${E.y + b2.y}`, class: cls }, g);
      };
      const angleOf = (V, A, B) => {
        const u = unitv({ x: A.x - V.x, y: A.y - V.y }), w = unitv({ x: B.x - V.x, y: B.y - V.y });
        return { u, w, deg: Math.round(Math.acos(Math.max(-1, Math.min(1, u.x * w.x + u.y * w.y))) * 180 / Math.PI) };
      };
      const kindOf = d => d === 0 ? "zero" : d < 90 ? "acute" : d === 90 ? "right" : d < 180 ? "obtuse" : "straight";

      function upd() {
        g.innerHTML = ""; labels.innerHTML = "";
        const notes = [];
        items.forEach(it => {
          if (it.type === "angle") {
            const V = pts[it.at], A = pts[it.from], B = pts[it.to];
            const { u, w, deg } = angleOf(V, A, B);
            for (const d of [u, w]) { const E = toEdge(V, d); h.setLine(h.el("line", { class: "cl" }, g), V, E); arrow(E, d, "cl"); }
            if (deg === 90) {
              h.el("path", { d: h.markPath(V, u, w, 22), class: "mark" }, g);
            } else if (deg > 0) {
              const r = 38, cross = u.x * w.y - u.y * w.x;
              h.el("path", { d: `M${V.x + r * u.x} ${V.y + r * u.y} A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${V.x + r * w.x} ${V.y + r * w.y}`, class: "mark" }, g);
            }
            const bis = unitv({ x: u.x + w.x, y: u.y + w.y });
            const bb = deg >= 179 ? { x: -u.y, y: u.x } : bis;
            h.txt(V.x + bb.x * 64, V.y + bb.y * 64 + 8, deg + "°", "t p", labels, { "text-anchor": "middle" });
            notes.push(`<strong>∠${it.from}${it.at}${it.to} = ${deg}°</strong> (${kindOf(deg)}), vertex ${it.at}`);
          } else {
            const A = pts[it.from], B = pts[it.to], d = unitv({ x: B.x - A.x, y: B.y - A.y });
            const cls = it.type === "segment" ? "gold" : "cl";
            if (it.type === "segment") {
              h.setLine(h.el("line", { class: cls }, g), A, B);
              const len = (Math.hypot(B.x - A.x, (B.y - A.y) * 52 / 50) / 52).toFixed(1);
              if (it.showLength) {
                const m = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
                h.txt(m.x - d.y * 26, m.y + d.x * 26 + 8, len + " cm", "t g", labels, { "text-anchor": "middle" });
              }
              notes.push(`Segment <strong>${it.from}${it.to}</strong>: stops at ${it.from} and ${it.to}` + (it.showLength ? ` (${len} cm)` : ""));
            } else if (it.type === "ray") {
              const E = toEdge(A, d);
              h.setLine(h.el("line", { class: cls }, g), A, E); arrow(E, d, cls);
              notes.push(`Ray <strong>${it.from}${it.to}</strong>: starts at ${it.from}, goes on forever through ${it.to}`);
            } else {
              const E1 = toEdge(A, d), E2 = toEdge(A, { x: -d.x, y: -d.y });
              h.setLine(h.el("line", { class: cls }, g), E1, E2); arrow(E1, d, cls); arrow(E2, { x: -d.x, y: -d.y }, cls);
              notes.push(`Line <strong>${it.from}${it.to}</strong>: goes on forever both ways`);
            }
          }
        });
        const names = Object.keys(pts);
        const c = names.reduce((s, k) => ({ x: s.x + pts[k].x / names.length, y: s.y + pts[k].y / names.length }), { x: 0, y: 0 });
        // Put each letter in the biggest empty gap between the lines leaving that point
        const dirs = {}; names.forEach(k => { dirs[k] = []; });
        const add = (k, from, to, both) => {
          const d = unitv({ x: pts[to].x - pts[from].x, y: pts[to].y - pts[from].y });
          dirs[k].push(Math.atan2(d.y, d.x));
          if (both) dirs[k].push(Math.atan2(-d.y, -d.x));
        };
        items.forEach(it => {
          if (it.type === "angle") {
            add(it.at, it.at, it.from, false); add(it.at, it.at, it.to, false);
            add(it.from, it.at, it.from, true); add(it.to, it.at, it.to, true);
          } else if (it.type === "segment") {
            add(it.from, it.from, it.to, false); add(it.to, it.to, it.from, false);
          } else if (it.type === "ray") {
            add(it.from, it.from, it.to, false); add(it.to, it.from, it.to, true);
          } else {
            add(it.from, it.from, it.to, true); add(it.to, it.from, it.to, true);
          }
        });
        names.forEach(k => {
          const P = pts[k];
          let o;
          const a = dirs[k].slice().sort((x, y) => x - y);
          if (a.length) {
            let best = -1, mid = 0;
            a.forEach((x, i) => {
              const y = i + 1 < a.length ? a[i + 1] : a[0] + 2 * Math.PI, gap = y - x;
              if (gap > best) { best = gap; mid = x + gap / 2; }
            });
            o = { x: Math.cos(mid), y: Math.sin(mid) };
          } else {
            o = unitv({ x: P.x - c.x || 1, y: P.y - c.y || -1 });
          }
          h.txt(P.x + o.x * 28, P.y + o.y * 28 + 9, k, "t big", labels, { "text-anchor": "middle" });
        });
        names.forEach(k => { handles[k].forEach(n => { n.setAttribute("cx", pts[k].x); n.setAttribute("cy", pts[k].y); }); });
        out.innerHTML = notes.length ? notes.join("<br>") : "Drag the points.";
      }

      const handles = {};
      Object.keys(pts).forEach(k => {
        handles[k] = [h.el("circle", { r: 9, class: "handle" }), h.el("circle", { r: 28, class: "hitc" })];
        h.makeDrag(handles[k][1], q => {
          const ux = Math.round(Math.max(0, Math.min(10, UX(q.x))) * 10) / 10, uy = Math.round(Math.max(0, Math.min(7, UY(q.y))) * 10) / 10;
          pts[k] = { x: GX(ux), y: GY(uy) };
          upd();
        });
      });
      upd();
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
    dotPattern: "Dot pictures that grow one step at a time (triangular, square, oblong numbers), or one dot array for multiplication and factors. Also 'pairs': a number as dots in 2 rows with any left-over dot marked, +1/−1 buttons (even and odd numbers). Settings: kind ('triangle'|'square'|'oblong'|'array'|'pairs'), steps (1-7), heading; for array: rows, cols; for pairs: number",
    numberLine: "Number line with jumps shown one by one: addition, subtraction, integers, skip counting, fractions, decimals. Settings: min, max, start, jumps[] (e.g. [3,-5]), denominator (fraction ticks, e.g. 4), marks[] (points to highlight), heading",
    barModel: "Singapore bar model, parts appear one by one: word problems, part-whole, comparison, fractions, ratio, percentage. Settings: bars:[{name, parts:[{v: width number, label: 'text' or '?'}], total: 'text' or '?'}] (1 to 3 bars; v sets the width; '?' marks the unknown), heading",
    dragTriangle: "Drag the corners of a triangle; angles and side lengths update live; shows angle sum 180°, triangle type and that two sides together are longer than the third. Settings: show ('angles'|'sides'|'both'), heading",
    angleMaker: "Drag one arm to make any angle from 0° to 360°; shows the measure and its type (acute, right, obtuse, straight, reflex). Settings: start (degrees), heading",
    geometryBoard: "Labelled points joined as lines (arrows both ends), rays (arrow one end), segments, and named angles with their size shown; children drag any point and everything moves. For lines, rays, segments, naming angles, intersecting and parallel lines, shapes. Settings: points {A:[x,y]} with x 0-10 and y 0-7 (y goes up), items:[{type:'line'|'ray'|'segment', from:'A', to:'B', showLength:true|false}, {type:'angle', at:'B', from:'D', to:'E'}] (angle at B between arms BD and BE), heading. Choose coordinates that make a clear picture: angles between 30° and 120° and points well apart, unless the screen is about obtuse, straight or reflex angles",
    quickQuestions: "Rapid-fire questions with countdown and reveal. Settings: questions[[q,a]], seconds, intro, outro"
  };

  window.ConceptTools = { helpers, tools, catalogue };
})();
