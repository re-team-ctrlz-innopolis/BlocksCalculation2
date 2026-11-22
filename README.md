# BlocksCalculator

An offline wall-plan editor for calculating full and half Stumbelbloc quantities, with a top-down plan and a course-by-course wall view.

## Getting started

Keep the project folder together and open [BlocksCalculation2.html](BlocksCalculation2.html) in a browser. All styles, fonts and scripts are bundled; no installation or internet connection is required.

- **Guide** explains editing, navigation and keyboard shortcuts.
- **File → Open project / Save project** loads and saves editable JSON files. Browser autosave also keeps the current project locally.
- **File → Save PDF / Print / Export CSV** produces a block quantities report. Validation errors block reports; drafts can still be saved as JSON.

Saving JSON or PDF lets you choose a folder and filename in supported browsers. Otherwise, enable **Ask where to save each file** in the browser's download settings.

For consistent browser storage between sessions, optionally run `python -m http.server 8000` from this folder and open `http://localhost:8000/BlocksCalculation2.html`.

## Examples

Load any example through **File → Open project**:

| Project | Description |
| --- | --- |
| [Sample house](examples/sample-house.json) | House with an internal partition |
| [Nested partition](examples/nested-partition.json) | House with an additional connected partition |
| [Compact studio](examples/compact-studio.json) | 4,000 × 3,200 mm room with a door and two windows |
| [Two-room house](examples/two-room-house.json) | Two rooms, windows and control joints |
| [L-shaped house](examples/l-shaped-house.json) | Six exterior walls and two doors |
| [Long wall](examples/long-wall-with-openings.json) | 18,000 mm wall with joints shifted clear of windows |
| [House with annex](examples/house-with-annex.json) | Connected walls of different heights |

## Editing and calculation

- Up to **500 walls**, with no predefined length limit. Move, resize and rotate walls by 90°, snap L/T-junctions, and set individual heights.
- Add rectangular doors and windows, including stacked openings. Undo/redo supports up to 50 edits. The lower wall view scrolls horizontally with the scrollbar or mouse wheel.
- Full blocks: **400 × 200 × 200 mm**; half blocks: **200 × 200 × 200 mm**. Placement and courses follow a **200 mm grid**; mortar and joint widths are excluded. Blocks are not cut.
- Wall heights: **2–17 courses (400–3,400 mm)** within the 3.5 m limit. Doors start at floor level; windows start at course 2 or above.
- Openings need **200 mm of masonry at each wall end** and **three solid courses above**, including before another opening. Widths over 1,500 mm show a notice about a separate lintel or beam but do not block export by themselves.
- L-corners share masonry counted once. At T-junctions, the host wall stays continuous and the branch fits between wall faces.
- Control joints target **5,000 mm intervals**, shifting clear of openings and staying at least **400 mm** from openings and wall ends. Sections must remain no longer than 5 m; impossible layouts block reports. The end clearance is an adopted layout rule.

The nominal model uses customer-confirmed block dimensions and `Rational-Design-.pdf`. Reports count above-floor wall blocks, including lintel blocks. Foundations, gables, reinforcement, straps, concrete, mortar, waste and separate beam quantities are excluded. Structural strength and stability are not calculated. Reference layouts and expected counts still require customer confirmation.