// Customer rules and the explicitly limited, nominal coordination model.
function formatCm(value) { return Number(value.toFixed(1)); }
function getWallRows(wall) { return wall.rows ?? state.totalWallRows; }
function getPartnerWall(id) { return state.walls.find(w => w.id === id); }
function arePerpendicular(a, b) {
    return Math.abs(Math.cos(getWallAngleRad(a) - getWallAngleRad(b))) < 0.00001;
}

function getControlJoints(wall) {
    const length = getWallLengthCm(wall);
    if (length <= MAX_CONTROL_SECTION_CM) return [];
    const joints = [];
    let previous = 0;
    const junctions = [];
    for (const branch of state.walls) {
        if (branch.id === wall.id || !arePerpendicular(wall, branch)) continue;
        for (const [x, y] of [[branch.x1, branch.y1], [branch.x2, branch.y2]]) {
            const local = worldToWallLocal(wall, x, y);
            if ((Math.abs(local.perp) < 0.01 || Math.abs(Math.abs(local.perp) - WALL_THICKNESS / 2) < 0.01) && local.along > HALF_BLOCK_PX && local.along < getWallLength(wall) - HALF_BLOCK_PX)
                junctions.push(snapToHalfBlockCellCenterCm(pxToCm(local.along), length));
        }
    }
    while (length - previous > MAX_CONTROL_SECTION_CM) {
        const sections = Math.ceil((length - previous) / MAX_CONTROL_SECTION_CM);
        const target = snapCmToGrid(previous + (length - previous) / sections);
        const candidates = [];
        for (let x = previous + HALF_BLOCK_CM; x <= Math.min(previous + MAX_CONTROL_SECTION_CM, length - HALF_BLOCK_CM); x += HALF_BLOCK_CM) {
            const atOpening = wall.openings.some(op => {
                const b = getOpeningBoundsCm(op);
                return x >= b.startCm - HALF_BLOCK_CM && x <= b.endCm + HALF_BLOCK_CM;
            });
            if (!atOpening && !junctions.some(j => x >= j.cellStartCm - HALF_BLOCK_CM && x <= j.cellEndCm + HALF_BLOCK_CM)) candidates.push(x);
        }
        candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
        if (!candidates.length) break; // Validation reports the unresolved section.
        previous = candidates[0];
        joints.push(previous);
    }
    return joints;
}

function validateProject() {
    const errors = [], warnings = [];
    const joints = getAllWallJoints();
    if (!state.walls.length) errors.push('Add at least one wall.');
    for (const wall of state.walls) {
        const label = `Wall #${wall.id}`;
        const rawLength = pxToCm(getWallLength(wall));
        if (Math.abs(rawLength / BLOCK_GRID_CM - Math.round(rawLength / BLOCK_GRID_CM)) > 0.00001 || rawLength < MIN_WALL_CM || rawLength > MAX_WALL_CM)
            errors.push(`${label}: length must be ${MIN_WALL_CM}–${MAX_WALL_CM} cm in 20 cm modules. No cutting.`);
        if (Math.abs(getWallAngleRad(wall) / (Math.PI / 2) - Math.round(getWallAngleRad(wall) / (Math.PI / 2))) > 0.00001)
            errors.push(`${label}: only 90° rotations are supported.`);
        if (!Number.isInteger(getWallRows(wall)) || getWallRows(wall) < 2 || getWallRows(wall) > MAX_WALL_ROWS)
            errors.push(`${label}: height must be 2–17 courses.`);
        const length = getWallLengthCm(wall);
        for (const op of wall.openings) {
            const b = getOpeningBoundsCm(op);
            if (b.startCm < HALF_BLOCK_CM || b.endCm > length - HALF_BLOCK_CM)
                errors.push(`${label}: opening #${op.id} needs a 20 cm pier at both wall ends.`);
            if (!Number.isInteger(op.startRow) || !Number.isInteger(op.rowCount) || op.startRow < 1 || op.rowCount < 1 || op.startRow + op.rowCount - 1 > getWallRows(wall))
                errors.push(`${label}: opening #${op.id} is outside the wall height.`);
            if (b.lenCm > 150) errors.push(`${label}: opening #${op.id} exceeds the 1.5 m lintel detail supported by this MVP.`);
            if (op.startRow + op.rowCount > getWallRows(wall) - 1)
                errors.push(`${label}: leave at least three courses above opening #${op.id} for the documented lintel detail.`);
            for (const other of wall.openings) {
                if (other.id <= op.id) continue;
                const c = getOpeningBoundsCm(other);
                if (b.startCm < c.endCm && c.startCm < b.endCm) errors.push(`${label}: openings overlap horizontally.`);
            }
        }
        const controls = [0, ...getControlJoints(wall), length];
        if (controls.some((x, i) => i && x - controls[i - 1] > MAX_CONTROL_SECTION_CM))
            errors.push(`${label}: cannot place control joints with sections ≤5 m clear of openings and T-joints. Move or resize the openings.`);
        if (calculateWallBlocks(wall, joints).unfilledCm > 0)
            errors.push(`${label}: the layout leaves unfilled masonry. Use 20 cm modules.`);
    }
    for (const j of joints.filter(j => j.type === 'T')) {
        const host = getPartnerWall(j.hostWallId), branch = getPartnerWall(j.branchWallId);
        if (j.legacyAxis) errors.push(`Wall #${branch.id}: reattach the T-junction to the host wall face.`);
        const actual = pxToCm(worldToWallLocal(host, j.x, j.y).along);
        if (Math.abs(actual - j.offsetCm) > 0.001)
            errors.push(`Wall #${branch.id}: align the T-junction with a highlighted host-wall cell.`);
        if (host.openings.some(op => {
            const b = getOpeningBoundsCm(op);
            return b.startCm < j.cellEndCm && b.endCm > j.cellStartCm && op.startRow <= getWallRows(branch);
        })) errors.push(`Wall #${branch.id}: T-junction intersects an opening in wall #${host.id}.`);
    }
    // Reject duplicate/overlapping collinear walls and unsupported X intersections.
    for (let i = 0; i < state.walls.length; i++) for (let k = i + 1; k < state.walls.length; k++) {
        const a = state.walls[i], b = state.walls[k];
        const p = worldToWallLocal(a, b.x1, b.y1), q = worldToWallLocal(a, b.x2, b.y2);
        const len = getWallLength(a), epsilon = 0.01;
        if (Math.abs(p.perp) < epsilon && Math.abs(q.perp) < epsilon) {
            if (Math.min(Math.max(p.along, q.along), len) - Math.max(Math.min(p.along, q.along), 0) > epsilon)
                errors.push(`Walls #${a.id} and #${b.id} overlap. Remove duplicate masonry.`);
            else if (Math.abs(Math.min(p.along, q.along) - len) < epsilon || Math.abs(Math.max(p.along, q.along)) < epsilon)
                errors.push(`Walls #${a.id} and #${b.id}: use one continuous wall instead of a collinear joint.`);
        } else if (Math.abs(p.perp - q.perp) < epsilon && Math.abs(p.perp) < WALL_THICKNESS && Math.min(Math.max(p.along, q.along), len) - Math.max(Math.min(p.along, q.along), 0) > epsilon) {
            errors.push(`Walls #${a.id} and #${b.id} are closer than the nominal wall thickness. Separate them.`);
        } else if (arePerpendicular(a, b) && p.perp * q.perp < -epsilon && p.along > epsilon && p.along < len - epsilon) {
            errors.push(`Walls #${a.id} and #${b.id}: X intersections are unsupported; use L or T junctions.`);
        }
    }
    // Three walls at the same corner are not an ordinary two-wall L connection.
    for (const j of joints.filter(j => j.type === 'L')) {
        const touching = state.walls.filter(w => dist(w.x1, w.y1, j.x, j.y) < 0.01 || dist(w.x2, w.y2, j.x, j.y) < 0.01);
        if (touching.length > 2) errors.push('A corner contains more than two walls. Use a T-junction on the host wall.');
    }
    warnings.push('Nominal 400/200 mm coordination; physical units 400/198 × 198 × 176 mm. Course height 179 mm. Mortar tolerances and joint width require customer confirmation.');
    warnings.push('Counts cover above-floor wall blocks, including block lintels. Foundations, gables, reinforcement, ties, concrete and waste allowance are excluded.');
    return { errors: [...new Set(errors)], warnings };
}

function updateProjectStatus() {
    const result = validateProject();
    const status = document.getElementById('projectStatus');
    status.replaceChildren();
    for (const message of result.errors.length ? result.errors : ['Layout valid within the MVP model.']) {
        const line = document.createElement('p');
        line.className = result.errors.length ? 'text-red-300' : 'text-emerald-400';
        line.textContent = message;
        status.appendChild(line);
    }
    document.getElementById('btnPrint').disabled = result.errors.length > 0;
    document.getElementById('btnExportCsv').disabled = result.errors.length > 0;
    document.getElementById('resultsStatus').textContent = result.errors.length ? 'Draft quantities — resolve errors below' : 'Calculated quantities · nominal model';
    if (result.errors.length) status.closest('details').open = true;
    const wall = getPartnerWall(state.selectedWallId);
    document.getElementById('btnAddOpening').disabled = !wall || getWallRows(wall) < 4 || !findFreeSlotForOpening(wall, HALF_BLOCK_CM);
}

function getProjectReport() {
    const validation = validateProject();
    if (validation.errors.length) { showToast('Resolve validation errors before exporting results.'); return null; }
    const joints = getAllWallJoints();
    return state.walls.map(w => ({ id: w.id, length: getWallLengthCm(w), height: formatCm(getWallRows(w) * COURSE_HEIGHT_CM), rows: getWallRows(w), controls: getControlJoints(w), ...calculateWallBlocks(w, joints) }));
}

function downloadFile(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
    const rows = getProjectReport(); if (!rows) return;
    const total = rows.reduce((s, r) => [s[0] + r.fullCount, s[1] + r.halfCount], [0, 0]);
    const lines = ['Wall,Length cm,Height cm,Courses,Full blocks,Half blocks,Total blocks,Control joints cm', ...rows.map(r => [r.id, r.length, r.height, r.rows, r.fullCount, r.halfCount, r.totalCount, r.controls.join(';')].join(',')), `TOTAL,,,,${total[0]},${total[1]},${total[0] + total[1]},`, '', 'MODEL: nominal 400/200 mm; physical 400/198 x 198 x 176 mm; course 179 mm.', 'Above-floor wall blocks only. Includes block lintels; excludes foundations/gables/reinforcement/concrete/waste. Customer confirmation required for mortar and joint details.'];
    downloadFile('blocks-materials.csv', '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

function printReport() {
    const rows = getProjectReport(); if (!rows) return;
    const report = document.getElementById('printReport');
    report.replaceChildren();
    const title = document.createElement('h1'); title.textContent = 'BlocksCalculator — Material quantities'; report.appendChild(title);
    const table = document.createElement('table');
    const header = document.createElement('tr');
    for (const label of ['Wall', 'Length (cm)', 'Height (cm)', 'Full', 'Half', 'Total', 'Control joints (cm)']) { const th = document.createElement('th'); th.textContent = label; header.appendChild(th); }
    table.appendChild(header);
    let full = 0, half = 0;
    for (const row of rows) {
        const tr = document.createElement('tr');
        for (const value of [row.id, row.length, row.height, row.fullCount, row.halfCount, row.totalCount, row.controls.join(', ') || '—']) { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }
        table.appendChild(tr); full += row.fullCount; half += row.halfCount;
    }
    report.appendChild(table);
    const total = document.createElement('p'); total.textContent = `Full: ${full} · Half: ${half} · Total: ${full + half}`; report.appendChild(total);
    for (const warning of validateProject().warnings) { const p = document.createElement('p'); p.textContent = warning; report.appendChild(p); }
    window.print();
}

function projectSnapshot() {
    return {version: PROJECT_VERSION, model: 'nominal-400-200-mm', planGeometry: 'face-t-v2', walls: state.walls, nextId: state.nextId, totalWallRows: state.totalWallRows};
}
function saveProjectLocally() {
    commitEditHistory();
    try { localStorage.setItem('blocks-calculator-v1', JSON.stringify(projectSnapshot())); } catch { /* Saving is optional when storage is unavailable. */ }
}
function restoreProject(data) {
    if (!data || data.version !== PROJECT_VERSION || data.model !== 'nominal-400-200-mm' || !Array.isArray(data.walls) || data.walls.length > 200) throw new Error('Unsupported project format (maximum 200 walls).');
    const ids = new Set();
    const takeId = id => { if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) throw new Error('Invalid or duplicate object ID.'); ids.add(id); return id; };
    const rows = data.totalWallRows;
    if (!Number.isInteger(rows) || rows < 2 || rows > MAX_WALL_ROWS) throw new Error('Invalid default height.');
    const walls = data.walls.map(w => {
        const id = takeId(w.id);
        if (![w.x1, w.y1, w.x2, w.y2].every(x => Number.isFinite(x) && Math.abs(x) < 100000) || !Array.isArray(w.openings) || w.openings.length > 100 || !Number.isInteger(w.rows) || w.rows < 2 || w.rows > MAX_WALL_ROWS) throw new Error('Invalid wall geometry or height.');
        const raw = pxToCm(dist(w.x1,w.y1,w.x2,w.y2));
        if (raw < MIN_WALL_CM || raw > MAX_WALL_CM || Math.abs(raw / BLOCK_GRID_CM - Math.round(raw / BLOCK_GRID_CM)) > 0.00001 || Math.abs((w.x2-w.x1)*(w.y2-w.y1)) > 0.001) throw new Error('Wall dimensions must follow the 20 cm grid and 90° angles.');
        const openings = w.openings.map(o => {
            const oid = takeId(o.id);
            const start = pxToCm(o.offset - o.length / 2), width = pxToCm(o.length);
            if (!Number.isFinite(start) || !Number.isFinite(width) || width < HALF_BLOCK_CM || start < HALF_BLOCK_CM || start + width > raw - HALF_BLOCK_CM || Math.abs(start / 20 - Math.round(start / 20)) > 0.00001 || Math.abs(width / 20 - Math.round(width / 20)) > 0.00001 || !Number.isInteger(o.startRow) || !Number.isInteger(o.rowCount) || o.startRow < 1 || o.rowCount < 1 || o.startRow + o.rowCount - 1 > MAX_WALL_ROWS || !['window', 'door', 'arch'].includes(o.type)) throw new Error('Invalid opening dimensions.');
            return {id: oid, offset: o.offset, length: o.length, type: o.type, startRow: o.startRow, rowCount: o.rowCount};
        });
        return {id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, rows: w.rows, openings};
    });
    // Apply only after the entire file has passed structural checks.
    state.walls = walls; state.totalWallRows = rows; state.nextId = Math.max(0, ...ids) + 1;
    state.selectedWallId = walls[0]?.id ?? null; state.selectedOpeningId = null;
    if (data.planGeometry !== 'face-t-v2') migrateLegacyTConnections();
    document.getElementById('sliderTotalRows').value = rows;
}

function migrateLegacyTConnections() {
    const joints = getAllWallJoints();
    for (const wall of state.walls) {
        const ends = joints.filter(j => j.type === 'T' && j.branchWallId === wall.id && j.legacyAxis);
        if (!ends.length) continue;
        // A branch tied at its other end to an L corner needs a manual resize;
        // don't silently break that connection during migration.
        if (ends.length === 1 && joints.some(j => j.type === 'L' && (j.wallA === wall.id || j.wallB === wall.id))) continue;
        const length = getWallLength(wall), ux = (wall.x2 - wall.x1) / length, uy = (wall.y2 - wall.y1) / length;
        const half = WALL_THICKNESS / 2;
        if (ends.length === 2) {
            if (length - WALL_THICKNESS < cmToPx(getMinAllowedWallLengthCm(wall))) continue;
            wall.x1 += ux * half; wall.y1 += uy * half;
            wall.x2 -= ux * half; wall.y2 -= uy * half;
        } else {
            const sign = ends[0].branchEnd === 'start' ? 1 : -1;
            wall.x1 += sign * ux * half; wall.y1 += sign * uy * half;
            wall.x2 += sign * ux * half; wall.y2 += sign * uy * half;
        }
    }
}

function bindProjectEvents() {
    document.getElementById('planCourse').addEventListener('change', e => {
        state.activePlanRow = Number(e.target.value);
        render();
    });
    // The elevation uses the same opening bounds as the plan and property panel.
    let elevationDrag = null;
    state.cancelElevationDrag = () => { elevationDrag = null; };
    state.elevCanvas.style.touchAction = 'none';
    state.elevCanvas.addEventListener('pointerdown', e => {
        const g = state.elevationGeometry;
        if (!g) return;
        const wall = getPartnerWall(g.wallId); if (!wall) return;
        const rect = state.elevCanvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - g.startX) / g.scaleX;
        const row = getWallRows(wall) - Math.floor((e.clientY - rect.top - g.padTop) / g.rowH);
        const opening = wall.openings.find(op => {
            const b = getOpeningBoundsCm(op);
            return x >= b.startCm && x <= b.endCm && row >= op.startRow && row < op.startRow + op.rowCount;
        });
        if (!opening) return;
        state.selectedWallId = wall.id; state.selectedOpeningId = opening.id;
        elevationDrag = {wall, opening, startX: e.clientX, startY: e.clientY, startCm: getOpeningBoundsCm(opening).startCm, startRow: opening.startRow, g};
        state.elevCanvas.setPointerCapture(e.pointerId);
        updateInspector(); render();
    });
    state.elevCanvas.addEventListener('pointermove', e => {
        if (!elevationDrag) return;
        const {wall, opening, startX, startY, startCm, startRow, g} = elevationDrag;
        const limits = getOpeningLimitsCm(wall, opening), width = getOpeningBoundsCm(opening).lenCm;
        const desired = snapCmToGrid(startCm + (e.clientX - startX) / g.scaleX);
        setOpeningBoundsCm(opening, clamp(desired, limits.minCm, limits.maxCm - width), width);
        opening.startRow = clamp(startRow - Math.round((e.clientY - startY) / g.rowH), 1, getWallRows(wall) - opening.rowCount + 1);
        updateInspector(); render();
    });
    const finishElevationDrag = () => { if (elevationDrag) { elevationDrag = null; saveProjectLocally(); } };
    state.elevCanvas.addEventListener('pointerup', finishElevationDrag);
    state.elevCanvas.addEventListener('pointercancel', finishElevationDrag);
    document.getElementById('inputWallRows').addEventListener('change', e => {
        const wall = getPartnerWall(state.selectedWallId); if (!wall) return;
        const rows = Number(e.target.value);
        if (!Number.isInteger(rows) || rows < 2 || rows > MAX_WALL_ROWS) { showToast('Use 2–17 whole courses.'); updateInspector(); return; }
        wall.rows = rows; clampWallOpenings(wall); updateInspector(); render(); saveProjectLocally();
    });
    document.getElementById('btnPrint').addEventListener('click', printReport);
    document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
    document.getElementById('btnSaveProject').addEventListener('click', () => downloadFile('blocks-project.json', JSON.stringify(projectSnapshot(), null, 2), 'application/json'));
    document.getElementById('btnLoadProject').addEventListener('click', () => document.getElementById('projectFile').click());
    document.getElementById('projectFile').addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        try {
            if (file.size > 2_000_000) throw new Error('Project file is too large.');
            restoreProject(JSON.parse(await file.text())); resetZoom(); updateInspector(); render(); saveProjectLocally(); showToast('Project loaded.');
        } catch (error) { showToast(error.message); }
        e.target.value = '';
    });
    document.addEventListener('change', saveProjectLocally);
    document.addEventListener('click', () => { if (!state.dragState) saveProjectLocally(); });
    window.addEventListener('beforeunload', saveProjectLocally);
}
