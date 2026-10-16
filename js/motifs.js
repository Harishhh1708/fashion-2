// Ready-made decorations. Each is a group of editable shapes marked deco (not counted as pattern pieces).
export const MOTIFS = { heart: "Heart", flower: "Flower", leaf: "Leaf", paisley: "Paisley", star: "Star", dots: "Polka dots", stripes: "Stripes", checks: "Checks", border: "Border" };
const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
export function makeMotif(name, cx, cy, size, fill = "#ff5fa2", stroke = "") {
  const r = size / 2, base = { deco: true, seam: false, fill, ...(stroke ? { stroke } : {}) };
  const poly = (pts, corners = [], extra = {}) => ({ type: "poly", pts: pts.map((p) => [cx + p[0] * r, cy + p[1] * r]), smooth: true, corners, ...base, ...extra });
  const rect = (x, y, w, h, extra = {}) => ({ type: "rect", pts: [[x, y], [x + w, y + h]], ...base, ...extra });
  const ell = (x, y, rx, ry, extra = {}) => ({ type: "ellipse", pts: [[x, y], [x + rx, y + ry]], ...base, ...extra });
  switch (name) {
    case "heart": { const pts = []; for (let i = 0; i < 18; i++) { const t = (i / 18) * Math.PI * 2; pts.push([16 * Math.sin(t) ** 3 / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]); } return [poly(pts)]; }
    case "flower": { const out = []; for (let k = 0; k < 5; k++) out.push(poly([[0, 0], [0.28, -0.35], [0, -0.9], [-0.28, -0.35]].map((p) => rot(p, (k * 2 * Math.PI) / 5)), [0, 2])); out.push(ell(cx, cy, r * 0.18, r * 0.18, { fill: "#f2c94c" })); return out; }
    case "leaf": return [poly([[0, -1], [0.45, -0.15], [0, 1], [-0.45, -0.15]], [0, 2], { fill: fill === "#ff5fa2" ? "#2e7d5b" : fill }), { type: "line", pts: [[cx, cy - r], [cx, cy + r * 0.9]], deco: true, stroke: "#ffffff" }];
    case "paisley": return [poly([[0, 0.9], [0.55, 0.35], [0.5, -0.4], [0, -0.9], [-0.35, -0.5], [-0.25, 0.1], [-0.55, 0.45]])];
    case "star": { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.42 : 1; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return [poly(pts, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])]; }
    case "dots": { const out = [], s = size / 3; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push(ell(cx - size / 2 + s / 2 + i * s, cy - size / 2 + s / 2 + j * s, size * 0.07, size * 0.07)); return out; }
    case "stripes": { const out = []; for (let i = 0; i < 5; i++) out.push(rect(cx - size / 2 + i * size * 0.2 + size * 0.06, cy - size / 2, size * 0.08, size)); return out; }
    case "checks": { const out = [], s = size / 4; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) out.push(rect(cx - size / 2 + i * s, cy - size / 2 + j * s, s, s)); return out; }
    case "border": { const out = [], n = 6, w = size / n; for (let i = 0; i < n; i++) out.push({ type: "poly", pts: [[cx - size / 2 + i * w, cy + w * 0.6], [cx - size / 2 + (i + 0.5) * w, cy - w * 0.6], [cx - size / 2 + (i + 1) * w, cy + w * 0.6]], smooth: false, ...base }); return out; }
    default: return [];
  }
}
