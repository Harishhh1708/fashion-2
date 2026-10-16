// Pure maths for the 3D studio (no Three.js). Lengths in the UI are centimetres; everything returned by layout() is metres.
export const PRESETS = {
  "Adult male": { height: 175, chest: 98, waist: 84, hip: 98, shoulder: 46, arm: 60, inseam: 80, neck: 38, head: 1, depth: 0.74 },
  "Adult female": { height: 163, chest: 88, waist: 70, hip: 96, shoulder: 40, arm: 56, inseam: 76, neck: 33, head: 1, depth: 0.74 },
  "Plus-size": { height: 165, chest: 112, waist: 100, hip: 120, shoulder: 42, arm: 57, inseam: 74, neck: 38, head: 1, depth: 0.78 },
  "Petite": { height: 155, chest: 82, waist: 66, hip: 88, shoulder: 37, arm: 52, inseam: 70, neck: 32, head: 1, depth: 0.74 },
  "Tall": { height: 185, chest: 100, waist: 86, hip: 100, shoulder: 48, arm: 64, inseam: 87, neck: 40, head: 1, depth: 0.74 },
  "Kid (about 8 years)": { height: 128, chest: 62, waist: 56, hip: 64, shoulder: 30, arm: 42, inseam: 58, neck: 28, head: 1.18, depth: 0.8 },
  "Baby (about 1 year)": { height: 76, chest: 47, waist: 46, hip: 48, shoulder: 20, arm: 22, inseam: 30, neck: 24, head: 1.55, depth: 0.88 }
};
export const MEAS = [["height", "Height", 40, 220], ["chest", "Chest", 40, 150], ["waist", "Waist", 35, 150], ["hip", "Hip", 40, 160], ["shoulder", "Shoulder width", 15, 60], ["arm", "Arm length", 15, 85], ["inseam", "Inseam", 15, 105], ["neck", "Neck", 20, 50]];
export const TYPES = { tshirt: "T-shirt", shirt: "Long-sleeve shirt", kurta: "Kurta (tunic)", dress: "Dress", skirt: "Skirt", trousers: "Trousers", shorts: "Shorts" };
export const DEFAULTS = { tshirt: { hem: 0.15, sleeve: 0.3 }, shirt: { hem: 0.2, sleeve: 1 }, kurta: { hem: 0.5, sleeve: 1 }, dress: { hem: 0.65, sleeve: 0 }, skirt: { hem: 0.55, sleeve: 0 }, trousers: { hem: 1, sleeve: 0 }, shorts: { hem: 0.45, sleeve: 0 } };
const cm = (v) => v / 100;
const ring = (C, k) => cm(C) / (2 * Math.PI * Math.sqrt((1 + k * k) / 2)); // semi-axis for a circumference C with depth ratio k
export function layout(m) {
  const H = cm(m.height), k = m.depth || 0.74, crotch = Math.min(cm(m.inseam), H * 0.54);
  const shoulderY = H * 0.82, neckBase = H * 0.845, span = shoulderY - crotch;
  return { H, k, crotch, shoulderY, neckBase, hipY: crotch + span * 0.12, waistY: crotch + span * 0.55, chestY: crotch + span * 0.8,
    aHip: ring(m.hip, k), aWaist: ring(m.waist, k), aChest: ring(m.chest, k), neckR: cm(m.neck) / (2 * Math.PI),
    shoulderW: cm(m.shoulder), armLen: cm(m.arm), headR: H * 0.062 * (m.head || 1), armR: H * 0.026, thighR: cm(m.hip) / (2 * Math.PI) * 0.57 };
}
export const ringAdd = (easeCm, k) => ring(Math.abs(easeCm), k) * Math.sign(easeCm);
export const legR = (L, t) => L.thighR * (1 - 0.62 * t);
export const armRad = (L, t) => L.armR * (1 - 0.38 * t);
export function torsoProfile(L) {
  return [[L.crotch, L.aHip * 0.92], [L.hipY, L.aHip], [L.waistY, L.aWaist], [L.chestY, L.aChest], [L.shoulderY - 0.01 * L.H, L.aChest * 0.97], [L.shoulderY + 0.012 * L.H, L.neckR * 2.1], [L.neckBase, L.neckR * 1.1]];
}
export function aAt(L, y) {
  const p = torsoProfile(L); if (y <= p[0][0]) return p[0][1]; if (y >= p[p.length - 1][0]) return p[p.length - 1][1];
  for (let i = 0; i < p.length - 1; i++) if (y <= p[i + 1][0]) { const t = (y - p[i][0]) / (p[i + 1][0] - p[i][0] || 1); return p[i][1] + (p[i + 1][1] - p[i][1]) * t; }
  return p[0][1];
}
const lerp = (a, b, t) => a + (b - a) * t;
export function garmentSpec(type, L, o) {
  const add = ringAdd(o.ease, L.k), spec = { type, torso: null, sleeve: null, legs: null };
  const flare = { tshirt: 0, shirt: 0, kurta: 0.12, dress: 0.35, skirt: 0.3 }[type];
  const base = (y, fl) => (y >= L.hipY ? aAt(L, y) : L.aHip * 0.97 + (L.hipY - y) * fl);
  if (flare !== undefined) {
    const top = type === "skirt" ? L.waistY + 0.01 * L.H : L.neckBase, hemY = lerp(L.waistY, 0.03 * L.H, o.hem), N = 22, pts = [];
    for (let i = 0; i <= N; i++) {
      const y = lerp(hemY, top, i / N); let a = base(y, flare) + (y > L.shoulderY ? add * 0.2 : add);
      if (type !== "skirt" && y > L.shoulderY) a = Math.max(a, L.neckR * 1.15);
      pts.push([y, Math.max(0.02, a)]);
    }
    spec.torso = pts;
    if (o.sleeve > 0 && type !== "skirt") { const s = Math.max(-0.15, add * 0.5 / (L.aChest || 1)); spec.sleeve = { len: L.armLen * o.sleeve, r0: Math.max(0.01, armRad(L, 0) * (1 + 0.6 * add / L.aChest) + 0.003), r1: Math.max(0.01, armRad(L, o.sleeve) * (1 + 0.6 * add / L.aChest) + 0.003) }; }
  } else {
    const yTop = L.waistY + 0.01 * L.H, yBot = L.crotch - 0.04 * L.H, N = 10, pts = [];
    for (let i = 0; i <= N; i++) { const y = lerp(yBot, yTop, i / N); pts.push([y, Math.max(0.02, (y >= L.hipY ? aAt(L, y) : L.aHip * 0.92) + add)]); }
    spec.torso = pts;
    const f = Math.min(1, Math.max(0.2, o.hem)), legLen = L.crotch - 0.045 * L.H, a2 = add * 0.8;
    spec.legs = { len: f * legLen, r0: Math.max(0.02, legR(L, 0) + a2), r1: Math.max(0.02, legR(L, f) + a2) };
  }
  return spec;
}
export const defaultEase = (stretch) => (stretch >= 40 ? -4 : stretch >= 15 ? 0 : 6);
// Visual approximation only: more wrinkle-prone fabrics get finer folds, softer drape gets larger waves.
export function foldParams(f, pct) {
  const s = pct / 100;
  return { amp: 0.002 * (6 - f.wrinkleResistance) * s, low: 0.0025 * f.drape * s, n1: 3 + Math.round((5 - f.drape) * 1.2), n2: 9 + (5 - f.wrinkleResistance) };
}
export function materialParams(f) {
  const t = f.texture;
  return { roughness: Math.min(0.95, Math.max(0.15, 0.95 - f.gloss * 0.15)), opacity: Math.min(1, 0.35 + 0.13 * f.opacity),
    metalness: t === "sequin" ? 0.55 : t === "leather" || t === "coated" ? 0.05 : 0, sheen: t === "satin" || t === "velvet" ? 1 : 0, bump: Math.min(0.6, f.roughness * 0.1) };
}
// Reads the main sizes of an edited pattern and turns them into ease, hem and sleeve settings for the 3D garment.
// info (mm): frontUnder = front width at underarm level, frontTop = width at the top edge, frontH = front piece height, sleeveH = sleeve piece height (0 if none)
export function fromPattern(info, m, L, type) {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), D = (m.chest / 8 + 6) * 10, out = { ease: 0, hem: 0.5, sleeve: 0 };
  if (type === "trousers" || type === "shorts") {
    out.ease = clamp(info.frontTop * 4 / 10 - m.hip, -15, 40);
    const hemY = L.waistY - info.frontH / 1000; out.hem = clamp((L.crotch - hemY) / (L.crotch - 0.045 * L.H), 0.2, 1); return out;
  }
  if (type === "skirt") {
    out.ease = clamp(info.frontTop * 2 / 10 - m.waist, -15, 40);
    const hemY = L.waistY - info.frontH / 1000; out.hem = clamp((L.waistY - hemY) / (L.waistY - 0.03 * L.H), 0.1, 1); return out;
  }
  out.ease = clamp(info.frontUnder * 2 / 10 - m.chest, -15, 40);
  const hemY = L.neckBase - info.frontH / 1000; out.hem = clamp((L.waistY - hemY) / (L.waistY - 0.03 * L.H), 0.1, 1);
  out.sleeve = info.sleeveH > 0 ? clamp((info.sleeveH - 0.35 * D) / (m.arm * 10), 0, 1) : 0; return out;
}
