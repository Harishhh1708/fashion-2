// Draws the artwork of a design (fills, drawings, pictures, text) onto a canvas. Used to put your design on the 3D model.
import { bbox, inPoly } from "./geometry.js";
import { polyOf, imgRect } from "./patternout.js";
const closedT = ["rect", "ellipse", "poly"];
export const isPiece = (s) => !!s.role || (closedT.includes(s.type) && /^(front|back|sleeve)/i.test(s.label || ""));
function path(ctx, pts, T, close) { ctx.beginPath(); pts.forEach((p, i) => { const x = (p[0] - T.x) * T.sx, y = (p[1] - T.y) * T.sy; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (close) ctx.closePath(); }
export function drawShapeArt(ctx, s, imgs, T) {
  const st = s.stroke || "#222";
  if (s.type === "image") { const el = imgs.get ? imgs.get(s.img) : imgs[s.img], r = imgRect(s); if (el) ctx.drawImage(el, (r.x - T.x) * T.sx, (r.y - T.y) * T.sy, r.w * T.sx, r.h * T.sy); return; }
  if (s.type === "free") { ctx.strokeStyle = st; ctx.lineWidth = Math.max(1, (s.width || 1) * T.sx); ctx.lineCap = ctx.lineJoin = "round"; const p = s.pts.length > 1 ? s.pts : [s.pts[0], [s.pts[0][0] + 0.01, s.pts[0][1]]]; path(ctx, p, T, false); ctx.stroke(); return; }
  if (s.type === "line") { ctx.strokeStyle = st; ctx.lineWidth = Math.max(1, 0.8 * T.sx); path(ctx, s.pts, T, false); ctx.stroke(); return; }
  if (s.type === "text") { ctx.fillStyle = s.stroke || "#222"; ctx.font = "600 " + Math.max(6, s.size * T.sx) + "px sans-serif"; ctx.fillText(s.text, (s.pts[0][0] - T.x) * T.sx, (s.pts[0][1] - T.y) * T.sy); return; }
  if (closedT.includes(s.type)) { path(ctx, polyOf(s), T, true); if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); } if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = Math.max(1, 0.8 * T.sx); ctx.stroke(); } }
}
// Canvas of one pattern piece (its bounding box maps to pxW x pxH), clipped to the piece outline, with its fill and any artwork on it.
export function pieceArt(doc, imgs, piece, pxW, pxH) {
  const c = document.createElement("canvas"); c.width = pxW; c.height = pxH; const ctx = c.getContext("2d"), pl = polyOf(piece), b = bbox(pl);
  const T = { x: b.minX, y: b.minY, sx: pxW / Math.max(1, b.maxX - b.minX), sy: pxH / Math.max(1, b.maxY - b.minY) };
  ctx.save(); path(ctx, pl, T, true); ctx.clip();
  doc.shapes.forEach((s) => {
    if (s === piece) { drawShapeArt(ctx, { ...s, stroke: "" }, imgs, T); return; }
    if (isPiece(s) || s.type === "dim") return;
    const e = s.type === "image" ? [s.pts[0], s.pts[1]] : s.pts, eb = bbox(e), cx = (eb.minX + eb.maxX) / 2, cy = (eb.minY + eb.maxY) / 2;
    if (cx >= b.minX && cx <= b.maxX && cy >= b.minY && cy <= b.maxY) drawShapeArt(ctx, s, imgs, T);
  });
  ctx.restore(); return c;
}
export function hasArt(doc, piece) { return !!piece.fill || doc.shapes.some((s) => s !== piece && !isPiece(s) && s.type !== "dim"); }
