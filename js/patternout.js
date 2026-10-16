// Pattern output helpers (pure). Shapes are in millimetres, y pointing down, as stored by the pattern editor.
import { dist, bbox, rectPts, ellipsePts, quad, offsetPoly, smoothPoly } from "./geometry.js";
const closed = ["rect", "ellipse", "poly"];
export const polyOf = (s) => (s.type === "rect" ? rectPts(s.pts) : s.type === "ellipse" ? ellipsePts(s.pts, 64) : s.smooth ? smoothPoly(s.pts, s.corners || []) : s.pts);
export const seamOf = (s, seam) => (s.type === "ellipse" ? ellipsePts(s.pts, 64, seam) : offsetPoly(polyOf(s), seam));
export const imgRect = (s) => { const [a, b] = s.pts; return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }; };
export function extentOf(s, seam) {
  if (s.type === "text") return [s.pts[0], [s.pts[0][0] + s.text.length * s.size * 0.6, s.pts[0][1] - s.size]];
  if (s.type === "curve") return quad(s.pts[0], s.pts[1], s.pts[2], 32);
  if (s.type === "image") return [s.pts[0], s.pts[1]];
  if (s.type === "free") return s.pts;
  if (closed.includes(s.type)) return s.seam ? seamOf(s, seam) : polyOf(s);
  return s.pts;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Drafting marks a maker needs on the cut piece: fold edge, grainline, darts, notches, cut count and the seam allowance of each edge.
export function markSvg(s, fmt, opts = {}) {
  const m = s.mark; if (!m) return "";
  const IN = opts.ink || "#111", AC = opts.accent || "#b3261e", o = [];
  const seg = (a, b, w, dash, col) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${col || IN}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const lab = (p, t, size, col, rot) => `<text x="${p[0]}" y="${p[1]}" font-size="${size || 5}" fill="${col || IN}" font-family="sans-serif" font-weight="600"${rot ? ` transform="rotate(${rot} ${p[0]} ${p[1]})"` : ""}>${esc(t)}</text>`;
  if (m.fold && m.fold.a) {
    const v = [m.fold.a[1], m.fold.b[1]], len = Math.abs(v[1] - v[0]);
    o.push(`<path d="M${m.fold.a[0]} ${v[0]} L${m.fold.b[0]} ${v[1]}" stroke="${IN}" stroke-width="1.6"/>`);
    for (let i = 0; i < 4; i++) { const y = v[0] + (len * (i + 0.5)) / 4, x = m.fold.a[0]; o.push(seg([x, y], [x + 3.4, y - 3.4], 0.5)); }
    o.push(lab([m.fold.a[0] + 5, (v[0] + v[1]) / 2], "PLACE ON FOLD", 4.6, IN, 90));
  }
  if (m.grain) {
    const { a, b } = m.grain, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, h = 3.2;
    o.push(seg(a, b, 0.9));
    [[a, -1], [b, 1]].forEach(([p, s]) => { o.push(`<path d="M${p[0]} ${p[1]} L${p[0] + s * ux * h - uy * h * 0.55} ${p[1] + s * uy * h + ux * h * 0.55} M${p[0]} ${p[1]} L${p[0] + s * ux * h + uy * h * 0.55} ${p[1] + s * uy * h - ux * h * 0.55}" fill="none" stroke="${IN}" stroke-width="0.9"/>`); });
    o.push(lab([a[0] + 2.4, (a[1] + b[1]) / 2], "GRAIN LINE", 4.4, IN, Math.atan2(dy, dx) * 180 / Math.PI));
  }
  (m.darts || []).forEach((d) => {
    const [l, r] = d.legs;
    o.push(seg(l, d.apex, 0.7), seg(r, d.apex, 0.7), `<path d="M${l[0]} ${l[1]} Q${(l[0] + r[0]) / 2} ${(l[1] + r[1]) / 2 + 2} ${r[0]} ${r[1]}" fill="none" stroke="${IN}" stroke-width="0.7"/>`);
    o.push(lab([d.apex[0] + 1.6, d.apex[1] + 1.6], "dart " + fmt(d.intake), 4, AC));
  });
  (m.notches || []).forEach((n) => {
    const t = n.p, u = 4.2;
    o.push(`<path d="M${t[0] - u} ${t[1]} L${t[0] + u} ${t[1]} M${t[0]} ${t[1] - u} L${t[0]} ${t[1] + u}" stroke="${AC}" stroke-width="0.8" fill="none"/>`);
    if (opts.notchText) o.push(lab([t[0] + 5, t[1] - 4], n.t, 3.8, AC));
  });
  (m.text || []).forEach((t) => o.push(lab(t.p, t.t, 4.6, IN)));
  if (m.cut) o.push(lab([Math.min(...polyOf(s).map((p) => p[0])) + 2, Math.min(...polyOf(s).map((p) => p[1])) + 6], "CUT " + m.cut + (m.fabric && m.fabric !== "shell" ? " · " + m.fabric.toUpperCase() : ""), 5, AC));
  if (opts.edgeSa) (m.edges || []).forEach((e) => { if (!e.sa) return; const p = e.pts[Math.floor(e.pts.length / 2)]; o.push(lab([p[0] + 1.5, p[1] - 1.5], e.name + " " + fmt(e.sa), 3.6, IN)); });
  return o.join("");
}
const pt = (a) => a.map((p) => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
const freePath = (pts) => { if (pts.length < 2) return `M${pts[0][0]} ${pts[0][1]}l0.01 0`; let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`; for (let i = 1; i < pts.length - 1; i++) { const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]; d += `Q${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} ${m[0].toFixed(2)} ${m[1].toFixed(2)}`; } const l = pts[pts.length - 1]; return d + `L${l[0].toFixed(2)} ${l[1].toFixed(2)}`; };
export function toSvg(doc, fmt, opts = {}) {
  const all = doc.shapes.flatMap((s) => extentOf(s, doc.seam)), b = bbox(all.length ? all : [[0, 0], [100, 100]]), pad = 20, imgs = doc.images || {};
  const x = b.minX - pad, y = b.minY - pad, w = b.maxX - b.minX + pad * 2, h = b.maxY - b.minY + pad * 2; let o = "";
  doc.shapes.forEach((s) => {
    const st = s.stroke || "#111";
    if (s.type === "line") o += `<line x1="${s.pts[0][0]}" y1="${s.pts[0][1]}" x2="${s.pts[1][0]}" y2="${s.pts[1][1]}" stroke="${st}" stroke-width="0.6"/>`;
    else if (s.type === "dim") { const m = [(s.pts[0][0] + s.pts[1][0]) / 2, (s.pts[0][1] + s.pts[1][1]) / 2]; o += `<line x1="${s.pts[0][0]}" y1="${s.pts[0][1]}" x2="${s.pts[1][0]}" y2="${s.pts[1][1]}" stroke="#555" stroke-width="0.3"/><text x="${m[0]}" y="${m[1] - 2}" font-size="5" text-anchor="middle" fill="#555" font-family="sans-serif">${esc(fmt(dist(s.pts[0], s.pts[1])))}</text>`; }
    else if (s.type === "curve") o += `<path d="M${s.pts[0].join(" ")} Q${s.pts[1].join(" ")} ${s.pts[2].join(" ")}" fill="none" stroke="${st}" stroke-width="0.6"/>`;
    else if (s.type === "free") o += `<path d="${freePath(s.pts)}" fill="none" stroke="${st}" stroke-width="${s.width || 1}" stroke-linecap="round" stroke-linejoin="round"/>`;
    else if (s.type === "image") { const r = imgRect(s); if (imgs[s.img]) o += `<image href="${imgs[s.img]}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" preserveAspectRatio="none"/>`; }
    else if (s.type === "text") o += `<text x="${s.pts[0][0]}" y="${s.pts[0][1]}" font-size="${s.size}" fill="${s.stroke || "#111"}" font-family="sans-serif">${esc(s.text)}</text>`;
    else { if (s.seam) o += `<polygon points="${pt(seamOf(s, doc.seam))}" fill="none" stroke="${opts.saInk || "#b8860b"}" stroke-width="0.4" stroke-dasharray="3 2"/>`;
      o += `<polygon points="${pt(polyOf(s))}" fill="${s.fill || opts.fill || "none"}" stroke="${s.deco && !s.stroke ? "none" : (opts.stroke || st)}" stroke-width="${opts.strokeWidth || 0.6}"/>`;
      o += markSvg(s, fmt, opts);
      if (s.label) { const bb = bbox(polyOf(s)); o += `<text x="${(bb.minX + bb.maxX) / 2}" y="${(bb.minY + bb.maxY) / 2}" font-size="${opts.labelSize || 6}" text-anchor="middle" fill="${opts.labelInk || "#111"}" font-family="sans-serif" font-weight="600">${esc(s.label)}</text>`; } }
  });
  const size = opts.fixed ? `width="${opts.fixed}" ` : `width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" `;
  return { w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" ${size}viewBox="${[x, y, w, h].map((v) => v.toFixed(2)).join(" ")}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${o}</svg>` };
}
// DXF R12 (ASCII), units millimetres, Y flipped so the pattern is the right way up in CAD. Layers: CUT, SEAM, DIM, TEXT. Pictures are not included.
export function toDXF(doc, fmt) {
  const out = [], g = (code, val) => out.push(String(code), String(val)), n = (v) => (+v).toFixed(3);
  const layers = [["CUT", 7], ["SEAM", 2], ["DIM", 3], ["TEXT", 7], ["DRAWING", 5]];
  g(0, "SECTION"); g(2, "HEADER"); g(9, "$ACADVER"); g(1, "AC1009"); g(9, "$INSUNITS"); g(70, 4); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES"); g(0, "TABLE"); g(2, "LTYPE"); g(70, 1); g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, "0.0"); g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LAYER"); g(70, layers.length); layers.forEach(([nm, col]) => { g(0, "LAYER"); g(2, nm); g(70, 0); g(62, col); g(6, "CONTINUOUS"); }); g(0, "ENDTAB"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  const line = (a, b, l) => { g(0, "LINE"); g(8, l); g(10, n(a[0])); g(20, n(-a[1])); g(30, "0.0"); g(11, n(b[0])); g(21, n(-b[1])); g(31, "0.0"); };
  const poly = (pts, close, l) => { g(0, "POLYLINE"); g(8, l); g(66, 1); g(70, close ? 1 : 0); pts.forEach((p) => { g(0, "VERTEX"); g(8, l); g(10, n(p[0])); g(20, n(-p[1])); g(30, "0.0"); }); g(0, "SEQEND"); g(8, l); };
  const text = (p, h, t, l) => { g(0, "TEXT"); g(8, l); g(10, n(p[0])); g(20, n(-p[1])); g(30, "0.0"); g(40, n(h)); g(1, String(t).replace(/[\r\n]+/g, " ")); g(50, "0.0"); };
  doc.shapes.forEach((s) => {
    if (s.type === "image") return;
    if (s.type === "line") line(s.pts[0], s.pts[1], "CUT");
    else if (s.type === "dim") { line(s.pts[0], s.pts[1], "DIM"); text([(s.pts[0][0] + s.pts[1][0]) / 2, (s.pts[0][1] + s.pts[1][1]) / 2], 4, fmt(dist(s.pts[0], s.pts[1])), "DIM"); }
    else if (s.type === "curve") poly(quad(s.pts[0], s.pts[1], s.pts[2], 32), false, "CUT");
    else if (s.type === "free") poly(s.pts.length > 1 ? s.pts : [s.pts[0], [s.pts[0][0] + 0.01, s.pts[0][1]]], false, "DRAWING");
    else if (s.type === "text") text(s.pts[0], s.size, s.text, "TEXT");
    else { poly(polyOf(s), true, s.deco ? "DRAWING" : "CUT"); if (s.seam) poly(seamOf(s, doc.seam), true, "SEAM"); if (s.label) { const b = bbox(polyOf(s)); text([(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], 6, s.label, "TEXT"); } }
  });
  g(0, "ENDSEC"); g(0, "EOF"); return out.join("\n") + "\n";
}
