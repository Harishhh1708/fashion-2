// Pure helpers for pieces, rough fabric consumption and costing. Consumption is an ESTIMATE from bounding boxes.
import { bbox, area } from "./geometry.js";
import { polyOf, seamOf } from "./patternout.js";
const CLOSED = ["rect", "ellipse", "poly"];
export function piecesOf(doc) {
  let i = 0; const out = [];
  doc.shapes.forEach((s) => {
    if (!CLOSED.includes(s.type) || s.deco) return; i++;
    const pl = polyOf(s), b = bbox(s.seam ? seamOf(s, doc.seam) : pl), per = pl.reduce((t, p, k) => t + Math.hypot(p[0] - pl[(k + 1) % pl.length][0], p[1] - pl[(k + 1) % pl.length][1]), 0);
    out.push({ id: s.id, name: s.label || "Piece " + i, type: s.type, w: b.maxX - b.minX, h: b.maxY - b.minY, area: Math.abs(area(pl)), perimeter: per, seam: !!s.seam });
  });
  return out;
}
// Shelf packing of bounding boxes across a fabric width (mm). Returns length used, efficiency and any pieces that can't fit.
export function pack(pieces, widthMM, allowRotate, gap = 5) {
  const items = []; pieces.forEach((p) => { for (let q = 0; q < Math.max(1, p.qty || 1); q++) items.push({ name: p.name, w: p.w + gap, h: p.h + gap, area: p.area }); });
  const misfit = []; items.forEach((it) => { if (it.w > widthMM + gap) { if (allowRotate && it.h <= widthMM + gap) { [it.w, it.h] = [it.h, it.w]; } else misfit.push(it.name); } });
  const ok = items.filter((it) => !misfit.includes(it.name)); ok.sort((a, b) => b.h - a.h);
  const rows = []; ok.forEach((it) => {
    let r = rows.find((x) => x.used + it.w <= widthMM + gap && it.h <= x.h + 0.001);
    if (!r && allowRotate) { r = rows.find((x) => x.used + it.h <= widthMM + gap && it.w <= x.h + 0.001); if (r) { r.used += it.h; return; } }
    if (r) r.used += it.w; else rows.push({ used: it.w, h: it.h });
  });
  const length = rows.reduce((t, r) => t + r.h, 0), pieceArea = ok.reduce((t, i) => t + i.area, 0);
  return { length, efficiency: length ? pieceArea / (length * widthMM) : 0, rows: rows.length, misfit: [...new Set(misfit)] };
}
export function cost(i) {
  const fabricM = i.lengthM * (1 + i.extraPct / 100), fabric = fabricM * i.rate, materials = fabric + i.trims, overhead = (materials + i.labour) * i.overheadPct / 100;
  const total = materials + i.labour + overhead, price = total * (1 + i.marginPct / 100);
  return { fabricM, fabric, trims: i.trims, labour: i.labour, overhead, total, price, batchPrice: price * i.qty, batchFabricM: fabricM * i.qty };
}
