// Parametric pattern generation for the guided Design Studio.
// Body measurements in, cuttable pieces out: each piece is an outline split into named sewing edges,
// with darts, notches, grainline, fold side, cut count and per-edge seam allowances.
// Units: millimetres, y down, x measured from the piece centre line (centre front / centre back / sleeve centre).
// These are draft blocks to fit and adjust, not graded production blocks.
import { dist } from "./geometry.js";

const mm = (cm) => cm * 10;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const R1 = (v) => Math.round(v * 10) / 10;

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
// Increments around the M measurement set: chest, waist, hip, shoulder, neck, arm, height (cm).
const SIZE_DELTA = {
  XS: [-8, -8, -8, -2, -2, -3, -4], S: [-4, -4, -4, -1, -1, -1.5, -2], M: [0, 0, 0, 0, 0, 0, 0],
  L: [4, 4, 4, 1, 1, 1.5, 2], XL: [8, 8, 8, 2, 2, 3, 4], XXL: [12, 12, 12, 3, 3, 4.5, 5]
};
const MKEYS = ["chest", "waist", "hip", "shoulder", "neck", "arm", "height"];
export function measureFor(m, size) {
  const d = SIZE_DELTA[size] || SIZE_DELTA.M, out = { ...m };
  MKEYS.forEach((k, i) => { out[k] = (m[k] ?? 0) + d[i]; });
  return out;
}
export function sizeChart(m) { return SIZES.map((size) => ({ size, ...measureFor(m, size) })); }

export const SILHOUETTES = {
  "a-line": { name: "A-line dress", waistSeam: false, flare: 0.3, darts: false, skirt: "a-line" },
  sheath: { name: "Sheath dress", waistSeam: false, flare: 0.08, darts: true, skirt: "straight" },
  "fit-flare": { name: "Fit and flare", waistSeam: true, flare: 0.6, darts: true, skirt: "a-line" },
  empire: { name: "Empire waist", waistSeam: true, flare: 0.55, darts: false, skirt: "a-line", waistRise: -0.06 },
  shift: { name: "Shift / straight", waistSeam: false, flare: 0.08, darts: false, skirt: "straight" },
  wrap: { name: "Wrap style", waistSeam: true, flare: 0.4, darts: true, skirt: "a-line" },
  gown: { name: "Evening gown", waistSeam: true, flare: 1.1, darts: true, skirt: "full" },
  mermaid: { name: "Mermaid, fit to knee", waistSeam: true, flare: 0.9, darts: true, skirt: "mermaid" }
};
export const NECKS = {
  round: { name: "Round neck", drop: 1.6, backDrop: 0.3, width: 0 },
  v: { name: "V neck", drop: 3.4, backDrop: 0.3, width: 0.15 },
  boat: { name: "Boat neck", drop: 0.5, backDrop: 0.1, width: 0.5 },
  square: { name: "Square neck", drop: 1.5, backDrop: 0.2, width: 0.3, sharp: true },
  sweetheart: { name: "Sweetheart", drop: 1.2, backDrop: 0.2, width: 0.4, sharp: true },
  high: { name: "High / mock neck", drop: 0.6, backDrop: 0.5, width: -0.15, collar: "mock" },
  halter: { name: "Halter", drop: 2.4, backDrop: 0.4, width: -0.45, sleeveless: true },
  scoop: { name: "Deep scoop", drop: 4.5, backDrop: 0.8, width: 0.25 }
};
export const SLEEVES = {
  none: { name: "Sleeveless", len: 0 }, cap: { name: "Cap sleeve", len: 0.16 }, short: { name: "Short sleeve", len: 0.42 },
  elbow: { name: "Elbow sleeve", len: 0.6 }, "three-quarter": { name: "Three-quarter", len: 0.8 }, long: { name: "Long sleeve", len: 1 },
  puff: { name: "Puff sleeve", len: 0.45, gather: 1.45 }, bell: { name: "Bell sleeve", len: 0.85, hemWidth: 2.1 },
  lantern: { name: "Lantern sleeve", len: 0.9, hemWidth: 0.72, cuff: true }, flutter: { name: "Flutter sleeve", len: 0.3, hemWidth: 2.6 }
};
export const SKIRTS = {
  straight: { name: "Straight / pencil", flare: 0.06 }, "a-line": { name: "A-line", flare: 0.32 },
  full: { name: "Full, gathered at waist", flare: 0.95, gathers: true }, gore: { name: "Four gore", flare: 0.55, gores: 4 },
  mermaid: { name: "Fit to knee, flared below", flare: 0.9, fitTo: 0.45 }
};
export const LENGTHS = { mini: 0.36, knee: 0.5, midi: 0.66, maxi: 0.82, floor: 0.93 };
export const CLOSURES = {
  "pull-on": { name: "Pull on, no opening", backOnFold: true },
  "back-zip": { name: "Centre back zip", backOnFold: false },
  "back-buttons": { name: "Centre back buttons", backOnFold: false },
  "front-buttons": { name: "Front button placket", backOnFold: true },
  "side-zip": { name: "Hidden zip in side seam", backOnFold: true },
  "wrap-tie": { name: "Wrap with tie", backOnFold: true }
};
export const HEM_FINISH = { plain: "Turn up and stitch", rolled: "Rolled hem", binding: "Bias binding", faced: "Hem facing" };

// ---------- curve helpers ----------
function ellipseQuarter(a, b) { return (Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))) / 4); }
// Cap height whose two quarter ellipses over a half-width W give half the wanted cap length.
function capHeightFor(W, wantHalfLen) {
  let lo = 0.02 * W, hi = 1.6 * W;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (ellipseQuarter(W, mid) < wantHalfLen) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const polyLen = (pts) => pts.reduce((t, p, i) => (i ? t + dist(pts[i - 1], p) : 0), 0);
function bez(p0, c, p1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); }
  return out;
}
const dedupe = (pts) => pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 0.6);
// Open Catmull-Rom curve through the given points, sampled densely enough for a true length.
function through(pts, per = 10) {
  if (pts.length < 3) return pts.slice();
  const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  out.push(P[P.length - 2]);
  return out;
}

function neckCurve(style, halfW, drop) {
  if (style.name === "V neck") return [[0, drop], [halfW, 0]];
  if (style.name === "Square neck") return [[0, drop], [halfW * 0.94, drop], [halfW, 0]];
  if (style.name === "Sweetheart") return dedupe([[0, drop * 0.5], ...bez([0, drop * 0.5], [halfW * 0.32, drop * 1.15], [halfW * 0.58, drop * 0.55]), ...bez([halfW * 0.58, drop * 0.55], [halfW * 0.86, drop * 0.1], [halfW, 0])]);
  if (style.name === "Boat neck") return bez([0, drop], [halfW * 0.55, drop * 0.22], [halfW, 0]);
  if (style.name === "Deep scoop") return bez([0, drop], [halfW * 0.5, drop * 1.18], [halfW, 0]);
  return bez([0, drop], [halfW * 0.52, drop * 0.94], [halfW, 0]);
}

function makePiece(o) {
  const pts = [];
  o.edges.forEach((e) => e.pts.forEach((p, i) => { if (!(i === 0 && pts.length && dist(pts[pts.length - 1], p) < 0.8)) pts.push(p); }));
  if (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 0.8) pts.pop();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return {
    role: o.role, label: o.label, cut: o.cut, fold: !!o.fold, fabric: o.fabric || "shell", edges: o.edges, points: pts,
    levels: o.levels || [], wrap: o.wrap || { band: "none" }, sa: o.sa || {}, size: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
    markings: { darts: o.darts || [], notches: o.notches || [], fold: !!o.fold, grain: o.grain ? { a: [o.grain[0], o.grain[1]], b: [o.grain[0], o.grain[2]] } : null, text: o.text || [] }
  };
}

export function makePattern(spec, m) {
  const sil = SILHOUETTES[spec.silhouette] || SILHOUETTES["a-line"];
  const neckStyle = NECKS[spec.neck] || NECKS.round;
  const slv = SLEEVES[spec.sleeve || "none"] || SLEEVES.none;
  const skirtKind = SKIRTS[spec.skirt || sil.skirt] || SKIRTS["a-line"];
  const closure = CLOSURES[spec.closure] || CLOSURES["pull-on"];
  const E = spec.ease ?? 6;
  const chest = m.chest + E, waist = m.waist + E, hip = m.hip + E + (sil.waistSeam ? 4 : 0);
  const Ht = mm(m.height);

  // Scye depth from the shoulder line, then the armhole as a sampled curve so its measured length is real.
  const scyeY = mm(chest / 6 + 5.2);
  const shoulderDrop = mm(4.2);
  const waistY = clamp(mm(m.height * (0.225 + (sil.waistRise || 0))), scyeY + 60, Ht * 0.29);
  const hipY = waistY + mm(m.height * 0.09);
  const fullHemY = clamp((spec.length || 0.6) * Ht, hipY + 130, Ht * 0.74);
  const bustX = mm(chest / 4), waistX = mm(waist / 4), hipX = mm(hip / 4);
  const neckHalfW = clamp(mm(m.neck / 8 + 1 + neckStyle.width), bustX * 0.16, bustX * 0.55);
  const neckDropF = mm(m.neck / 8 + 1.2 + neckStyle.drop), neckDropB = mm(1.6 + neckStyle.backDrop * 2);
  const shoulderX = bustX - mm(3.2 + E * 0.05);
  const dartTake = sil.darts ? 22 : 0;
  const sa = { neck: 10, shoulder: 15, side: 15, armhole: 12, centre: 15, hem: spec.hemAllow || 40, cap: 12 };
  const onePiece = !sil.waistSeam;
  const hemFlare = (skirtKind.flare ?? sil.flare) * (spec.flareScale ?? 1);
  const hemX = onePiece ? Math.max(bustX, Math.max(waistX, hipX) * (1 + hemFlare * 1.3)) : waistX + dartTake / 2;
  const bottomX = hemX;

  const frontNeck = neckCurve(neckStyle, neckHalfW, neckDropF);
  const frontArm = through([[shoulderX, shoulderDrop], [shoulderX - mm(0.7), scyeY * 0.4], [bustX - mm(5), scyeY - mm(17)], [bustX, scyeY]]);
  const backNeck = dedupe([[0, neckDropB], ...bez([0, neckDropB], [neckHalfW * 0.72, neckDropB * 0.12], [neckHalfW, 0], 12)]);
  const backArm = through([[shoulderX, shoulderDrop], [shoulderX - mm(1.6), scyeY * 0.38], [bustX - mm(3.4), scyeY - mm(13)], [bustX, scyeY + mm(1)]]);
  const pieces = [];

  const sideOf = (role, start, waistOffset, extra) => {
    const out = [[bustX + extra, start]];
    if (!onePiece) { out.push([waistX + waistOffset, waistY]); return out; }
    out.push([waistX + waistOffset, waistY]);
    if (skirtKind.fitTo) { const kneeY = waistY + (fullHemY - waistY) * skirtKind.fitTo; out.push([Math.max(hipX, waistX) * 1.03 + extra, kneeY], [hemX + extra, fullHemY]); return out; }
    out.push([Math.max(hipX, waistX * 1.04) + extra, hipY]);
    out.push([hemX + extra, fullHemY]);
    return out;
  };
  const hemOf = (wid) => (onePiece ? [[wid, fullHemY], [wid * 0.5, fullHemY + (hemFlare > 0.45 ? wid * 0.05 : 0)], [0, fullHemY + (hemFlare > 0.45 ? wid * 0.08 : 0)]] : [[wid, waistY], [0, waistY]]);
  const levelsOf = (bottom) => dedupe([{ pY: 0, bY: "neckTop" }, { pY: scyeY, bY: "chestY" }, { pY: onePiece || bottom > waistY + 5 ? waistY : bottom, bY: "waistY" }, { pY: hipY, bY: "hipY" }, { pY: bottom, bY: "hemY" }])
    .filter((l) => l.pY <= bottom + 0.1 && (l.bY !== "hemY" || true));

  const frontFold = spec.closure !== "front-buttons" && spec.closure !== "wrap-tie";
  pieces.push(makePiece({
    role: "front", label: onePiece ? "FRONT (whole dress)" : "FRONT bodice", cut: frontFold ? 1 : 2, fold: frontFold,
    edges: [
      { name: "neck", pts: frontNeck, sa: sa.neck },
      { name: "shoulder", pts: [frontNeck[frontNeck.length - 1], [shoulderX, shoulderDrop]], sa: sa.shoulder },
      { name: "armhole", pts: frontArm, sa: sa.armhole },
      { name: "side", pts: sideOf("front", scyeY, dartTake / 2 + 6, 0).slice(1), sa: sa.side },
      { name: "hem", pts: hemOf(bottomX), sa: onePiece ? sa.hem : sa.centre },
      { name: "centre", pts: [[0, onePiece ? fullHemY : waistY], [0, neckDropF]], sa: spec.closure === "front-buttons" ? sa.centre : 0 }
    ],
    levels: levelsOf(onePiece ? fullHemY : waistY), sa,
    wrap: { band: "torso", sector: 0, slots: 1, mirror: true, pinTo: scyeY * 0.6, ringFraction: 0.5, halfWidth: Math.max(bustX, bottomX), topY: 0, bottomY: onePiece ? fullHemY : waistY, neckDrop: neckDropF },
    darts: sil.darts ? [{ apex: [(waistX + 8) * 0.52, waistY - mm(2.2)], legs: [[(waistX + 8) * 0.52 - dartTake / 2, waistY + 25], [(waistX + 8) * 0.52 + dartTake / 2, waistY + 25]], intake: dartTake }] : [],
    notches: [{ p: frontArm[Math.floor(frontArm.length / 2)], t: "front balance" }, { p: [waistX + dartTake / 2 + 6, waistY], t: "waist" }],
    grain: [0, onePiece ? fullHemY * 0.12 : 10, onePiece ? fullHemY * 0.9 : waistY - 10]
  }));

  pieces.push(makePiece({
    role: "back", label: onePiece ? "BACK (whole dress)" : "BACK bodice", cut: closure.backOnFold ? 1 : 2, fold: closure.backOnFold,
    edges: [
      { name: "neck", pts: backNeck, sa: sa.neck },
      { name: "shoulder", pts: [backNeck[backNeck.length - 1], [shoulderX, shoulderDrop]], sa: sa.shoulder },
      { name: "armhole", pts: backArm, sa: sa.armhole },
      { name: "side", pts: sideOf("back", scyeY + mm(0.9), dartTake / 2 + 10, 4).slice(1), sa: sa.side },
      { name: "hem", pts: hemOf(bottomX + 4), sa: onePiece ? sa.hem : sa.centre },
      { name: "centre", pts: [[0, onePiece ? fullHemY : waistY], [0, neckDropB]], sa: spec.closure === "pull-on" || spec.closure === "front-buttons" ? 0 : sa.centre }
    ],
    levels: levelsOf(onePiece ? fullHemY : waistY), sa,
    wrap: { band: "torso", sector: Math.PI, slots: 1, mirror: true, pinTo: scyeY * 0.6, ringFraction: 0.5, halfWidth: Math.max(bustX, bottomX + 4), topY: 0, bottomY: onePiece ? fullHemY : waistY, neckDrop: neckDropB },
    darts: sil.darts ? [{ apex: [(waistX + 12) * 0.5, waistY + mm(3)], legs: [[(waistX + 12) * 0.5 - dartTake / 2 - 2, waistY - 20], [(waistX + 12) * 0.5 + dartTake / 2 + 2, waistY - 20]], intake: dartTake + 4 }] : [],
    notches: [{ p: backArm[Math.floor(backArm.length / 2)], t: "back balance" }, { p: [waistX + dartTake / 2 + 10, waistY], t: "waist" }],
    grain: [0, onePiece ? fullHemY * 0.12 : 10, onePiece ? fullHemY * 0.9 : waistY - 10],
    text: spec.closure === "back-zip" ? [{ p: [4, neckDropB + 20], t: "centre back zip to " + Math.round((onePiece ? fullHemY * 0.45 : waistY + scyeY * 0.4)) + " mm down" }] : []
  }));

  if (!onePiece) pieces.push(...skirtPieces(spec, skirtKind, waist, hip, waistY, fullHemY, hemFlare, sa, dartTake));
  if (slv.len > 0) { const armholeLen = polyLen(pieces[0].edges[2].pts) + polyLen(pieces[1].edges[2].pts); pieces.push(sleevePiece(slv, armholeLen, m, sa, spec.capEase ?? 28)); }
  pieces.push(...smallParts(spec, { neckStyle, slv, closure, frontNeck, backNeck, frontArm, backArm, waist, hip, waistY, fullHemY, sa, m, sil, onePiece }));

  const armLen = polyLen(pieces[0].edges[2].pts) + polyLen(pieces[1].edges[2].pts);
  const fit = { chest, waist, hip, scyeY, waistY, hipY, fullHemY, hemX, neckHalfW, neckDropF, neckDropB, shoulderDrop, sleeveless: slv.len === 0, onePiece, armLen, closureName: closure.name, sleeveName: slv.name, skirtName: skirtKind.name, length: spec.length || 0.6 };
  const seams = seamPlan(pieces, spec, sa, fit);
  return { pieces, doc: toDoc(pieces, spec.seam ?? 15), seam: spec.seam ?? 15, sa, seams, fit };
}

// Which edge joins which, in the order a machinist would sew. Every entry names piece indexes and edge names
// so the cutting sheet, the 3D seams and the instructions cannot disagree.
function seamPlan(pieces, spec, sa, fit) {
  const i = (p) => pieces.indexOf(p);
  const pick = (band, test) => pieces.find((p) => p.wrap.band === band && test(p));
  const torsoF = pick("torso", (p) => p.role === "front"), torsoB = pick("torso", (p) => p.role === "back");
  const skirtP = pieces.filter((p) => p.wrap.band === "skirt");
  const slv = pick("sleeve", () => true);
  const neckBand = pieces.find((p) => p.role === "neckband"), facing = pieces.find((p) => p.role === "facing");
  const binding = pieces.find((p) => p.role === "binding"), waistband = pieces.find((p) => p.role === "waistband"), cuffband = pieces.find((p) => p.role === "cuffband");
  const closure = CLOSURES[spec.closure] || CLOSURES["pull-on"];
  const has = (p, name) => !!p && p.edges.some((e) => e.name === name);
  const joins = [], steps = [];
  const add = (title, detail, list) => { steps.push({ n: steps.length + 1, title, detail }); joins.push(...(list || [])); };
  const seam = (a, ea, b, eb, saName, note) => (a && b && has(a, ea) && has(b, eb) ? [{ a: i(a), ea, b: i(b), eb, sa: sa[saName], note }] : []);

  const darted = pieces.filter((p) => (p.markings.darts || []).length);
  add("Preparation", "Prewash and press the fabric so any shrinkage happens before cutting. Lay it up with the selvedges parallel, pin each piece with its grainline along the length of the cloth, then cut. Transfer every notch, dart point and balance mark with a tailors' tack or a tracing wheel before the pattern comes off.", null);
  if (darted.length) add("Darts", "Mark both legs and the point, fold along the centre line with right sides together and stitch from the point out to the cut edge - do not back-tack, leave 4 cm of thread and tie it off. Press the darts towards the centre of the body.", []);
  add("Shoulders", "Pin the FRONT shoulder edge to the BACK shoulder edge, right sides together, matching the notch. Stitch a " + sa.shoulder + " mm seam, press open and finish the edges together.",
    seam(torsoF, "shoulder", torsoB, "shoulder", "shoulder"));
  const neckTrim = neckBand || facing;
  if (neckTrim) add(neckBand ? "Neck band" : "Neck facing", neckBand
    ? "Join the two band pieces at their short ends, press the seam open and fold the band in half lengthways, wrong sides together. Stitch the band to the neck edge with " + sa.neck + " mm allowance, turn it inside out and press, then topstitch 6 mm from the fold."
    : "Join the facing pieces at the shoulders. Put the facing to the neck edge right sides together, stitch " + sa.neck + " mm, clip the curves, turn it to the wrong side and press. Slip-stitch the other edge down or topstitch 5 mm.",
    seam(torsoF, "neck", neckTrim, "a", "neck").concat(seam(torsoB, "neck", neckTrim, "a", "neck")));
  if (slv) add("Sleeve", "Close the sleeve underarm seam first and press it open. Ease the cap into the armhole - the cap curve is longer than the armhole, so run two rows of gathering thread between the notches and pinch the fullness evenly. Pin the cap peak to the shoulder seam and the notches to the front and back balance marks, then stitch " + sa.cap + " mm round starting and finishing at the underarm. Finish the armhole edges together.",
    [{ a: i(slv), ea: "side", b: i(slv), eb: "centre", sa: sa.side, self: true }].concat(seam(torsoF, "armhole", slv, "cap", "cap"), seam(torsoB, "armhole", slv, "cap", "cap")));
  else if (binding) add("Armholes", "Bind each armhole with the self bias strip: stitch right sides together all round, roll the binding to the wrong side, press and slip-stitch it down.",
    seam(torsoF, "armhole", binding, "a", "armhole").concat(seam(torsoB, "armhole", binding, "a", "armhole")));
  if (cuffband) add("Cuffs", "Join each cuff band at the short end, fold it in half, right sides together, and stitch it to the sleeve end. Turn, press and topstitch, leaving the opening for the hand." + (spec.cuff ? " Stitch the button on the cuff." : ""));
  const sideList = seam(torsoF, "side", torsoB, "side", "side");
  if (skirtP.length === 2) sideList.push(...seam(skirtP[0], "side", skirtP[1], "side", "side"));
  else skirtP.forEach((g, gi) => { sideList.push(...seam(g, "side", skirtP[gi + 1], "side", "side")); if (g.fold) sideList.push(...seam(g, "centre", skirtP[gi + 1], "side", "side")); });
  const centre = !closure.backOnFold ? seam(torsoB, "centre", torsoB, "centre", "centre", closure.name === "Centre back buttons" ? "leave the top open for buttons" : "leave the zip opening") : [];
  add("Side seams", "Join the front to the back at the side seams" + (skirtP.length ? " and run the skirt panel seams" : "") + ", right sides together, matching the waist and hip notches. Stitch " + sa.side + " mm, press open and finish the edges together. With sleeves, continue the seam down the sleeve underarm in one run.", sideList.concat(centre));
  if (closure.name === "Centre back zip" || closure.name === "Hidden zip in side seam") add("Zip", "Fit a " + Math.round(clamp(fit.waistY * 0.55, 180, 400)) + " mm zip: interline the opening, stay-stitch 2 mm inside the seam line, press the allowances to one side and stitch the tape down with a concealed-zip foot.", []);
  if (closure.name === "Front button placket") add("Placket", "Join the two placket pieces to the front centre edges, fold along the pressing line, stitch the button side and work " + Math.max(3, Math.round((spec.length || 0.6) * 4)) + " buttons 1 cm from the edge.", []);
  if (closure.name === "Wrap with tie") add("Wrap edges", "Face both wrap edges, cross the right panel over at the waist and stitch the waist tie to the left side seam, then to the right side at the back.", []);
  if (skirtP.length) {
    const gathered = skirtP.some((p) => p.wrap.gathers);
    add(waistband ? "Waistband" : gathered ? "Gather and join the skirt" : "Join the skirt to the bodice", waistband
      ? "Join the skirt to the bodice at the waist as above, then set the waistband: fold it in half lengthways, wrong sides together, press. Stitch one long edge to the waist, right sides together, ease the fullness evenly and end " + sa.centre + " mm past the zip or opening. Turn it up, fold in the raw edge and stitch the fold down from the right side."
      : gathered
      ? "Machine-gather the skirt waist between the notches to match the bodice waist, distribute the fullness evenly and pin at the side seams and centres. Stitch with " + sa.centre + " mm, finish the edges together and press up."
      : "With right sides together, stitch the skirt to the bodice at the waist, matching the side seams and centre marks. " + sa.centre + " mm seam, finish together and press towards the skirt.",
      (torsoF ? skirtP.map((p) => ({ a: i(torsoF), ea: "hem", b: i(p), eb: "waist", sa: sa.centre })) : []).concat(waistband && torsoF ? [{ a: i(waistband), ea: "a", b: i(torsoF), eb: "hem", sa: sa.centre }] : []));
  }
  const hemHow = { rolled: "Fold the raw edge back twice, 5 mm each, and stitch a narrow rolled hem close to the fold. Finish the curved hem on an overlocker or with a hem foot for an even line.",
    binding: "Enclose the raw edge with bias binding cut 25 mm wide, stitch from the right side with an even gap, and let the binding ease the curve flat.",
    faced: "Join the hem facing to the hem edge with " + sa.hem + " mm, turn it up inside, stitch the fold down by hand so nothing shows on the right side, then even the length." }[spec.hemFinish];
  add("Hem", "Try the length on the wearer, even the hem and press up " + sa.hem + " mm. " + (hemHow || "Stitch by hand (blind stitch) or with a narrow machine hem, keeping the stitch line just above the fold.") + " Press again with a ham so the hem lies flat all round.", []);
  add("Finish", "Remove tacks, press the whole garment inside-out then right side, close the remaining openings by hand and press the seams one last time.", []);
  return { steps, joins: joins.filter(Boolean), order: steps.map((s) => s.n) };
}

function skirtPieces(spec, skirtKind, waistCm, hipCm, waistY, hemY, flare, sa, dartTake) {
  const len = hemY - waistY;
  if (skirtKind.gores) {
    // Four gores, each drafted as a half gore on the fold: the front/back pair sits on the body centres
    // and the side pair on the side seams, so the waist widths add up to the waist exactly.
    const n = skirtKind.gores, gw = mm(waistCm) / n, gh = Math.max(mm(hipCm) / n * (1 + flare * 0.5), gw * 2.2);
    const groups = [{ role: "front", label: "FRONT/BACK gore", cut: 2, sector: 0 },
      { role: "side", label: "SIDE gore", cut: 2, sector: Math.PI / 2 }];
    const out = [];
    groups.forEach((g) => {
      const top = gw / 2, bot = gh / 2, count = g.cut;
      out.push(makePiece({
        role: g.role, label: g.label + " (x" + count + ")", cut: count, fold: true,
        edges: [{ name: "waist", pts: [[0, waistY], [top, waistY]], sa: sa.centre },
          { name: "side", pts: [[top, waistY], [top * 0.7 + bot * 0.3, waistY + len * 0.55], [bot, hemY]], sa: sa.side },
          { name: "hem", pts: [[bot, hemY], [0, hemY + bot * 0.04]], sa: sa.hem },
          { name: "centre", pts: [[0, hemY + bot * 0.04], [0, waistY]], sa: 0 }],
        levels: [{ pY: waistY, bY: "waistY" }, { pY: waistY + len * 0.55, bY: "hipY" }, { pY: hemY, bY: "hemY" }], sa,
        wrap: { band: "skirt", sector: g.sector, slots: count, mirror: true, pinTo: waistY, ringFraction: count / n, halfWidth: bot, topY: waistY, bottomY: hemY },
        grain: [top * 0.45, waistY + 15, hemY - 15], notches: [{ p: [top * 0.75, waistY + len * 0.5], t: "hip" }],
        text: [{ p: [4, waistY + len * 0.45], t: "cut 2, both on the fold" }]
      }));
    });
    return out;
  }
  const wTop = mm(waistCm) / 4 + dartTake / 2;
  const wBot = skirtKind.gathers ? wTop * 2.1 : Math.max(mm(hipCm) / 4 * (1 + flare * 0.75), wTop * 1.3);
  const mk = (role, label, cut, fold, widen, sector) => {
    const top = wTop * widen, bot = wBot * widen;
    const side = skirtKind.fitTo
      ? [[top, waistY], [Math.max(bot * 0.55, top * 1.02), waistY + len * skirtKind.fitTo], [bot, hemY]]
      : [[top, waistY], [top * 0.45 + bot * 0.55, waistY + len * 0.45], [bot, hemY]];
    return makePiece({
      role, label, cut, fold,
      edges: [{ name: "waist", pts: [[0, waistY], [top, waistY]], sa: sa.centre }, { name: "side", pts: side, sa: sa.side },
        { name: "hem", pts: [[bot, hemY], [0, hemY + (flare > 0.4 ? bot * 0.045 : 0)]], sa: sa.hem },
        { name: "centre", pts: [[0, hemY + (flare > 0.4 ? bot * 0.045 : 0)], [0, waistY]], sa: 0 }],
      levels: [{ pY: waistY, bY: "waistY" }, { pY: waistY + len * 0.45, bY: "hipY" }, { pY: hemY, bY: "hemY" }], sa,
      wrap: { band: "skirt", sector, slots: 1, mirror: true, pinTo: waistY, ringFraction: 0.5, halfWidth: bot, topY: waistY, bottomY: hemY, gathers: !!skirtKind.gathers },
      grain: [top * 0.5, waistY + 15, hemY - 15], notches: [{ p: [top, waistY + 45], t: "side" }],
      text: skirtKind.gathers ? [{ p: [top * 0.3, waistY + 30], t: "gather top edge to waist size " + Math.round(top * 2 / 10) + " cm" }] : []
    });
  };
  return [mk("front", "FRONT skirt", 1, true, 1, 0), mk("back", "BACK skirt", 2, false, 1.04, Math.PI)];
}

function sleevePiece(slv, armLen, m, sa, easeCap = 28) {
  // Bicep half width from the arm measure, then the cap height is solved so the measured cap length
  // equals the armhole length plus easing - which is what makes a set-in sleeve sit on the shoulder.
  const bicep = mm(m.chest / 4 + 9) * (slv.gather || 1);
  let W = clamp(bicep / 2, armLen * 0.2, armLen * 0.34);
  const want = armLen + easeCap * (slv.gather || 1); // whole cap length, armhole plus easing
  // The cap is two quarter ellipses over the bicep half width, so its measured length matches the solver.
  const build = (w, h, n = 13) => {
    const left = [], right = [];
    for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI / 2; left.push([-w * Math.cos(t), h - h * Math.sin(t)]); right.unshift([w * Math.cos(t), h - h * Math.sin(t)]); }
    return left.concat(right.slice(1));
  };
  let h = capHeightFor(W, want / 2);
  // A narrow bicep needs an implausibly tall cap; widen it instead until the height is sane.
  for (let i = 0; i < 24 && h > W * 1.1; i++) { W = Math.min(W * 1.03, bicep * 0.7); h = capHeightFor(W, want / 2); }
  // The sampled polyline sits just under the true arc, so nudge the height onto it.
  for (let i = 0; i < 24; i++) { const len = polyLen(build(W, h)); if (Math.abs(len - want) < 1.5) break; h *= want / len; }
  const cap = build(W, h), capLen = polyLen(cap);
  const L = Math.max(40, mm(m.arm) * slv.len);
  const wrist = mm(m.chest * 0.082 + 1.2);
  const cuffW = slv.hemWidth ? wrist * slv.hemWidth : Math.max(wrist * 1.08, W * 0.62);
  const ox = Math.max(W, cuffW); // place the piece inside x >= 0; the outline is symmetric about x = 0 before this
  const edges = [
    { name: "cap", pts: cap, sa: sa.cap }, { name: "side", pts: [[W, h], [cuffW, h + L]], sa: sa.side },
    { name: "hem", pts: [[cuffW, h + L], [-cuffW, h + L]], sa: slv.cuff ? 15 : 25 }, { name: "centre", pts: [[-cuffW, h + L], [-W, h]], sa: sa.side }
  ].map((e) => ({ ...e, pts: e.pts.map((p) => [p[0] + ox, p[1]]) }));
  return makePiece({
    role: "sleeve", label: "SLEEVE (x2)", cut: 2, fold: false, edges, sa: { ...sa, hem: slv.cuff ? 15 : 25 },
    levels: [{ pY: 0, bY: "shoulderY" }, { pY: h + L, bY: "wristY" }],
    wrap: { band: "sleeve", sleeveKey: Object.keys(SLEEVES).find((k) => SLEEVES[k] === slv), capH: h, len: L, topR: W, hemR: cuffW, gather: slv.gather || 1, topY: 0, bottomY: h + L, halfWidth: W },
    notches: [{ p: [ox + W - W * 0.45, h * 0.4], t: "front notch" }, { p: [ox + W + W * 0.45, h * 0.4], t: "back notch" }, { p: [ox + W, 0], t: "cap peak" }],
    grain: [ox + W, h + 10, h + L - 10],
    text: [{ p: [ox - W + 6, h * 0.85], t: "cap " + Math.round(capLen) + " mm vs armhole " + Math.round(armLen) + " mm" }]
  });
}

function smallParts(spec, c) {
  const { neckStyle, slv, closure, frontNeck, backNeck, frontArm, waist, hip, waistY, fullHemY, sa, m, sil } = c, out = [];
  const neckLen = polyLen(frontNeck) + polyLen(backNeck);
  const strip = (label, role, w, h, cut, fold, note) => makePiece({
    role, label, cut, fold, fabric: "trim",
    edges: [{ name: "a", pts: [[0, 0], [w, 0]], sa: 0 }, { name: "b", pts: [[w, 0], [w, h]], sa: 0 }, { name: "c", pts: [[w, h], [0, h]], sa: 0 }, { name: "d", pts: [[0, h], [0, 0]], sa: 0 }],
    sa: { ...sa, hem: 0, side: 10 }, text: [{ p: [4, h * 0.55], t: note }]
  });
  if (neckStyle.collar === "mock") out.push(strip("NECK BAND (x2)", "neckband", R1(neckLen * 0.52), 62, 2, false, "interfaced, cut 2"));
  else out.push(strip("NECK FACING (x2)", "facing", R1(neckLen * 0.52), 62, 2, false, "front and back as one, cut 2"));
  if (slv.len === 0) out.push(strip("ARMHOLE BINDING (x2)", "binding", R1(polyLen(frontArm) + 40), 32, 2, false, "self bias strip 3 cm wide"));
  if (slv.cuff || spec.cuff) { const cw = R1(Math.PI * (m.chest * 0.082 + 1.2) * 1.1); out.push(strip("CUFF BAND (x2)", "cuffband", cw, 70, 2, false, "interfaced, open " + Math.round(cw / 10) + " cm")); }
  if (sil.waistSeam || spec.waistBand) { const wb = R1(mm(waist) * 0.5 + 60); out.push(strip("WAISTBAND (x1 on fold)", "waistband", wb, 80, 1, true, "cut on the cross for a flat band")); }
  if (closure.name === "Front button placket") out.push(strip("FRONT PLACKET (x2)", "placket", 55, R1(fullHemY * 0.5), 2, false, "one button side, one hole side"));
  if (closure.name === "Wrap with tie") out.push(strip("WAIST TIE (x1)", "tie", 65, 1500, 1, false, "cut on the bias, 150 cm long"));
  if (spec.pockets) out.push(strip("POCKET (x2 on fold)", "pocket", R1(Math.max(160, mm(hip) * 0.18)), 220, 2, true, "side-seam pocket bag"));
  return out;
}

export function toDoc(pieces, seam) {
  const shapes = []; let x = 0, id = 1;
  pieces.forEach((p) => {
    const minX = Math.min(...p.points.map((q) => q[0]));
    const off = (q) => [R1(q[0] - minX + x), R1(q[1])];
    const mk = p.markings || {};
    const ys = p.points.map((q) => q[1]);
    const ce = p.edges.find((e) => e.name === "centre");
    const foldX = p.fold && ce ? (ce.pts[0][0] + ce.pts[ce.pts.length - 1][0]) / 2 : null;
    shapes.push({
      id: id++, type: "poly", pts: p.points.map(off), smooth: true, corners: [], seam: true, label: p.label, role: p.role, blk: true,
      mark: {
        fold: foldX === null ? null : { a: off([foldX, Math.min(...ys)]), b: off([foldX, Math.max(...ys)]) }, cut: p.cut, fabric: p.fabric,
        darts: (mk.darts || []).map((d) => ({ apex: off(d.apex), legs: d.legs.map(off), intake: d.intake })),
        notches: (mk.notches || []).map((n) => ({ p: off(n.p), t: n.t })),
        grain: mk.grain ? { a: off(mk.grain.a), b: off(mk.grain.b) } : null,
        text: (mk.text || []).map((t) => ({ p: off(t.p), t: t.t })),
        sa: p.sa, edges: p.edges.map((e) => ({ name: e.name, pts: e.pts.map(off), sa: e.sa }))
      },
      pieceMeta: { role: p.role, cut: p.cut, fold: !!p.fold, fabric: p.fabric, sa: p.sa, wrap: p.wrap, levels: p.levels, size: p.size }
    });
    x += p.size[0] + 70;
  });
  return { v: 2, seam, shapes, images: {} };
}
