# BlocksCalculator MVP

A Requirements Engineering course project for entering wall layouts and calculating the quantities of full and half Stumbelbloc blocks. The original editor layout is retained: a top-down plan, an elevation of the selected wall, and a properties panel on the right.

## Running the application

Open `draft.html` in a browser. For consistent persistence between sessions, use a local HTTP server from the project root:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/draft.html`. Tailwind styles and the Inter font are loaded over the internet, as in the original project. No build tool, npm packages, or backend are required.

## Features

- Add, delete, move, resize, and rotate walls in 90° increments.
- Press Delete to remove the selected wall or opening. Clearing the canvas and loading the sample project require confirmation.
- Camera controls: scroll to zoom around the cursor; drag empty space with the left mouse button, or drag anywhere with the middle button, to pan. Reset restores the camera position and zoom.
- Use the back arrow or Ctrl/Cmd+Z to undo plan edits: creation, deletion, property changes, rotation, dragging, clearing, and importing. Use the forward arrow, Ctrl/Cmd+Shift+Z, or Ctrl/Cmd+Y to redo an undone edit. A new edit clears the redo history. Each drag gesture counts as one operation. Up to 50 operations are retained for the current session; camera movements are excluded. When typing in a field, the browser's native text undo remains available.
- Wall orientation is shown as Horizontal / Vertical. Turn left / Turn right rotates the wall by a quarter turn without entering angles.
- Snapping for L- and T-junctions; a wall list for selection and access to properties.
- Individual wall heights, with a separate action to apply a height to all walls.
- Rectangular openings with width, position, bottom course, and height in courses. A Door starts at the first course at floor level; a Window starts at course 2 or above. Width and position use the nominal block module without accounting for joint width. Curved arches are not modeled.
- Move and resize openings on the plan; move them horizontally and vertically in the elevation. Openings can be stacked when their rectangles do not overlap. Property controls, dragging, and JSON import enforce the same two-dimensional collision rule. The opening list shows occupied rows; select stacked openings there or in the elevation. On the plan, the selected opening is drawn and hit-tested on top.
- Automatic full/half block layouts, alternating course bonds, and shared L-corners counted once.
- Control joints at fixed 5,000 mm intervals, with sections no longer than 5 m, one half block on each side of the joint in every second course, and markers in both views.
- Validation messages for unsupported geometry. The final report is unavailable when errors exist, and preliminary quantities are marked as drafts.
- CSV export and a printable report; PDF output through the browser's print dialog.
- The File menu next to the application name groups Open project / Save project (JSON), Print / Save PDF, and Export CSV. Result exports are disabled when the model has validation errors. Close the menu by choosing an action, clicking outside it, or pressing Escape; keyboard navigation is also supported.
- Autosave in the current browser, plus JSON project export and import with structure and identifier validation. A failed import does not replace the current project.

## Adopted model and accuracy limits

Sources: two customer meeting transcripts and `Rational-Design-.pdf` (Draft Rational Design Report, February 2011). Page references below refer to PDF pages.

1. **Block dimensions:** the project uses full blocks measuring 400 × 200 × 200 mm and half blocks measuring 200 × 200 × 200 mm, as clarified by the team. Wall thickness is 200 mm. The interface accepts millimeters; internal coordinates with the `Cm` suffix remain in centimeters. Horizontal placement follows 400/200 mm modules. Individual vertical mortar joints are not added to these lengths, and the earlier 198 mm half-block assumption is no longer used.
2. **Course height is 200 mm:** one block height, with no additional mortar allowance. Mortar joints are currently excluded in every direction, and control-joint width is not subtracted. This is the team's chosen MVP model; it replaces the earlier 176 mm block + 3 mm mortar assumption. Results count blocks in this simplified model rather than simulate construction tolerances.
3. **Single storey, rectangular walls, and a 3.5 m height limit**, based on the wall-plate level on p. 81. At 200 mm per course, 2–17 whole courses are allowed, up to 3,400 mm; 18 courses would reach 3,600 mm and exceed the limit. The maximum individual wall length is 100,000 mm, an editor limit rather than a building-code limit. It is not a limit on unsupported wall length: stability is not calculated.
4. **Plan dimensions use modular lengths on a shared 20 × 20 cm grid.** Wall faces lie on cell boundaries, and wall axes run through cell centers. An L-junction occupies one shared 20 × 20 cm cell, assigned to one wall in odd courses and the other in even courses. Above the shorter wall, the shared-corner deduction stops. At a T-junction, the host wall remains continuous; the branch wall length is the clear distance between faces. With 300 cm between the axes of two walls, the partition length is 280 cm. The T-detail follows the metal-strap connection and concrete-filled cavities on pp. 9 and 67; these materials are excluded from the block report. The shared grid is the editor's adopted nominal model, with no block cutting.
5. **Openings** follow the 20 cm grid, with at least 20 cm of masonry at both wall ends. Their horizontal ranges may overlap when they occupy different rows; intersection of the actual opening rectangles is prohibited. Touching edges alone do not count as an intersection. The maximum width on the chosen grid is 140 cm, keeping within the 1.5 m span described on p. 66. At least three solid courses must remain above an opening, including before another opening at the same horizontal position; otherwise final export is blocked. Their blocks are included; reinforcement and concrete quantities are not calculated. Larger openings are possible in construction with a different lintel design, but this MVP does not support them. Changing wall dimensions does not repack stacked openings into one horizontal row. Invalid overlapping JSON imports are rejected without replacing the current project.
6. **Control joints** are vertical lines at 5,000 mm and its multiples, no more than 5 m apart, based on p. 70. Openings are not allowed within 400 mm of a joint line. The team's chosen MVP rule uses one half block on each side of the line in every second course, with full blocks filling the remaining space where the bond permits: `[full][half] | [half]`. This replaces the earlier implementation's two half blocks per side; it is a project decision, not a verified interpretation of the manual's wording. No full block crosses the line. The geometric joint width is not deducted.
7. **Cutting blocks to length or height is not supported.** Page 64 prohibits half blocks in the foundation setting-out course. That course and the foundation are excluded from the above-floor wall calculation; the rule is not arbitrarily applied to the first above-floor course. Page 69 allows an alternative door installation method involving cutting; the MVP follows the customer's no-cutting constraint.
8. **The report covers only above-floor wall blocks**, including lintel blocks. Foundations, gables, roofing, reinforcement, straps, concrete, mortar, and production waste are not calculated. Strength, stability, and compliance with current building codes are not assessed. Descriptions of tests in the PDF do not constitute requirements to implement engineering analysis in the application.

Before final acceptance, the customer must confirm the dimensional model and reference layouts of two adjacent courses for a standalone wall, an L-corner, a T-junction, an opening, and a control joint. Expected block counts must be provided for these examples.

## Verification

The plan, pointer interactions, and snapping use the same nominal coordinates, without rescaling block spacing when walls are connected. The shared L-corner area counted in the neighboring wall is marked in green in both the plan and elevation. The shared grid is 20 cm, with wall axes offset 10 cm from cell boundaries. T-snap positions on parallel walls are coordinated, including exterior walls and internal partitions. The grid is independent of pan and zoom.

Dragging evaluates candidates for both wall ends simultaneously: an exact connection at both ends takes priority, followed by the nearest positional correction. Moving a wall does not change its length. If the distance between walls is incompatible with the partition length, the editor does not simulate a connection at both ends. Resizing with a handle preserves the wall direction, and a snap preview is shown only for an exactly reachable point. Numeric length changes preserve the wall's first face. The buttons and yellow handle rotate the wall around the center of its first cell; four 90° turns return it to its original position.

New projects use `planGeometry: modular-cells-v3`. Older projects without this marker, or with `face-t-v2`, are migrated to the shared grid: modular L-wall lengths are preserved, and T-partitions are fitted between faces. Identifiers, heights, and opening dimensions/positions are preserved. Changed lengths are listed in yellow messages, such as 380 → 360 cm and 300 → 280 cm in the old sample house with an additional partition. Migration is not repeated. If migration invalidates opening dimensions or cannot preserve L-connections, the entire import is rejected with an explanation; the current project is not replaced. New autosaves use a separate `blocks-calculator-v3` key, leaving the original `blocks-calculator-v1` data available and unchanged.

Changing wall height does not trim or move openings. If an opening extends above the wall, an error is shown and the final report is blocked. Restoring the height preserves the original openings, including after saving and reopening the project.

Perpendicular wall intersections are checked using the nominal 20 cm thickness, including areas near wall ends. The shared area of a valid L-corner is handled by the corner-bond rules; other overlaps block printing and CSV export. If a wall is too short for both L-corners in any course, it must be lengthened or its connections changed. Such projects can be opened for correction; preliminary quantities are marked as drafts.

The editor retains its 3.5 m wall-plate height limit. With the updated 200 mm block height and no mortar allowance, it permits at most 17 courses (3,400 mm). The sample house keeps its 17-course exterior walls, now displayed as 3,400 mm high. Older saved projects with 18 or 19 courses can still be opened for correction without removing walls or openings; their final reports remain blocked until heights meet the new limit. Stored course counts are preserved, and heights in millimeters are recalculated using 200 mm per course. Gables are not modeled. The editor limit is not a structural safety check.

The T-junction follows p. 9 (Fig. 4) and p. 67 (Step 7): the connection uses a metal strap, and cavities are filled with concrete. A shared block between the two walls is not required. Block counting keeps the host wall continuous and does not deduct a branch-wall block from it. A glue-only model does not match the full connection detail; straps and concrete remain outside the block report.

Use Node.js 24 or a compatible version with built-in `node:test`:

```powershell
node --test tests/calculation.test.cjs
```

Calculation tests cover course bonding, counting L-corners once, walls of different heights, T-junctions, a nested 280 cm partition, openings by course, control joints, geometry errors, the sample house, and atomic imports. Stacked-opening tests cover two-dimensional intersections, lintel clearance, property and pointer handlers, plan selection, undo/redo, and JSON round trips. A separate check compares every occupied layout cell against the wall geometry across all courses and four orientations, checking for both gaps and duplicate counts of shared cells.

The integration check requires Chrome or Edge installed on Windows. The script starts a headless browser with a separate temporary profile, starts a temporary server, and checks the interface through DevTools. No npm dependencies are required:

```powershell
node tests/browser-smoke.cjs
```

The screenshot is saved in the operating system's temporary directory. The script checks loading, wall properties, invalid dimensions, dragging an opening in the elevation, CSV export, the printable table, restoration after reload, blocked export, and adding/clearing walls.
