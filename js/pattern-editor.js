import { requireAuth, showMsg } from "./auth.js";
import { getProject, saveProjectData } from "./account.js";
import { dist, area, bbox, quad, distSeg, inPoly, nearestOnEdges } from "./geometry.js";
import { toDXF, toSvg, polyOf, extentOf, imgRect } from "./patternout.js";
import { makeBlock, NECKS } from "./blocks.js";
import { PRESETS } from "./bodymodel.js";
import { makeMotif, MOTIFS } from "./motifs.js";

const $ = (id) => document.getElementById(id);
const UNITS = { cm: { k: 10, d: 1, snap: 5 }, in: { k: 25.4, d: 2, snap: 6.35 }, mm: { k: 1, d: 1, snap: 1 } };
let unit = "cm"; try { unit = localStorage.getItem("fc-units") || "cm"; } catch (e) {}
if (!UNITS[unit]) unit = "cm";
const fmt = (mm) => (mm / UNITS[unit].k).toFixed(UNITS[unit].d) + " " + unit;
const num = (mm, extra = 1) => (mm / UNITS[unit].k).toFixed(UNITS[unit].d + extra);
const toMM = (v) => parseFloat(v) * UNITS[unit].k;

const TOOLS = [["select","Select","V"],["pan","Pan","H"],["pencil","Pencil","N"],["brush","Brush","B"],["eraser","Eraser","X"],["line","Line","L"],["rect","Rectangle","R"],["ellipse","Ellipse","E"],["poly","Polygon","P"],["curve","Curve","C"],["measure","Measure","M"],["text","Text","T"],["cut","Cut-out","K"]];
const FREE = ["pencil", "brush", "eraser", "cut"];
const HINT = {
  select: "Click a shape. Drag to move. Drag a point to reshape. Double-click an edge adds a point. Shift+click a point removes it. Ctrl+click toggles sharp or smooth.",
  pan: "Drag to pan. Scroll to zoom. The middle mouse button also pans.",
  pencil: "Drag to draw freehand. Pick a line colour first if you want one.", brush: "Drag to paint a thick stroke. Change the thickness in Colour and line.", eraser: "Drag over pencil or brush strokes to erase them.",
  line: "Click the start, then the end. Hold Shift for 15° angles. Esc cancels.", rect: "Click one corner, then the opposite corner.", ellipse: "Click the centre, then a point on the edge box.",
  poly: "Click each corner. Click the first point, press Enter, or double-click to close.", curve: "Click the start, then the bend point, then the end.",
  measure: "Click two points to leave a dimension on the pattern.", text: "Click where the note should go.", cut: "Draw around part of a picture to cut it out as a new picture."
};
const TITLE = { line: "Line", rect: "Rectangle", ellipse: "Ellipse", poly: "Polygon", curve: "Curve", dim: "Dimension", text: "Text", free: "Drawing", image: "Picture" };
const CLOSED = ["rect", "ellipse", "poly"];

let doc = { v: 2, seam: 15, shapes: [], images: {} }, hist = [], hi = -1, dirty = false, uid = null, pid = null, nextId = 1, catalog = [], blockInfo = null;
let tool = "select", sel = null, drawing = [], stroke = null, cur = [0, 0], drag = null, snapOn = true, gridOn = true, shiftDown = false, erased = false;
const style = { stroke: "", fill: "", lw: 1.2 }, imgs = new Map(), view = { s: 2, ox: 60, oy: 60 };
const cv = $("cv"), ctx = cv.getContext("2d"); let W = 800, H = 600;
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const w2s = (p) => [p[0] * view.s + view.ox, p[1] * view.s + view.oy];
const s2w = (p) => [(p[0] - view.ox) / view.s, (p[1] - view.oy) / view.s];
const shape = (id) => doc.shapes.find((s) => s.id === id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const uidStr = () => Math.random().toString(36).slice(2, 9);
const sn = (p) => { if (!snapOn) return p; const st = UNITS[unit].snap; return [Math.round(p[0] / st) * st, Math.round(p[1] / st) * st]; };
const grpOf = (s) => (s && s.grp ? doc.shapes.filter((x) => x.grp === s.grp) : s ? [s] : []);
const selShapes = () => grpOf(shape(sel));
const curveOf = (s) => quad(s.pts[0], s.pts[1], s.pts[2], 40);
const textW = (s) => s.text.length * s.size * 0.6;
const hasHandles = (s) => s && s.type !== "free";

function hitTest(p) {
  const tol = 7 / view.s;
  for (let i = doc.shapes.length - 1; i >= 0; i--) {
    const s = doc.shapes[i];
    if (s.type === "line" || s.type === "dim") { if (distSeg(p, s.pts[0], s.pts[1]) < tol) return s; }
    else if (s.type === "curve") { const c = curveOf(s); for (let j = 0; j < c.length - 1; j++) if (distSeg(p, c[j], c[j + 1]) < tol) return s; }
    else if (s.type === "free") { const t = tol + (s.width || 1) / 2; if (s.pts.length === 1 ? dist(p, s.pts[0]) < t : s.pts.some((q, j) => j < s.pts.length - 1 && distSeg(p, q, s.pts[j + 1]) < t)) return s; }
    else if (s.type === "image") { const r = imgRect(s); if (p[0] >= r.x - tol && p[0] <= r.x + r.w + tol && p[1] >= r.y - tol && p[1] <= r.y + r.h + tol) return s; }
    else if (s.type === "text") { const [a, b] = extentOf(s); if (p[0] >= a[0] - tol && p[0] <= b[0] + tol && p[1] <= a[1] + tol && p[1] >= b[1] - tol) return s; }
    else { const pl = polyOf(s); if (inPoly(p, pl)) return s; for (let j = 0; j < pl.length; j++) if (distSeg(p, pl[j], pl[(j + 1) % pl.length]) < tol) return s; }
  }
  return null;
}

// ---------- history ----------
const snapshot = () => JSON.stringify({ seam: doc.seam, shapes: doc.shapes });
function setDirty(d) { dirty = d; if (d) $("status").textContent = "Unsaved changes"; }
function commit() { hist = hist.slice(0, hi + 1); hist.push(snapshot()); if (hist.length > 150) hist.shift(); hi = hist.length - 1; setDirty(true); renderPanel(); renderList(); syncStyleUI(); draw(); }
function restore(i) { if (i < 0 || i >= hist.length) return; const d = JSON.parse(hist[i]); doc.seam = d.seam; doc.shapes = d.shapes; hi = i; if (!shape(sel)) sel = null; setDirty(true); renderPanel(); renderList(); syncStyleUI(); draw(); }
function pushShape(o, keepTool) { o.id = nextId++; if (style.stroke && !o.stroke && !["rect", "ellipse", "poly"].includes(o.type)) o.stroke = style.stroke; if (style.stroke && !o.stroke && CLOSED.includes(o.type)) o.stroke = style.stroke; if (style.fill && CLOSED.includes(o.type) && !o.fill) o.fill = style.fill; doc.shapes.push(o); sel = o.id; if (!keepTool) setTool("select"); commit(); }

// ---------- drawing ----------
function resize() {
  const r = cv.parentElement.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; cv.style.width = W + "px"; cv.style.height = H + "px"; ctx.setTransform(d, 0, 0, d, 0, 0); draw();
}
function drawGrid(col) {
  let step = UNITS[unit].k * (unit === "mm" ? 10 : 1); while (step * view.s < 8) step *= 5;
  const a = s2w([0, 0]), b = s2w([W, H]); ctx.strokeStyle = col; ctx.lineWidth = 1;
  for (let x = Math.floor(a[0] / step) * step; x <= b[0]; x += step) { const m = Math.round(x / step) % 5 === 0; ctx.globalAlpha = m ? 1 : 0.45; const sx = Math.round(x * view.s + view.ox) + 0.5; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke(); }
  for (let y = Math.floor(a[1] / step) * step; y <= b[1]; y += step) { const m = Math.round(y / step) % 5 === 0; ctx.globalAlpha = m ? 1 : 0.45; const sy = Math.round(y * view.s + view.oy) + 0.5; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
function path(pts, close) { ctx.beginPath(); pts.forEach((q, i) => { const p = w2s(q); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); if (close) ctx.closePath(); }
function freePath(pts) { const p = pts.map(w2s); ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); if (p.length === 1) ctx.lineTo(p[0][0] + 0.01, p[0][1]); for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2); if (p.length > 1) ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]); }
function label(txt, q, col, size = 13, dy = 0) { const p = w2s(q); ctx.fillStyle = col; ctx.font = "600 " + size + "px DM Sans, sans-serif"; ctx.textAlign = "center"; ctx.fillText(txt, p[0], p[1] + dy); ctx.textAlign = "left"; }
function seamPoly(s) { return s.type === "ellipse" ? extentOf({ ...s, seam: true }, doc.seam) : extentOf({ ...s, seam: true }, doc.seam); }
// Drafting marks that come with a generated piece: fold edge, grainline arrow, darts, notches, cut count.
function drawMarks(s, c) {
  const m = s.mark; if (!m) return;
  const P = (q) => w2s(q), arrow = (from, to) => { const a = Math.atan2(to[1] - from[1], to[0] - from[0]); ctx.beginPath(); ctx.moveTo(to[0], to[1]); ctx.lineTo(to[0] + Math.cos(a + 2.6) * 7, to[1] + Math.sin(a + 2.6) * 7); ctx.moveTo(to[0], to[1]); ctx.lineTo(to[0] + Math.cos(a - 2.6) * 7, to[1] + Math.sin(a - 2.6) * 7); ctx.stroke(); };
  ctx.save(); ctx.setLineDash([]); ctx.strokeStyle = c.chalk; ctx.lineCap = "round";
  if (m.fold && m.fold.a) {
    const a = P(m.fold.a), b = P(m.fold.b); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.lineWidth = 1.2; for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y - 5); ctx.stroke(); }
  }
  ctx.lineWidth = 1.4;
  (m.darts || []).forEach((d) => { const ap = P(d.apex), l = P(d.legs[0]), r = P(d.legs[1]); ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(ap[0], ap[1]); ctx.lineTo(r[0], r[1]); ctx.lineTo(l[0], l[1]); ctx.stroke(); ctx.beginPath(); ctx.arc(ap[0], ap[1], 2.6, 0, 7); ctx.stroke(); });
  (m.notches || []).forEach((n) => { const p = P(n.p); ctx.strokeStyle = c.pink; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(p[0] - 5, p[1]); ctx.lineTo(p[0] + 5, p[1]); ctx.moveTo(p[0], p[1] - 5); ctx.lineTo(p[0], p[1] + 5); ctx.stroke(); ctx.strokeStyle = c.chalk; ctx.lineWidth = 1.4; });
  if (m.grain) { const a = P(m.grain.a), b = P(m.grain.b); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); arrow(a, b); arrow(b, a); }
  (m.text || []).forEach((t) => { const p = P(t.p); ctx.fillStyle = c.tape; ctx.font = "600 11px DM Sans, sans-serif"; ctx.fillText(t.t, p[0], p[1]); });
  if (m.cut) { const b = bbox(polyOf(s)); label("CUT " + m.cut + (m.fold ? " · ON FOLD" : ""), [b.minX + 30, b.minY + 14], c.pink, 12); }
  ctx.restore();
}
function drawShape(s, selected, c, preview) {
  const col = selected ? c.pink : s.stroke || (s.type === "dim" ? c.tape : c.chalk);
  ctx.strokeStyle = col; ctx.lineWidth = selected ? 2.5 : 2; ctx.setLineDash(preview ? [5, 4] : []);
  if (s.type === "line" || s.type === "dim") {
    path(s.pts, false); ctx.stroke();
    if (s.type === "dim") { const m = [(s.pts[0][0] + s.pts[1][0]) / 2, (s.pts[0][1] + s.pts[1][1]) / 2]; label(fmt(dist(s.pts[0], s.pts[1])), m, c.tape, 13, -7); s.pts.forEach((q) => { const p = w2s(q); ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fillStyle = c.tape; ctx.fill(); }); }
  } else if (s.type === "curve") { path(curveOf(s), false); ctx.stroke(); }
  else if (s.type === "polyline") { path(s.pts, false); ctx.stroke(); }
  else if (s.type === "free") { ctx.lineCap = ctx.lineJoin = "round"; ctx.lineWidth = Math.max(1, (s.width || 1) * view.s); freePath(s.pts); ctx.stroke(); ctx.lineCap = "butt"; if (selected) { const b = bbox(s.pts), a = w2s([b.minX, b.minY]), z = w2s([b.maxX, b.maxY]); ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.strokeStyle = c.pink; ctx.strokeRect(a[0] - 4, a[1] - 4, z[0] - a[0] + 8, z[1] - a[1] + 8); } }
  else if (s.type === "image") { const r = imgRect(s), a = w2s([r.x, r.y]), el = imgs.get(s.img); if (el) ctx.drawImage(el, a[0], a[1], r.w * view.s, r.h * view.s); else { ctx.strokeRect(a[0], a[1], r.w * view.s, r.h * view.s); } if (selected) { ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeRect(a[0], a[1], r.w * view.s, r.h * view.s); } }
  else if (s.type === "text") { const p = w2s(s.pts[0]); ctx.fillStyle = col; ctx.font = "600 " + Math.max(8, s.size * view.s) + "px DM Sans, sans-serif"; ctx.fillText(s.text, p[0], p[1]); }
  else {
    if (s.seam && !preview) { ctx.setLineDash([7, 5]); ctx.strokeStyle = selected ? c.pink : c.tape; ctx.lineWidth = 1.5; path(seamPoly(s), true); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = col; ctx.lineWidth = selected ? 2.5 : 2; }
    path(polyOf(s), true);
    if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); } else { ctx.globalAlpha = 0.07; ctx.fillStyle = c.chalk; ctx.fill(); ctx.globalAlpha = 1; }
    if (!(s.deco && !s.stroke && !selected)) { ctx.lineWidth = s.deco ? 1 : selected ? 2.5 : 2; ctx.stroke(); }
    if (s.mark && !preview) drawMarks(s, c);
    if (s.label && !preview) { const b = bbox(polyOf(s)); label(s.label, [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], c.chalk, 14, 5); }
  }
  ctx.setLineDash([]);
}
function draw() {
  const c = { chalk: css("--chalk"), pink: css("--pink"), tape: css("--tape") };
  ctx.fillStyle = css("--mat"); ctx.fillRect(0, 0, W, H); if (gridOn) drawGrid(css("--grid"));
  const o = w2s([0, 0]); ctx.strokeStyle = c.tape; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(o[0] - 8, o[1]); ctx.lineTo(o[0] + 8, o[1]); ctx.moveTo(o[0], o[1] - 8); ctx.lineTo(o[0], o[1] + 8); ctx.stroke(); ctx.globalAlpha = 1;
  const ids = new Set(selShapes().map((s) => s.id));
  doc.shapes.forEach((s) => drawShape(s, ids.has(s.id), c, false));
  const ps = shape(sel); if (ps && hasHandles(ps)) ps.pts.forEach((q, i) => { const p = w2s(q), corner = ps.smooth && (ps.corners || []).includes(i); ctx.fillStyle = c.pink; if (ps.type === "poly" && ps.smooth && !corner) { ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, 7); ctx.fill(); } else ctx.fillRect(p[0] - 4, p[1] - 4, 8, 8); });
  const pv = previewShape(); if (pv) drawShape(pv, true, c, true);
  if (stroke && stroke.length) { ctx.strokeStyle = tool === "cut" ? c.tape : tool === "eraser" ? "#ff8a8a" : style.stroke || c.chalk; ctx.lineWidth = tool === "cut" || tool === "eraser" ? 1.5 : Math.max(1, strokeWidth() * view.s); ctx.setLineDash(tool === "cut" ? [5, 4] : []); ctx.lineCap = ctx.lineJoin = "round"; freePath(stroke); ctx.stroke(); ctx.lineCap = "butt"; ctx.setLineDash([]); }
}
const strokeWidth = () => (tool === "brush" ? style.lw * 4 : style.lw);
function previewShape() {
  if (!drawing.length) return null; const pts = [...drawing, cur];
  if (tool === "poly") return { type: "polyline", pts };
  if (tool === "curve") return pts.length === 2 ? { type: "line", pts } : { type: "curve", pts };
  const t = tool === "measure" ? "dim" : tool; return ["line", "rect", "ellipse", "dim"].includes(t) ? { type: t, pts } : null;
}
function liveLen() {
  if (!drawing.length) return ""; const a = drawing[drawing.length - 1];
  if (tool === "rect" || tool === "ellipse") { const f = tool === "ellipse" ? 2 : 1; return fmt(Math.abs(cur[0] - drawing[0][0]) * f) + " × " + fmt(Math.abs(cur[1] - drawing[0][1]) * f); }
  return "Length " + fmt(dist(a, cur));
}

// ---------- tools / input ----------
function setTool(t) {
  tool = t; drawing = []; stroke = null;
  document.querySelectorAll("#tools button[data-t]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === t));
  $("st-hint").textContent = HINT[t]; cv.style.cursor = t === "pan" ? "grab" : t === "select" ? "default" : "crosshair"; draw();
}
function constrain(p) {
  if (!shiftDown || !drawing.length || !["line", "measure", "poly"].includes(tool)) return p;
  const a = drawing[drawing.length - 1], ang = Math.round(Math.atan2(p[1] - a[1], p[0] - a[0]) / (Math.PI / 12)) * (Math.PI / 12), L = dist(a, p);
  return [a[0] + L * Math.cos(ang), a[1] + L * Math.sin(ang)];
}
const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function finishTool() {
  const d = drawing; drawing = []; if (d.length < 2 || dist(d[0], d[1]) < 0.5) { draw(); return; }
  if (tool === "line") pushShape({ type: "line", pts: d }); else if (tool === "measure") pushShape({ type: "dim", pts: d });
  else if (tool === "rect") pushShape({ type: "rect", pts: d, seam: false, label: "" }); else if (tool === "ellipse") pushShape({ type: "ellipse", pts: d, seam: false, label: "" });
  else if (tool === "curve") pushShape({ type: "curve", pts: d });
}
function finishPoly() { const d = drawing; drawing = []; if (d.length >= 3) pushShape({ type: "poly", pts: d, seam: false, label: "" }); else draw(); }
function rdp(pts, eps) {
  if (pts.length < 3) return pts; let md = 0, mi = 0; const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) { const d = distSeg(pts[i], a, b); if (d > md) { md = d; mi = i; } }
  if (md <= eps) return [a, b]; return [...rdp(pts.slice(0, mi + 1), eps).slice(0, -1), ...rdp(pts.slice(mi), eps)];
}
function eraseAt(p) {
  const r = 8 / view.s; const keep = doc.shapes.filter((s) => !(s.type === "free" && (s.pts.length === 1 ? dist(p, s.pts[0]) < r + (s.width || 1) / 2 : s.pts.some((q, j) => j < s.pts.length - 1 && distSeg(p, q, s.pts[j + 1]) < r + (s.width || 1) / 2))));
  if (keep.length !== doc.shapes.length) { doc.shapes = keep; erased = true; if (!shape(sel)) sel = null; }
}
function removeVertex(s, i) { s.pts.splice(i, 1); s.corners = (s.corners || []).filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)); }

cv.addEventListener("pointerdown", (e) => {
  cv.focus(); cv.setPointerCapture(e.pointerId);
  const sp = pos(e), raw = s2w(sp);
  if (e.button === 1 || e.button === 2 || tool === "pan") { drag = { mode: "pan", sx: sp[0], sy: sp[1], ox: view.ox, oy: view.oy }; return; }
  if (FREE.includes(tool)) { stroke = [raw]; drag = { mode: "free" }; if (tool === "eraser") { erased = false; eraseAt(raw); } draw(); return; }
  if (tool === "select") {
    const s = shape(sel);
    if (s && hasHandles(s)) { const i = s.pts.findIndex((q) => dist(w2s(q), sp) < 9);
      if (i >= 0) {
        if (e.shiftKey && s.type === "poly" && s.pts.length > 3) { removeVertex(s, i); commit(); return; }
        if ((e.ctrlKey || e.metaKey) && s.type === "poly") { s.smooth = true; const cs = new Set(s.corners || []); cs.has(i) ? cs.delete(i) : cs.add(i); s.corners = [...cs].sort((a, b) => a - b); commit(); return; }
        drag = { mode: "vertex", idx: i, moved: false }; return; } }
    const h = hitTest(raw); sel = h ? h.id : null;
    if (h) { const orig = {}; grpOf(h).forEach((x) => (orig[x.id] = clone(x.pts))); drag = { mode: "move", start: sn(raw), orig, moved: false }; }
    renderPanel(); renderList(); syncStyleUI(); draw(); return;
  }
  const p = constrain(sn(raw));
  if (tool === "text") { const t = prompt("Text note"); if (t && t.trim()) pushShape({ type: "text", pts: [p], text: t.trim().slice(0, 80), size: 20 }); return; }
  if (tool === "poly") { if (drawing.length >= 3 && dist(w2s(drawing[0]), sp) < 10) { finishPoly(); return; } drawing.push(p); draw(); return; }
  drawing.push(p); if (drawing.length === (tool === "curve" ? 3 : 2)) finishTool(); else draw();
});
cv.addEventListener("pointermove", (e) => {
  const sp = pos(e), raw = s2w(sp); cur = constrain(sn(raw));
  $("st-pos").textContent = num(raw[0], 0) + ", " + num(raw[1], 0) + " " + unit; $("st-len").textContent = liveLen();
  if (drag) {
    if (drag.mode === "pan") { view.ox = drag.ox + sp[0] - drag.sx; view.oy = drag.oy + sp[1] - drag.sy; }
    else if (drag.mode === "free") { if (tool === "eraser") eraseAt(raw); const l = stroke[stroke.length - 1]; if (dist(w2s(l), sp) >= 2) stroke.push(raw); }
    else { const s = shape(sel); if (!s) return;
      if (drag.mode === "move") { const q = sn(raw), dx = q[0] - drag.start[0], dy = q[1] - drag.start[1]; grpOf(s).forEach((x) => { x.pts = drag.orig[x.id].map((v) => [v[0] + dx, v[1] + dy]); }); drag.moved = true; }
      else if (drag.mode === "vertex") { s.pts[drag.idx] = sn(raw); drag.moved = true; } }
  }
  draw();
});
async function endDrag() {
  const d = drag; drag = null; if (!d) return;
  if (d.mode === "free" && stroke) {
    const st = stroke; stroke = null;
    if (tool === "pencil" || tool === "brush") { const pts = rdp(st, 0.6 / view.s).map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]); pushShape({ type: "free", pts, width: strokeWidth(), ...(style.stroke ? { stroke: style.stroke } : {}) }, true); }
    else if (tool === "eraser") { if (erased) commit(); else draw(); }
    else if (tool === "cut") await cutOut(st);
    return;
  }
  if (d.moved) commit();
}
cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag); cv.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("dblclick", (e) => {
  if (tool === "poly" && drawing.length >= 3) { drawing.pop(); finishPoly(); return; }
  const s = shape(sel); if (tool !== "select" || !s || s.type !== "poly") return;
  const sp = pos(e), nr = nearestOnEdges(s2w(sp), s.pts);
  if (nr.d * view.s < 14) { s.pts.splice(nr.i + 1, 0, [Math.round(nr.q[0] * 10) / 10, Math.round(nr.q[1] * 10) / 10]); s.corners = (s.corners || []).map((c) => (c > nr.i ? c + 1 : c)); commit(); }
});
cv.addEventListener("wheel", (e) => { e.preventDefault(); const sp = pos(e), w = s2w(sp), f = Math.exp(-e.deltaY * 0.0015); view.s = Math.min(40, Math.max(0.05, view.s * f)); view.ox = sp[0] - w[0] * view.s; view.oy = sp[1] - w[1] * view.s; draw(); }, { passive: false });
function fitView() {
  const pts = doc.shapes.flatMap((s) => extentOf(s, doc.seam)); if (!pts.length) { view.s = 2; view.ox = 60; view.oy = 60; draw(); return; }
  const b = bbox(pts), pad = 60, w = b.maxX - b.minX || 1, h = b.maxY - b.minY || 1;
  view.s = Math.min(40, Math.max(0.05, Math.min((W - pad * 2) / w, (H - pad * 2) / h))); view.ox = (W - w * view.s) / 2 - b.minX * view.s; view.oy = (H - h * view.s) / 2 - b.minY * view.s; draw();
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Shift") shiftDown = true;
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === "z") { e.preventDefault(); restore(e.shiftKey ? hi + 1 : hi - 1); return; }
  if (mod && k === "y") { e.preventDefault(); restore(hi + 1); return; }
  if (mod && k === "s") { e.preventDefault(); save(); return; }
  if (mod && k === "d") { e.preventDefault(); duplicate(); return; }
  if (mod && k === "c") { copySel(); return; }
  if (k === "escape") { drawing = []; stroke = null; sel = null; renderPanel(); renderList(); draw(); return; }
  if (k === "enter" && tool === "poly") { finishPoly(); return; }
  if ((k === "delete" || k === "backspace") && sel) { e.preventDefault(); removeSel(); return; }
  const t = TOOLS.find((x) => x[2].toLowerCase() === k); if (t && !mod) setTool(t[0]);
});
window.addEventListener("keyup", (e) => { if (e.key === "Shift") shiftDown = false; });

// ---------- shape actions ----------
function removeSel() { const ids = new Set(selShapes().map((s) => s.id)); if (!ids.size) return; doc.shapes = doc.shapes.filter((s) => !ids.has(s.id)); sel = null; commit(); }
function insertShapes(shapes, images, dx, dy) {
  const gm = {}, made = []; Object.entries(images || {}).forEach(([id, url]) => { if (!doc.images[id]) { doc.images[id] = url; loadImage(id, url); } });
  shapes.forEach((s) => { const c = clone(s); c.id = nextId++; delete c.blk; if (c.grp) c.grp = gm[c.grp] || (gm[c.grp] = "g" + uidStr()); c.pts = c.pts.map((p) => [p[0] + dx, p[1] + dy]); doc.shapes.push(c); made.push(c); });
  if (made.length) { sel = made[made.length - 1].id; setTool("select"); commit(); }
}
function duplicate() { const sh = selShapes(); if (!sh.length) return; const imgsUsed = {}; sh.forEach((s) => { if (s.img) imgsUsed[s.img] = doc.images[s.img]; }); insertShapes(sh, imgsUsed, 20, 20); }
function mirror() { const sh = selShapes(); if (!sh.length) return; const b = bbox(sh.flatMap((s) => extentOf(s, doc.seam))), cx = (b.minX + b.maxX) / 2; sh.forEach((s) => { s.pts = s.pts.map((p) => [2 * cx - p[0], p[1]]); }); commit(); }
function copySel() { const sh = selShapes(); if (!sh.length) return; const images = {}; sh.forEach((s) => { if (s.img) images[s.img] = doc.images[s.img]; }); try { localStorage.setItem("fc-clip", JSON.stringify({ shapes: sh, images })); showMsg($("msg"), "Copied. You can paste it here or in another project.", "ok"); } catch (e) { showMsg($("msg"), "Couldn't copy. The picture may be too large."); } }
function pasteClip() { let c = null; try { c = JSON.parse(localStorage.getItem("fc-clip") || "null"); } catch (e) {} if (!c || !Array.isArray(c.shapes) || !c.shapes.length) return showMsg($("msg"), "Nothing copied yet."); showMsg($("msg"), ""); insertShapes(c.shapes, c.images, 20, 20); }
function viewCentre() { return s2w([W / 2, H / 2]); }

// ---------- pictures ----------
function loadImage(id, url) { return new Promise((res) => { const el = new Image(); el.onload = () => { imgs.set(id, el); draw(); res(el); }; el.onerror = () => res(null); el.src = url; }); }
async function addPicture(dataUrl, ratio, w) { const id = "i" + uidStr(); doc.images[id] = dataUrl; await loadImage(id, dataUrl); return id; }
function fileToImage(file) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = () => rej(new Error("Couldn't read that file.")); fr.onload = () => { const el = new Image(); el.onerror = () => rej(new Error("That doesn't look like a picture.")); el.onload = () => res({ el, type: file.type }); el.src = fr.result; }; fr.readAsDataURL(file); });
}
async function insertPictureFile(file) {
  try {
    if (!file.type.startsWith("image/")) throw new Error("Choose a picture file (PNG, JPG, WEBP).");
    const { el, type } = await fileToImage(file), k = Math.min(1, 900 / Math.max(el.naturalWidth, el.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(el.naturalWidth * k)); c.height = Math.max(1, Math.round(el.naturalHeight * k)); c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
    const url = c.toDataURL(type === "image/png" ? "image/png" : "image/jpeg", 0.85), id = await addPicture(url), w = 150, h = w * c.height / c.width, ctr = viewCentre();
    pushShape({ type: "image", img: id, pts: [[ctr[0] - w / 2, ctr[1] - h / 2], [ctr[0] + w / 2, ctr[1] + h / 2]] }); showMsg($("msg"), "Picture added. Use the Cut-out tool to take just a part of it.", "ok");
  } catch (e) { showMsg($("msg"), e.message || "Couldn't add that picture."); }
}
async function cutOut(lasso) {
  if (lasso.length < 6) { draw(); return showMsg($("msg"), "Draw a loop around the part you want."); }
  const lb = bbox(lasso), cands = doc.shapes.filter((s) => s.type === "image" && !(imgRect(s).x > lb.maxX || imgRect(s).x + imgRect(s).w < lb.minX || imgRect(s).y > lb.maxY || imgRect(s).y + imgRect(s).h < lb.minY));
  const target = (shape(sel) && shape(sel).type === "image" && cands.includes(shape(sel)) ? shape(sel) : cands[cands.length - 1]);
  if (!target) { draw(); return showMsg($("msg"), "No picture there. Insert a picture first, then draw around part of it."); }
  const r = imgRect(target), el = imgs.get(target.img); if (!el) return;
  const x0 = Math.max(lb.minX, r.x), y0 = Math.max(lb.minY, r.y), x1 = Math.min(lb.maxX, r.x + r.w), y1 = Math.min(lb.maxY, r.y + r.h);
  if (x1 - x0 < 1 || y1 - y0 < 1) { draw(); return; }
  const sx = el.naturalWidth / r.w, sy = el.naturalHeight / r.h, wpx = (x1 - x0) * sx, hpx = (y1 - y0) * sy, k = Math.min(1, 800 / Math.max(wpx, hpx)), c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(wpx * k)); c.height = Math.max(1, Math.round(hpx * k)); const g = c.getContext("2d");
  g.beginPath(); lasso.forEach((p, i) => { const X = (Math.min(Math.max(p[0], x0), x1) - x0) * sx * k, Y = (Math.min(Math.max(p[1], y0), y1) - y0) * sy * k; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.clip();
  g.drawImage(el, (x0 - r.x) * sx, (y0 - r.y) * sy, wpx, hpx, 0, 0, c.width, c.height);
  const id = await addPicture(c.toDataURL("image/png"));
  pushShape({ type: "image", img: id, pts: [[x0 + 15, y0 + 15], [x1 + 15, y1 + 15]] }); showMsg($("msg"), "Cut out. The new picture is on top. Drag it where you want it.", "ok");
}
async function removeBackground(s) {
  const el = imgs.get(s.img); if (!el) return; const k = Math.min(1, 800 / Math.max(el.naturalWidth, el.naturalHeight)), w = Math.max(1, Math.round(el.naturalWidth * k)), h = Math.max(1, Math.round(el.naturalHeight * k));
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(el, 0, 0, w, h); const im = g.getImageData(0, 0, w, h), d = im.data;
  const px = (x, y) => (y * w + x) * 4, corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]], bg = [0, 1, 2].map((i) => corners.reduce((t, [x, y]) => t + d[px(x, y) + i], 0) / 4);
  const spread = Math.max(...corners.map(([x, y]) => Math.max(...[0, 1, 2].map((i) => Math.abs(d[px(x, y) + i] - bg[i])))));
  if (spread > 60) return showMsg($("msg"), "The corners of this picture are different colours, so the background isn't plain. Try the Cut-out tool instead.");
  const seen = new Uint8Array(w * h), stack = corners.map(([x, y]) => y * w + x), tol = 45; let n = 0;
  while (stack.length) { const idx = stack.pop(); if (seen[idx]) continue; seen[idx] = 1; const o = idx * 4; if (Math.max(Math.abs(d[o] - bg[0]), Math.abs(d[o + 1] - bg[1]), Math.abs(d[o + 2] - bg[2])) > tol) continue; d[o + 3] = 0; n++; const x = idx % w, y = (idx - x) / w; if (x > 0) stack.push(idx - 1); if (x < w - 1) stack.push(idx + 1); if (y > 0) stack.push(idx - w); if (y < h - 1) stack.push(idx + w); }
  g.putImageData(im, 0, 0); s.img = await addPicture(c.toDataURL("image/png")); commit(); showMsg($("msg"), n ? "Plain background removed." : "Nothing to remove.", n ? "ok" : "error");
}
cv.addEventListener("dragover", (e) => e.preventDefault());
cv.addEventListener("drop", (e) => { e.preventDefault(); const f = [...(e.dataTransfer.files || [])].find((x) => x.type.startsWith("image/")); if (f) insertPictureFile(f); });
window.addEventListener("paste", (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); insertPictureFile(f); return; } pasteClip();
});

// ---------- colour and line ----------
function applyStyle(key, val) { selShapes().forEach((s) => { if (key === "stroke") { if (val) s.stroke = val; else delete s.stroke; } else if (key === "fill") { if (CLOSED.includes(s.type)) { if (val) s.fill = val; else delete s.fill; } } else if (key === "lw" && s.type === "free") s.width = val; }); if (selShapes().length) commit(); else draw(); }
function syncStyleUI() {
  const s = shape(sel); if (s) { if (s.stroke) $("stroke").value = s.stroke; if (CLOSED.includes(s.type)) { $("nofill").checked = !s.fill; if (s.fill) $("fill").value = s.fill; } if (s.type === "free") $("lw").value = (s.width || 1).toFixed(1); }
}
$("stroke").oninput = () => { style.stroke = $("stroke").value; applyStyle("stroke", style.stroke); };
$("strokeauto").onclick = () => { style.stroke = ""; applyStyle("stroke", ""); };
$("fill").oninput = () => { $("nofill").checked = false; style.fill = $("fill").value; applyStyle("fill", style.fill); };
$("nofill").onchange = () => { style.fill = $("nofill").checked ? "" : $("fill").value; applyStyle("fill", style.fill); };
$("lw").onchange = () => { const v = parseFloat($("lw").value); if (!(v >= 0.2 && v <= 30)) { showMsg($("msg"), "Thickness must be between 0.2 and 30 mm."); $("lw").value = style.lw; return; } showMsg($("msg"), ""); style.lw = v; applyStyle("lw", v); };
$("cpy").onclick = copySel; $("pst").onclick = pasteClip;

// ---------- side panel ----------
function field(parent, text, val, fn, type) {
  const l = document.createElement("label"); l.textContent = text; const i = document.createElement("input"); if (type) i.type = type;
  if (type === "checkbox") i.checked = val; else i.value = val; l.append(i); parent.append(l); i.addEventListener("change", () => fn(type === "checkbox" ? i.checked : i.value)); return i;
}
function note(parent, t) { const p = document.createElement("p"); p.className = "ro"; p.textContent = t; parent.append(p); }
function btn(parent, t, fn, cls) { const b = document.createElement("button"); b.className = "mini " + (cls || ""); b.textContent = t; b.onclick = fn; parent.append(b); return b; }
function renderPanel() {
  const p = $("props"); p.textContent = ""; const s = shape(sel), box = document.createElement("details"); box.open = true; p.append(box);
  const h = document.createElement("summary"); h.textContent = s ? TITLE[s.type] : "Pattern settings"; box.append(h);
  if (!s) { field(box, "Seam allowance (" + unit + ")", num(doc.seam), (v) => { const m = toMM(v); if (m >= 0 && m <= 100) { doc.seam = m; commit(); } else showMsg($("msg"), "Seam allowance must be between 0 and 100 mm."); }); note(box, "Applies to every shape that has seam allowance switched on. Select a shape to edit it by typing exact values."); return; }
  const a = s.pts[0], b = s.pts[1];
  if (s.type === "line" || s.type === "dim") field(box, "Length (" + unit + ")", num(dist(a, b)), (v) => { const m = toMM(v), L = dist(a, b) || 1; if (m > 0) { s.pts[1] = [a[0] + (b[0] - a[0]) / L * m, a[1] + (b[1] - a[1]) / L * m]; commit(); } });
  if (s.type === "rect") {
    field(box, "Width (" + unit + ")", num(Math.abs(b[0] - a[0])), (v) => { const m = toMM(v); if (m > 0) { s.pts[1] = [a[0] + (Math.sign(b[0] - a[0]) || 1) * m, b[1]]; commit(); } });
    field(box, "Height (" + unit + ")", num(Math.abs(b[1] - a[1])), (v) => { const m = toMM(v); if (m > 0) { s.pts[1] = [b[0], a[1] + (Math.sign(b[1] - a[1]) || 1) * m]; commit(); } });
  }
  if (s.type === "ellipse") {
    field(box, "Width (" + unit + ")", num(Math.abs(b[0] - a[0]) * 2), (v) => { const m = toMM(v); if (m > 0) { s.pts[1] = [a[0] + (Math.sign(b[0] - a[0]) || 1) * m / 2, b[1]]; commit(); } });
    field(box, "Height (" + unit + ")", num(Math.abs(b[1] - a[1]) * 2), (v) => { const m = toMM(v); if (m > 0) { s.pts[1] = [b[0], a[1] + (Math.sign(b[1] - a[1]) || 1) * m / 2]; commit(); } });
  }
  if (s.type === "image") {
    const r = imgRect(s);
    field(box, "Width (" + unit + ")", num(r.w), (v) => { const m = toMM(v); if (m > 0) { s.pts = [[r.x, r.y], [r.x + m, r.y + r.h]]; commit(); } });
    field(box, "Height (" + unit + ")", num(r.h), (v) => { const m = toMM(v); if (m > 0) { s.pts = [[r.x, r.y], [r.x + r.w, r.y + m]]; commit(); } });
    btn(box, "Remove plain background", () => removeBackground(s));
  }
  if (s.type === "free") field(box, "Thickness (mm)", (s.width || 1).toFixed(1), (v) => { const m = parseFloat(v); if (m >= 0.2 && m <= 30) { s.width = m; commit(); } });
  if (s.type === "curve") { const c = curveOf(s); let L = 0; for (let i = 0; i < c.length - 1; i++) L += dist(c[i], c[i + 1]); note(box, "Curve length: " + fmt(L)); }
  if (s.type === "text") field(box, "Text", s.text, (v) => { if (v.trim()) { s.text = v.trim().slice(0, 80); commit(); } });
  if (CLOSED.includes(s.type)) {
    field(box, "Piece name", s.label || "", (v) => { s.label = v.trim().slice(0, 30); commit(); });
    field(box, "Add seam allowance", !!s.seam, (v) => { s.seam = v; commit(); }, "checkbox");
    if (s.type === "poly") field(box, "Smooth curves", !!s.smooth, (v) => { s.smooth = v; commit(); }, "checkbox");
    const ar = Math.abs(area(polyOf(s))) / (UNITS[unit].k * UNITS[unit].k); note(box, "Area: " + ar.toFixed(2) + " " + unit + "²");
  }
  const r = document.createElement("div"); r.className = "row"; box.append(r);
  btn(r, "Duplicate", duplicate); btn(r, "Mirror", mirror); btn(r, "Delete", removeSel); btn(r, "Copy", copySel);
  if (s.grp) btn(r, "Ungroup", () => { const g = s.grp; doc.shapes.forEach((x) => { if (x.grp === g) delete x.grp; }); commit(); });
}
function renderList() {
  const ul = $("list"); ul.textContent = "";
  if (!doc.shapes.length) { const li = document.createElement("li"); li.className = "ro"; li.textContent = "Nothing drawn yet."; ul.append(li); return; }
  doc.shapes.forEach((s, i) => { const li = document.createElement("li"), b = document.createElement("button");
    b.textContent = TITLE[s.type] + " " + (i + 1) + (s.label ? " · " + s.label : s.text ? " · " + s.text.slice(0, 14) : ""); if (s.id === sel) b.setAttribute("aria-current", "true");
    b.onclick = () => { sel = s.id; setTool("select"); renderPanel(); renderList(); syncStyleUI(); draw(); }; li.append(b); ul.append(li); });
}

// ---------- base pattern, motifs, my designs ----------
function insertBlock() {
  const g = catalog.find((x) => x.id === $("bg").value); if (!g) return showMsg($("msg"), "Choose a garment first.");
  const m = { ...PRESETS[$("bp").value] }, made = makeBlock(g.block, m, $("bn").value, g.name).map((s) => ({ ...s, id: nextId++ }));
  doc.shapes = [...made, ...doc.shapes.filter((s) => !s.blk)]; blockInfo = { garment: g.name, garmentId: g.id, preset: $("bp").value, neck: $("bn").value }; sel = made[0].id; setTool("select"); commit(); fitView();
  showMsg($("msg"), "Base pattern for " + g.name + " added. Drag the points to make it your own design.", "ok");
}
$("binsert").onclick = insertBlock;
$("madd").onclick = () => { const c = viewCentre(), fillC = style.fill || "#ff5fa2", size = Math.max(40, Math.min(120, 160 / view.s * 1.0)), g = "g" + uidStr();
  const sh = makeMotif($("motif").value, c[0], c[1], size, fillC, style.stroke); sh.forEach((s) => { s.id = nextId++; s.grp = g; doc.shapes.push(s); }); if (sh.length) { sel = sh[sh.length - 1].id; setTool("select"); commit(); } };
const LIB = "fc-designs";
const libGet = () => { try { return JSON.parse(localStorage.getItem(LIB) || "[]"); } catch (e) { return []; } };
function renderLib() { const l = libGet(), s = $("dlist"); s.textContent = ""; if (!l.length) { const o = document.createElement("option"); o.textContent = "No saved designs yet"; o.value = ""; s.append(o); return; } l.forEach((d, i) => { const o = document.createElement("option"); o.value = i; o.textContent = d.name; s.append(o); }); }
$("dsave").onclick = () => {
  const sh = selShapes(); if (!sh.length) return showMsg($("msg"), "Select the shapes you want to save first."); const name = $("dname").value.trim(); if (!name) return showMsg($("msg"), "Give the design a name.");
  const b = bbox(sh.flatMap((s) => extentOf(s, doc.seam))), images = {}; sh.forEach((s) => { if (s.img) images[s.img] = doc.images[s.img]; });
  const shapes = clone(sh).map((s) => { s.pts = s.pts.map((p) => [p[0] - b.minX, p[1] - b.minY]); delete s.blk; return s; }), lib = libGet(); lib.push({ name: name.slice(0, 30), shapes, images }); if (lib.length > 30) lib.shift();
  try { localStorage.setItem(LIB, JSON.stringify(lib)); renderLib(); $("dname").value = ""; showMsg($("msg"), "Saved to My designs. You can insert it in any project.", "ok"); } catch (e) { showMsg($("msg"), "Not enough space in this browser to save that design."); }
};
$("dins").onclick = () => { const d = libGet()[+$("dlist").value]; if (!d) return showMsg($("msg"), "Pick a saved design."); const c = viewCentre(), bb = bbox(d.shapes.flatMap((s) => extentOf(s, doc.seam))); insertShapes(d.shapes, d.images, c[0] - (bb.maxX + bb.minX) / 2, c[1] - (bb.maxY + bb.minY) / 2); };
$("ddel").onclick = () => { const l = libGet(), i = +$("dlist").value; if (!l[i]) return; l.splice(i, 1); localStorage.setItem(LIB, JSON.stringify(l)); renderLib(); };

// ---------- export ----------
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const fname = (ext) => ($("pname").textContent || "pattern").replace(/[^\w\-]+/g, "_") + "." + ext;
const buildSvg = () => toSvg(doc, fmt);
$("svgb").onclick = () => { if (!doc.shapes.length) return showMsg($("msg"), "Draw something first."); download(new Blob([buildSvg().svg], { type: "image/svg+xml" }), fname("svg")); };
$("pngb").onclick = () => {
  if (!doc.shapes.length) return showMsg($("msg"), "Draw something first.");
  const { w, h, svg } = buildSvg(), k = Math.min(4, 8000 / Math.max(w, h)), img = new Image();
  img.onload = () => { const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k); const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); c.toBlob((b) => download(b, fname("png")), "image/png"); };
  img.onerror = () => showMsg($("msg"), "Couldn't create the PNG. Try SVG instead."); img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
};
$("dxfb").onclick = () => { if (!doc.shapes.length) return showMsg($("msg"), "Draw something first."); download(new Blob([toDXF(doc, fmt)], { type: "application/dxf" }), fname("dxf")); };
$("prnb").onclick = () => {
  if (!doc.shapes.length) return showMsg($("msg"), "Draw something first.");
  const w = window.open("", "_blank"); if (!w) return showMsg($("msg"), "Your browser blocked the print window. Allow pop-ups for this site and try again.");
  w.document.write("<!doctype html><title>Pattern</title><style>@page{margin:8mm}body{margin:0}</style>" + buildSvg().svg); w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
};

// ---------- save / load ----------
function persistable() { const used = new Set(doc.shapes.map((s) => s.img).filter(Boolean)), images = {}; used.forEach((i) => { if (doc.images[i]) images[i] = doc.images[i]; }); return { v: 2, seam: doc.seam, shapes: doc.shapes, images }; }
async function save() {
  if (!pid) return; const b = $("save"); b.disabled = true; b.textContent = "Saving…";
  try { const data = { patternJson: JSON.stringify(persistable()) }; if (blockInfo) data.blockJson = JSON.stringify(blockInfo); await saveProjectData(uid, pid, data); dirty = false; $("status").textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); showMsg($("msg"), ""); }
  catch (e) { showMsg($("msg"), "Couldn't save. This browser may be out of space. Try removing large pictures or download a backup in Settings."); }
  b.disabled = false; b.textContent = "Save";
}
window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

// ---------- init ----------
TOOLS.forEach(([id, name, key], i) => { if (id === "line") { const s = document.createElement("div"); s.className = "sep"; $("tools").append(s); } const b = document.createElement("button"); b.dataset.t = id; b.innerHTML = "<span></span><kbd>" + key + "</kbd>"; b.firstChild.textContent = name; b.onclick = () => setTool(id); $("tools").append(b); });
{ const s = document.createElement("div"); s.className = "sep"; $("tools").append(s); const b = document.createElement("button"); b.id = "picb"; b.className = "act"; b.innerHTML = "<span>Picture…</span>"; b.title = "Insert a picture from your device"; b.onclick = () => $("imgf").click(); $("tools").append(b); }
$("imgf").onchange = (e) => { const f = e.target.files[0]; if (f) insertPictureFile(f); e.target.value = ""; };
$("unit").value = unit; $("unit").onchange = (e) => { unit = e.target.value; try { localStorage.setItem("fc-units", unit); } catch (x) {} renderPanel(); draw(); };
$("undo").onclick = () => restore(hi - 1); $("redo").onclick = () => restore(hi + 1); $("fit").onclick = fitView; $("save").onclick = save;
$("snap").onchange = (e) => { snapOn = e.target.checked; }; $("gridchk").onchange = (e) => { gridOn = e.target.checked; draw(); };
Object.entries(MOTIFS).forEach(([k, v]) => { const o = document.createElement("option"); o.value = k; o.textContent = v; $("motif").append(o); });
Object.entries(PRESETS).forEach(([k]) => { const o = document.createElement("option"); o.value = k; o.textContent = k; $("bp").append(o); });
Object.entries(NECKS).forEach(([k, v]) => { const o = document.createElement("option"); o.value = k; o.textContent = v; $("bn").append(o); });
renderLib(); new ResizeObserver(resize).observe(cv.parentElement); setTool("select"); renderPanel(); renderList();

const SYN = { Trousers: "Casual Trousers", Jacket: "Bomber Jacket", Dress: "Midi Dress", Other: "" };
requireAuth(async (u) => {
  uid = u.uid; pid = new URLSearchParams(location.search).get("id");
  if (!pid) { location.replace("dashboard.html"); return; }
  $("to3d").href = "studio.html?id=" + encodeURIComponent(pid);
  let p = null; try { [p, catalog] = await Promise.all([getProject(uid, pid), fetch("data/garments.json").then((r) => r.json()).then((j) => j.garments).catch(() => [])]); } catch (e) { showMsg($("msg"), "Couldn't load the project."); return; }
  if (!p) { showMsg($("msg"), "Project not found. Go back to the dashboard."); $("pname").textContent = "Not found"; return; }
  $("pname").textContent = p.name || "Untitled";
  const fams = {}; catalog.forEach((g) => (fams[g.family] = fams[g.family] || []).push(g));
  Object.keys(fams).forEach((f) => { const og = document.createElement("optgroup"); og.label = f; fams[f].forEach((g) => { const o = document.createElement("option"); o.value = g.id; o.textContent = g.name; og.append(o); }); $("bg").append(og); });
  $("bg").onchange = () => { const g = catalog.find((x) => x.id === $("bg").value); if (g) $("bp").value = g.block.preset; };
  if (p.patternJson) { try { const d = JSON.parse(p.patternJson); if (d && Array.isArray(d.shapes)) { doc = { v: 2, seam: d.seam ?? 15, shapes: d.shapes, images: d.images || {} }; await Promise.all(Object.entries(doc.images).map(([id, url]) => loadImage(id, url))); } } catch (e) { showMsg($("msg"), "This project's saved pattern couldn't be read, so it opened empty."); } }
  try { if (p.blockJson) blockInfo = JSON.parse(p.blockJson); } catch (e) {}
  nextId = Math.max(0, ...doc.shapes.map((s) => s.id || 0)) + 1;
  const want = blockInfo ? catalog.find((g) => g.id === blockInfo.garmentId) : catalog.find((g) => g.name.toLowerCase() === (SYN[p.garmentType] ?? p.garmentType ?? "").toLowerCase());
  if (want) { $("bg").value = want.id; $("bp").value = (blockInfo && blockInfo.preset) || want.block.preset; if (blockInfo && blockInfo.neck) $("bn").value = blockInfo.neck; } else if (catalog[0]) $("bp").value = "Adult female";
  hist = [snapshot()]; hi = 0; dirty = false;
  if (!p.patternJson && want) { insertBlock(); hist = [snapshot()]; hi = 0; dirty = false; $("status").textContent = "Base pattern added"; }
  else { $("status").textContent = p.patternJson ? "Loaded" : "New pattern"; }
  renderPanel(); renderList(); fitView();
});
