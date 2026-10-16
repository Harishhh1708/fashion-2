# FashionCAD Studio

A browser-based fashion design and pattern learning studio. Static HTML, CSS and JavaScript on GitHub Pages. No login, no accounts, no terminal.

**Start here:** open `design.html`. Pick a body, choose the shape, and download the sewing PDF to cut and stitch it for real.

## What works
- **Design studio** (`design.html`) — the guided way to make a dress. Six steps: body preset and size, silhouette, neckline, skirt, sleeve, fabric. Every choice redraws a real flat pattern (front, back, sleeves, gores, darts, notches, grainlines, seam allowance) and re-sews the 3D garment. Quick styles at the top give you a finished dress in two clicks.
- **3D garment sewn from your own pattern** — the pattern pieces are wrapped onto the body ring and relaxed under gravity, so ease, flare, gathers, dart shaping, sleeve caps, cuffs, waistbands, buttons and pockets come from the pieces you designed, not from a preset shape. Front/back/three-quarter/side/top camera views.
- **Sewing & cutting PDF** — one download gives you a printed pack: finished measurements, fabric and notions list, body measurements with ease, a cutting layout, one page per pattern piece (with a 10 cm ruler so you can prove the print is 1:1), seam allowance named on every edge, the sewing order step by step, and machine settings.
- Export SVG, PNG, DXF, print/PDF from the pattern editor; PNG, GLB, OBJ from the 3D studio
- 2D pattern editor: pencil, brush, eraser, line, rectangle, ellipse, polygon, curve, measure, text, colours and fills, seam allowance, exact sizes, undo/redo
- Pictures: insert a photo, cut part of it out with a loop, remove a plain background. Motifs (flower, heart, paisley, stripes and more), copy and paste between projects, and a My designs library
- Garment catalog (291 garments) and fabric library (98 fabrics, sample values you can edit)
- 3D studio: adjustable mannequin, simple garment shapes, fabric materials, camera views. Your pattern's colours, drawings and pictures appear on the model, and its length, width and sleeve length shape it.
- Drape test: cloth simulation prototype with a drape coefficient
- Production: fabric estimate, costing, measurement sheet, tech pack (print/PDF), CSV
- Projects and profile saved in your browser, with backup and restore in Settings

## Where your data lives
Projects are saved in **this browser on this device**. They do not sync between devices. Clearing browser data, or using a private/incognito window, removes them. Use Settings, Download backup, now and then, and Restore from backup on another device.

## Honest limits
- Fabric numbers are teaching samples, not lab data
- The Design studio's 3D garment is sewn from your real pattern pieces, so neckline, sleeve, skirt and length changes show on the body. It is a fitted drape, not a physics-accurate photoscan: very fine details (heavy gathers, bias drape, stiff interfacing) are approximated, and the PDF sizes are the ones to trust when you cut fabric
- The older **3D studio** page (`studio.html`) is still the simple shape that wears your pattern's colours and drawings — use the Design studio for a garment built from the pattern
- Pictures are shrunk to fit browser storage; very large or many pictures can fill it
- The drape test is a prototype, not calibrated to a real tester
- Fabric edits are saved in your browser only
- No accounts or cloud sync. Not included: FBX, PSD, AI export, body scanning

## Put it online
1. Create a public GitHub repository.
2. Upload all files to the repository root (not inside an extra folder).
3. Settings, Pages, deploy from `main` and `/ (root)`.
4. Open the Pages address. Opening the files directly from your computer will not work.

## Check everything
Open `health.html` on your site and press Run checks.

## Updating
Upload changed files with the same names and they replace the old ones. Files you delete from your computer are not deleted from GitHub; delete those in the repository itself.
