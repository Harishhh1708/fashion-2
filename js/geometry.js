// Pure geometry helpers. All coordinates are in millimetres.
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function bbox(p) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of p) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  return { minX, minY, maxX, maxY };
}
export function rectPts(pts) { const [a, b] = pts; return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]; }
export function ellipsePts(pts, n = 64, grow = 0) {
  const [c, e] = pts, rx = Math.abs(e[0] - c[0]) + grow, ry = Math.abs(e[1] - c[1]) + grow, out = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; out.push([c[0] + rx * Math.cos(t), c[1] + ry * Math.sin(t)]); }
  return out;
}
export function quad(a, c, b, n = 32) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
  return out;
}
export function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
export function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
// Offset a closed polygon outward by d (seam allowance). Sharp corners are mitred, with a limit.
export function offsetPoly(p, d) {
  const n = p.length; if (n < 3) return p;
  const sgn = area(p) > 0 ? 1 : -1, lines = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    lines.push({ x: a[0] + (sgn * dy / L) * d, y: a[1] + (-sgn * dx / L) * d, dx, dy });
  }
  return p.map((v, i) => {
    const l1 = lines[(i - 1 + n) % n], l2 = lines[i], cross = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(cross) < 1e-9) return [l2.x, l2.y];
    const t = ((l2.x - l1.x) * l2.dy - (l2.y - l1.y) * l2.dx) / cross;
    const q = [l1.x + l1.dx * t, l1.y + l1.dy * t];
    return Math.hypot(q[0] - v[0], q[1] - v[1]) > 4 * Math.abs(d) ? [l2.x, l2.y] : q;
  });
}
// Smooth closed outline through control points. corners is a list of indices that stay sharp.
export function smoothPoly(pts, corners = [], per = 10) {
  const n = pts.length; if (n < 3) return pts; const cs = new Set(corners), out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n], j = (i + 1) % n;
    const m1 = cs.has(i) ? [0, 0] : [(p2[0] - p0[0]) / 6, (p2[1] - p0[1]) / 6], m2 = cs.has(j) ? [0, 0] : [(p3[0] - p1[0]) / 6, (p3[1] - p1[1]) / 6];
    const c1 = [p1[0] + m1[0], p1[1] + m1[1]], c2 = [p2[0] - m2[0], p2[1] - m2[1]], straight = cs.has(i) && cs.has(j);
    const steps = straight ? 1 : per;
    for (let k = 0; k < steps; k++) { const t = k / steps, u = 1 - t;
      out.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0], u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]); }
  }
  return out;
}
export function nearestOnEdges(p, pts) {
  let best = { d: Infinity, i: 0, q: pts[0] };
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { d, i, q }; }
  return best;
}
// Width of a closed outline along a horizontal line at height y (0 if the line misses it).
export function widthAtY(poly, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] <= y && b[1] >= y) || (b[1] <= y && a[1] >= y)) { const t = b[1] === a[1] ? 0 : (y - a[1]) / (b[1] - a[1]), x = a[0] + (b[0] - a[0]) * t; lo = Math.min(lo, x); hi = Math.max(hi, x); } }
  return hi > lo ? hi - lo : 0;
}
