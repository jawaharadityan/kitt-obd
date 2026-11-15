// Animated SVG gauge (shared with the desktop version).

// ---------- SVG gauge ----------
const NS = "http://www.w3.org/2000/svg";
const START = 135, SWEEP = 270;            // degrees, 0 = 3 o'clock, clockwise
const CX = 100, CY = 100, R = 80;

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
const polar = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
function arcPath(r, a0, a1) {
  const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export class Gauge {
  /** cfg: {title, unit, min, max, major, minor, decimals, labelDiv, zones:[[from,to,color]], key} */
  constructor(host, cfg) {
    this.cfg = cfg;
    this.shown = cfg.min;
    this.target = null;
    const wrap = document.createElement("div");
    wrap.className = "gauge stale";
    host.appendChild(wrap);
    this.wrap = wrap;
    const svg = el("svg", { viewBox: "0 0 200 200", role: "img", "aria-label": cfg.title });
    wrap.appendChild(svg);
    const defs = el("defs", {}, svg);
    const f = el("filter", { id: "glow", filterUnits: "userSpaceOnUse", x: 0, y: 0, width: 200, height: 200 }, defs);
    el("feGaussianBlur", { stdDeviation: "2.2", result: "b" }, f);
    const m = el("feMerge", {}, f);
    el("feMergeNode", { in: "b" }, m);
    el("feMergeNode", { in: "SourceGraphic" }, m);

    el("path", { class: "g-track", d: arcPath(R, START, START + SWEEP), "stroke-width": 10 }, svg);
    for (const [from, to, color] of cfg.zones || []) {
      el("path", { class: "g-zone", d: arcPath(R + 9, this.ang(from), this.ang(to)),
        stroke: color, "stroke-width": 3, opacity: 0.9 }, svg);
    }
    this.fill = el("path", { class: "g-fill", d: arcPath(R, START, START + SWEEP),
      "stroke-width": 6, pathLength: 1000, "stroke-dasharray": "0 1000" }, svg);

    for (let v = cfg.min; v <= cfg.max + 1e-9; v += cfg.minor) {
      const major = Math.abs((v - cfg.min) / cfg.major - Math.round((v - cfg.min) / cfg.major)) < 1e-6;
      const a = this.ang(v);
      const [x0, y0] = polar(R - 9, a), [x1, y1] = polar(R - (major ? 19 : 14), a);
      el("line", { class: "g-tick" + (major ? " major" : ""), x1: x0, y1: y0, x2: x1, y2: y1,
        "stroke-width": major ? 2 : 1 }, svg);
      if (major) {
        const [lx, ly] = polar(R - 30, a);
        const t = el("text", { class: "g-label", x: lx, y: ly }, svg);
        t.textContent = +(v / (cfg.labelDiv || 1)).toFixed(cfg.labelDecimals || 0);
      }
    }
    this.needle = el("line", { class: "g-needle", x1: CX, y1: CY, x2: CX + R - 14, y2: CY }, svg);
    el("circle", { class: "g-hub", cx: CX, cy: CY, r: 7 }, svg);
    this.valueText = el("text", { class: "g-value", x: CX, y: CY + 66 }, svg);
    this.valueText.textContent = "—";
    const u = el("text", { class: "g-unit", x: CX, y: CY + 82 }, svg);
    u.textContent = cfg.unit;
    this.unitText = u;
    this.isUnsupported = "";
    const h = document.createElement("h3");
    h.textContent = cfg.title;
    wrap.appendChild(h);
    this.render();
  }
  ang(v) {
    const c = this.cfg, t = Math.min(1, Math.max(0, (v - c.min) / (c.max - c.min)));
    return START + t * SWEEP;
  }
  set(v) {
    this.target = (v === null || v === undefined || Number.isNaN(v)) ? null : v;
    this.wrap.classList.toggle("stale", this.target === null);
    if (this.target === null) this.valueText.textContent = "—";
    else this.render(); // a value equal to the needle position (e.g. 0 rpm) never triggers step()
  }
  /** The car doesn't report this value: show N/A instead of a dash that looks like a fault. */
  unsupported(flag, label = "NOT SUPPORTED BY CAR") {
    const key = flag ? label : "";
    if (key === this.isUnsupported) return;
    this.isUnsupported = key;
    this.wrap.classList.toggle("unsupported", flag);
    this.unitText.textContent = flag ? label : this.cfg.unit;
    if (flag) { this.set(null); this.valueText.textContent = "N/A"; }
  }
  colorFor(v) {
    for (const [from, to, color] of this.cfg.zones || []) if (v >= from && v <= to) return color;
    return "var(--red)";
  }
  step() {
    const goal = this.target === null ? this.cfg.min : this.target;
    const d = goal - this.shown;
    if (Math.abs(d) < (this.cfg.max - this.cfg.min) * 0.0005) return;
    this.shown += d * 0.16;
    this.render();
  }
  render() {
    const a = this.ang(this.shown);
    this.needle.setAttribute("transform", `rotate(${a} ${CX} ${CY})`);
    const frac = (a - START) / SWEEP;
    this.fill.setAttribute("stroke-dasharray", `${(frac * 1000).toFixed(1)} 1000`);
    if (this.target !== null) {
      this.valueText.textContent = this.target.toFixed(this.cfg.decimals || 0);
      this.fill.style.stroke = this.colorFor(this.target);
    }
  }
}

