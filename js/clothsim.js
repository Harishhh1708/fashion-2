// Small position-based cloth simulation for a "drape test" (circular sample over a round support).
// PROTOTYPE: fabric ratings are mapped to settings with simple formulas. Results are for comparing and learning,
// not calibrated against a real drape tester.
export function paramsFor(f, sampleDia = 0.30) {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), gsmK = clamp(f.gsm / 150, 0.6, 1.8);
  return { R: sampleDia / 2, grid: 27, supportR: 0.09, supportH: 0.1,
    ks: clamp(1 - f.stretch / 200, 0.4, 1), kb: Math.min(1, Math.exp(-(f.drape - 1))), g: 9.81 * 0.2 * gsmK, damp: 0.97 + clamp(f.gsm / 150, 0.4, 2) * 0.008 };
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function createCloth(p) {
  // Circular sample cut from a square grid, so bending can be measured along straight grid lines.
  const N = p.grid || 27, h = (2 * p.R) / (N - 1), c0 = (N - 1) / 2, map = new Int32Array(N * N).fill(-1), top = p.supportH + 0.012, r = rng(7), P = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = (i - c0) * h, z = (j - c0) * h; if (x * x + z * z <= (p.R + h * 0.01) ** 2) { map[j * N + i] = P.length; P.push([x, z]); } }
  const n = P.length, pos = new Float32Array(n * 3), prev = new Float32Array(n * 3), flat = new Float32Array(n * 2);
  P.forEach(([x, z], k) => { flat[k * 2] = x; flat[k * 2 + 1] = z; pos[k * 3] = x; pos[k * 3 + 1] = top + (r() - 0.5) * 0.0008; pos[k * 3 + 2] = z; }); prev.set(pos);
  const at = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? -1 : map[j * N + i]), D = [], T = [], tris = [];
  const dist = (a, b) => Math.hypot(flat[a * 2] - flat[b * 2], flat[a * 2 + 1] - flat[b * 2 + 1]);
  const link = (a, b, k) => { if (a >= 0 && b >= 0) D.push([a * 3, b * 3, dist(a, b), k]); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = at(i, j); if (a < 0) continue;
    link(a, at(i + 1, j), p.ks); link(a, at(i, j + 1), p.ks); link(a, at(i + 1, j + 1), p.ks * 0.6); link(a, at(i + 1, j - 1), p.ks * 0.6);
    const l = at(i - 1, j), rr = at(i + 1, j), u = at(i, j - 1), d = at(i, j + 1);
    if (l >= 0 && rr >= 0) T.push([l * 3, a * 3, rr * 3]); if (u >= 0 && d >= 0) T.push([u * 3, a * 3, d * 3]);
    const q1 = at(i + 1, j), q2 = at(i, j + 1), q3 = at(i + 1, j + 1);
    if (q1 >= 0 && q2 >= 0) { tris.push(a, q1, q2); if (q3 >= 0) tris.push(q1, q3, q2); } else if (q1 >= 0 && q3 >= 0 && q2 < 0) tris.push(a, q1, q3); }
  const m = D.length, ca = new Int32Array(m), cb = new Int32Array(m), cr = new Float32Array(m), ck = new Float32Array(m);
  D.forEach(([a, b, rest, k], q) => { ca[q] = a; cb[q] = b; cr[q] = rest; ck[q] = k; });
  const nt = T.length, ta = new Int32Array(nt), tb = new Int32Array(nt), tc = new Int32Array(nt);
  T.forEach(([a, b, c], q) => { ta[q] = a; tb[q] = b; tc[q] = c; });
  return { p, n, pos, prev, flat, ca, cb, cr, ck, m, ta, tb, tc, nt, tris: new Uint32Array(tris), N, t: 0 };
}
export function step(c, dt = 1 / 90, iters = 12) {
  const { p, pos, prev, n, ca, cb, cr, ck, m, ta, tb, tc, nt } = c, g = p.g * dt * dt, thick = 0.002, top = p.supportH;
  for (let k = 0; k < n; k++) { const o = k * 3;
    for (let a = 0; a < 3; a++) { const v = (pos[o + a] - prev[o + a]) * p.damp; prev[o + a] = pos[o + a]; pos[o + a] += v; }
    pos[o + 1] -= g; }
  for (let it = 0; it < iters; it++) {
    for (let q = 0; q < m; q++) { const ia = ca[q], ib = cb[q], rest = cr[q], kk = ck[q];
      const dx = pos[ib] - pos[ia], dy = pos[ib + 1] - pos[ia + 1], dz = pos[ib + 2] - pos[ia + 2], d = Math.hypot(dx, dy, dz) || 1e-9, s = ((d - rest) / d) * 0.5 * kk;
      pos[ia] += dx * s; pos[ia + 1] += dy * s; pos[ia + 2] += dz * s; pos[ib] -= dx * s; pos[ib + 1] -= dy * s; pos[ib + 2] -= dz * s; }
    for (let q = 0; q < nt; q++) { const a = ta[q], b = tb[q], cc = tc[q], k = p.kb / 3;
      for (let e = 0; e < 3; e++) { const d = (pos[a + e] + pos[cc + e]) * 0.5 - pos[b + e]; pos[b + e] += d * 2 * k; pos[a + e] -= d * k; pos[cc + e] -= d * k; } }
    for (let k = 0; k < n; k++) { const o = k * 3, x = pos[o], z = pos[o + 2], r = Math.hypot(x, z);
      if (r < p.supportR + thick && pos[o + 1] < top + thick) {
        if (prev[o + 1] >= top - 0.002 || r < p.supportR - 0.004) pos[o + 1] = top + thick;
        else { const s = (p.supportR + thick) / (r || 1e-9); pos[o] = x * s; pos[o + 2] = z * s; } }
      if (pos[o + 1] < thick) { pos[o + 1] = thick; prev[o] += (pos[o] - prev[o]) * 0.5; prev[o + 2] += (pos[o + 2] - prev[o + 2]) * 0.5; } }
  }
  c.t++;
}
export function energy(c) { let e = 0; for (let k = 0; k < c.n * 3; k++) { const v = c.pos[k] - c.prev[k]; e += v * v; } return e / c.n; }
// Drape coefficient: (shadow area - support area) / (sample area - support area), from the outline seen from above.
export function drapeCoefficient(c, bins = 72) {
  const { p, pos, n } = c, mx = new Float32Array(bins);
  for (let k = 0; k < n; k++) { const x = pos[k * 3], z = pos[k * 3 + 2], r = Math.hypot(x, z), b = Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * bins) % bins; if (r > mx[b]) mx[b] = r; }
  let area = 0; for (let b = 0; b < bins; b++) area += 0.5 * mx[b] * mx[(b + 1) % bins] * Math.sin((2 * Math.PI) / bins);
  const aS = Math.PI * p.supportR ** 2, aD = Math.PI * p.R ** 2; return Math.max(0, Math.min(1, (area - aS) / (aD - aS)));
}
export function runToRest(f, sampleDia = 0.3, maxSteps = 260) {
  const c = createCloth(paramsFor(f, sampleDia)); for (let i = 0; i < maxSteps; i++) { step(c); if (i > 100 && i % 20 === 0 && energy(c) < 1e-9) break; } return { dc: drapeCoefficient(c), steps: c.t, cloth: c };
}
