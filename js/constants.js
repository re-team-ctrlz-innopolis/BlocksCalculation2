const FULL_BLOCK_CM = 40;
const HALF_BLOCK_CM = 20;
const PX_PER_CM = 1.0;
const FULL_BLOCK_PX = FULL_BLOCK_CM * PX_PER_CM;
const HALF_BLOCK_PX = HALF_BLOCK_CM * PX_PER_CM;
const WALL_THICKNESS = HALF_BLOCK_PX;
const BLOCK_GRID_CM = 20;
const POSITION_GRID_CM = BLOCK_GRID_CM;
const ENDPOINT_RADIUS = 7;
const SNAP_RADIUS = 22;
const MIN_WALL_CM = HALF_BLOCK_CM;
const MAX_WALL_CM = 2400;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.2;

// Nominal horizontal coordination; physical blocks: 400/198 x 198 x 176 mm.
const COURSE_HEIGHT_CM = 17.9; // 176 mm + 3 mm TBM (report p.19).
const MAX_WALL_HEIGHT_CM = 350; // Wall plate limit in the report, p.81.
const MAX_WALL_ROWS = Math.floor(MAX_WALL_HEIGHT_CM / COURSE_HEIGHT_CM);
const MAX_CONTROL_SECTION_CM = 500;
const PROJECT_VERSION = 1;
const PLAN_GEOMETRY = 'modular-cells-v3';
const LOCAL_PROJECT_KEY = 'blocks-calculator-v3';
