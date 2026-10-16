// Design Studio: pick a look, and the same numbers draft the paper pattern, sew the 3D dress and fill the PDF.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { requireAuth, showMsg } from "./auth.js";
import { createProject, getProject, saveProjectData } from "./account.js";
import { PRESETS, MEAS, layout, torsoProfile, materialParams } from "./bodymodel.js";
import { SIZES, measureFor, sizeChart, SILHOUETTES, NECKS, SLEEVES, SKIRTS, LENGTHS, CLOSURES, HEM_FINISH, makePattern, toDoc } from "./patterngen.js";
import { sewGarment } from "./garment3d.js";
import { toSvg, toDXF } from "./patternout.js";
import { drawSwatch } from "./swatch.js";

const $ = (id) => document.getElementById(id), msg = $("msg");
const UN = { cm: { k: 1, d: 1 }, in: { k: 2.54, d: 2 }, mm: { k: 0.1, d: 0 } };
let unit = "cm"; try { unit = localStorage.getItem("fc-units") || "cm"; } catch (e) {} if (!UN[unit]) unit = "cm";
const toU = (cmv) => (cmv / UN[unit].k).toFixed(UN[unit].d), fromU = (v) => parseFloat(v) * UN[unit].k;
const fmtMM = (v) => (unit === "cm" ? (v / 10).toFixed(1) + " cm" : unit === "mm" ? Math.round(v) + " mm" : (v / 25.4).toFixed(2) + " in");
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const STEPS = ["Start", "Body & size", "Silhouette", "Neck & sleeve", "Skirt & length", "Opening", "Fabric", "Check"];
const QUICK = [
  { n: "Everyday A-line", s: { silhouette: "a-line", neck: "round", sleeve: "cap", skirt: "a-line", length: "knee", closure: "pull-on", ease: 8 } },
  { n: "Office sheath", s: { silhouette: "sheath", neck: "boat", sleeve: "short", skirt: "straight", length: "knee", closure: "back-zip", ease: 4 } },
  { n: "Weekend shift", s: { silhouette: "shift", neck: "scoop", sleeve: "flutter", skirt: "straight", length: "mini", closure: "pull-on", ease: 10 } },
  { n: "Wrap dress", s: { silhouette: "wrap", neck: "v", sleeve: "three-quarter", skirt: "a-line", length: "midi", closure: "wrap-tie", ease: 6 } },
  { n: "Fit & flare", s: { silhouette: "fit-flare", neck: "round", sleeve: "puff", skirt: "gore", length: "midi", closure: "side-zip", ease: 5 } },
  { n: "Evening gown", s: { silhouette: "gown", neck: "sweetheart", sleeve: "none", skirt: "full", length: "floor", closure: "back-zip", ease: 4 } },
  { n: "Empire maxi", s: { silhouette: "empire", neck: "v", sleeve: "long", skirt: "a-line", length: "maxi", closure: "pull-on", ease: 9 } },
  { n: "Mermaid formal", s: { silhouette: "mermaid", neck: "high", sleeve: "none", skirt: "mermaid", length: "floor", closure: "back-buttons", ease: 3 } }
];

// line icons, drawn in a 100 x 100 box
const dress = (prof) => { const L = prof.map(([y, w]) => [50 - w, y]), R = prof.map(([y, w]) => [50 + w, y]).reverse(); return "<path d='M" + [...L, ...R].map((p) => p.map((v) => v.toFixed(0)).join(" ")).join(" L ") + " Z'/>"; };
const ICON = {
  sil: {
    "a-line": dress([[12, 15], [42, 17], [86, 33]]), sheath: dress([[12, 15], [42, 14], [86, 16]]),
    "fit-flare": dress([[12, 15], [40, 11], [86, 30]]), empire: dress([[12, 14], [28, 12], [86, 27]]),
    shift: dress([[12, 16], [45, 18], [84, 20]]), wrap: dress([[12, 15], [42, 13], [86, 27]]) + "<path d='M38 12 L58 48'/>",
    gown: dress([[12, 14], [40, 11], [95, 32]]), mermaid: dress([[12, 14], [45, 12], [68, 13], [93, 28]])
  },
  neck: {
    round: "<path d='M18 22 Q50 62 82 22'/>", v: "<path d='M20 20 L50 70 L80 20'/>", boat: "<path d='M10 28 Q50 44 90 28'/>",
    square: "<path d='M26 20 L26 58 L74 58 L74 20'/>", sweetheart: "<path d='M18 24 Q34 46 50 34 Q66 46 82 24'/>",
    high: "<path d='M28 16 Q50 26 72 16 M26 34 Q50 46 74 34'/>", halter: "<path d='M28 72 L50 18 L72 72 M40 40 Q50 48 60 40'/>",
    scoop: "<path d='M16 20 Q50 86 84 20'/>"
  },
  sleeve: {
    none: "<path d='M40 14 Q22 38 40 62 M40 14 L70 14'/>", cap: "<path d='M38 14 Q14 22 22 44 L44 40'/>",
    short: "<path d='M38 12 Q10 20 14 52 L40 48'/>", elbow: "<path d='M38 12 Q8 18 10 64 L32 62'/>",
    "three-quarter": "<path d='M38 12 Q6 16 6 76 L26 76'/>", long: "<path d='M38 12 Q4 14 4 90 L22 90'/>",
    puff: "<path d='M38 12 Q6 16 12 40 Q20 54 40 46 Q48 30 38 12'/>", bell: "<path d='M38 12 Q22 16 14 58 L46 62 Q36 32 38 12 Z'/>",
    lantern: "<path d='M38 12 Q6 22 12 52 Q18 66 34 60 L36 50'/>", flutter: "<path d='M38 14 Q4 22 8 46 Q22 54 34 40'/>"
  },
  skirt: {
    straight: dress([[16, 22], [86, 20]]), "a-line": dress([[16, 20], [86, 38]]),
    full: dress([[16, 26], [86, 46]]) + "<path d='M36 20 L34 30 M50 20 L50 30 M64 20 L66 30'/>",
    gore: dress([[16, 22], [86, 34]]) + "<path d='M50 22 L50 86 M34 24 L26 84 M66 24 L74 84'/>",
    mermaid: dress([[16, 20], [56, 19], [86, 40]])
  },
  len: { mini: dress([[14, 16], [42, 26]]), knee: dress([[14, 16], [58, 28]]), midi: dress([[14, 16], [74, 30]]), maxi: dress([[14, 16], [90, 32]]), floor: dress([[14, 16], [97, 34]]) },
  cloc: {
    "pull-on": "<path d='M28 20 L28 80 M72 20 L72 80 M28 20 Q50 34 72 20'/>",
    "back-zip": "<path d='M50 22 L50 80 M44 28 H56 M44 38 H56 M44 48 H56 M44 58 H56'/>",
    "back-buttons": "<path d='M50 22 L50 80'/>" + [30, 44, 58, 72].map((y) => `<circle cx='50' cy='${y}' r='3.5'/>`).join(""),
    "front-buttons": "<path d='M42 22 L42 80 M58 22 L58 80'/>" + [30, 44, 58, 72].map((y) => `<circle cx='50' cy='${y}' r='3.5'/>`).join(""),
    "side-zip": "<path d='M30 22 L30 80 M70 22 L70 80 M66 40 H74 M66 50 H74 M66 60 H74'/>",
    "wrap-tie": "<path d='M32 22 L64 50 L32 78 M68 22 L36 50 L68 78 M64 50 L82 58'/>"
  }
};
const svgIcon = (d) => `<svg viewBox="0 0 100 100" aria-hidden="true">${d}</svg>`;

const D = {
  preset: "Adult female", m: { ...PRESETS["Adult female"] }, size: "M",
  silhouette: "a-line", neck: "round", sleeve: "cap", skirt: "a-line", length: "knee", closure: "pull-on",
  ease: 8, flareScale: 1, seam: 15, capEase: 28, hemAllow: 40, hemFinish: "plain", waistBand: false, pockets: false, cuff: false,
  weight: 100, fabricId: null, color: null, step: 0
};
let fabrics = [], fabricEdits = {}, uid = null, pid = null, pattern = null, L = null, doc = null;
const fab = () => fabrics.find((f) => f.id === D.fabricId) || fabrics[0] || { name: "Cotton", gsm: 150, drape: 3, texture: "plain", colors: ["#d9d2c6"], id: "x" };
const meas = () => D.size === "custom" ? D.m : measureFor(D.m, D.size);
const spec = () => ({ silhouette: D.silhouette, neck: D.neck, sleeve: D.sleeve, skirt: D.skirt, closure: D.closure, length: LENGTHS[D.length], ease: D.ease, flareScale: D.flareScale, seam: D.seam, capEase: D.capEase, hemAllow: D.hemAllow, hemFinish: D.hemFinish, waistBand: D.waistBand, pockets: D.pockets, cuff: D.cuff });

// ---------- three.js stage ----------
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: $("cv"), antialias: true, preserveDrawingBuffer: true }); }
catch (e) { showMsg(msg, "Your browser couldn't start 3D graphics (WebGL). Try another browser or enable hardware acceleration."); }
if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true;
}
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.05, 60);
let controls = null;
if (renderer) controls = new OrbitControls(camera, renderer.domElement);
if (controls) { controls.enableDamping = true; controls.minDistance = 0.4; controls.maxDistance = 8; }
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(2.2, 3.6, 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 12 }); scene.add(sun);
const rim = new THREE.DirectionalLight(0xaaccff, 0.55); rim.position.set(-3, 2, -3); scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshStandardMaterial({ color: 0x1a3a34, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(3, 30, 0x2a554d, 0x1d443d); grid.position.y = 0.001; scene.add(grid);
const root = new THREE.Group(); scene.add(root);
let bodyG = null, garG = null;
function resize() { if (!renderer) return; const r = $("cv").parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
if (window.ResizeObserver) new ResizeObserver(resize).observe($("cv").parentElement); else window.addEventListener("resize", resize);
const lathe = (pts, seg = 56) => new THREE.LatheGeometry(pts.map(([y, a]) => new THREE.Vector2(a, y)), seg);
function smoothProfile(prof) { const c = new THREE.CatmullRomCurve3(prof.map(([y, a]) => new THREE.Vector3(a, y, 0)), false, "centripetal"); return c.getPoints(70).map((p) => [p.y, Math.max(0.01, p.x)]); }
function tapered(r0, r1, len, open, hs = 12) { const g = new THREE.CylinderGeometry(r0, r1, len, 28, hs, open); g.translate(0, -len / 2, 0); return g; }
const skin = new THREE.MeshStandardMaterial({ color: 0xbdb2a6, roughness: 0.85 });
function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
function disposeGroup(g) { if (!g) return; g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== skin) o.material.dispose(); }); root.remove(g); }
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
  bodyG.visible = $("bodyv") ? $("bodyv").checked : true; root.add(bodyG);
}

// ---------- fabric materials for the sewn pieces ----------
let texList = [];
const clearTex = () => { texList.forEach((t) => t.dispose()); texList = []; };
const shade = (hex, f) => { const n = parseInt(hex.replace("#", ""), 16), r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f)); return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1); };
function baseColor() { const f = fab(); return (D.color || f.colors[0] || "#d9d2c6").toLowerCase(); }
function fabricTex(color, seed) { const c = document.createElement("canvas"); c.width = c.height = 256; drawSwatch(c, fab().texture, color, seed); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.colorSpace = THREE.SRGBColorSpace; texList.push(t); return t; }
const TRIM = new Set(["neckband", "facing", "binding", "cuffband", "waistband", "placket", "tie", "pocket"]);
function matFor(piece) {
  const f = fab(), mp = materialParams(f), col = baseColor();
  const trim = TRIM.has(piece.role), lining = piece.fabric === "lining" || piece.fabric === "interfacing";
  const c = trim ? shade(col, 1.12) : lining ? shade(col, 0.72) : col;
  const t = fabricTex(c, trim ? 5 : 3);
  return new THREE.MeshPhysicalMaterial({ map: t, bumpMap: t, bumpScale: mp.bump * 0.7, roughness: mp.roughness, metalness: mp.metalness,
    sheen: mp.sheen, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.5, transparent: mp.opacity < 0.98, opacity: mp.opacity,
    depthWrite: mp.opacity >= 0.98, side: THREE.DoubleSide });
}

// ---------- rebuild ----------
const VIEWS = { Front: [0, 0, 1], Back: [0, 0, -1], Left: [1, 0, 0], Right: [-1, 0, 0], ThreeQuarter: [0.62, 0.12, 0.78], Top: [0, 1, 0.001] };
let curView = "ThreeQuarter", flatScale = 1;
function computePattern() { pattern = makePattern(spec(), meas()); doc = pattern.doc; }
function paint3D() {
  if (!renderer || !pattern) return;
  disposeGroup(garG); clearTex();
  const g = sewGarment(pattern.pieces, pattern.fit, L, fab(), matFor, { cloth: { weight: D.weight / 100 } });
  garG = g ? g.group : new THREE.Group();
  root.add(garG);
}
function frameCamera() {
  if (!L || !controls) return;
  const d = (L.H * 0.66) / Math.tan((camera.fov * Math.PI) / 360) * 1.25, v = VIEWS[curView], n = Math.hypot(...v);
  camera.position.set(v[0] / n * d, L.H * 0.5 + v[1] / n * d, v[2] / n * d);
  controls.target.set(0, L.H * 0.5, 0); controls.update();
}
function paintFlat() {
  if (!doc) return;
  const r = toSvg(doc, fmtMM, { fill: shade(baseColor(), 1.04), stroke: "#20242a", strokeWidth: 1.1, labelInk: "#20242a", labelSize: 7, accent: "#b3261e", ink: "#3b4249", saInk: "#8a6500", notchText: true, edgeSa: true });
  $("flatsvg").innerHTML = r.svg;
  const el = $("flatsvg").firstElementChild;
  if (el) { el.style.width = (r.w * flatScale).toFixed(0) + "mm"; el.style.height = "auto"; }
}
function paintSew() {
  if (!pattern) return;
  const steps = pattern.seams.steps, joins = pattern.seams.joins;
  const cut = pattern.pieces.map((p, i) => ({ i, label: p.label, w: p.size[0], h: p.size[1], cut: p.cut, fold: p.fold, fabric: p.fabric || "shell" }));
  $("sewbox").innerHTML = '<h2 style="font-size:1.3rem;margin:0 0 .3rem">How to sew this dress</h2><p class="hint" style="margin:0 0 1rem">The order a machinist would follow. Seam allowances are the ones printed on each edge of the flat pattern.</p>' +
    '<ol class="sew">' + steps.map((s) => `<li><b>${esc(s.title)}</b><span>${esc(s.detail)}</span></li>`).join("") + "</ol>" +
    '<h3 style="margin-top:1.6rem;font-size:1.1rem">Joining map</h3><table class="cut"><thead><tr><th>Join</th><th>to</th><th>Seam</th><th>Note</th></tr></thead><tbody>' +
    joins.map((j) => `<tr><td>${esc(pattern.pieces[j.a].label)} · ${esc(j.ea)}</td><td>${esc(pattern.pieces[j.b].label)} · ${esc(j.eb)}</td><td class="n">${fmtMM(j.sa)}</td><td>${esc(j.note || "")}</td></tr>`).join("") + "</tbody></table>" +
    '<h3 style="margin-top:1.6rem;font-size:1.1rem">Cut list</h3><table class="cut"><thead><tr><th>Piece</th><th>Size on the sheet</th><th>Cut</th><th>Fabric</th></tr></thead><tbody>' +
    cut.map((c) => `<tr><td>${esc(c.label)}</td><td class="n">${fmtMM(c.w)} × ${fmtMM(c.h)}</td><td class="n">${c.cut}${c.fold ? " on fold" : ""}</td><td>${esc(c.fabric)}</td></tr>`).join("") + "</tbody></table>";
}
function paintSummary() {
  const f = fab(), sil = SILHOUETTES[D.silhouette], fitt = pattern.fit;
  const area = pattern.pieces.reduce((t, p) => t + p.size[0] * p.size[1] * 0.72 * p.cut, 0) / 1e6;
  $("sum").innerHTML =
    box("The look", [["Style", sil.name], ["Neck", NECKS[D.neck].name], ["Sleeve", SLEEVES[D.sleeve].name], ["Skirt", (SKIRTS[D.skirt] || SKIRTS[sil.skirt]).name], ["Length", D.length], ["Opening", CLOSURES[D.closure].name], ["Ease", D.ease + " cm"]]) +
    box("Cutting", [["Shapes", pattern.pieces.length], ["Paper pieces", pattern.pieces.reduce((t, p) => t + p.cut, 0)], ["Seam allowance", fmtMM(D.seam)], ["Approx. fabric", area.toFixed(2) + " m² at 1.4 m wide"], ["Hem", fmtMM(fitt.fullHemY) + " below the shoulder"]]) +
    box("Fabric", [["Cloth", f.name], ["Weight", f.gsm + " g/m²"], ["Needle", needleFor(f.gsm)], ["Colour", baseColor()], ["Care", f.care || "—"]]) +
    '<div class="box"><h3>Size chart used</h3><table class="cut"><thead><tr><th>Size</th><th>Chest</th><th>Waist</th><th>Hip</th></tr></thead><tbody>' +
    sizeChart(D.m).map((r) => `<tr${r.size === D.size ? ' style="color:var(--pink);font-weight:700"' : ""}><td>${r.size}</td><td class="n">${r.chest}</td><td class="n">${r.waist}</td><td class="n">${r.hip}</td></tr>`).join("") + "</tbody></table></div>";
}
const needleFor = (gsm) => (gsm < 90 ? "70/10 microtex" : gsm < 200 ? "80/12 universal" : gsm < 340 ? "90/14 universal" : "100/16 jeans");
const box = (title, rows) => '<div class="box"><h3>' + esc(title) + "</h3><dl>" + rows.map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("") + "</dl></div>";

let rt = 0;
function rebuildNow() {
  try {
    computePattern(); L = layout(meas()); paintFlat(); paintSew(); paintSummary(); buildBody(); paint3D();
  } catch (e) {
    showMsg(msg, "This combination could not be drawn: " + (e && e.message ? e.message : e) + " Try a different skirt or sleeve.");
  }
  $("busy").hidden = true;
}
function refresh() { $("busy").hidden = false; clearTimeout(rt); rt = setTimeout(rebuildNow, 160); }

// ---------- wizard UI ----------
const measureEls = {};
function buildMeasures() {
  const box = $("meas"); box.textContent = "";
  MEAS.forEach(([k, label, mn, mx]) => {
    const w = document.createElement("div"); w.className = "mrow";
    const l = document.createElement("label"); l.textContent = label + " (" + unit + ")"; l.htmlFor = "m-" + k;
    const n = document.createElement("input"); n.type = "number"; n.id = "m-" + k; n.step = unit === "mm" ? 1 : 0.1; n.value = toU(D.m[k]);
    const r = document.createElement("input"); r.type = "range"; r.min = mn; r.max = mx; r.step = 0.5; r.value = D.m[k]; r.setAttribute("aria-label", label);
    const set = (cmv) => { D.m[k] = cmv; D.size = "custom"; $("size").value = "custom"; n.value = toU(cmv); r.value = cmv; refresh(); };
    r.oninput = () => set(+r.value);
    n.onchange = () => { const v = fromU(n.value); if (isNaN(v) || v < mn || v > mx) { showMsg(msg, label + " must be between " + toU(mn) + " and " + toU(mx) + " " + unit + "."); n.value = toU(D.m[k]); return; } showMsg(msg, ""); set(v); };
    w.append(l, n, r); box.append(w); measureEls[k] = { n, r };
  });
}
function syncMeasures() { MEAS.forEach(([k]) => { measureEls[k].n.value = toU(D.m[k]); measureEls[k].r.value = D.m[k]; }); }
function optionGrid(el, table, key, iconSet, onChange) {
  el.textContent = "";
  Object.entries(table).forEach(([k, v]) => {
    const lab = document.createElement("label");
    const inp = document.createElement("input"); inp.type = "radio"; inp.name = key; inp.value = k; inp.checked = D[key] === k;
    inp.onchange = () => { D[key] = k; onChange && onChange(k); refresh(); };
    lab.append(inp); lab.insertAdjacentHTML("beforeend", svgIcon(iconSet[k] || "") + "<span>" + esc(v.name) + "</span>");
    el.append(lab);
  });
}
function goto(i) {
  D.step = i;
  for (let k = 0; k < STEPS.length; k++) $("s" + k).hidden = k !== i;
  $("steps").querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
}
function buildSteps() {
  const s = $("steps"); s.textContent = "";
  STEPS.forEach((t, i) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab");
    b.innerHTML = "<b>" + (i + 1) + "</b>" + esc(t); b.onclick = () => goto(i); s.append(b); });
}
function slider(id, key, min, max, step, fmt, after) {
  const r = $(id), o = $(id + "-v"); r.min = min; r.max = max; r.step = step; r.value = D[key]; o.textContent = fmt(D[key]);
  r.oninput = () => { D[key] = +r.value; o.textContent = fmt(D[key]); if (after) after(); refresh(); };
}
function buildColors() {
  const f = fab(), box = $("chips"); box.textContent = "";
  f.colors.forEach((c) => { const b = document.createElement("button"); b.className = "chip"; b.style.background = c; b.setAttribute("aria-label", "Colour " + c);
    b.setAttribute("aria-pressed", String((D.color || f.colors[0]) === c)); b.onclick = () => { D.color = c; $("cc").value = c; buildColors(); refresh(); }; box.append(b); });
  $("cc").value = D.color || f.colors[0] || "#ffffff";
}
function fabricInfo() { const f = fab(); $("finfo").textContent = f.category + " · " + f.gsm + " g/m² · stretch " + f.stretch + "% · drape " + f.drape + "/5 · sample values"; }
function pickFabric(id) { D.fabricId = id; D.color = null; const f = fab(); D.ease = (f.stretch >= 40 ? -4 : f.stretch >= 15 ? 0 : 8); $("ease").value = D.ease; $("ease-v").textContent = D.ease + " cm"; fabricInfo(); buildColors(); refresh(); $("fab").value = id; }
function applySize(size) {
  D.size = size;
  if (size !== "custom") { D.m = { ...D.m, ...measureFor(PRESETS[D.preset], size) }; syncMeasures(); }
  refresh();
}

// ---------- tabs ----------
function setTab(which) {
  ["3d", "flat", "sew"].forEach((k) => { $("p" + k).hidden = k !== which; $("t" + k).setAttribute("aria-selected", String(k === which)); });
  if (which === "flat") paintFlat();
  if (which === "sew") paintSew();
}

// ---------- save / export ----------
function designJson() { return { v: 1, name: $("pname").value.trim(), D: { ...D }, m: { ...D.m } }; }
async function persist(silent) {
  const data = { designJson: JSON.stringify(designJson()), patternJson: JSON.stringify(doc), blockJson: JSON.stringify({ source: "design-studio", silhouette: D.silhouette, size: D.size }) };
  if (!pid) { const p = await createProject(uid, $("pname").value.trim() || "Untitled dress", "Dress"); pid = p.id; }
  await saveProjectData(uid, pid, data);
  try { localStorage.setItem("fc-last-design", JSON.stringify(designJson())); } catch (e) {}
  history.replaceState(null, "", "?id=" + encodeURIComponent(pid));
  if (!silent) showMsg(msg, "Saved. Open the flat pattern or the sewing PDF any time.", "ok");
}
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
const fname = () => (($("pname").value.trim() || "dress").replace(/[^\w\-]+/g, "_"));

function wire() {
  buildSteps();
  const ps = $("preset"); Object.keys(PRESETS).forEach((p) => { const o = document.createElement("option"); o.textContent = p; ps.append(o); });
  ps.value = D.preset; ps.onchange = () => { D.preset = ps.value; D.m = { ...PRESETS[ps.value] }; applySize(D.size === "custom" ? "M" : D.size); };
  const sz = $("size"); sz.append(Object.assign(document.createElement("option"), { value: "custom", textContent: "Custom (the numbers below)" }));
  SIZES.forEach((s) => sz.append(Object.assign(document.createElement("option"), { value: s, textContent: s + " — chest " + measureFor(PRESETS[D.preset], s).chest + " cm" })));
  sz.value = D.size; sz.onchange = () => applySize(sz.value);
  $("unit").value = unit; $("unit").onchange = (e) => { unit = e.target.value; try { localStorage.setItem("fc-units", unit); } catch (x) {} buildMeasures(); paintFlat(); paintSew(); paintSummary(); };
  $("qk").textContent = "";
  QUICK.forEach((q) => { const b = document.createElement("label"); const inp = document.createElement("input"); inp.type = "radio"; inp.name = "quick";
    inp.onchange = () => { Object.assign(D, q.s); syncControls(); refresh(); };
    b.append(inp); b.insertAdjacentHTML("beforeend", svgIcon(ICON.sil[q.s.silhouette]) + "<span>" + esc(q.n) + "</span>"); $("qk").append(b); });
  optionGrid($("sil"), SILHOUETTES, "silhouette", ICON.sil, (k) => { D.skirt = SILHOUETTES[k].skirt; syncOption($("skrt"), "skirt"); });
  optionGrid($("neck"), NECKS, "neck", ICON.neck);
  optionGrid($("slv"), SLEEVES, "sleeve", ICON.sleeve);
  optionGrid($("skrt"), SKIRTS, "skirt", ICON.skirt);
  optionGrid($("len"), Object.fromEntries(Object.entries(LENGTHS).map(([k, v]) => [k, { name: k }])), "length", ICON.len);
  optionGrid($("cloc"), CLOSURES, "closure", ICON.cloc);
  slider("fl", "flareScale", 0.4, 1.8, 0.05, (v) => "×" + v.toFixed(2));
  slider("ease", "ease", -10, 30, 1, (v) => v + " cm");
  slider("sb", "seam", 8, 25, 1, (v) => v + " mm");
  slider("cap", "capEase", 0, 60, 2, (v) => "+" + v + " mm at the cap");
  slider("wt", "weight", 20, 200, 10, (v) => v + "%");
  $("hemf").textContent = ""; Object.entries(HEM_FINISH).forEach(([k, v]) => $("hemf").append(Object.assign(document.createElement("option"), { value: k, textContent: v })));
  $("hemf").onchange = (e) => { D.hemFinish = e.target.value; D.hemAllow = { plain: 40, rolled: 10, binding: 15, faced: 30 }[e.target.value]; refresh(); };
  ["wband", "pkts", "cuff"].forEach((id) => { const k = { wband: "waistBand", pkts: "pockets", cuff: "cuff" }[id]; $(id).onchange = (e) => { D[k] = e.target.checked; refresh(); }; });
  const fs = $("fab"), cats = {}; fabrics.forEach((f) => (cats[f.category] = cats[f.category] || []).push(f));
  Object.keys(cats).sort().forEach((c) => { const g = document.createElement("optgroup"); g.label = c; cats[c].sort((a, b) => a.name.localeCompare(b.name)).forEach((f) => g.append(Object.assign(document.createElement("option"), { value: f.id, textContent: f.name }))); fs.append(g); });
  fs.onchange = () => pickFabric(fs.value);
  $("cc").oninput = () => { D.color = $("cc").value; buildColors(); refresh(); };
  $("saveblock").onclick = () => { try { localStorage.setItem("fc-body", JSON.stringify(D.m)); showMsg(msg, "Saved as your block on this device.", "ok"); } catch (e) { showMsg(msg, "The browser blocked saving."); } };
  $("loadblock").onclick = () => { try { const s = JSON.parse(localStorage.getItem("fc-body") || "null"); if (!s || !s.chest) return showMsg(msg, "No saved block yet. Set your measurements, then press Save as my block."); D.m = { ...D.m, ...s }; D.size = "custom"; syncControls(); refresh(); showMsg(msg, "Loaded your measurements.", "ok"); } catch (e) { showMsg(msg, "The saved block could not be read."); } };
  $("t3d").onclick = () => setTab("3d"); $("tflat").onclick = () => setTab("flat"); $("tsew").onclick = () => setTab("sew");
  $("zin").onclick = () => { flatScale = Math.min(3, flatScale * 1.25); paintFlat(); };
  $("zout").onclick = () => { flatScale = Math.max(0.4, flatScale / 1.25); paintFlat(); };
  $("fitview").onclick = () => { flatScale = 1; paintFlat(); };
  $("views").textContent = ""; Object.keys(VIEWS).forEach((n) => { const b = document.createElement("button"); b.className = "mini"; b.textContent = n; b.onclick = () => { curView = n; frameCamera(); }; $("views").append(b); });
  $("bodyv").onchange = () => { if (bodyG) bodyG.visible = $("bodyv").checked; };
  $("rot").onchange = (e) => { if (controls) controls.autoRotate = e.target.checked; };
  $("png").onclick = () => { if (!renderer) return; renderer.render(scene, camera); $("cv").toBlob((b) => b ? download(b, fname() + ".png") : showMsg(msg, "Couldn't create the image."), "image/png"); };
  $("dlsvg").onclick = () => download(new Blob([toSvg(doc, fmtMM, { fill: "#ffffff", stroke: "#111", notchText: true, edgeSa: true }).svg], { type: "image/svg+xml" }), fname() + "-pattern.svg");
  $("dldxf").onclick = () => download(new Blob([toDXF(doc, (v) => v.toFixed(1))], { type: "text/plain" }), fname() + "-pattern.dxf");
  $("savejson").onclick = () => persist(false).catch((e) => showMsg(msg, "Couldn't save on this browser."));
  $("openeditor").onclick = async () => { try { await persist(true); location.href = "editor.html?id=" + encodeURIComponent(pid); } catch (e) { showMsg(msg, "Couldn't open the editor."); } };
  $("pdf").onclick = async () => { const b = $("pdf"); b.disabled = true; b.textContent = "Making the PDF…";
    try { const { buildSewingPdf } = await import("./sewingpdf.js"); await buildSewingPdf({ D, spec: spec(), pattern, doc, meas: meas(), fabric: fab(), unit, fmtMM, name: fname(), snapshot: () => renderer ? renderer.domElement.toDataURL("image/png") : null }); showMsg(msg, "PDF downloaded.", "ok"); }
    catch (e) { showMsg(msg, "The PDF couldn't be built: " + (e.message || e) + ". The print window will open instead — choose Save as PDF.");
      try { const { printSewingSheet } = await import("./sewingpdf.js"); printSewingSheet({ D, spec: spec(), pattern, doc, meas: meas(), fabric: fab(), unit, fmtMM, name: fname(), snapshot: () => renderer ? renderer.domElement.toDataURL("image/png") : null }); } catch (x) {} }
    b.disabled = false; b.textContent = "Download sewing PDF"; };
  $("pname").addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  goto(0);
}
function syncOption(el, key) { el.querySelectorAll("input").forEach((i) => { i.checked = i.value === D[key]; }); }
function syncControls() {
  ["sil", "neck", "slv", "skrt", "len", "cloc"].forEach((id, k) => syncOption($(id), ["silhouette", "neck", "sleeve", "skirt", "length", "closure"][k]));
  $("ease").value = D.ease; $("ease-v").textContent = D.ease + " cm";
  $("fl").value = D.flareScale; $("fl-v").textContent = "×" + Number(D.flareScale).toFixed(2);
  $("sb").value = D.seam; $("sb-v").textContent = D.seam + " mm";
  $("cap").value = D.capEase; $("cap-v").textContent = "+" + D.capEase + " mm at the cap";
  $("wt").value = D.weight; $("wt-v").textContent = D.weight + "%";
  $("hemf").value = D.hemFinish;
  ["wband", "pkts", "cuff"].forEach((id) => $(id).checked = D[{ wband: "waistBand", pkts: "pockets", cuff: "cuff" }[id]]);
  $("size").value = D.size; $("fab").value = D.fabricId; fabricInfo(); buildColors(); syncMeasures();
}

function frame() { requestAnimationFrame(frame); if (controls) controls.update(); renderer && renderer.render(scene, camera); }

requireAuth(async (u) => {
  uid = u.uid;
  try { fabricEdits = JSON.parse(localStorage.getItem("fc-fabric-edits") || "{}"); } catch (e) {}
  try { fabrics = (await (await fetch("data/fabrics.json")).json()).fabrics.map((f) => ({ ...f, ...(fabricEdits[f.id] || {}) })); } catch (e) { showMsg(msg, "The fabric list could not be loaded. Check your connection."); }
  D.fabricId = fabrics.some((f) => f.id === "cotton-plain") ? "cotton-plain" : (fabrics[0] || {}).id;
  let start = null;
  const pidQ = new URLSearchParams(location.search).get("id");
  if (pidQ) { pid = pidQ; try { const p = await getProject(uid, pid); if (p) { const d = JSON.parse(p.designJson || "null"); if (d && d.D) start = d; $("pname").value = p.name || "Untitled dress"; } } catch (e) {} }
  if (!start) { try { const d = JSON.parse(localStorage.getItem("fc-last-design") || "null"); if (d && d.D) { start = d; $("pname").value = d.name || "Untitled dress"; } } catch (e) {} }
  if (start) { const m = start.m || start.D.m; Object.assign(D, start.D); D.m = { ...D.m, ...m }; }
  buildMeasures(); wire(); syncControls(); fabricInfo(); buildColors();
  if (renderer) { resize(); frameCamera(); frame(); rebuildNow(); }
  else { computePattern(); L = layout(meas()); paintFlat(); paintSew(); paintSummary(); $("busy").hidden = true; }
});
