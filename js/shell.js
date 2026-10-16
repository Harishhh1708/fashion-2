export function renderShell(active) {
  const links = [["design.html","Design studio"],["dashboard.html","Dashboard"],["garments.html","Garments"],["fabrics.html","Fabrics"],["studio.html","3D studio"],["drape.html","Drape test"],["production.html","Production"],["profile.html","Profile"],["settings.html","Settings"]];
  document.getElementById("side").innerHTML =
    '<a class="logo" href="index.html">Fashion<i>CAD</i></a><nav style="margin-top:1.2rem">' +
    links.map(([h,t]) => '<a class="m" href="'+h+'"'+(h===active?' aria-current="page" style="background:var(--mat)"':'')+'>'+t+'</a>').join("") +
    '<a class="m" href="#" id="theme">Switch theme</a></nav><p class="hint" style="margin-top:1.2rem">Saved on this device. Use Settings to download a backup.</p>';
  document.getElementById("theme").onclick = (e) => { e.preventDefault();
    const r = document.documentElement, n = r.dataset.theme === "light" ? "dark" : "light";
    r.dataset.theme = n; try { localStorage.setItem("fc-theme", n); } catch (x) {} };
}
