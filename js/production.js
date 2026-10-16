import { requireAuth, showMsg } from "./auth.js";
import { renderShell } from "./shell.js";
import { listProjects, getProject, saveProjectData } from "./account.js";
import { piecesOf, pack, cost } from "./costing.js";
import { toSvg } from "./patternout.js";
import { PRESETS, MEAS, TYPES } from "./bodymodel.js";
renderShell("production.html");
const $ = (id) => document.getElementById(id), msg = $("msg");
const UN = { cm: { k: 10, d: 1 }, in: { k: 25.4, d: 2 }, mm: { k: 1, d: 0 } };
let unit = "cm"; try { unit = localStorage.getItem("fc-units") || "cm"; } catch (e) {} if (!UN[unit]) unit = "cm";
const fmt = (mm) => (mm / UN[unit].k).toFixed(UN[unit].d) + " " + unit;
const cmFmt = (cmv) => (cmv * 10 / UN[unit].k).toFixed(UN[unit].d) + " " + unit;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (v) => ($("cur").value || "") + v.toFixed(2);
let uid, pid, proj, doc = { seam: 15, shapes: [] }, fabrics = [], edits = {}, pieces = [], qtys = {}, studio = null, last = null;
const fabOf = (id) => { const f = fabrics.find((x) => x.id === id) || fabrics[0]; return { ...f, ...(edits[f.id] || {}) }; };
function td(tr, text, cls) { const c = document.createElement("td"); c.textContent = text; if (cls) c.className = cls; tr.append(c); return c; }
function head(tbl, cols) { tbl.textContent = ""; const tr = document.createElement("tr"); cols.forEach((c, i) => { const th = document.createElement("th"); th.textContent = c; if (i > 0 && c.endsWith("#")) { th.textContent = c.slice(0, -1); th.className = "n"; } tr.append(th); }); tbl.append(tr); }

function drawPieces() {
  const t = $("pt"); head(t, ["Piece", "Width#", "Height#", "Area#", "Seam allowance", "Quantity#"]);
  if (!pieces.length) { $("pnote").textContent = "No closed shapes yet. Draw rectangles, ellipses or polygons in the pattern editor to calculate fabric."; return; }
  $("pnote").textContent = "Sizes include seam allowance where it is switched on. Set how many of each piece to cut per garment.";
  pieces.forEach((p) => { const tr = document.createElement("tr"); td(tr, p.name); td(tr, fmt(p.w), "n"); td(tr, fmt(p.h), "n"); td(tr, (p.area / UN[unit].k / UN[unit].k).toFixed(1) + " " + unit + "²", "n"); td(tr, p.seam ? "Yes" : "No");
    const c = document.createElement("td"); c.className = "n"; const i = document.createElement("input"); i.type = "number"; i.min = 1; i.max = 99; i.value = qtys[p.id] || 1; i.setAttribute("aria-label", "Quantity of " + p.name);
    i.onchange = () => { const v = Math.round(+i.value); if (!(v >= 1 && v <= 99)) { showMsg(msg, "Quantity must be 1 to 99."); i.value = qtys[p.id] || 1; return; } showMsg(msg, ""); qtys[p.id] = v; recalc(); }; c.append(i); tr.append(c); t.append(tr); });
}
function num(id, lo, hi, name) { const v = parseFloat($(id).value); if (isNaN(v) || v < lo || v > hi) { showMsg(msg, name + " must be between " + lo + " and " + hi + "."); return null; } return v; }
function recalc() {
  const w = num("wid", 20, 400, "Fabric width"), ex = num("extra", 0, 50, "Extra allowance"), rate = num("rate", 0, 1e6, "Fabric price"), tr = num("trims", 0, 1e6, "Trims"), lab = num("labour", 0, 1e6, "Labour"), oh = num("oh", 0, 200, "Overheads"), mg = num("mg", 0, 500, "Margin"), q = num("qty", 1, 1e5, "Order size");
  if ([w, ex, rate, tr, lab, oh, mg, q].some((v) => v === null)) return; showMsg(msg, "");
  const withQty = pieces.map((p) => ({ ...p, qty: qtys[p.id] || 1 })), pk = pack(withQty, w * 10, $("rot").checked), lengthM = pk.length / 1000;
  $("len").textContent = pieces.length ? lengthM.toFixed(2) + " m" : "0 m"; $("eff").textContent = pieces.length ? "Fabric use about " + Math.round(pk.efficiency * 100) + "% on " + w + " cm width." + (pk.misfit.length ? " Too wide for this fabric: " + pk.misfit.join(", ") + "." : "") : "";
  const c = cost({ lengthM, extraPct: ex, rate, trims: tr, labour: lab, overheadPct: oh, marginPct: mg, qty: q }); last = { c, pk, lengthM, w, ex, rate, tr, lab, oh, mg, q };
  const t = $("ct"); head(t, ["Item", "Per garment#", "Whole order#"]);
  [["Fabric (" + c.fabricM.toFixed(2) + " m)", c.fabric], ["Trims and accessories", c.trims], ["Stitching and labour", c.labour], ["Overheads", c.overhead], ["Total cost", c.total, 1], ["Selling price", c.price, 1]].forEach(([n, v, b]) => { const r = document.createElement("tr"); if (b) r.className = "tot"; td(r, n); td(r, money(v), "n"); td(r, money(v * q), "n"); t.append(r); });
}
function drawMeasures() {
  const m = studio ? studio.m : PRESETS["Adult female"], ease = studio ? studio.ease : 0, type = studio ? studio.type : null;
  $("mnote").textContent = studio ? "Body measurements from the saved 3D studio mannequin (" + studio.preset + "). Finished size is body plus ease for the measurements the garment covers." : "No 3D studio setup saved for this project, so these are the sample Adult female measurements. Open the 3D studio, set your measurements and save to use them here.";
  const covers = { tshirt: ["chest", "waist", "hip"], shirt: ["chest", "waist", "hip"], kurta: ["chest", "waist", "hip"], dress: ["chest", "waist", "hip"], skirt: ["waist", "hip"], trousers: ["waist", "hip"], shorts: ["waist", "hip"] }[type] || [];
  const t = $("mt"); head(t, ["Measurement", "Body#", "Ease#", "Finished (approx)#"]);
  MEAS.forEach(([k, l]) => { const r = document.createElement("tr"), on = covers.includes(k); td(r, l); td(r, cmFmt(m[k]), "n"); td(r, on ? cmFmt(ease) : "-", "n"); td(r, on ? cmFmt(m[k] + ease) : "-", "n"); t.append(r); });
}
function rows() {
  const r = [["Project", proj.name || ""], ["Garment", studio ? TYPES[studio.type] : proj.garmentType || ""], ["Fabric", fabOf($("fab").value).name], [], ["Piece", "Width (mm)", "Height (mm)", "Area (mm2)", "Seam", "Qty"]];
  pieces.forEach((p) => r.push([p.name, p.w.toFixed(1), p.h.toFixed(1), p.area.toFixed(0), p.seam ? "Yes" : "No", qtys[p.id] || 1]));
  if (last) { r.push([], ["Costing", "Per garment", "Order"], ["Fabric length (m)", last.c.fabricM.toFixed(2), last.c.batchFabricM.toFixed(2)]);
    [["Fabric", last.c.fabric], ["Trims", last.c.trims], ["Labour", last.c.labour], ["Overheads", last.c.overhead], ["Total cost", last.c.total], ["Selling price", last.c.price]].forEach(([n, v]) => r.push([n, v.toFixed(2), (v * last.q).toFixed(2)])); }
  r.push([], ["Measurement", "Body (cm)", "Ease (cm)"]); const m = studio ? studio.m : PRESETS["Adult female"]; MEAS.forEach(([k, l]) => r.push([l, m[k], studio ? studio.ease : 0])); return r;
}
$("csv").onclick = () => { const txt = rows().map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + txt], { type: "text/csv" })); a.download = (proj.name || "project").replace(/[^\w\-]+/g, "_") + "_sheet.csv"; document.body.append(a); a.click(); a.remove(); };
$("print").onclick = () => {
  const f = fabOf($("fab").value), svg = toSvg(doc, fmt, { fixed: "100%" }).svg, tab = (id) => { const c = $(id).cloneNode(true), src = $(id).querySelectorAll("input"); c.querySelectorAll("input").forEach((el, i) => { const sp = document.createElement("span"); sp.textContent = src[i].value; el.replaceWith(sp); }); return c.outerHTML; };
  const h = `<!doctype html><meta charset="utf-8"><title>Tech pack</title><style>body{font:13px/1.4 sans-serif;margin:16mm;color:#111}h1{margin:0 0 4px}h2{margin:18px 0 6px;border-bottom:2px solid #111;padding-bottom:2px;font-size:15px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:3px 8px 3px 0;border-bottom:1px solid #ccc}.n{text-align:right}tr.tot td{font-weight:700}.box{border:1px solid #999;padding:6px;margin-top:6px}small{color:#555}@page{margin:10mm}</style>
<h1>Tech pack: ${esc(proj.name || "Untitled")}</h1><small>${esc(studio ? TYPES[studio.type] : proj.garmentType || "")} · ${new Date().toLocaleDateString()} · units ${unit} · generated by FashionCAD Studio</small>
<h2>Fabric</h2><p>${esc(f.name)} (${esc(f.category)}). Sample properties: ${f.gsm} g/m², stretch ${f.stretch}%. Care: ${esc(f.care)}<br><small>Sample library values, confirm with your supplier.</small></p>
<h2>Pattern</h2><div class="box">${svg}</div><h2>Pieces</h2>${tab("pt")}<h2>Fabric estimate</h2><p>${$("len").textContent} per garment on ${last ? last.w : ""} cm width (rough estimate).</p>
<h2>Measurements</h2>${tab("mt")}<h2>Costing</h2>${tab("ct")}`;
  const w = window.open("", "_blank"); if (!w) return showMsg(msg, "Your browser blocked the print window. Allow pop-ups for this site and try again.");
  w.document.write(h); w.document.close(); w.focus(); setTimeout(() => w.print(), 500);
};
$("save").onclick = async () => {
  if (!last) return; const b = $("save"); b.disabled = true;
  try { await saveProjectData(uid, pid, { costJson: JSON.stringify({ v: 1, fabricId: $("fab").value, widthCm: last.w, rotate: $("rot").checked, extra: last.ex, rate: last.rate, trims: last.tr, labour: last.lab, oh: last.oh, mg: last.mg, qty: last.q, cur: $("cur").value, qtys }) }); showMsg(msg, "Saved to this project.", "ok"); }
  catch (e) { showMsg(msg, "Couldn't save. Check your connection and Firestore rules."); }
  b.disabled = false;
};
requireAuth(async (u) => {
  uid = u.uid; pid = new URLSearchParams(location.search).get("id");
  if (!pid) { $("pickbox").hidden = false; let l = []; try { l = await listProjects(uid); } catch (e) { showMsg(msg, "Couldn't load projects."); }
    if (!l.length) $("pick").textContent = "No projects yet. Create one on the dashboard."; l.forEach((p) => { const li = document.createElement("li"), a = document.createElement("a"); a.href = "production.html?id=" + encodeURIComponent(p.id); a.textContent = p.name + (p.garmentType ? " · " + p.garmentType : ""); li.append(a); $("pick").append(li); }); return; }
  try { fabrics = (await (await fetch("data/fabrics.json")).json()).fabrics; proj = await getProject(uid, pid); } catch (e) { showMsg(msg, "Couldn't load the project or fabric list."); return; }
  if (!proj) { showMsg(msg, "Project not found."); return; }
  try { edits = JSON.parse(localStorage.getItem("fc-fabric-edits") || "{}"); } catch (e) {}
  try { if (proj.patternJson) { const d = JSON.parse(proj.patternJson); if (d && Array.isArray(d.shapes)) doc = d; } } catch (e) { showMsg(msg, "The saved pattern couldn't be read."); }
  try { if (proj.studioJson) { const d = JSON.parse(proj.studioJson); if (d && d.m) studio = { m: { ...PRESETS[d.preset], ...d.m }, ease: d.ease ?? 0, type: TYPES[d.type] ? d.type : null, preset: d.preset || "custom" }; } } catch (e) {}
  let saved = {}; try { if (proj.costJson) saved = JSON.parse(proj.costJson) || {}; } catch (e) {}
  qtys = saved.qtys || {}; pieces = piecesOf(doc);
  $("sub").textContent = "Project: " + (proj.name || "Untitled") + ". Fabric estimate, costing, measurement sheet and tech pack."; $("work").hidden = false;
  const cats = {}; fabrics.forEach((f) => (cats[f.category] = cats[f.category] || []).push(f));
  Object.keys(cats).sort().forEach((c) => { const g = document.createElement("optgroup"); g.label = c; cats[c].sort((a, b) => a.name.localeCompare(b.name)).forEach((f) => { const o = document.createElement("option"); o.value = f.id; o.textContent = f.name; g.append(o); }); $("fab").append(g); });
  $("fab").value = fabrics.some((f) => f.id === saved.fabricId) ? saved.fabricId : "cotton-plain";
  const set = (id, v) => { $(id).value = v; };
  set("wid", saved.widthCm ?? 112); set("extra", saved.extra ?? 5); set("rate", saved.rate ?? fabOf($("fab").value).cost); set("trims", saved.trims ?? 40); set("labour", saved.labour ?? 150); set("oh", saved.oh ?? 10); set("mg", saved.mg ?? 30); set("qty", saved.qty ?? 1); set("cur", saved.cur ?? "₹"); $("rot").checked = !!saved.rotate;
  $("unit").value = unit; $("unit").onchange = (e) => { unit = e.target.value; try { localStorage.setItem("fc-units", unit); } catch (x) {} drawPieces(); drawMeasures(); recalc(); };
  $("fab").onchange = () => { $("rate").value = fabOf($("fab").value).cost; recalc(); };
  ["wid", "extra", "rate", "trims", "labour", "oh", "mg", "qty", "cur", "rot"].forEach((id) => $(id).addEventListener("change", recalc));
  drawPieces(); drawMeasures(); recalc();
});
