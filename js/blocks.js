// Base pattern blocks. Sizes come from body measurements in cm; output shapes are in millimetres, y pointing down.
// These are simple starting shapes to adjust, not finished professional blocks.
export const NECKS = { round: "Round neck", v: "V neck", boat: "Boat neck", square: "Square neck" };
const poly = (role, label, pts, corners) => ({ type: "poly", pts: pts.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]), smooth: true, corners, seam: false, label, role, blk: true });
function neckPts(cx, Nw, depth, style) {
  if (style === "v") return { pts: [[cx, depth]], corners: [0] };
  if (style === "square") return { pts: [[cx + Nw / 2, depth], [cx - Nw / 2, depth]], corners: [0, 1] };
  return { pts: [[cx + Nw * 0.36, depth * 0.8], [cx, depth], [cx - Nw * 0.36, depth * 0.8]], corners: [] };
}
function upper(m, spec, cx, back, style, widths) {
  const H = m.height * 10, W = widths.chest, Sd = Math.min(m.shoulder * 10, W * 0.94), Nw = (style === "boat" ? 1.5 : 1) * m.neck * 10 / 3.3, D = (m.chest / 8 + 6) * 10, slope = H * 0.012;
  const depth = back ? (style === "boat" ? 15 : 25) : style === "v" ? Nw * 1.1 : style === "boat" ? Nw * 0.3 : style === "square" ? Nw * 0.6 : m.neck * 10 / 6;
  const xs = cx - Sd / 2, mid = xs - (cx - W / 2); // distance of shoulder tip inside the side seam
  const am = (cx - W / 2) + mid * 0.45 + W * 0.045;
  const nk = neckPts(cx, Nw, depth, style);
  return { D, slope, Nw, Sd, W, am, nk, H };
}
function topLike(m, spec, style, dress) {
  const H = m.height * 10, W = (m.chest + spec.ease) * 10 / 2, Ww = (m.waist + spec.ease) * 10 / 2, Wp = (m.hip + spec.ease) * 10 / 2;
  const D = (m.chest / 8 + 6) * 10, Wy = Math.max(D + 60, 0.225 * H), Hy = Math.max(Wy + 60, 0.34 * H);
  let Lg = spec.len * H; Lg = Math.max(Lg, (dress ? Hy : D) + 40);
  const Wh = dress ? Math.max(Wp, Ww) * (1 + spec.flare) : W * (1 + spec.flare), Wmax = Math.max(W, Wh, dress ? Wp : 0), cx = Wmax / 2, out = [];
  const make = (back, label, role, ox) => {
    const u = upper(m, spec, cx, back, style, { chest: W }), s = (x, y) => [x + ox, y];
    const pts = [s(cx - u.Nw / 2, 0), s(cx - u.Sd / 2, u.slope), s(u.am, u.D * 0.55), s(cx - W / 2, u.D)], corners = [0, 1, 3];
    if (dress) { pts.push(s(cx - Ww / 2, Wy), s(cx - Wp / 2, Hy)); }
    pts.push(s(cx - Wh / 2, Lg)); corners.push(pts.length - 1); pts.push(s(cx + Wh / 2, Lg)); corners.push(pts.length - 1);
    if (dress) { pts.push(s(cx + Wp / 2, Hy), s(cx + Ww / 2, Wy)); }
    pts.push(s(cx + W / 2, u.D)); corners.push(pts.length - 1);
    pts.push(s(2 * cx - (u.am + 0), u.D * 0.55)); pts.push(s(cx + u.Sd / 2, u.slope)); corners.push(pts.length - 1);
    pts.push(s(cx + u.Nw / 2, 0)); corners.push(pts.length - 1);
    const base = pts.length; u.nk.pts.forEach((q) => pts.push(s(q[0], q[1]))); u.nk.corners.forEach((c) => corners.push(base + c));
    return poly(role, label, pts, corners);
  };
  out.push(make(false, "FRONT", "front", 0), make(true, "BACK", "back", Wmax + 80));
  if (spec.sleeve > 0) {
    const T = (m.chest * 0.215 + spec.ease / 4) * 10, B = T * (spec.sleeve > 0.7 ? 0.72 : 0.88), capH = D * 0.35, Ls = Math.max(40, m.arm * 10 * spec.sleeve), ox = 2 * Wmax + 160;
    out.push(poly("sleeve", "SLEEVE (x2)", [[ox, capH], [ox + T / 2, 0], [ox + T, capH], [ox + T / 2 + B / 2, capH + Ls], [ox + T / 2 - B / 2, capH + Ls]], [0, 2, 3, 4]));
  }
  return out;
}
function skirt(m, spec) {
  const H = m.height * 10, Wt = (m.waist + spec.ease) * 10 / 2, Wp = (m.hip + spec.ease) * 10 / 2, Lg = Math.max(120, spec.len * H), yh = Math.min(0.1 * H, Lg * 0.5), Wh = Math.max(Wp, Wt) * (1 + spec.flare), cx = Math.max(Wh, Wp) / 2;
  const mk = (label, role, ox) => poly(role, label, [[ox + cx - Wt / 2, 0], [ox + cx - Wp / 2, yh], [ox + cx - Wh / 2, Lg], [ox + cx + Wh / 2, Lg], [ox + cx + Wp / 2, yh], [ox + cx + Wt / 2, 0]], [0, 2, 3, 5]);
  return [mk("FRONT", "front", 0), mk("BACK", "back", 2 * cx + 80)];
}
function pants(m, spec) {
  const H = m.height * 10, Tw = (m.hip + spec.ease) * 10 / 4, Lg = Math.max(100, spec.len * H);
  const mk = (label, role, ox, k) => { const cx = Tw * k, cy = Math.min(H * 0.145, Lg * 0.75), bw = Math.max(60, (Tw + cx) * spec.hemw), c = (Tw + cx) / 2;
    return poly(role, label, [[ox, 0], [ox + Tw, 0], [ox + Tw + cx * 0.3, cy * 0.45], [ox + Tw + cx, cy], [ox + c + bw / 2, Lg], [ox + c - bw / 2, Lg]], [0, 1, 3, 4, 5]); };
  return [mk("FRONT LEG (x2)", "frontleg", 0, 0.22), mk("BACK LEG (x2)", "backleg", Tw * 1.8 + 80, 0.3)];
}
export function makeBlock(spec, m, neck = "round", name = "") {
  const s = { ease: 8, flare: 0, sleeve: 0, hemw: 0.62, ...spec };
  if (s.kind === "cloth") { const w = s.w, l = s.l; return [poly("cloth", (name || "CLOTH").toUpperCase(), [[0, 0], [w, 0], [w, l], [0, l]], [0, 1, 2, 3])]; }
  if (s.kind === "skirt") return skirt(m, s);
  if (s.kind === "pants") return pants(m, s);
  return topLike(m, s, neck, s.kind === "dress");
}
