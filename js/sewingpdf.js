// The sewing guide: a printable, cut-at-home paper pattern PDF built from the same numbers that sew the 3D dress.
// jsPDF comes from a CDN when the button is pressed; if that fails, printSewingSheet() opens the same content
// in a print window so the user can still choose "Save as PDF".
import { polyOf, seamOf, toSvg } from "./patternout.js";
import { bbox } from "./geometry.js";
import { sizeChart, SILHOUETTES, SKIRTS, CLOSURES, HEM_FINISH } from "./patterngen.js";

const PW = 210, PH = 297, MG = 14, CW = PW - 2 * MG, BOT = PH - 16;
const SRC = ["https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm", "https://unpkg.com/jspdf@2.5.2/+esm"];
const INK = [26, 30, 36], DIM = [112, 120, 130], ACC = [179, 38, 30], GOLD = [138, 101, 0], PAPER = [246, 243, 236];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cm = (v) => Math.round(v * 10) / 10;

async function loadJsPdf() {
  let last;
  for (const u of SRC) { try { const m = await import(/* webpackIgnore: true */ u); if (m && m.jsPDF) return m.jsPDF; } catch (e) { last = e; } }
  throw last || new Error("jsPDF could not be downloaded");
}

// ---------- sewing knowledge that comes out of the fabric card ----------
export function sewingSettings(f) {
  const gsm = f.gsm || 150, stretch = f.stretch || 0, knitted = stretch >= 20 || /jersey|knit|rib|pointe/i.test(f.texture || "");
  return {
    needle: knitted ? (gsm > 250 ? "90/14 ballpoint" : "80/14 ballpoint") : gsm < 90 ? "70/10 microtex" : gsm < 220 ? "80/12 universal" : gsm < 340 ? "90/14 universal" : "100/16 jeans",
    stitch: knitted ? "3 mm zig-zag or a lightning/stretch stitch, with a stretch plate on the shoulder seams" : gsm < 90 ? "2 mm straight, shorter still on sheer cloth" : "2.5–3 mm straight",
    tension: knitted ? "3–4, with the upper tension lowered until the seam lies flat and does not ripple" : gsm > 300 ? "4–5, tested on two layers of the offcut" : "3–4, tested on the offcut first",
    foot: knitted ? "walking foot or roller foot, stretch plate to stop the fabric tunnelling" : gsm < 90 ? "straight-stitch plate so the cloth is not pushed into the feed" : "standard zig-zag plate, quarter-inch guide for the seams",
    thread: knitted ? "polycore-spun or textured machine thread; wooly nylon in the looper" : "100% polyester all-purpose, 40 wt for medium cloth",
    seamFinish: gsm < 110 ? "French seam, or overlock the two edges together and press towards the back" : gsm > 300 ? "overlock, or pink and curve the edges, and press the seams open" : "overlock or zig-zag the two edges together, then press towards the centre back",
    press: "Press every seam as it is stitched, then press it open over a tailor's ham so the curve keeps its shape. " + (f.texture === "satin" || f.texture === "velvet" ? "Very low heat and a press cloth; never rest the iron on the face of the fabric." : gsm > 300 || f.texture === "denim" ? "Hot iron with steam, and a press cloth on the face." : "Medium heat with steam for the curved seams."),
    wash: f.care || "Wash cold on gentle, dry flat, iron on the reverse side.",
    interlining: knitted ? "Stretch lightweight fusible, or knit interfacing tape, on the shoulder seams, neck band and any button band" : "Fusible lightweight woven interlining on the neck facing, plackets, cuffs and waistband"
  };
}
export function notionsFor(ctx) {
  const { spec, pattern, fabric } = ctx, fit = pattern.fit, cl = CLOSURES[spec.closure] || { name: "" }, out = [];
  const zipLen = Math.round(Math.min(400, Math.max(180, fit.waistY * 0.55)));
  if (/zip/i.test(cl.name)) out.push({ n: cl.name, q: "1 × " + zipLen + " mm (" + (zipLen / 10).toFixed(0) + " cm) tape, teeth to match the cloth", d: "Measure the tape, not the pull, against the opening before you pin it." });
  if (/button/i.test(cl.name)) { const n = Math.max(3, Math.round((spec.length || 0.6) * 4)); out.push({ n: n + " buttons", q: "15 mm, spaced " + Math.round((fit.waistY - fit.neckDropF - 60) / Math.max(1, n - 1)) + " mm", d: "Mark by laying the fronts or the centre line together and pricking through." }); }
  if (spec.cuff) out.push({ n: "Cuff buttons", q: "2 × 10 mm, plus 2 buttonhole ends or a hooked fastening", d: "Place them with the arm seam so the cuff closes towards the body." });
  if (spec.closure === "wrap-tie") out.push({ n: "Waist tie", q: "1 × 1.3 m self-fabric strip, 70 mm wide", d: "Cut it on the cross so the knot lies flat and drapes." });
  out.push({ n: "Interfacing", q: sewingSettings(fabric).interlining, d: "Fuse a 50 mm test square on an offcut first — check it does not shadow the face." });
  const seamMm = pattern.pieces.reduce((t, p) => t + p.points.reduce((s, q, i) => s + Math.hypot(q[0] - p.points[(i + 1) % p.points.length][0], q[1] - p.points[(i + 1) % p.points.length][1]), 0) * p.cut, 0);
  out.push({ n: "Thread", q: "About " + (seamMm * 3.5 / 1000).toFixed(0) + " m, matching the fabric", d: "Machine sewing, overlocking the seams and hand tacking together — buy one spare cone." });
  if (/zip|button/i.test(cl.name)) out.push({ n: "Hook and eye", q: "1 pair at the top of the opening", d: "Sew it on the waist seam line, not the waist edge, so it is hidden." });
  if (/(gather|full)/i.test((SKIRTS[spec.skirt] || {}).name || "")) out.push({ n: "Elastic (only if you change to a casing)", q: "Waist circumference minus 50 mm, 20 mm wide", d: "The drafted finish is a band or gathers; a casing is the easy swap." });
  out.push({ n: "Stay tape or two offcut strips", q: "2 × 60 mm for the shoulder seams", d: "Jersey shoulders stretch out of shape without them." });
  out.push({ n: "Labels", q: "Care label + your own size label", d: "Set into the left side seam 150 mm below the waist." });
  return out;
}
export function fabricUsage(pieces, widthCm) {
  const W = widthCm * 10, sa = 30, list = [];
  pieces.forEach((p) => { for (let i = 0; i < p.cut; i++) list.push({ w: p.size[0] + sa * 2, h: p.size[1] + sa * 2 }); });
  list.sort((a, b) => b.h - a.h);
  let len = 0, rowW = 0, rowH = 0;
  list.forEach((p) => { if (rowW + p.w > W && rowW > 0) { len += rowH; rowW = 0; rowH = 0; } rowW += p.w; rowH = Math.max(rowH, p.h); });
  len += rowH;
  return { metres: cm(len / 1000), widthCm, cloth: cm(list.reduce((t, p) => t + p.w * p.h, 0) / 1e6) };
}

// ---------- PDF ----------
export async function buildSewingPdf(ctx) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: "mm", format: "a4", compress: true });
  const { pattern, meas, fabric, fmtMM, D, spec } = ctx, fit = pattern.fit, st = sewingSettings(fabric);
  const title = (ctx.name || "dress").replace(/_/g, " ");
  let y = MG;

  const page = () => { doc.addPage(); y = MG; };
  const h1 = (t) => { if (y > MG + 40) page(); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...INK); if (y + 14 > BOT) page(); doc.text(t, MG, y + 5); y += 7.5; doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.line(MG, y, PW - MG, y); y += 6; };
  const h2 = (t) => { doc.setFont("helvetica", "bold"); doc.setFontSize(11); if (y + 10 > BOT) page(); y += 3; doc.setTextColor(...INK); doc.text(t, MG, y); y += 4.5; };
  const text = (t, size, col) => { const s = size || 9.5; doc.setFont("helvetica", "normal"); doc.setFontSize(s);
    doc.splitTextToSize(String(t), CW).forEach((ln) => { if (y + s * 0.45 > BOT) page(); doc.setTextColor(...(col || INK)); doc.text(ln, MG, y); y += s * 0.45; }); y += 2.2; };
  const table = (rows, widths, size) => { const s = size || 8.8, lh = s * 0.45;
    rows.forEach((r, ri) => {
      doc.setFont(ri === 0 ? "helvetica" : "helvetica", ri === 0 ? "bold" : "normal"); doc.setFontSize(s);
      const cells = r.map((c, ci) => doc.splitTextToSize(String(c), widths[ci] - 3));
      const h = Math.max(...cells.map((c) => c.length)) * lh + 2.6;
      if (y + h > BOT) page();
      if (ri === 0) { doc.setFillColor(...INK); doc.rect(MG, y - 3.6, CW, h, "F"); doc.setTextColor(255, 255, 255); }
      else { if (ri % 2 === 0) { doc.setFillColor(244, 242, 238); doc.rect(MG, y - 3.6, CW, h, "F"); } doc.setTextColor(...INK); }
      let x = MG;
      cells.forEach((c, ci) => { doc.text(c, x + 1.6, y); x += widths[ci]; });
      y += h; doc.setDrawColor(208, 208, 212); doc.setLineWidth(0.2); doc.line(MG, y - 1.2, PW - MG, y - 1.2);
    }); y += 3; };

  // ---- 1 cover ----
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...ACC); doc.text("SEWING & CUTTING GUIDE", MG, MG + 3);
  doc.setFontSize(24); doc.setTextColor(...INK); doc.text(title, MG, MG + 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...DIM);
  doc.text(new Date().toLocaleDateString() + "   ·   size " + String(D.size).toUpperCase() + "   ·   " + ((SILHOUETTES[D.silhouette] || {}).name || "") + "   ·   " + fabric.name, MG, MG + 21);
  let shot = null, shotH = 0;
  try { const d = ctx.snapshot && ctx.snapshot(); if (d && d.length > 20000) { const p = doc.getImageProperties(d); shot = d; shotH = 78 * (p.height / p.width); } } catch (e) {}
  const infoW = shot ? CW - shotH - 8 : CW;
  doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.rect(MG, MG + 26, infoW, 56, "S");
  const facts = [["Finished bust", fit.chest.toFixed(0) + " cm"], ["Finished waist", fit.waist.toFixed(0) + " cm"],
    ["Finished hip", fit.hip.toFixed(0) + " cm"], ["Hem below shoulder", fmtMM(fit.fullHemY)],
    ["Neck drop front / back", cm(fit.neckDropF / 10) + " / " + cm(fit.neckDropB / 10) + " cm"], ["Armhole seam", fmtMM(Math.round(fit.armLen))],
    ["Seam allowance", fmtMM(D.seam)], ["Paper pieces", String(pattern.pieces.reduce((t, p) => t + p.cut, 0))]];
  doc.setFontSize(8.6);
  facts.forEach((f, i) => { const x = MG + 3 + (i % 2) * (infoW / 2), yy = MG + 34 + Math.floor(i / 2) * 6.8;
    doc.setTextColor(...DIM); doc.text(f[0], x, yy); doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.text(String(f[1]), x + 38, yy); doc.setFont("helvetica", "normal"); });
  if (shot) doc.addImage(shot, "PNG", MG + infoW + 8, MG + 26, shotH, shotH);
  y = MG + 26 + 62;
  text("Everything in this pack comes from the design you just drew: the same numbers cut the 3D dress, laid out these pieces and set the machine. The pattern pages print at 1:1 — check the 10 cm ruler before cutting, then seam allowance is already drawn on every edge. Draft this fit in calico or an old sheet first if the fabric is expensive.", 9.5);
  h2("What you need");
  table([["Item", "Quantity / spec", "Note"], ...notionsFor(ctx).map((n) => [n.n, n.q, n.d])], [44, 84, CW - 128], 8.6);
  h2("Fabric");
  const u140 = fabricUsage(pattern.pieces, 140), u115 = fabricUsage(pattern.pieces, 115);
  text(fabric.name + " · " + fabric.category + " · " + fabric.gsm + " g/m² · " + (fabric.stretch || 0) + "% stretch · drape " + fabric.drape + "/5 · " + (fabric.care || ""));
  text("Buy about " + (Math.ceil(u140.metres * 4) / 4) + " m at 140 cm wide (" + u140.cloth + " m² of cloth in the pieces). At 115 cm it is " + (Math.ceil(u115.metres * 4) / 4) + " m. Add 10% for one-way prints, nap and pattern matching, and 30 cm for facings if you want them self-made.");

  // ---- 2 measurements ----
  page(); h1("Measurements and ease");
  const slv = pattern.pieces.find((p) => p.role === "sleeve");
  table([["Part", "Body", "Ease", "Sewn garment", "Where it sits"],
    ["Bust", cm(meas.chest), "+" + D.ease, fit.chest.toFixed(0) + " cm", cm(fit.scyeY / 10) + " cm below the shoulder line"],
    ["Waist", cm(meas.waist), "+" + D.ease, fit.waist.toFixed(0) + " cm", cm(fit.waistY / 10) + " cm below the shoulder line"],
    ["Hip", cm(meas.hip), "+" + D.ease, fit.hip.toFixed(0) + " cm", cm(fit.hipY / 10) + " cm below the shoulder line"],
    ["Shoulder width", cm(meas.shoulder), "0", cm(meas.shoulder), "Shoulder seam, " + cm(fit.shoulderDrop / 10) + " cm slope"],
    ["Neck opening", cm(meas.neck), "+4", "drop " + cm(fit.neckDropF / 10) + " cm front, " + cm(fit.neckDropB / 10) + " cm back", "half width " + cm(fit.neckHalfW / 10) + " cm"],
    ["Arm length", cm(meas.arm), "0", slv ? fmtMM(Math.round(slv.size[1])) + " sleeve" : "sleeveless", "armhole seam measures " + fmtMM(Math.round(fit.armLen))],
    ["Hem", "—", "—", fmtMM(fit.fullHemY) + " from the shoulder", (CLOSURES[spec.closure] || {}).name || ""]],
    [30, 18, 14, 42, CW - 104], 8.8);
  h2("Graded chart around your block");
  text("Cut one column per size. If the bust and hip fall in different columns, trace both and blend the line through the waist — that is normal, not a mistake.", 9);
  table([["Size", "Chest", "Waist", "Hip", "Shoulder", "Neck", "Arm", "Height"], ...sizeChart(D.m).map((r) => [r.size + (r.size === D.size ? "  ←" : ""), r.chest, r.waist, r.hip, r.shoulder, r.neck, r.arm, r.height])],
    [26, 22, 22, 22, 24, 22, 22, CW - 140], 8.8);
  h2("What this ease feels like when it is sewn");
  text(D.ease < 0 ? "Negative ease of " + D.ease + " cm means the dress is tighter than the body, so the cloth must stretch over the bust and hip. Use a fabric with at least " + Math.abs(D.ease) * 6 + "% stretch, sew with a stretch stitch, and stay-tape the shoulders so they do not grow."
    : D.ease <= 3 ? "At " + D.ease + " cm the dress sits close to the body. Choose a fabric with some give, or let the side seams out by 1 cm each if you want to sit down comfortably."
    : D.ease <= 8 ? "At " + D.ease + " cm the dress skims the body — the usual fitting for a woven day dress, with room to layer a thin top underneath."
    : "At " + D.ease + " cm the dress is loose and forgiving. If the neckline gapes, take 1 cm off each shoulder seam end rather than easing the neck band.", 9.2);

  // ---- 3 cutting layout ----
  page(); h1("Cutting layout");
  text("Lay the cloth with the selvedges parallel and the fabric square. Put every piece with its grainline arrow along the length of the cloth, place on the fold where marked, weight or pin every 10 cm, then cut one piece at a time. Transfer every notch, dart point and centre mark with a tailors' tack before the paper comes off.", 9.2);
  const svgP = toSvg(pattern.doc, fmtMM, { fill: "#ffffff", stroke: "#1a1a1a", strokeWidth: 1, labelSize: 7, notchText: true, edgeSa: true });
  try { const png = await svgToPng(svgP.svg, 1400); const hh = Math.min(BOT - y - 6, CW * svgP.h / svgP.w); doc.addImage(png, "PNG", MG, y, CW, hh); y += hh + 3; }
  catch (e) { text("(The layout picture could not be drawn — the piece pages below still carry every marking.)", 9, DIM); }
  text("Above: all pieces at one scale on the sheet. Seam allowance in gold dashes, notches in red, grainline arrowed. Each piece then gets its own page at real size.", 8.6, DIM);
  table([["Piece", "Cut", "Fold", "Cloth", "Width × height", "Seam allowance on each edge"],
    ...pattern.pieces.map((p) => [p.label, String(p.cut), p.fold ? "on fold" : "—", p.fabric || "shell", fmtMM(Math.round(p.size[0])) + " × " + fmtMM(Math.round(p.size[1])), edgeText(p, fmtMM)])],
    [38, 12, 16, 18, 32, CW - 116], 8.2);

  // ---- 4 one page per piece, at 1:1 ----
  const areaW = CW, areaH = PH - 64;
  pattern.pieces.forEach((p, i) => {
    const shape = pattern.doc.shapes[i], pl = polyOf(shape), bb = bbox(pl), sl = seamOf(shape, pattern.doc.seam), sbb = bbox(sl);
    const w = sbb.maxX - sbb.minX, h = sbb.maxY - sbb.minY, s = Math.min(1, areaW / w, areaH / h);
    page(); h1(p.label + "   cut " + p.cut + (p.fold ? " on the fold" : "") + (p.fabric && p.fabric !== "shell" ? "   ·   " + p.fabric : ""));
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
    doc.text("Pattern piece " + (i + 1) + " of " + pattern.pieces.length + "   ·   printed at " + (s >= 0.999 ? "1:1 actual size" : Math.round(s * 100) + "%") + "   ·   " + fabric.name + ", " + fabric.gsm + " g/m²", MG, y);
    y += 3;
    const ox = MG + (areaW - w * s) / 2 - sbb.minX * s, oy = y + (areaH - h * s) / 2 - sbb.minY * s;
    const X = (v) => ox + v * s, Y = (v) => oy + v * s;
    doc.setFillColor(...PAPER); polyPath(doc, sl, X, Y, "F");
    doc.setFillColor(255, 255, 255); polyPath(doc, pl, X, Y, "F");
    doc.setDrawColor(...INK); doc.setLineWidth(0.8); polyPath(doc, pl, X, Y, "S");
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.35);
    if (doc.setLineDashPattern) doc.setLineDashPattern([2.2, 1.6], 0);
    polyPath(doc, sl, X, Y, "S");
    if (doc.setLineDashPattern) doc.setLineDashPattern([], 0);
    drawMarks(doc, shape, X, Y, fmtMM);
    doc.setFontSize(8.4); doc.setTextColor(...DIM);
    doc.text("Cut from: " + (p.fabric === "shell" ? fabric.name : p.fabric) + (p.fold ? ", one piece on the fold" : ", " + p.cut + " piece" + (p.cut > 1 ? "s" : "")) + "  ·  " + edgeText(p, fmtMM), MG, PH - 22, { maxWidth: CW });
    if (s >= 0.999) ruler(doc, MG, PH - 18);
    else { doc.setFontSize(8.4); doc.setTextColor(...ACC); doc.text("This piece is longer than an A4 sheet, so the drawing here is at " + Math.round(s * 100) + "%. To cut it full size, print the studio's SVG or DXF export tiled on A4 (set the printer to poster tiles at 100%), or check the 10 cm ruler on a 1:1 piece page first and scale from that.", MG, PH - 14, { maxWidth: CW }); }
  });

  // ---- sewing order ----
  page(); h1("How to sew it, in order");
  text("Right sides together unless the step says otherwise. Stitch the seam allowance printed on each edge — it changes between the neck, the armholes and the hem.", 9.2, DIM);
  pattern.seams.steps.forEach((s, i) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...ACC);
    if (y + 16 > BOT) page(); doc.text(String(i + 1) + ".  " + s.title, MG, y + 3); y += 6.5;
    text(s.detail, 9.2);
  });
  h2("Joining map");
  table([["Piece and edge", "sew to", "Seam", "Note"],
    ...pattern.seams.joins.map((j) => [pattern.pieces[j.a].label + " · " + j.ea, pattern.pieces[j.b].label + " · " + j.eb, fmtMM(j.sa), j.note || ""])],
    [60, 60, 18, CW - 138], 8.4);

  // ---- machine + finishing ----
  page(); h1("Machine settings and finishing");
  text("From the fabric card for " + fabric.name + ". Test every line of this on an offcut of the real cloth, sewn as two layers, before you touch a dress piece.", 9.2, DIM);
  table([["Setting", "Value"], ["Needle", st.needle], ["Stitch", st.stitch], ["Upper tension", st.tension], ["Foot and plate", st.foot], ["Thread", st.thread],
    ["Seam finish", st.seamFinish], ["Interfacing", st.interlining], ["Hem", (HEM_FINISH[D.hemFinish] || "Turn up and stitch") + " — " + fmtMM(D.hemAllow) + " allowance as drawn"],
    ["Closure", (CLOSURES[spec.closure] || {}).name || "—"], ["Care", st.wash]], [40, CW - 40], 9);
  h2("Pressing as you go"); text(st.press);
  h2("Fit check before you close the side seams");
  text("Sew the shoulder seams and one side seam with a long stitch. Turn the dress right side out and put it on the wearer (or the mannequin). Check: the shoulder seam lands on the shoulder bone, the bust lets the arms cross, the neckline lies flat without gaping at the back or pulling at the front, and the hem hangs level to the floor. Mark what changes with a pen, take it off, then sew the rest. Change side seams on both sides so the seams stay on the body centres.", 9.2);
  h2("Safe places to alter");
  text("Lengthen or shorten at the hem, or by cutting the skirt longer at its hem line. Take in or let out the side seams by up to 2 cm each. Do not shorten the sleeve cap without shortening the armhole by the same amount — they are matched to " + fmtMM(Math.round(fit.armLen)) + " plus the easing.", 9.2);
  h2("A note on what this is");
  text("These are drafting blocks made from your measurements and this app's sample fabric values — not an industrial graded production set. Fit them on a calico first, keep the changes written on the pattern, and the same numbers will then carry through to every size.", 8.8, DIM);

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...DIM); doc.text("FashionCAD Studio sewing guide · " + title + " · page " + i + " of " + n, MG, PH - 6); }
  doc.save((ctx.name || "dress").replace(/\.pdf$/i, "") + "-sewing-guide.pdf");
  return true;
}

const edgeText = (p, fmtMM) => { const live = p.edges.filter((e) => e.sa > 0); return live.length ? live.map((e) => e.name + " " + fmtMM(e.sa)).join(", ") : "cut to the line, no seam allowance"; };
function polyPath(doc, pts, X, Y, style) {
  if (!pts || pts.length < 3) return;
  const d = [];
  for (let i = 1; i < pts.length; i++) d.push([X(pts[i][0]) - X(pts[i - 1][0]), Y(pts[i][1]) - Y(pts[i - 1][1])]);
  doc.lines(d, X(pts[0][0]), Y(pts[0][1]), [1, 1], style, true);
}
function drawMarks(doc, shape, X, Y, fmtMM) {
  const m = shape.mark; if (!m) return;
  doc.setTextColor(...INK); doc.setDrawColor(...INK);
  if (m.fold) {
    doc.setLineWidth(0.9); doc.line(X(m.fold.a[0]), Y(m.fold.a[1]), X(m.fold.b[0]), Y(m.fold.b[1]));
    doc.setLineWidth(0.3); const steps = 6;
    for (let i = 0; i < steps; i++) { const t = (i + 0.5) / steps, px = X(m.fold.a[0]) + (X(m.fold.b[0]) - X(m.fold.a[0])) * t, py = Y(m.fold.a[1]) + (Y(m.fold.b[1]) - Y(m.fold.a[1])) * t; doc.line(px, py, px + 2, py - 2); }
    doc.setFontSize(7.5); doc.text("PLACE ON FOLD", X(m.fold.a[0]) + 3, (Y(m.fold.a[1]) + Y(m.fold.b[1])) / 2, { angle: 90 });
  }
  doc.setLineWidth(0.35);
  (m.darts || []).forEach((d) => {
    doc.line(X(d.legs[0][0]), Y(d.legs[0][1]), X(d.apex[0]), Y(d.apex[1]));
    doc.line(X(d.legs[1][0]), Y(d.legs[1][1]), X(d.apex[0]), Y(d.apex[1]));
    doc.line(X(d.legs[0][0]), Y(d.legs[0][1]), X(d.legs[1][0]), Y(d.legs[1][1]));
    doc.circle(X(d.apex[0]), Y(d.apex[1]), 0.8, "S");
    doc.setFontSize(6.8); doc.text("dart " + fmtMM(Math.round(d.intake)), X(d.apex[0]) + 2, Y(d.apex[1]) + 3);
  });
  (m.notches || []).forEach((n) => {
    doc.setDrawColor(...ACC); doc.setTextColor(...ACC); doc.setLineWidth(0.5);
    doc.line(X(n.p[0]) - 2.6, Y(n.p[1]), X(n.p[0]) + 2.6, Y(n.p[1])); doc.line(X(n.p[0]), Y(n.p[1]) - 2.6, X(n.p[0]), Y(n.p[1]) + 2.6);
    doc.setFontSize(6.4); doc.text(String(n.t), X(n.p[0]) + 3.4, Y(n.p[1]) - 2.6);
    doc.setDrawColor(...INK); doc.setTextColor(...INK);
  });
  if (m.grain) {
    const a = [X(m.grain.a[0]), Y(m.grain.a[1])], b = [X(m.grain.b[0]), Y(m.grain.b[1])];
    doc.setLineWidth(0.5); doc.line(a[0], a[1], b[0], b[1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), h = 3.4;
    [[a, ang + Math.PI], [b, ang]].forEach(([p, t]) => { doc.line(p[0], p[1], p[0] + Math.cos(t + 0.4) * h, p[1] + Math.sin(t + 0.4) * h); doc.line(p[0], p[1], p[0] + Math.cos(t - 0.4) * h, p[1] + Math.sin(t - 0.4) * h); });
    doc.setFontSize(6.6); doc.text("GRAIN LINE", a[0] + 2.4, a[1] + 3.4, { angle: -(ang * 180) / Math.PI });
  }
  (m.text || []).forEach((t) => { doc.setFontSize(7); doc.setTextColor(...DIM); doc.text(String(t.t), X(t.p[0]), Y(t.p[1]), { maxWidth: 62 }); doc.setTextColor(...INK); });
  const bb = bbox(polyOf(shape));
  doc.setFontSize(7.6); doc.setTextColor(...DIM); doc.text("cut size " + fmtMM(Math.round(bb.maxX - bb.minX)) + " × " + fmtMM(Math.round(bb.maxY - bb.minY)) + " — hem allowance in, stitched seam allowance on top", X(bb.minX), Y(bb.minY) - 2.4);
}
function ruler(doc, x, y) {
  doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.rect(x, y, 100, 4.5, "S");
  for (let i = 0; i <= 100; i += 5) doc.line(x + i, y, x + i, y + (i % 10 === 0 ? 4.5 : 2.4));
  for (let i = 0; i <= 100; i += 10) { doc.setFontSize(6.2); doc.setTextColor(...INK); doc.text(String(i), x + i - 3, y + 8); }
  doc.setFontSize(7.2); doc.setTextColor(...ACC); doc.text("CHECK: this bar is exactly 10 cm when printed at 100%", x + 104, y + 4);
  doc.setTextColor(...INK);
}
function svgToPng(svg, px) {
  return new Promise((res, rej) => {
    const im = new Image(), url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    im.onload = () => { const k = px / (im.width || px); const c = document.createElement("canvas"); c.width = px; c.height = Math.max(1, Math.round((im.height || px) * k));
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/png")); };
    im.onerror = () => rej(new Error("svg rasterise failed")); im.src = url;
  });
}

// ---------- print-window fallback ----------
export function printSewingSheet(ctx) {
  const { pattern, meas, fabric, fmtMM, D, spec } = ctx, st = sewingSettings(fabric), fit = pattern.fit;
  const rows = (a) => "<table>" + a.map((r, i) => "<tr>" + r.map((c) => (i ? "<td>" : "<th>") + esc(c) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</table>";
  const svg = toSvg(pattern.doc, fmtMM, { fill: "#ffffff", stroke: "#111", strokeWidth: 1, labelSize: 7, notchText: true, edgeSa: true }).svg;
  const html = `<!doctype html><meta charset="utf-8"><title>Sewing guide · ${esc(ctx.name)}</title>
<style>body{font:13px/1.45 sans-serif;margin:14mm;color:#111}h1{margin:0 0 2px;font-size:23px}h2{margin:18px 0 5px;border-bottom:2px solid #111;padding-bottom:2px;font-size:15px}
table{border-collapse:collapse;width:100%;margin:6px 0;font-size:12px}th,td{text-align:left;padding:4px 8px 4px 0;border-bottom:1px solid #ccc;vertical-align:top}
.box{border:1px solid #999;padding:8px;margin:8px 0}svg{width:100%;height:auto}small{color:#555}ol li{margin-bottom:9px}@page{margin:12mm}</style>
<h1>${esc(ctx.name)} — sewing &amp; cutting guide</h1>
<small>${new Date().toLocaleDateString()} · size ${esc(String(D.size).toUpperCase())} · ${esc((SILHOUETTES[D.silhouette] || {}).name || "")} · ${esc(fabric.name)} · FashionCAD Studio</small>
<p class="box">Print at 100% (no page scaling) and measure the flat pattern against a ruler before cutting. ${pattern.pieces.length} shapes, ${pattern.pieces.reduce((t, p) => t + p.cut, 0)} paper pieces, seam allowance ${fmtMM(D.seam)} already drawn on every edge.</p>
<h2>Measurements</h2>${rows([["Part", "Body", "Ease", "Sewn garment"], ["Bust", cm(meas.chest), "+" + D.ease, fit.chest.toFixed(0) + " cm"], ["Waist", cm(meas.waist), "+" + D.ease, fit.waist.toFixed(0) + " cm"], ["Hip", cm(meas.hip), "+" + D.ease, fit.hip.toFixed(0) + " cm"], ["Armhole seam", "—", "—", fmtMM(Math.round(fit.armLen))], ["Hem", "—", "—", fmtMM(fit.fullHemY) + " below the shoulder"]])}
<h2>Size chart</h2>${rows([["Size", "Chest", "Waist", "Hip", "Shoulder", "Neck", "Arm"], ...sizeChart(D.m).map((r) => [r.size + (r.size === D.size ? " ←" : ""), r.chest, r.waist, r.hip, r.shoulder, r.neck, r.arm])])}
<h2>Fabric</h2><p>${esc(fabric.name)} · ${esc(fabric.category)} · ${fabric.gsm} g/m² · stretch ${fabric.stretch || 0}% · ${esc(fabric.care || "")}<br><small>Buy about ${fabricUsage(pattern.pieces, 140).metres} m at 140 cm wide; add 10% for one-way prints and nap.</small></p>
<h2>Notions</h2>${rows([["Item", "Quantity / spec", "Note"], ...notionsFor(ctx).map((n) => [n.n, n.q, n.d])])}
<h2>Cut list</h2>${rows([["Piece", "Cut", "Fold", "Cloth", "Width × height", "Seam allowance per edge"], ...pattern.pieces.map((p) => [p.label, p.cut, p.fold ? "on fold" : "—", p.fabric || "shell", fmtMM(Math.round(p.size[0])) + " × " + fmtMM(Math.round(p.size[1])), edgeText(p, fmtMM)])])}
<h2>Flat pattern with markings</h2><div class="box">${svg}</div>
<h2>Sewing order</h2><ol>${pattern.seams.steps.map((s) => "<li><b>" + esc(s.title) + "</b><br>" + esc(s.detail) + "</li>").join("")}</ol>
<h2>Joining map</h2>${rows([["Piece and edge", "sew to", "Seam", "Note"], ...pattern.seams.joins.map((j) => [pattern.pieces[j.a].label + " · " + j.ea, pattern.pieces[j.b].label + " · " + j.eb, fmtMM(j.sa), j.note || ""])])}
<h2>Machine settings</h2>${rows([["Setting", "Value"], ["Needle", st.needle], ["Stitch", st.stitch], ["Upper tension", st.tension], ["Foot and plate", st.foot], ["Thread", st.thread], ["Seam finish", st.seamFinish], ["Interfacing", st.interlining], ["Hem", (HEM_FINISH[D.hemFinish] || "Turn up and stitch") + ", " + fmtMM(D.hemAllow)], ["Pressing", st.press], ["Care", st.wash]])}
<h2>Fit check before closing the side seams</h2><p>Sew the shoulders and one side seam with a long stitch, turn right side out and try it on. The shoulder seam must sit on the shoulder bone, the bust must let the arms cross, the neckline must lie flat and the hem must hang level. Mark the changes, then sew the rest — alter both side seams so they stay on the body centres.</p>`;
  const w = window.open("", "_blank"); if (!w) throw new Error("the print window was blocked — allow pop-ups for this site");
  w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch (e) {} }, 600);
  return true;
}
