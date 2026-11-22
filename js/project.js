// Customer rules and the explicitly limited, nominal coordination model.
function formatCm(value) { return Number(value.toFixed(1)); }
function getWallRows(wall) { return wall.rows ?? state.totalWallRows; }
function getPartnerWall(id) { return state.walls.find(w => w.id === id); }
function getMigrationMessages() {
    // Older saves keep wall IDs in their notices. Resolve them against the current list.
    return state.migrationNotes.flatMap(note => {
        let missingWall = false;
        const message = note.replace(/\bWall #(\d+)/g, (_, id) => {
            const number = getWallNumber(Number(id));
            if (number === null) missingWall = true;
            return `Wall #${number}`;
        });
        return missingWall ? [] : [message];
    });
}
function arePerpendicular(a, b) {
    return Math.abs(Math.cos(getWallAngleRad(a) - getWallAngleRad(b))) < 0.00001;
}

function getControlJoints(wall) {
    const length = getWallLengthCm(wall);
    if (length <= MAX_CONTROL_SECTION_CM) return [];
    const fixedJoints = [];
    for (let jointCm = MAX_CONTROL_SECTION_CM; jointCm < length; jointCm += MAX_CONTROL_SECTION_CM) {
        fixedJoints.push(jointCm);
    }

    const candidates = [0];
    for (let jointCm = MIN_CONTROL_END_DISTANCE_CM; jointCm <= length - MIN_CONTROL_END_DISTANCE_CM; jointCm += BLOCK_GRID_CM) {
        const conflictsWithOpening = wall.openings.some(op => {
            const bounds = getOpeningBoundsCm(op);
            return bounds.startCm < jointCm + 2 * HALF_BLOCK_CM &&
                bounds.endCm > jointCm - 2 * HALF_BLOCK_CM;
        });
        if (!conflictsWithOpening) candidates.push(jointCm);
    }
    candidates.push(length);

    const best = candidates.map(() => null);
    best[0] = {jointCount: 0, shift: 0, previous: -1};
    for (let i = 1; i < candidates.length; i++) {
        const position = candidates[i];
        const isEnd = i === candidates.length - 1;
        const shift = isEnd ? 0 : Math.min(...fixedJoints.map(jointCm => Math.abs(position - jointCm)));
        for (let previous = i - 1; previous >= 0; previous--) {
            if (position - candidates[previous] > MAX_CONTROL_SECTION_CM) break;
            if (!best[previous]) continue;
            const candidate = {
                jointCount: best[previous].jointCount + (isEnd ? 0 : 1),
                shift: best[previous].shift + shift,
                previous
            };
            if (!best[i] || candidate.jointCount < best[i].jointCount ||
                (candidate.jointCount === best[i].jointCount && candidate.shift < best[i].shift)) {
                best[i] = candidate;
            }
        }
    }

    const endIndex = candidates.length - 1;
    if (!best[endIndex]) return fixedJoints;
    const joints = [];
    for (let index = best[endIndex].previous; index > 0; index = best[index].previous) {
        joints.push(candidates[index]);
    }
    return joints.reverse();
}

function validateProject() {
    const errors = [], warnings = [], notices = [];
    const joints = getAllWallJoints();
    if (!state.walls.length) errors.push('Add at least one wall.');
    for (const wall of state.walls) {
        const label = `Wall #${getWallNumber(wall.id)}`;
        const rawLength = pxToCm(getWallLength(wall));
        if (Math.abs(rawLength / BLOCK_GRID_CM - Math.round(rawLength / BLOCK_GRID_CM)) > 0.00001 || rawLength < MIN_WALL_CM || rawLength > MAX_WALL_CM)
            errors.push(`${label}: length must be ${MIN_WALL_MM}–${MAX_WALL_MM} mm in 200 mm modules. No cutting.`);
        if (Math.abs(getWallAngleRad(wall) / (Math.PI / 2) - Math.round(getWallAngleRad(wall) / (Math.PI / 2))) > 0.00001)
            errors.push(`${label}: only 90° rotations are supported.`);
        if (!isWallOnGrid(wall))
            errors.push(`${label}: align the wall faces with the common 200 mm grid. Move the wall to snap it into place.`);
        if (!Number.isInteger(getWallRows(wall)) || getWallRows(wall) < 2 || getWallRows(wall) > MAX_WALL_ROWS)
            errors.push(`${label}: height must be 2–${MAX_WALL_ROWS} courses (up to ${MAX_WALL_HEIGHT_CM / 100} m, whole courses only).`);
        const length = getWallLengthCm(wall);
        for (let row = 1; row <= getWallRows(wall); row++) {
            const corner = getWallEndCornerState(wall, row, joints);
            if (corner.startInsetCm + corner.endInsetCm > length) {
                errors.push(`${label}: not enough length for both L-corners in course ${row}. Lengthen the wall or change its connections.`);
                break;
            }
        }
        for (const op of wall.openings) {
            const openingNumber = getOpeningNumber(wall.id, op.id);
            const b = getOpeningBoundsCm(op);
            if (b.startCm < HALF_BLOCK_CM || b.endCm > length - HALF_BLOCK_CM)
                errors.push(`${label}: opening #${openingNumber} needs a 200 mm pier at both wall ends.`);
            if (!Number.isInteger(op.startRow) || !Number.isInteger(op.rowCount) || op.startRow < 1 || op.rowCount < 1 || op.startRow + op.rowCount - 1 > getWallRows(wall))
                errors.push(`${label}: opening #${openingNumber} is outside the wall height.`);
            if (op.type === 'door' && op.startRow !== 1)
                errors.push(`${label}: door opening #${openingNumber} must start at course 1 (floor level).`);
            if (op.type === 'window' && op.startRow < 2)
                errors.push(`${label}: window opening #${openingNumber} must start at course 2 or above.`);
            if (b.lenCm > 150) notices.push(`${label}: opening #${openingNumber} is wider than 1500 mm and requires a separate lintel or beam. Lintel/beam design and quantities are not calculated.`);
            const openingTopRow = op.startRow + op.rowCount - 1;
            const coursesAbove = getWallRows(wall) - openingTopRow;
            if (coursesAbove < 3)
                errors.push(`${label}: leave at least three courses above opening #${openingNumber} (${Math.max(0, coursesAbove)} available).`);
            for (const other of wall.openings) {
                if (other.id <= op.id) continue;
                if (openingsOverlap(op, other)) errors.push(`${label}: openings #${openingNumber} and #${getOpeningNumber(wall.id, other.id)} overlap.`);
            }
            const lintelStart = getOpeningRowRange(op).endRow;
            if (wall.openings.some(other => other.id !== op.id && openingWidthsOverlap(op, other) &&
                getOpeningRowRange(other).startRow < lintelStart + 3 && getOpeningRowRange(other).endRow > lintelStart))
                errors.push(`${label}: leave at least three courses above opening #${openingNumber} before another opening.`);
        }
        const controls = [0, ...getControlJoints(wall), length];
        if (controls.length > 2 && (controls[1] < MIN_CONTROL_END_DISTANCE_CM ||
            length - controls[controls.length - 2] < MIN_CONTROL_END_DISTANCE_CM))
            errors.push(`${label}: cannot place control joints at least ${MIN_CONTROL_END_DISTANCE_MM} mm from wall ends while keeping sections ≤5 m. Move or resize the openings.`);
        if (controls.some((x, i) => i && x - controls[i - 1] > MAX_CONTROL_SECTION_CM))
            errors.push(`${label}: cannot place control joints with sections ≤5 m clear of openings and T-joints. Move or resize the openings.`);
        for (const jointCm of getControlJoints(wall)) {
            if (wall.openings.some(op => {
                const bounds = getOpeningBoundsCm(op);
                return bounds.startCm < jointCm + 2 * HALF_BLOCK_CM &&
                    bounds.endCm > jointCm - 2 * HALF_BLOCK_CM;
            })) {
                errors.push(`${label}: cannot shift the control joint clear of openings near ${jointCm * MM_PER_CM} mm. Move or resize the openings.`);
            }
        }
        if (calculateWallBlocks(wall, joints).unfilledCm > 0)
            errors.push(`${label}: the layout leaves unfilled masonry. Use 200 mm modules.`);
    }
    for (const j of joints.filter(j => j.type === 'T')) {
        const host = getPartnerWall(j.hostWallId), branch = getPartnerWall(j.branchWallId);
        if (j.legacyAxis) errors.push(`Wall #${getWallNumber(branch.id)}: reattach the T-junction to the host wall face.`);
        const actual = pxToCm(worldToWallLocal(host, j.x, j.y).along);
        if (Math.abs(actual - j.offsetCm) > 0.001)
            errors.push(`Wall #${getWallNumber(branch.id)}: align the T-junction with a highlighted host-wall cell.`);
        if (host.openings.some(op => {
            const b = getOpeningBoundsCm(op);
            return b.startCm < j.cellEndCm && b.endCm > j.cellStartCm && op.startRow <= getWallRows(branch);
        })) errors.push(`Wall #${getWallNumber(branch.id)}: T-junction intersects an opening in wall #${getWallNumber(host.id)}.`);
    }
    // Reject duplicate/overlapping collinear walls and unsupported X intersections.
    for (let i = 0; i < state.walls.length; i++) for (let k = i + 1; k < state.walls.length; k++) {
        const a = state.walls[i], b = state.walls[k];
        const p = worldToWallLocal(a, b.x1, b.y1), q = worldToWallLocal(a, b.x2, b.y2);
        const len = getWallLength(a), epsilon = 0.01;
        const sharedCorner = joints.some(j => j.type === 'L' &&
            ((j.wallA === a.id && j.wallB === b.id) || (j.wallA === b.id && j.wallB === a.id)));
        if (Math.abs(p.perp) < epsilon && Math.abs(q.perp) < epsilon) {
            if (Math.min(Math.max(p.along, q.along), len) - Math.max(Math.min(p.along, q.along), 0) > epsilon)
                errors.push(`Walls #${getWallNumber(a.id)} and #${getWallNumber(b.id)} overlap. Remove duplicate masonry.`);
            else if (Math.abs(Math.min(p.along, q.along) - len) < epsilon || Math.abs(Math.max(p.along, q.along)) < epsilon)
                errors.push(`Walls #${getWallNumber(a.id)} and #${getWallNumber(b.id)}: use one continuous wall instead of a collinear joint.`);
        } else if (Math.abs(p.perp - q.perp) < epsilon && Math.abs(p.perp) < WALL_THICKNESS && Math.min(Math.max(p.along, q.along), len) - Math.max(Math.min(p.along, q.along), 0) > epsilon) {
            errors.push(`Walls #${getWallNumber(a.id)} and #${getWallNumber(b.id)} are closer than the nominal wall thickness. Separate them.`);
        } else if (!sharedCorner && arePerpendicular(a, b) && p.perp * q.perp < -epsilon && p.along > epsilon && p.along < len - epsilon) {
            errors.push(`Walls #${getWallNumber(a.id)} and #${getWallNumber(b.id)}: X intersections are unsupported; use L or T junctions.`);
        } else if (arePerpendicular(a, b)) {
            // Project the perpendicular wall's full thickness onto wall A.
            // Axis-only checks miss overlaps beside or just beyond an endpoint.
            const half = WALL_THICKNESS / 2;
            const overlapAlong = Math.min(len, p.along + half) - Math.max(0, p.along - half);
            const overlapAcross = Math.min(half, Math.max(p.perp, q.perp)) - Math.max(-half, Math.min(p.perp, q.perp));
            // Supported L-corners share a nominal module, counted by one wall.
            // Face-to-face T-junctions only touch and have no area overlap.
            if (overlapAlong > epsilon && overlapAcross > epsilon && !sharedCorner)
                errors.push(`Walls #${getWallNumber(a.id)} and #${getWallNumber(b.id)} overlap outside a supported L-corner. Move them apart or reconnect them as an L or T junction.`);
        }
    }
    // Three walls at the same corner are not an ordinary two-wall L connection.
    for (const j of joints.filter(j => j.type === 'L')) {
        const touching = state.walls.filter(w => ['start', 'end'].some(end => {
            const cell = getWallEndCellCenter(w, end);
            return dist(cell.x, cell.y, j.x, j.y) < 0.01;
        }));
        if (touching.length > 2) errors.push('A corner contains more than two walls. Use a T-junction on the host wall.');
    }
    warnings.push('Full block: 400×200×200 mm; half block: 200×200×200 mm. One course is 200 mm. Mortar joints are not included in the dimensions or quantities.');
    warnings.push('Counts cover above-floor wall blocks, including block lintels. Foundations, gables, reinforcement, ties, concrete and waste allowance are excluded.');
    notices.push(...getMigrationMessages());
    warnings.push(...notices);
    return { errors: [...new Set(errors)], warnings, notices };
}

function updateProjectStatus() {
    const result = validateProject();
    const status = document.getElementById('projectStatus');
    status.replaceChildren();
    for (const message of result.errors) {
        const line = document.createElement('p');
        line.className = 'text-red-300';
        line.textContent = message;
        status.appendChild(line);
    }
    for (const message of result.notices) {
        const line = document.createElement('p');
        line.className = 'text-amber-300'; line.textContent = message; status.appendChild(line);
    }
    status.hidden = result.errors.length === 0 && result.notices.length === 0;
    document.getElementById('btnPrint').disabled = result.errors.length > 0;
    document.getElementById('btnExportCsv').disabled = result.errors.length > 0;
    const resultsStatus = document.getElementById('resultsStatus');
    resultsStatus.className = `export-status ${result.errors.length ? 'export-status-unavailable' : 'export-status-ready'}`;
    resultsStatus.textContent = result.errors.length ? 'Draft quantities — fix the issues below to export' : 'Ready to export';
    const wall = getPartnerWall(state.selectedWallId);
    document.getElementById('btnAddOpening').disabled = !wall || !findFreeSlotForOpening(wall, HALF_BLOCK_CM);
}

function getProjectReport() {
    const validation = validateProject();
    if (validation.errors.length) { showToast('Resolve validation errors before exporting results.'); return null; }
    const joints = getAllWallJoints();
    return state.walls.map(w => ({
        id: w.id,
        number: getWallNumber(w.id),
        length: Math.round(getWallLengthCm(w) * MM_PER_CM),
        height: Math.round(getWallRows(w) * COURSE_HEIGHT_CM * MM_PER_CM),
        rows: getWallRows(w),
        controls: getControlJoints(w).map(joint => Math.round(joint * MM_PER_CM)),
        ...calculateWallBlocks(w, joints)
    }));
}

function downloadFile(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function serializeCsvRows(rows) {
    const escape = value => {
        const text = String(value ?? '');
        return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    // Use one delimiter throughout; UTF-8 BOM preserves non-ASCII text in spreadsheet imports.
    return '\ufeff' + rows.map(row => row.map(escape).join(';')).join('\r\n') + '\r\n';
}

function exportCsv() {
    const rows = getProjectReport(); if (!rows) return;
    const total = rows.reduce((s, r) => [s[0] + r.fullCount, s[1] + r.halfCount], [0, 0]);
    const table = [
        ['Wall', 'Length (mm)', 'Height (mm)', 'Courses', 'Full blocks', 'Half blocks', 'Total blocks', 'Control joints (mm)'],
        ...rows.map(r => [r.number, r.length, r.height, r.rows, r.fullCount, r.halfCount, r.totalCount, r.controls.join(' | ')]),
        ['TOTAL', '', '', '', total[0], total[1], total[0] + total[1], '']
    ];
    // CSV contains only tabular data. Scope and model explanations remain in the print/PDF report.
    downloadFile('blocks-materials.csv', serializeCsvRows(table), 'text/csv;charset=utf-8');
}

function printReport() {
    const rows = getProjectReport(); if (!rows) return;
    const report = document.getElementById('printReport');
    report.replaceChildren();
    const title = document.createElement('h1'); title.textContent = 'BlocksCalculator — Material quantities'; report.appendChild(title);
    const table = document.createElement('table');
    const header = document.createElement('tr');
    for (const label of ['Wall', 'Length (mm)', 'Height (mm)', 'Full', 'Half', 'Total', 'Control joints (mm)']) { const th = document.createElement('th'); th.textContent = label; header.appendChild(th); }
    table.appendChild(header);
    let full = 0, half = 0;
    for (const row of rows) {
        const tr = document.createElement('tr');
        for (const value of [row.number, row.length, row.height, row.fullCount, row.halfCount, row.totalCount, row.controls.join(', ') || '—']) { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }
        table.appendChild(tr); full += row.fullCount; half += row.halfCount;
    }
    report.appendChild(table);
    const total = document.createElement('p'); total.textContent = `Full: ${full} · Half: ${half} · Total: ${full + half}`; report.appendChild(total);
    for (const warning of validateProject().warnings) { const p = document.createElement('p'); p.textContent = warning; report.appendChild(p); }
    window.print();
}

function projectSnapshot() {
    return {version: PROJECT_VERSION, model: 'nominal-400-200-mm', planGeometry: PLAN_GEOMETRY,
        walls: state.walls, nextId: state.nextId, totalWallRows: state.totalWallRows, migrationNotes: state.migrationNotes};
}
function saveProjectLocally() {
    commitEditHistory();
    try { localStorage.setItem(LOCAL_PROJECT_KEY, JSON.stringify(projectSnapshot())); } catch { /* Saving is optional when storage is unavailable. */ }
}
function restoreProject(data) {
    if (!data || data.version !== PROJECT_VERSION || data.model !== 'nominal-400-200-mm' || !Array.isArray(data.walls) || data.walls.length > 200) throw new Error('Unsupported project format (maximum 200 walls).');
    if (data.planGeometry != null && ![PLAN_GEOMETRY, 'face-t-v2'].includes(data.planGeometry)) throw new Error('Unsupported plan geometry.');
    const ids = new Set();
    const takeId = id => { if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) throw new Error('Invalid or duplicate object ID.'); ids.add(id); return id; };
    const rows = data.totalWallRows;
    if (!Number.isInteger(rows) || rows < 2 || rows > MAX_SAVED_WALL_ROWS) throw new Error('Invalid default height.');
    const walls = data.walls.map((w, wallIndex) => {
        const id = takeId(w.id);
        if (![w.x1, w.y1, w.x2, w.y2].every(x => Number.isFinite(x) && Math.abs(x) < 100000) || !Array.isArray(w.openings) || w.openings.length > 100 || !Number.isInteger(w.rows) || w.rows < 2 || w.rows > MAX_SAVED_WALL_ROWS) throw new Error('Invalid wall geometry or height.');
        const raw = pxToCm(dist(w.x1,w.y1,w.x2,w.y2));
        if (raw < MIN_WALL_CM || raw > MAX_WALL_CM || Math.abs(raw / BLOCK_GRID_CM - Math.round(raw / BLOCK_GRID_CM)) > 0.00001 || Math.abs((w.x2-w.x1)*(w.y2-w.y1)) > 0.001) throw new Error('Wall dimensions must follow the 200 mm grid and 90° angles.');
        const openings = w.openings.map(o => {
            const oid = takeId(o.id);
            const start = pxToCm(o.offset - o.length / 2), width = pxToCm(o.length);
            if (!Number.isFinite(start) || !Number.isFinite(width) || width < HALF_BLOCK_CM || start < HALF_BLOCK_CM || start + width > raw - HALF_BLOCK_CM || Math.abs(start / 20 - Math.round(start / 20)) > 0.00001 || Math.abs(width / 20 - Math.round(width / 20)) > 0.00001 || !Number.isInteger(o.startRow) || !Number.isInteger(o.rowCount) || o.startRow < 1 || o.rowCount < 1 || o.startRow + o.rowCount - 1 > MAX_SAVED_WALL_ROWS || !['window', 'door', 'arch'].includes(o.type)) throw new Error('Invalid opening dimensions.');
            const startRow = o.type === 'door' ? 1 : (o.type === 'window' ? Math.max(2, o.startRow) : o.startRow);
            const rowCount = Math.min(o.rowCount, w.rows - startRow + 1);
            if (rowCount < 1) throw new Error('Opening is outside the wall height.');
            return {id: oid, offset: o.offset, length: o.length, type: o.type, startRow, rowCount};
        });
        for (let i = 0; i < openings.length; i++) for (let j = i + 1; j < openings.length; j++) {
            if (openingsOverlap(openings[i], openings[j])) throw new Error(`Wall #${wallIndex + 1}: openings overlap. Import was cancelled.`);
        }
        return {id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, rows: w.rows, openings};
    });
    const migrationNotes = data.planGeometry === PLAN_GEOMETRY
        ? (Array.isArray(data.migrationNotes) ? data.migrationNotes.filter(s=>typeof s==='string').slice(0,201).map(s=>s.slice(0,300)) : [])
        : migrateLegacyGeometry(walls);
    // Apply only after structural checks and any geometry conversion succeed.
    state.walls = walls; state.totalWallRows = rows; state.nextId = Math.max(0, ...ids) + 1;
    state.migrationNotes = migrationNotes;
    state.selectedWallId = walls[0]?.id ?? null; state.selectedOpeningId = null;
    document.getElementById('sliderTotalRows').value = rows;
}

function bindFileMenuEvents() {
    const menu = document.getElementById('fileMenu');
    const trigger = menu.querySelector('summary');
    const actions = () => [...menu.querySelectorAll('button:not(:disabled)')];
    menu.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (button && !button.disabled) { menu.open = false; trigger.focus(); }
    });
    menu.addEventListener('keydown', e => {
        const buttons = actions();
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            menu.open = true;
            const next = index < 0 ? (e.key === 'ArrowDown' ? 0 : buttons.length - 1)
                : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next].focus();
        } else if (menu.open && (e.key === 'Home' || e.key === 'End')) {
            e.preventDefault();
            buttons[e.key === 'Home' ? 0 : buttons.length - 1].focus();
        }
    });
    menu.addEventListener('focusout', e => {
        if (e.relatedTarget && !menu.contains(e.relatedTarget)) menu.open = false;
    });
    document.addEventListener('pointerdown', e => {
        if (!menu.contains(e.target)) menu.open = false;
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && menu.open) {
            e.preventDefault(); menu.open = false; trigger.focus();
        }
    });
}

function bindProjectEvents() {
    bindFileMenuEvents();
    const elevationViewport = document.getElementById('elevationViewport');
    elevationViewport.addEventListener('wheel', event => {
        if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
        const maxScroll = elevationViewport.scrollWidth - elevationViewport.clientWidth;
        if (maxScroll <= 0) return;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? elevationViewport.clientWidth : 1;
        elevationViewport.scrollLeft = clamp(elevationViewport.scrollLeft + event.deltaY * unit, 0, maxScroll);
        event.preventDefault();
    }, { passive: false });
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
        state.elevCanvas.focus?.({preventScroll: true});
        state.selectedWallId = wall.id; state.selectedOpeningId = opening.id;
        elevationDrag = {wall, opening, startX: e.clientX, startY: e.clientY, startCm: getOpeningBoundsCm(opening).startCm, startRow: opening.startRow, g};
        state.elevCanvas.setPointerCapture(e.pointerId);
        updateInspector(); render();
    });
    state.elevCanvas.addEventListener('pointermove', e => {
        if (!elevationDrag) return;
        const {wall, opening, startX, startY, startCm, startRow, g} = elevationDrag;
        const width = getOpeningBoundsCm(opening).lenCm;
        const desired = snapCmToGrid(startCm + (e.clientX - startX) / g.scaleX);
        const desiredRow = opening.type === 'door' ? 1
            : clamp(startRow - Math.round((e.clientY - startY) / g.rowH), opening.type === 'window' ? 2 : 1, getWallRows(wall) - opening.rowCount + 1);
        tryUpdateOpening(wall, opening, {
            startCm: clamp(desired, HALF_BLOCK_CM, getWallLengthCm(wall) - HALF_BLOCK_CM - width),
            startRow: desiredRow
        });
        updateInspector(); render();
    });
    const finishElevationDrag = () => { if (elevationDrag) { elevationDrag = null; saveProjectLocally(); } };
    state.elevCanvas.addEventListener('pointerup', finishElevationDrag);
    state.elevCanvas.addEventListener('pointercancel', finishElevationDrag);
    document.getElementById('inputWallRows').addEventListener('change', e => {
        const wall = getPartnerWall(state.selectedWallId); if (!wall) return;
        const rows = Number(e.target.value);
        if (!Number.isInteger(rows) || rows < 2 || rows > MAX_WALL_ROWS) { showToast(`Use 2–${MAX_WALL_ROWS} whole courses (maximum ${MAX_WALL_HEIGHT_CM / 100} m).`); updateInspector(); return; }
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
