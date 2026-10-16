// The 3D garment: the real cut pieces are wrapped onto the mannequin and relaxed with cloth physics,
// so the dress in the viewport has the same lengths, seams and ease as the one you will sew.
import * as THREE from "three";
import { aAt, armRad } from "./bodymodel.js";

const mmy = (mm) => mm / 1000; // pattern millimetres to scene metres
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- body as colliders ----------
export function bodyColliders(L) {
  const sy = L.shoulderY - 0.02 * L.H, list = [{ kind: "torso", L }];
  list.push({ kind: "cyl", y0: L.neckBase - 0.03 * L.H, y1: L.neckBase + 0.06 * L.H, r: L.neckR * 1.06 });
  [-1, 1].forEach((s) => {
    const th = s * 0.2;
    list.push({ kind: "capsule", a: [s * L.shoulderW / 2, sy, 0], d: [Math.sin(th), -Math.cos(th), 0], len: L.armLen, r0: L.armR * 1.1, r1: L.armR * 0.68 });
    list.push({ kind: "capsule", a: [s * L.aHip * 0.5, L.crotch, 0], d: [0, -1, 0], len: L.crotch - 0.045 * L.H, r0: L.thighR * 1.05, r1: L.thighR * 0.45 });
  });
  return list;
}
function collide(list, p, margin) {
  for (const c of list) {
    if (c.kind === "torso") {
      const L = c.L;
      if (p[1] < L.crotch - 0.03 || p[1] > L.neckBase) continue;
      const need = aAt(L, p[1]) + margin, r = Math.hypot(p[0], p[2] / L.k);
      if (r < need) { if (r < 1e-5) { p[0] = 0; p[2] = need; } else { const s = need / r; p[0] *= s; p[2] *= s; } }
    } else if (c.kind === "cyl") {
      if (p[1] < c.y0 || p[1] > c.y1) continue;
      const need = c.r + margin, r = Math.hypot(p[0], p[2]);
      if (r < need) { const s = need / Math.max(r, 1e-5); p[0] *= s; p[2] *= s; if (r < 1e-5) p[0] = need; }
    } else {
      const t = clamp(((p[0] - c.a[0]) * c.d[0] + (p[1] - c.a[1]) * c.d[1] + (p[2] - c.a[2]) * c.d[2]) / c.len, 0, 1);
      const qx = c.a[0] + c.d[0] * c.len * t, qy = c.a[1] + c.d[1] * c.len * t, qz = c.a[2] + c.d[2] * c.len * t;
      const dx = p[0] - qx, dy = p[1] - qy, dz = p[2] - qz, r = Math.hypot(dx, dy, dz);
      const need = c.r0 + (c.r1 - c.r0) * t + margin;
      if (r < need) { const s = need / Math.max(r, 1e-5); p[0] = qx + dx * s; p[1] = qy + dy * s; p[2] = qz + dz * s; if (r < 1e-5) p[0] = qx + need; }
    }
  }
}

// ---------- ring maths: the body cross-section is an ellipse, fabric runs along its arc ----------
const perim = (a, k) => { const b = a * k; return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); };
const aForPerim = (P, k) => P / (Math.PI * (3 * (1 + k) - Math.sqrt((3 + k) * (1 + 3 * k))));
function ringMap(a, k, n = 96) {
  const b = a * k, cum = new Float64Array(n + 1); let px = 0, pz = b, total = 0;
  for (let i = 1; i <= n; i++) {
    const phi = (i / n) * Math.PI * 2, x = a * Math.sin(phi), z = b * Math.cos(phi);
    total += Math.hypot(x - px, z - pz); cum[i] = total; px = x; pz = z;
  }
  return { cum, total, n, a, b };
}
function posAtArc(map, s) {
  const T = map.total, u = ((s % T) + T) % T;
  let lo = 0, hi = map.n;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (map.cum[mid] < u) lo = mid; else hi = mid; }
  const seg = map.cum[hi] - map.cum[lo], t = seg > 1e-9 ? (u - map.cum[lo]) / seg : 0;
  const phi = ((lo + t) / map.n) * Math.PI * 2;
  return [map.a * Math.sin(phi), map.b * Math.cos(phi)];
}
const posAtAngle = (map, phi) => [map.a * Math.sin(phi), map.b * Math.cos(phi)];
function arcAtAngle(map, phi) {
  const u = (((phi / (Math.PI * 2)) % 1) + 1) % 1, x = u * map.n, i = Math.floor(x);
  return map.cum[i] + (map.cum[Math.min(map.n, i + 1)] - map.cum[i]) * (x - i);
}

// Horizontal crossing of a closed outline at pattern height y, or null if the row misses it.
function spanAtY(pts, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[1] <= y && b[1] >= y) || (b[1] <= y && a[1] >= y)) {
      const t = b[1] === a[1] ? 0 : (y - a[1]) / (b[1] - a[1]);
      const x = a[0] + (b[0] - a[0]) * t; lo = Math.min(lo, x); hi = Math.max(hi, x);
    }
  }
  return hi > lo ? [lo, hi] : null;
}

// ---------- cloth solver ----------
export function clothParams(f) {
  const flow = clamp(((f && f.drape) || 3) / 5, 0.1, 1), weight = clamp(((f && f.gsm) || 160) / 320, 0.3, 1.6);
  return { gravity: 0.0006 * weight * (0.5 + flow), bend: 0.06 + 0.4 * (1 - flow), shear: 0.3 + 0.35 * (1 - flow),
    iters: 60 + Math.round(30 * flow), margin: 0.004 + 0.002 * weight };
}
function makePack(rows, cols) {
  const n = rows * cols;
  return { rows, cols, n, pos: new Float32Array(n * 3), uv: new Float32Array(n * 2), pinned: new Uint8Array(n), hole: new Uint8Array(n),
    pYs: new Float32Array(rows), con: null };
}
const gid = (p, r, c) => r * p.cols + c;
function buildConstraints(p, cp) {
  const i = [], j = [], rest = [], k = [];
  const add = (a, b, stiff) => {
    if (p.hole[a] || p.hole[b]) return;
    i.push(a); j.push(b); k.push(stiff);
    rest.push(Math.hypot(p.pos[a * 3] - p.pos[b * 3], p.pos[a * 3 + 1] - p.pos[b * 3 + 1], p.pos[a * 3 + 2] - p.pos[b * 3 + 2]));
  };
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
    const a = gid(p, r, c); if (p.hole[a]) continue;
    if (c + 1 < p.cols) add(a, gid(p, r, c + 1), 1);
    if (r + 1 < p.rows) add(a, gid(p, r + 1, c), 1);
    if (r + 1 < p.rows && c + 1 < p.cols) { add(a, gid(p, r + 1, c + 1), cp.shear); add(gid(p, r, c + 1), gid(p, r + 1, c), cp.shear); }
    if (r + 2 < p.rows) add(a, gid(p, r + 2, c), cp.bend);
    if (c + 2 < p.cols) add(a, gid(p, r, c + 2), cp.bend * 0.6);
  }
  p.con = { i: Int32Array.from(i), j: Int32Array.from(j), rest: Float32Array.from(rest), k: Float32Array.from(k) };
}
function relax(packs, colliders, cp) {
  for (let it = 0; it < cp.iters; it++) {
    const g = cp.gravity * (0.3 + 0.7 * (it / cp.iters));
    for (const p of packs) {
      for (let i = 0; i < p.n; i++) if (!p.pinned[i] && !p.hole[i]) p.pos[i * 3 + 1] -= g;
      for (let pass = 0; pass < 2; pass++) {
        const { i, j, rest, k } = p.con;
        for (let c = 0; c < i.length; c++) {
          const a = i[c], b = j[c];
          const dx = p.pos[b * 3] - p.pos[a * 3], dy = p.pos[b * 3 + 1] - p.pos[a * 3 + 1], dz = p.pos[b * 3 + 2] - p.pos[a * 3 + 2];
          const d = Math.hypot(dx, dy, dz); if (d < 1e-7) continue;
          const wa = p.pinned[a] ? 0 : 1, wb = p.pinned[b] ? 0 : 1, tw = wa + wb; if (!tw) continue;
          const f = ((d - rest[c]) / d) * 0.5 * k[c];
          p.pos[a * 3] += dx * f * (2 * wa / tw); p.pos[a * 3 + 1] += dy * f * (2 * wa / tw); p.pos[a * 3 + 2] += dz * f * (2 * wa / tw);
          p.pos[b * 3] -= dx * f * (2 * wb / tw); p.pos[b * 3 + 1] -= dy * f * (2 * wb / tw); p.pos[b * 3 + 2] -= dz * f * (2 * wb / tw);
        }
      }
      for (let i = 0; i < p.n; i++) {
        if (p.pinned[i] || p.hole[i]) continue;
        const q = [p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]];
        collide(colliders, q, cp.margin);
        p.pos[i * 3] = q[0]; p.pos[i * 3 + 1] = q[1]; p.pos[i * 3 + 2] = q[2];
      }
    }
  }
}
function geometryOf(p) {
  const idx = [];
  for (let r = 0; r + 1 < p.rows; r++) for (let c = 0; c + 1 < p.cols; c++) {
    const a = gid(p, r, c), b = gid(p, r, c + 1), d = gid(p, r + 1, c), e = gid(p, r + 1, c + 1);
    if (p.hole[a] || p.hole[b] || p.hole[d] || p.hole[e]) continue;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p.pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(p.uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const bodyY = (L, pY) => L.shoulderY - mmy(pY); // pattern y=0 is the shoulder line, measured down in mm

// ---------- wrap the bodice and skirt bands onto the body ring ----------
function wrapBand(pieces, band, L, cp) {
  const ps = pieces.filter((p) => p.wrap.band === band && p.wrap.mirror !== undefined);
  if (!ps.length) return [];
  const top = Math.min(...ps.map((p) => p.wrap.topY)), bottom = Math.max(...ps.map((p) => p.wrap.bottomY));
  const rows = clamp(Math.round((bottom - top) / 26), 16, 44);
  // A piece with slots > 1 (gores, repeats of one panel) becomes one cloth panel per slot.
  const packs = [];
  ps.forEach((piece) => {
    const slots = piece.wrap.slots || 1;
    for (let slot = 0; slot < slots; slot++) {
      const cols = clamp(Math.round(piece.size[0] / 24), 10, 28);
      const pack = makePack(rows, cols);
      pack.piece = piece; pack.slot = slot; pack.slots = slots; pack.x0 = Math.min(...piece.points.map((q) => q[0]));
      pack.w0 = Math.max(...piece.points.map((q) => q[0])) - pack.x0;
      packs.push(pack);
    }
  });
  const pinTo = Math.max(...ps.map((p) => p.wrap.pinTo !== undefined ? p.wrap.pinTo : p.wrap.topY));
  for (let r = 0; r < rows; r++) {
    // Rows bunch towards the shoulder line, where the neckline and armhole change fastest.
    const pY = top + (bottom - top) * Math.pow(r / (rows - 1), 1.45), y = bodyY(L, pY);
    packs.forEach((p) => { p.pYs[r] = pY; });
    const spanOf = new Map();
    let arcMM = 0;
    ps.forEach((piece) => {
      const s = spanAtY(piece.points, pY);
      const ext = s ? (piece.wrap.mirror ? s[1] : s[1] - s[0]) : 0;
      if (!s || ext < 1) return;
      spanOf.set(piece, { s, ext });
      arcMM += ext * (piece.wrap.mirror ? 2 : 1) * (piece.wrap.slots || 1);
    });
    const P = Math.max(arcMM / 1000, perim(aAt(L, y), L.k) * 1.004), map = ringMap(aForPerim(P, L.k), L.k, 96);
    packs.forEach((p) => {
      const w = p.piece.wrap, sp = spanOf.get(p.piece);
      if (!sp) { for (let c = 0; c < p.cols; c++) p.hole[gid(p, r, c)] = 1; return; }
      const slotArcMM = w.mirror ? 2 * sp.ext : sp.ext, slotArc = slotArcMM / 1000; // ring arc in scene metres
      const centre = arcAtAngle(map, w.sector || 0) + (p.slot * map.total) / p.slots;
      const pin = pY <= (w.pinTo !== undefined ? w.pinTo : pinTo) + 0.01;
      for (let c = 0; c < p.cols; c++) {
        const i = gid(p, r, c), off = (c / (p.cols - 1) - 0.5) * slotArc;
        let x; // pattern x, millimetres
        if (w.mirror) { x = Math.abs(off) * 1000; if (x < sp.s[0] - 0.6) { p.hole[i] = 1; continue; } }
        else x = sp.s[0] + (off + slotArc / 2) * 1000;
        const [X, Z] = posAtArc(map, centre + off);
        p.pos[i * 3] = X; p.pos[i * 3 + 1] = y; p.pos[i * 3 + 2] = Z;
        p.uv[i * 2] = clamp((x - p.x0) / Math.max(1, p.w0), 0, 1);
        p.uv[i * 2 + 1] = 1 - clamp((pY - w.topY) / Math.max(1, w.bottomY - w.topY), 0, 1);
        if (pin) p.pinned[i] = 1;
      }
    });
  }
  return packs;
}

// ---------- sleeves: a tube around the arm with the cap drawn over the shoulder ----------
function wrapSleeves(pieces, L, cp) {
  const out = [];
  pieces.filter((p) => p.wrap.band === "sleeve").forEach((piece) => {
    const capH = piece.wrap.capH, bottom = capH + piece.wrap.len;
    const rows = clamp(Math.round(bottom / 32), 10, 32), cols = clamp(Math.round(piece.size[0] / 22), 10, 26);
    const x0 = Math.min(...piece.points.map((q) => q[0])), w0 = Math.max(...piece.points.map((q) => q[0])) - x0;
    [-1, 1].forEach((side) => {
      const p = makePack(rows, cols);
      p.piece = piece; p.side = side;
      const th = side * 0.2, d = [Math.sin(th), -Math.cos(th), 0], outw = [Math.cos(th), Math.sin(th), 0];
      const O = [side * L.shoulderW / 2, L.shoulderY - 0.02 * L.H, 0];
      for (let r = 0; r < rows; r++) {
        const pY = (bottom * r) / (rows - 1); p.pYs[r] = pY;
        const sp = spanAtY(piece.points, pY);
        for (let c = 0; c < cols; c++) {
          const i = gid(p, r, c);
          if (!sp) { p.hole[i] = 1; continue; }
          const x = sp[0] + ((sp[1] - sp[0]) * c) / (cols - 1), cx = (sp[0] + sp[1]) / 2, circ = Math.max(1, sp[1] - sp[0]);
          const phi = ((x - cx) / circ) * Math.PI * 2;
          let t, rad;
          if (pY <= capH) {
            const u = pY / Math.max(1, capH), rUnder = Math.max(mmy(circ) / (Math.PI * 2), armRad(L, 0) * 1.15);
            rad = rUnder * Math.sqrt(Math.max(0.06, 1 - (1 - u) * (1 - u))); t = mmy(capH) * u * 0.9;
          } else {
            t = mmy(capH) * 0.9 + mmy(pY - capH);
            const along = clamp(t / Math.max(0.02, L.armLen), 0, 1);
            rad = Math.max(mmy(circ) / (Math.PI * 2), armRad(L, along) * 1.08) + cp.margin * 0.6;
          }
          const ca = Math.cos(phi), sa = Math.sin(phi);
          p.pos[i * 3] = O[0] + d[0] * t + outw[0] * ca * rad;
          p.pos[i * 3 + 1] = O[1] + d[1] * t + outw[1] * ca * rad;
          p.pos[i * 3 + 2] = sa * rad;
          p.uv[i * 2] = clamp((x - x0) / Math.max(1, w0), 0, 1); p.uv[i * 2 + 1] = 1 - clamp(pY / bottom, 0, 1);
          if (pY <= capH) p.pinned[i] = 1;
        }
      }
      out.push(p);
    });
  });
  return out;
}

// ---------- trims and accessories ----------
function ringStrip(L, yTop, yBot, extra, sector, arcFrac, rows = 4, cols = 16) {
  const p = makePack(rows, cols);
  p.piece = { label: "trim" };
  for (let r = 0; r < rows; r++) {
    const y = yBot + ((yTop - yBot) * r) / (rows - 1), a = aAt(L, y) + extra, map = ringMap(a, L.k, 64);
    for (let c = 0; c < cols; c++) {
      const i = gid(p, r, c), phi = sector + (c / (cols - 1) - 0.5) * arcFrac * Math.PI * 2, [X, Z] = posAtAngle(map, phi);
      p.pos[i * 3] = X; p.pos[i * 3 + 1] = y; p.pos[i * 3 + 2] = Z;
      p.uv[i * 2] = c / (cols - 1); p.uv[i * 2 + 1] = r / (rows - 1);
      p.pinned[i] = 1;
    }
  }
  return p;
}
function armTube(a, dir, r0, r1, len, rows = 4, cols = 16) {
  const p = makePack(rows + 1, cols);
  p.piece = { label: "trim" };
  const e1 = [-dir[1], dir[0], 0];
  for (let r = 0; r <= rows; r++) {
    const t = (len * r) / rows, rad = r0 + (r1 - r0) * (r / rows);
    for (let c = 0; c < cols; c++) {
      const i = gid(p, r, c), phi = (c / (cols - 1)) * Math.PI * 2;
      p.pos[i * 3] = a[0] + dir[0] * t + (e1[0] * Math.cos(phi)) * rad;
      p.pos[i * 3 + 1] = a[1] + dir[1] * t + (e1[1] * Math.cos(phi)) * rad;
      p.pos[i * 3 + 2] = Math.sin(phi) * rad;
      p.uv[i * 2] = c / (cols - 1); p.uv[i * 2 + 1] = r / rows;
      p.pinned[i] = 1;
    }
  }
  return p;
}
const radiusAtRow = (p, row) => {
  let best = 0;
  for (let c = 0; c < p.cols; c++) { const i = gid(p, row, c); if (p.hole[i]) continue; best = Math.max(best, Math.hypot(p.pos[i * 3], p.pos[i * 3 + 2] / 1)); }
  return best;
};
const rowForY = (p, pY) => { let best = 0, bd = Infinity; for (let r = 0; r < p.rows; r++) { const d = Math.abs(p.pYs[r] - pY); if (d < bd) { bd = d; best = r; } } return best; };

function addTrims(group, pieces, fit, L, fabric, matFor, packs, cp) {
  const find = (role) => pieces.find((p) => p.role === role);
  const torso = packs.filter((p) => p.piece.wrap.band === "torso");
  const front = torso.find((p) => p.piece.role === "front") || torso[0];
  const trimMesh = (pack, mat, name) => {
    const m = new THREE.Mesh(geometryOf(pack), mat); m.castShadow = m.receiveShadow = true; m.name = name; group.add(m); return m;
  };
  const matOf = (p, fallback) => (p ? matFor(p, fabric) : null) || fallback;
  const notions = new THREE.MeshStandardMaterial({ color: 0xf3ece0, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide });
  const wb = find("waistband");
  if (wb && front) {
    const y = bodyY(L, fit.waistY), h = mmy(wb.size[1] || 70) * 0.55;
    trimMesh(ringStrip(L, y + h, y - h, cp.margin + 0.003, 0, 1), matOf(wb, notions), "waistband");
  }
  const nb = find("neckband");
  if (nb && front) {
    const yTop = L.shoulderY + 0.03 * L.H, yBot = bodyY(L, Math.max(fit.neckDropF, 20));
    trimMesh(ringStrip(L, yTop, yBot, cp.margin + 0.004, 0, 1), matOf(nb, notions), "neckband");
  }
  const cb = find("cuffband");
  if (cb) packs.filter((p) => p.piece.wrap.band === "sleeve").forEach((p) => {
    const th = p.side * 0.2, d = [Math.sin(th), -Math.cos(th), 0];
    const t = mmy(p.piece.wrap.capH + p.piece.wrap.len) - 0.03;
    const centre = [p.side * L.shoulderW / 2 + d[0] * t, L.shoulderY - 0.02 * L.H + d[1] * t, 0];
    const rad = Math.max(mmy(p.piece.wrap.hemR) / Math.PI, armRad(L, clamp(t / L.armLen, 0, 1)) * 1.08) * 1.12;
    trimMesh(armTube(centre, d, rad * 1.14, rad * 1.04, 0.055, 3, 16), matOf(cb, notions), "cuff");
  });
  const cl = fit.closureName;
  if (cl === "Front button placket" || cl === "Centre back buttons" || cl === "Wrap with tie") {
    const n = cl === "Wrap with tie" ? 2 : 6, back = cl === "Centre back buttons";
    const mat = new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.35, metalness: 0.08 });
    for (let i = 0; i < n; i++) {
      const pY = back ? fit.neckDropB + 25 + ((fit.waistY - fit.neckDropB - 60) * i) / Math.max(1, n - 1)
        : fit.neckDropF + 25 + ((fit.waistY - fit.neckDropF - 60) * i) / Math.max(1, n - 1);
      const host = back ? (torso.find((p) => p.piece.role === "back") || front) : front;
      if (!host) continue;
      const row = rowForY(host, pY), r = radiusAtRow(host, row) + cp.margin + 0.003, y = bodyY(L, pY);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 14, 10), mat);
      b.position.set(0, y, back ? -r : r); b.scale.z = 0.4; b.castShadow = true; group.add(b);
    }
  }
  if (cl === "Centre back zip" || cl === "Hidden zip in side seam") {
    const side = cl === "Hidden zip in side seam";
    const y0 = bodyY(L, side ? fit.scyeY : fit.neckDropB + 10), y1 = bodyY(L, fit.waistY * 0.7);
    trimMesh(ringStrip(L, y0, y1, cp.margin + 0.001, side ? Math.PI / 2 : Math.PI, 0.05, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2c2c31, roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide }), "zip");
  }
  const tie = find("tie");
  if (tie && front) {
    const row = rowForY(front, fit.waistY), r = radiusAtRow(front, row) + cp.margin, y = bodyY(L, fit.waistY);
    const knot = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.008, 8, 18), matOf(tie, notions));
    knot.position.set(0.03, y, r); knot.rotation.y = Math.PI / 2; knot.castShadow = true; group.add(knot);
    [-1, 1].forEach((s) => trimMesh(armTube([0.03, y, r], [s * 0.35, -1, 0.15], 0.009, 0.006, 0.3, 5, 6), matOf(tie, notions), "tie"));
  }
  const pocket = find("pocket");
  if (pocket) {
    const y = bodyY(L, fit.hipY + 90) - 0.03, a = aAt(L, y) + cp.margin * 0.6, b = a * L.k;
    [-1, 1].forEach((s) => {
      const phi = s * 0.55, nx = Math.sin(phi), nz = Math.cos(phi);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(mmy(pocket.size[0]), mmy(pocket.size[1]) * 0.85), matOf(pocket, notions));
      m.position.set(a * nx, y, b * nz); m.lookAt(a * nx * 2, y, b * nz * 2); m.castShadow = true; group.add(m);
    });
  }
}

// ---------- entry point ----------
export function sewGarment(pieces, fit, L, fabric, matFor, opts) {
  const o = opts || {}, cp = Object.assign(clothParams(fabric), o.cloth || {});
  if (cp.weight) { cp.gravity *= cp.weight; cp.iters = Math.round(cp.iters * (0.75 + 0.25 * cp.weight)); delete cp.weight; }
  const packs = wrapBand(pieces, "torso", L, cp).concat(wrapBand(pieces, "skirt", L, cp), wrapSleeves(pieces, L, cp));
  if (!packs.length) return null;
  packs.forEach((p) => buildConstraints(p, cp));
  relax(packs, bodyColliders(L), cp);
  const group = new THREE.Group(), meshes = [];
  packs.forEach((p, i) => {
    const mat = matFor(p.piece, fabric) || new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.85, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geometryOf(p), mat);
    m.castShadow = m.receiveShadow = true;
    m.name = String(p.piece.label || "piece").toLowerCase().replace(/[^\w]+/g, "_") + (p.side ? (p.side > 0 ? "_r" : "_l") : "") + (p.slots > 1 ? "_" + (p.slot + 1) : "");
    group.add(m); meshes.push(m);
  });
  if (o.trims !== false) addTrims(group, pieces, fit, L, fabric, matFor, packs, cp);
  return { group, meshes, packs, cloth: cp };
}
