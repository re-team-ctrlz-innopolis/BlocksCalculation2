const FULL_BLOCK_MM = 400;
const HALF_BLOCK_MM = 200;
const BLOCK_HEIGHT_MM = 200;
const BLOCK_DEPTH_MM = 200;
const MM_PER_CM = 10;
const FULL_BLOCK_CM = FULL_BLOCK_MM / MM_PER_CM;
const HALF_BLOCK_CM = HALF_BLOCK_MM / MM_PER_CM;
const PX_PER_CM = 1.0;
const PX_PER_MM = PX_PER_CM / MM_PER_CM;
const FULL_BLOCK_PX = FULL_BLOCK_CM * PX_PER_CM;
const HALF_BLOCK_PX = HALF_BLOCK_CM * PX_PER_CM;
const WALL_THICKNESS = HALF_BLOCK_PX;
const BLOCK_GRID_CM = 20;
const BLOCK_GRID_MM = BLOCK_GRID_CM * MM_PER_CM;
const POSITION_GRID_CM = BLOCK_GRID_CM;
const ENDPOINT_RADIUS = 7;
const SNAP_RADIUS = 22;
const MIN_WALL_CM = HALF_BLOCK_CM;
const MIN_WALL_MM = MIN_WALL_CM * MM_PER_CM;
const MAX_PROJECT_WALLS = 500;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1; // 10 percentage points per manual zoom step.
const ELEVATION_PX_PER_CM = 1.8; // A 400 mm block stays 72 px wide in the side view.

// Customer-confirmed sizes (length × width × height): 400×200×200 mm and 200×200×200 mm; mortar is excluded.
const COURSE_HEIGHT_CM = BLOCK_HEIGHT_MM / MM_PER_CM;
const MAX_WALL_HEIGHT_CM = 350; // Wall plate limit in the report, p.81.
const MAX_WALL_ROWS = Math.floor(MAX_WALL_HEIGHT_CM / COURSE_HEIGHT_CM);
// Keep older 18/19-course projects editable; validation blocks their final reports.
const MAX_SAVED_WALL_ROWS = Math.max(19, MAX_WALL_ROWS);
const MAX_CONTROL_SECTION_MM = 5000;
const MAX_CONTROL_SECTION_CM = MAX_CONTROL_SECTION_MM / MM_PER_CM;
// MVP layout rule: leave room for a full block between a joint and either wall end.
const MIN_CONTROL_END_DISTANCE_MM = FULL_BLOCK_MM;
const MIN_CONTROL_END_DISTANCE_CM = MIN_CONTROL_END_DISTANCE_MM / MM_PER_CM;
const PROJECT_VERSION = 1;
const PLAN_GEOMETRY = 'modular-cells-v3';
const LOCAL_PROJECT_KEY = 'blocks-calculator-v3';
