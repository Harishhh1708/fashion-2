import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { requireAuth, showMsg } from "./auth.js";
import { getProject, saveProjectData } from "./account.js";
import { drawSwatch } from "./swatch.js";
import { PRESETS, MEAS, TYPES, DEFAULTS, layout, torsoProfile, garmentSpec, foldParams, materialParams, defaultEase, fromPattern } from "./bodymodel.js";
import { pieceArt } from "./render2d.js";
import { polyOf } from "./patternout.js";
import { bbox, widthAtY } from "./geometry.js";

const $ = (id) => document.getElementById(id), msg = $("msg");
const UN = { cm: { k: 1, d: 1 }, in: { k: 2.54, d: 2 }, mm: { k: 0.1, d: 0 } };
let unit = "cm"; try { unit = localStorage.getItem("fc-units") || "cm"; } catch (e) {} if (!UN[unit]) unit = "cm";
const S = { preset: "Adult female", m: { ...PRESETS["Adult female"] }, type: "tshirt", ease: 8, hem: DEFAULTS.tshirt.hem, sleeve: DEFAULTS.tshirt.sleeve, fold: 100, fabricId: null, color: null, usePattern: false, wire: false, body: true, rotate: false, grid: true };
let fabrics = [], edits = {}, uid = null, pid = null, L = null;
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fab = () => { const f = fabrics.find((x) => x.id === S.fabricId) || fabrics[0]; return { ...f, ...(edits[f.id] || {}) }; };

// ---------- renderer / scene ----------
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: $("cv"), antialias: true, preserveDrawingBuffer: true }); }
catch (e) { showMsg(msg, "Your browser couldn't start 3D graphics (WebGL). Try another browser or enable hardware acceleration."); throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.05, 60);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.minDistance = 0.4; controls.maxDistance = 8;
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 3.5, 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 12 }); scene.add(sun);
const rim = new THREE.DirectionalLight(0xaaccff, 0.5); rim.position.set(-3, 2, -3); scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.MeshStandardMaterial({ color: 0x1a3a34, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(3.2, 32, 0x2a554d, 0x1d443d); grid.position.y = 0.001; scene.add(grid);
const root = new THREE.Group(); scene.add(root);
let bodyG = null, garG = null;
function resize() { const r = $("cv").parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe($("cv").parentElement);

function disposeGroup(g) { if (!g) return; g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); root.remove(g); }
const lathe = (pts, seg = 56) => new THREE.LatheGeometry(pts.map(([y, a]) => new THREE.Vector2(a, y)), seg);
function smoothProfile(prof) {
  const c = new THREE.CatmullRomCurve3(prof.map(([y, a]) => new THREE.Vector3(a, y, 0)), false, "centripetal");
  return c.getPoints(70).map((p) => [p.y, Math.max(0.01, p.x)]);
}
function tapered(r0, r1, len, open, hs = 12) { const g = new THREE.CylinderGeometry(r0, r1, len, 28, hs, open); g.translate(0, -len / 2, 0); return g; }
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; }

// ---------- mannequin ----------
const skin = new THREE.MeshStandardMaterial({ color: 0xbdb2a6, roughness: 0.85 });
function buildBody() {
  disposeGroup(bodyG); bodyG = new THREE.Group(); const H = L.H;
  const torso = mesh(lathe(smoothProfile(torsoProfile(L))), skin); torso.scale.z = L.k; bodyG.add(torso);
  const sy = L.shoulderY - 0.02 * H;
  const bar = mesh(new THREE.CylinderGeometry(L.armR * 1.05, L.armR * 1.05, L.shoulderW, 20), skin); bar.rotation.z = Math.PI / 2; bar.position.y = sy; bodyG.add(bar);
  const hc = H - L.headR * 1.18, head = mesh(new THREE.SphereGeometry(L.headR, 32, 24), skin); head.scale.y = 1.18; head.position.y = hc; bodyG.add(head);
  const nTop = hc - L.headR * 0.9, nh = Math.max(0.01, nTop - (L.neckBase - 0.02 * H));
  const neck = mesh(new THREE.CylinderGeometry(L.neckR * 0.95, L.neckR, nh, 20), skin); neck.position.y = L.neckBase - 0.02 * H + nh / 2; bodyG.add(neck);
  [-1, 1].forEach((s) => {
    const arm = new THREE.Group(); arm.position.set(s * L.shoulderW / 2, sy, 0); arm.rotation.z = s * 0.2;
    arm.add(mesh(tapered(L.armR, L.armR * 0.62, L.armLen, false), skin));
    const hand = mesh(new THREE.SphereGeometry(L.armR * 0.7, 16, 12), skin); hand.position.y = -L.armLen; arm.add(hand); bodyG.add(arm);
    const leg = new THREE.Group(); leg.position.set(s * L.aHip * 0.5, L.crotch, 0); const ll = L.crotch - 0.045 * H;
    leg.add(mesh(tapered(L.thighR, L.thighR * 0.38, ll, false, 8), skin));
    const foot = mesh(new THREE.SphereGeometry(L.thighR * 0.5, 16, 12), skin); foot.scale.set(0.9, 0.5, 1.9); foot.position.set(0, -ll - 0.005, L.thighR * 0.6); leg.add(foot); bodyG.add(leg);
  });
  bodyG.visible = S.body; root.add(bodyG);
}

// ---------- garment ----------
function applyFolds(geo, fp, seed) {
  if (fp.amp <= 0 && fp.low <= 0) return;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z); if (r < 1e-4) continue;
    const ang = Math.atan2(z, x);
    let d = fp.amp * (Math.sin(ang * fp.n2 + y * 37 + seed) + 0.6 * Math.sin(ang * (fp.n2 - 3) - y * 23)) + fp.low * Math.sin(ang * fp.n1 + y * 6 + seed);
    d = Math.max(-0.08 * r, Math.min(0.08 * r, d)); const k = (r + d) / r; p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
}
let texList = [], designDoc = null, design = null, lastTorsoCanvas = null; const designImgs = new Map();
const clearTex = () => { texList.forEach((t) => t.dispose()); texList = []; };
function matFrom(canvas, f, repeat) {
  const mp = materialParams(f), t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; texList.push(t);
  return new THREE.MeshPhysicalMaterial({ map: t, bumpMap: repeat ? t : null, bumpScale: mp.bump, roughness: mp.roughness, metalness: mp.metalness, sheen: mp.sheen, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.5,
    transparent: mp.opacity < 0.98, opacity: mp.opacity, depthWrite: mp.opacity >= 0.98, side: THREE.DoubleSide, wireframe: S.wire });
}
function fabricMat(f) { const c = document.createElement("canvas"); c.width = c.height = 256; drawSwatch(c, f.texture, S.color || f.colors[0], 3); return matFrom(c, f, 6); }
// One surface texture: base colour, then the front art on the front half and the back art on the back half, then the fabric weave on top.
function composeSurface(front, back, f, baseColor) {
  const Wc = 1024, Hc = 768, c = document.createElement("canvas"); c.width = Wc; c.height = Hc; const g = c.getContext("2d");
  g.fillStyle = baseColor || S.color || f.colors[0]; g.fillRect(0, 0, Wc, Hc);
  if (front) { g.drawImage(front, 0, 0, 256, Hc, 0.75 * Wc, 0, 0.25 * Wc, Hc); g.drawImage(front, 256, 0, 256, Hc, 0, 0, 0.25 * Wc, Hc); }
  const bk = back || front; if (bk) g.drawImage(bk, 0, 0, 512, Hc, 0.25 * Wc, 0, 0.5 * Wc, Hc);
  const sw = document.createElement("canvas"); sw.width = sw.height = 256; drawSwatch(sw, f.texture, "#ffffff", 3);
  g.globalCompositeOperation = "multiply"; g.globalAlpha = 0.55; g.fillStyle = g.createPattern(sw, "repeat"); g.fillRect(0, 0, Wc, Hc); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; return c;
}
const solid = (color) => { const c = document.createElement("canvas"); c.width = 512; c.height = 768; const g = c.getContext("2d"); g.fillStyle = color; g.fillRect(0, 0, 512, 768); return c; };
function designMats(f) {
  if (!(S.usePattern && design)) { const m = fabricMat(f); return { torso: m, sleeve: m, leg: m, band: m }; }
  const P = design.P, torso = composeSurface(design.front, design.back, f); lastTorsoCanvas = torso;
  const sleeve = design.sleeve ? matFrom(composeSurface(design.sleeve, design.sleeve, f), f, 0) : matFrom(composeSurface(solid(P.front.fill || S.color || f.colors[0]), null, f), f, 0);
  const band = matFrom(composeSurface(solid(P.front.fill || S.color || f.colors[0]), null, f), f, 0), tm = matFrom(torso, f, 0);
  return { torso: tm, sleeve, leg: tm, band };
}
function findPieces(doc) {
  const closedT = ["rect", "ellipse", "poly"], ps = doc.shapes.filter((s) => closedT.includes(s.type) && !s.deco && (s.role || /^(front|back|sleeve)/i.test(s.label || "")));
  const by = (role, re) => ps.find((s) => s.role === role) || ps.find((s) => re.test(s.label || ""));
  const front = by("front", /^front/i) || by("frontleg", /^front leg/i) || ps[0] || doc.shapes.find((s) => closedT.includes(s.type) && !s.deco);
  return { front, back: by("back", /^back/i) || by("backleg", /^back leg/i), sleeve: by("sleeve", /^sleeve/i) };
}
function buildDesign() {
  design = null; if (!designDoc) return; const P = findPieces(designDoc); if (!P.front) return;
  const mk = (p) => (p ? pieceArt(designDoc, designImgs, p, 512, 768) : null); design = { P, front: mk(P.front), back: mk(P.back), sleeve: mk(P.sleeve) };
}
function deriveFromPattern() {
  if (!design) return; const fp = polyOf(design.P.front), bb = bbox(fp), D = (S.m.chest / 8 + 6) * 10, sb = design.P.sleeve ? bbox(polyOf(design.P.sleeve)) : null;
  const r = fromPattern({ frontUnder: widthAtY(fp, bb.minY + D), frontTop: widthAtY(fp, bb.minY + 1), frontH: bb.maxY - bb.minY, sleeveH: sb ? sb.maxY - sb.minY : 0 }, S.m, L, S.type);
  S.ease = Math.round(r.ease); S.hem = Math.round(r.hem * 100) / 100; S.sleeve = ["skirt", "trousers", "shorts"].includes(S.type) ? 0 : Math.round(r.sleeve * 100) / 100;
}
function buildGarment() {
  disposeGroup(garG); garG = new THREE.Group(); clearTex(); const f = fab(), mats = designMats(f), fp = foldParams(f, S.fold), sp = garmentSpec(S.type, L, S);
  const t = mesh(lathe(sp.torso, 64), sp.legs ? mats.band : mats.torso); t.scale.z = L.k; applyFolds(t.geometry, fp, 1); garG.add(t);
  const sy = L.shoulderY - 0.02 * L.H;
  [-1, 1].forEach((s, i) => {
    if (sp.sleeve) { const piv = new THREE.Group(); piv.position.set(s * L.shoulderW / 2, sy, 0); piv.rotation.z = s * 0.2; const g = tapered(sp.sleeve.r0, sp.sleeve.r1, sp.sleeve.len, true, 14); applyFolds(g, fp, 2 + i); piv.add(mesh(g, mats.sleeve)); garG.add(piv); }
    if (sp.legs) { const piv = new THREE.Group(); piv.position.set(s * L.aHip * 0.5, L.crotch, 0); const g = tapered(sp.legs.r0, sp.legs.r1, sp.legs.len, true, 16); applyFolds(g, fp, 4 + i); piv.add(mesh(g, mats.leg)); garG.add(piv); }
  });
  root.add(garG);
}
function rebuild(all = true) { L = layout(S.m); if (S.usePattern && design) { deriveFromPattern(); syncGarmentUI(); } if (all) buildBody(); buildGarment(); }

// ---------- camera ----------
function dist() { return (L.H * 0.62) / Math.tan((camera.fov * Math.PI) / 360) * 1.25; }
const VIEWS = { Front: [0, 0, 1], Back: [0, 0, -1], Left: [1, 0, 0], Right: [-1, 0, 0], Top: [0, 1, 0.001], Bottom: [0, -1, 0.001], Perspective: [0.6, 0.25, 0.8] };
let tween = null;
function setView(name, instant) {
  const d = dist(), v = VIEWS[name], n = Math.hypot(...v), to = new THREE.Vector3(v[0] / n * d, L.H * 0.5 + v[1] / n * d, v[2] / n * d), tgt = new THREE.Vector3(0, L.H * 0.5, 0);
  if (v[1] !== 0 && Math.abs(v[0]) + Math.abs(v[2]) < 0.01) to.y = L.H * 0.5 + v[1] / n * d;
  if (instant) { camera.position.copy(to); controls.target.copy(tgt); controls.update(); return; }
  tween = { t0: performance.now(), from: camera.position.clone(), to, tf: controls.target.clone(), tt: tgt };
}
function frame(now) {
  requestAnimationFrame(frame);
  if (tween) { const k = Math.min(1, (now - tween.t0) / 450), e = k * k * (3 - 2 * k); camera.position.lerpVectors(tween.from, tween.to, e); controls.target.lerpVectors(tween.tf, tween.tt, e); if (k >= 1) tween = null; }
  controls.update(); renderer.render(scene, camera);
}

// ---------- controls UI ----------
const toU = (cmv) => (cmv / UN[unit].k).toFixed(UN[unit].d), fromU = (v) => parseFloat(v) * UN[unit].k;
let raf = 0; const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; rebuild(true); }); };
const measureEls = {};
function buildMeasures() {
  const box = $("meas"); box.textContent = "";
  MEAS.forEach(([k, label, mn, mx]) => {
    const w = document.createElement("div"); w.className = "mrow"; const l = document.createElement("label"); l.textContent = label + " (" + unit + ")"; l.htmlFor = "m-" + k;
    const n = document.createElement("input"); n.type = "number"; n.id = "m-" + k; n.step = unit === "mm" ? 1 : 0.1; n.value = toU(S.m[k]);
    const r = document.createElement("input"); r.type = "range"; r.min = mn; r.max = mx; r.step = 0.5; r.value = S.m[k]; r.setAttribute("aria-label", label);
    r.oninput = () => { S.m[k] = +r.value; n.value = toU(S.m[k]); later(); };
    n.onchange = () => { const v = fromU(n.value); if (isNaN(v) || v < mn || v > mx) { showMsg(msg, label + " must be between " + toU(mn) + " and " + toU(mx) + " " + unit + "."); n.value = toU(S.m[k]); return; } showMsg(msg, ""); S.m[k] = v; r.value = v; later(); };
    w.append(l, n, r); box.append(w); measureEls[k] = { n, r };
  });
}
function syncMeasures() { MEAS.forEach(([k]) => { measureEls[k].n.value = toU(S.m[k]); measureEls[k].r.value = S.m[k]; }); }
function slider(id, key, min, max, step, fmt, rebuildFn) {
  const r = $(id), o = $(id + "-v"); r.min = min; r.max = max; r.step = step; r.value = S[key]; o.textContent = fmt(S[key]);
  r.oninput = () => { S[key] = +r.value; o.textContent = fmt(S[key]); rebuildFn(); };
}
const rebuildG = () => buildGarment();
function syncGarmentUI() { $("ease").value = S.ease; $("ease-v").textContent = S.ease + " cm"; $("hem").value = S.hem; $("hem-v").textContent = Math.round(S.hem * 100) + "%"; $("sleeve").value = S.sleeve; $("sleeve-v").textContent = Math.round(S.sleeve * 100) + "%"; $("fold").value = S.fold; $("fold-v").textContent = S.fold + "%";
  $("hem-l").textContent = ["trousers", "shorts"].includes(S.type) ? "Leg length" : "Hem length (waist to floor)"; $("sleeve").disabled = S.type === "skirt" || S.type === "trousers" || S.type === "shorts"; }
function fabricInfo() { const f = fab(); $("finfo").textContent = f.category + " · " + f.gsm + " g/m² · stretch " + f.stretch + "% · drape " + f.drape + "/5 · wrinkle resistance " + f.wrinkleResistance + "/5 · sample values"; }
function buildColors() { const f = fab(), box = $("chips"); box.textContent = ""; f.colors.forEach((c) => { const b = document.createElement("button"); b.className = "chip"; b.style.background = c; b.setAttribute("aria-label", "Colour " + c); b.setAttribute("aria-pressed", (S.color || f.colors[0]) === c); b.onclick = () => { S.color = c; $("cc").value = c; buildColors(); buildGarment(); }; box.append(b); }); $("cc").value = S.color || f.colors[0]; }
function pickFabric(id, keepColor) { S.fabricId = id; if (!keepColor) S.color = null; const f = fab(); S.ease = defaultEase(f.stretch); syncGarmentUI(); fabricInfo(); buildColors(); buildGarment(); $("fab").value = id; }

function initUI() {
  const ps = $("preset"); Object.keys(PRESETS).forEach((p) => { const o = document.createElement("option"); o.textContent = p; ps.append(o); }); ps.value = S.preset;
  ps.onchange = () => { S.preset = ps.value; S.m = { ...PRESETS[S.preset] }; syncMeasures(); rebuild(true); setView("Front"); };
  $("unit").value = unit; $("unit").onchange = (e) => { unit = e.target.value; try { localStorage.setItem("fc-units", unit); } catch (x) {} buildMeasures(); };
  const ty = $("type"); Object.entries(TYPES).forEach(([k, v]) => { const o = document.createElement("option"); o.value = k; o.textContent = v; ty.append(o); }); ty.value = S.type;
  ty.onchange = () => { S.type = ty.value; S.hem = DEFAULTS[S.type].hem; S.sleeve = DEFAULTS[S.type].sleeve; if (S.usePattern && design) deriveFromPattern(); syncGarmentUI(); buildGarment(); };
  slider("ease", "ease", -15, 40, 1, (v) => v + " cm", rebuildG); slider("hem", "hem", 0.1, 1, 0.01, (v) => Math.round(v * 100) + "%", rebuildG);
  slider("sleeve", "sleeve", 0, 1, 0.01, (v) => Math.round(v * 100) + "%", rebuildG); slider("fold", "fold", 0, 200, 5, (v) => v + "%", rebuildG);
  const fs = $("fab"), cats = {}; fabrics.forEach((f) => (cats[f.category] = cats[f.category] || []).push(f));
  Object.keys(cats).sort().forEach((c) => { const g = document.createElement("optgroup"); g.label = c; cats[c].sort((a, b) => a.name.localeCompare(b.name)).forEach((f) => { const o = document.createElement("option"); o.value = f.id; o.textContent = f.name; g.append(o); }); fs.append(g); });
  fs.onchange = () => pickFabric(fs.value, false);
  $("cc").oninput = () => { S.color = $("cc").value; buildColors(); buildGarment(); };
  $("wire").onchange = (e) => { S.wire = e.target.checked; buildGarment(); };
  $("bodyv").onchange = (e) => { S.body = e.target.checked; if (bodyG) bodyG.visible = S.body; };
  $("rot").onchange = (e) => { controls.autoRotate = e.target.checked; controls.autoRotateSpeed = 2; };
  $("gridv").onchange = (e) => { grid.visible = ground.visible = e.target.checked; };
  const vb = $("views"); Object.keys(VIEWS).forEach((n) => { const b = document.createElement("button"); b.className = "mini"; b.textContent = n; b.onclick = () => setView(n); vb.append(b); });
  buildMeasures(); syncGarmentUI(); fabricInfo(); buildColors();
}

// ---------- export / save ----------
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
const base = () => ($("pname").textContent || "garment").replace(/[^\w\-]+/g, "_");
function exportRoot() { const g = new THREE.Group(); if (S.body && bodyG) g.add(bodyG.clone()); if (garG) g.add(garG.clone()); return g; }
$("png").onclick = () => { renderer.render(scene, camera); $("cv").toBlob((b) => b ? download(b, base() + ".png") : showMsg(msg, "Couldn't create the image."), "image/png"); };
$("glb").onclick = () => { try { new GLTFExporter().parse(exportRoot(), (buf) => download(new Blob([buf], { type: "model/gltf-binary" }), base() + ".glb"), (e) => showMsg(msg, "GLB export failed."), { binary: true }); } catch (e) { showMsg(msg, "GLB export failed."); } };
$("obj").onclick = () => { try { download(new Blob([new OBJExporter().parse(exportRoot())], { type: "text/plain" }), base() + ".obj"); } catch (e) { showMsg(msg, "OBJ export failed."); } };
$("save").onclick = async () => {
  if (!pid) return showMsg(msg, "Open the 3D studio from a project to save your setup. Go to the dashboard and choose a project.");
  const b = $("save"); b.disabled = true; b.textContent = "Saving…";
  try { const { m, preset, type, ease, hem, sleeve, fold, fabricId, color, usePattern } = S; await saveProjectData(uid, pid, { studioJson: JSON.stringify({ v: 1, m, preset, type, ease, hem, sleeve, fold, fabricId, color, usePattern }) }); showMsg(msg, "Saved to this project.", "ok"); }
  catch (e) { showMsg(msg, "Couldn't save. Check your connection and Firestore rules."); }
  b.disabled = false; b.textContent = "Save to project";
};

// ---------- init ----------
requireAuth(async (u) => {
  uid = u.uid; pid = new URLSearchParams(location.search).get("id");
  try { fabrics = (await (await fetch("data/fabrics.json")).json()).fabrics; } catch (e) { showMsg(msg, "Couldn't load the fabric list."); return; }
  try { edits = JSON.parse(localStorage.getItem("fc-fabric-edits") || "{}"); } catch (e) {}
  S.fabricId = (fabrics.find((f) => f.id === "cotton-plain") || fabrics[0]).id; S.ease = defaultEase(fab().stretch);
  let catalog = []; try { catalog = (await (await fetch("data/garments.json")).json()).garments; } catch (e) {}
  let proj = null;
  if (pid) { $("back").href = "editor.html?id=" + encodeURIComponent(pid); $("back").textContent = "Back to pattern"; try { proj = await getProject(uid, pid); } catch (e) { showMsg(msg, "Couldn't load this project."); } }
  if (proj) {
    $("pname").textContent = proj.name || "Untitled";
    if (proj.patternJson) { try { const d = JSON.parse(proj.patternJson); if (d && Array.isArray(d.shapes) && d.shapes.length) { designDoc = { seam: d.seam, shapes: d.shapes, images: d.images || {} };
      await Promise.all(Object.entries(designDoc.images).map(([id, url]) => new Promise((res) => { const el = new Image(); el.onload = () => { designImgs.set(id, el); res(); }; el.onerror = () => res(); el.src = url; }))); } } catch (e) { showMsg(msg, "Couldn't read this project's pattern, so the plain model is shown."); } }
    let block = null; try { if (proj.blockJson) block = JSON.parse(proj.blockJson); } catch (e) {}
    const g = block ? catalog.find((x) => x.id === block.garmentId) : null;
    if (g) { S.type = g.block.type3d; S.hem = DEFAULTS[S.type].hem; S.sleeve = DEFAULTS[S.type].sleeve; S.preset = block.preset && PRESETS[block.preset] ? block.preset : g.block.preset; S.m = { ...PRESETS[S.preset] }; }
    S.usePattern = !!designDoc;
    if (proj.studioJson) { try { const d = JSON.parse(proj.studioJson); if (d && d.m && PRESETS[d.preset]) { Object.assign(S, { preset: d.preset, m: { ...PRESETS[d.preset], ...d.m }, type: TYPES[d.type] ? d.type : S.type, ease: d.ease ?? S.ease, hem: d.hem ?? S.hem, sleeve: d.sleeve ?? S.sleeve, fold: d.fold ?? S.fold, color: d.color || null, usePattern: !!designDoc && d.usePattern !== false }); if (fabrics.some((f) => f.id === d.fabricId)) S.fabricId = d.fabricId; } } catch (e) { showMsg(msg, "Couldn't load this project's saved 3D setup. Starting fresh."); } }
  } else $("pname").textContent = "No project (preview only)";
  L = layout(S.m); buildDesign(); if (!design) S.usePattern = false; if (S.usePattern) deriveFromPattern();
  resize(); initUI(); $("fab").value = S.fabricId; buildColors(); fabricInfo();
  $("usepat").checked = S.usePattern; $("usepat").disabled = !design; $("patinfo").textContent = design ? "Colours, drawings and pictures from your pattern appear on the model. Length, width and sleeve length follow your pattern." : "No pattern yet. Open the pattern editor and draw one, then come back.";
  $("usepat").onchange = (e) => { S.usePattern = e.target.checked; if (S.usePattern) { L = layout(S.m); deriveFromPattern(); syncGarmentUI(); } buildGarment(); };
  rebuild(true); setView("Perspective", true); requestAnimationFrame(frame); window.__studioReady = true;
});
window.__studioDebug = () => ({ S, hasDesign: !!design, torso: lastTorsoCanvas, pieces: design ? { front: !!design.front, back: !!design.back, sleeve: !!design.sleeve } : null });
