import * as THREE from "three";
import { requireAuth, showMsg } from "./auth.js";
import { renderShell } from "./shell.js";
import { drawSwatch } from "./swatch.js";
import { paramsFor, createCloth, step, energy, drapeCoefficient, runToRest } from "./clothsim.js";
renderShell("drape.html");
const $ = (id) => document.getElementById(id), msg = $("msg");
let fabrics = [], edits = {}, cloth = null, running = true, mesh = null, tex = null, settled = false;
const fab = (id) => { const f = fabrics.find((x) => x.id === id) || fabrics[0]; return { ...f, ...(edits[f.id] || {}) }; };
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: $("cv"), antialias: true }); } catch (e) { showMsg(msg, "Your browser couldn't start 3D graphics (WebGL)."); throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.0)); const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(0.6, 1, 0.8); scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.MeshStandardMaterial({ color: 0x1a3a34, roughness: 1 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 48), new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.6 })); ped.position.y = 0.05; scene.add(ped);
function size() { const r = $("cv").parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
new ResizeObserver(size).observe($("cv").parentElement);
const VIEWS = { Perspective: [0.32, 0.26, 0.38], Side: [0, 0.1, 0.6], Top: [0, 0.75, 0.001] };
function view(n) { const v = VIEWS[n]; camera.position.set(...v); camera.lookAt(0, n === "Top" ? 0 : 0.06, 0); }

function build() {
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  const f = fab($("fab").value), p = paramsFor(f, +$("size").value); cloth = createCloth(p); settled = false; $("dc").textContent = "–"; $("dcn").textContent = "Waiting for the sample to settle.";
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(cloth.pos, 3));
  const uv = new Float32Array(cloth.n * 2); for (let k = 0; k < cloth.n; k++) { uv[k * 2] = (cloth.flat[k * 2] / (2 * p.R) + 0.5) * 3; uv[k * 2 + 1] = (cloth.flat[k * 2 + 1] / (2 * p.R) + 0.5) * 3; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(cloth.tris, 1)); g.computeVertexNormals();
  const c = document.createElement("canvas"); c.width = c.height = 256; drawSwatch(c, f.texture, f.colors[0], 3); if (tex) tex.dispose(); tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8, wireframe: $("wire").checked })); scene.add(mesh);
}
const label = (dc) => (dc < 0.35 ? "very soft drape" : dc < 0.55 ? "soft to medium drape" : dc < 0.75 ? "medium to stiff" : "stiff, holds its shape");
function loop() {
  requestAnimationFrame(loop);
  if (running && cloth && !settled) { for (let i = 0; i < 2; i++) step(cloth); mesh.geometry.attributes.position.needsUpdate = true; mesh.geometry.computeVertexNormals();
    if (cloth.t > 100 && (energy(cloth) < 1e-9 || cloth.t > 420)) { settled = true; const dc = drapeCoefficient(cloth); $("dc").textContent = Math.round(dc * 100) + "%"; $("dcn").textContent = "About " + Math.round(dc * 100) + "%: " + label(dc) + ". Rough guide only."; } }
  renderer.render(scene, camera);
}
let stop = false;
async function rank() {
  stop = false; $("rank").disabled = true; $("stop").hidden = false; const out = [], sz = +$("size").value;
  for (let i = 0; i < fabrics.length && !stop; i++) { $("prog").textContent = "Testing " + (i + 1) + " of " + fabrics.length + "…"; await new Promise((r) => setTimeout(r, 0)); const f = fab(fabrics[i].id); out.push({ f, dc: runToRest(f, sz).dc }); }
  $("rank").disabled = false; $("stop").hidden = true; $("prog").textContent = stop ? "Stopped. Showing " + out.length + " results." : "Done."; out.sort((a, b) => a.dc - b.dc);
  const t = $("rt"); t.textContent = ""; const h = document.createElement("tr"); ["Fabric", "Category", "Drape rating", "Drape coefficient"].forEach((x) => { const th = document.createElement("th"); th.textContent = x; h.append(th); }); t.append(h);
  out.forEach(({ f, dc }) => { const r = document.createElement("tr"); [f.name, f.category, f.drape + "/5", Math.round(dc * 100) + "%"].forEach((x) => { const td = document.createElement("td"); td.textContent = x; r.append(td); }); t.append(r); });
}
requireAuth(async () => {
  try { fabrics = (await (await fetch("data/fabrics.json")).json()).fabrics; } catch (e) { showMsg(msg, "Couldn't load the fabric list."); return; }
  try { edits = JSON.parse(localStorage.getItem("fc-fabric-edits") || "{}"); } catch (e) {}
  const cats = {}; fabrics.forEach((f) => (cats[f.category] = cats[f.category] || []).push(f));
  Object.keys(cats).sort().forEach((c) => { const g = document.createElement("optgroup"); g.label = c; cats[c].sort((a, b) => a.name.localeCompare(b.name)).forEach((f) => { const o = document.createElement("option"); o.value = f.id; o.textContent = f.name; g.append(o); }); $("fab").append(g); });
  $("fab").value = "cotton-plain"; $("fab").onchange = build; $("size").onchange = build; $("run").onclick = build; $("wire").onchange = () => { if (mesh) mesh.material.wireframe = $("wire").checked; };
  $("pause").onclick = () => { running = !running; $("pause").textContent = running ? "Pause" : "Resume"; }; $("rank").onclick = rank; $("stop").onclick = () => { stop = true; };
  Object.keys(VIEWS).forEach((n) => { const b = document.createElement("button"); b.className = "mini"; b.textContent = n; b.onclick = () => view(n); $("views").append(b); });
  size(); view("Perspective"); build(); requestAnimationFrame(loop); window.__drapeReady = true;
});
