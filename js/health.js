const FILES = ["404.html", "css/base.css", "css/catalog.css", "css/design.css", "css/production.css", "css/studio.css", "css/workspace.css", "dashboard.html", "data/fabrics.json", "data/garments.json", "design.html", "drape.html", "editor.html", "fabrics.html", "garments.html", "health.html", "index.html", "js/account.js", "js/auth.js", "js/blocks.js", "js/bodymodel.js", "js/clothsim.js", "js/costing.js", "js/design.js", "js/drape.js", "js/garment3d.js", "js/geometry.js", "js/health.js", "js/motifs.js", "js/pattern-editor.js", "js/patterngen.js", "js/patternout.js", "js/production.js", "js/render2d.js", "js/sewingpdf.js", "js/shell.js", "js/studio.js", "js/swatch.js", "production.html", "profile.html", "settings.html", "studio.html"];
const $ = (id) => document.getElementById(id);
const checks = [
  ["Files uploaded", async () => { const miss = []; await Promise.all(FILES.map(async (f) => { try { const r = await fetch(f, { cache: "no-store" }); if (!r.ok) miss.push(f); } catch (e) { miss.push(f); } }));
    return miss.length ? [false, "Missing: " + miss.join(", "), "Upload these files to GitHub, keeping the folder names."] : [true, FILES.length + " files found."]; }],
  ["Browser storage", async () => { localStorage.setItem("fc-health", "1"); const ok = localStorage.getItem("fc-health") === "1"; localStorage.removeItem("fc-health"); return ok ? [true, "Works."] : [false, "Blocked.", "Allow site data for this page. Private or incognito windows forget everything when closed."]; }],
  ["Saving projects", async () => { const acc = await import("./account.js"); const r = await acc.createProject("local", "health-check (safe to delete)", "Test"); const p = await acc.getProject("local", r.id); await acc.renameProject("local", r.id, "renamed"); await acc.removeProject("local", r.id); const gone = await acc.getProject("local", r.id);
    return p && !gone ? [true, "Created, read, renamed and deleted a test project."] : [false, "Project saving did not work."]; }],
  ["Garment and fabric data", async () => { const [g, f] = await Promise.all([fetch("data/garments.json").then((r) => r.json()), fetch("data/fabrics.json").then((r) => r.json())]); return [true, g.garments.length + " garments, " + f.fabrics.length + " fabrics."]; }],
  ["3D graphics (WebGL)", async () => { const c = document.createElement("canvas"); return c.getContext("webgl2") || c.getContext("webgl") ? [true, "Available."] : [false, "Not available.", "Try Chrome or Edge, and turn on hardware acceleration."]; }],
  ["3D engine download", async () => { await import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"); return [true, "Three.js loaded from the CDN."]; }],
];
async function run() {
  $("go").disabled = true; const t = $("t"); t.textContent = "";
  const h = document.createElement("tr"); ["Check", "Result", "Details"].forEach((x) => { const th = document.createElement("th"); th.textContent = x; h.append(th); }); t.append(h);
  for (const [name, fn] of checks) {
    const tr = document.createElement("tr"), a = document.createElement("td"), b = document.createElement("td"), c = document.createElement("td"); a.textContent = name; b.textContent = "Running…"; tr.append(a, b, c); t.append(tr);
    let r; try { r = await fn(); } catch (e) { r = [false, "Error: " + (e.message || e), "Check your internet connection and try again."]; }
    b.textContent = r[0] === true ? "Pass" : r[0] === false ? "FAIL" : "Skipped"; b.style.color = r[0] === true ? "var(--good)" : r[0] === false ? "var(--bad)" : "var(--dim)"; b.style.fontWeight = "700";
    c.textContent = r[1] + (r[2] ? " " + r[2] : "");
  }
  $("go").disabled = false;
}
$("go").onclick = run; run();
