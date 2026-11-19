function addNewWall() {
            const cx = snapWorldCoordinate((state.canvas.width / 2 - state.panX) / state.zoom);
            const cy = snapWorldCoordinate((state.canvas.height / 2 - state.panY) / state.zoom);
            const offset = (state.walls.length % 5) * cmToPx(FULL_BLOCK_CM);
            const lenPx = cmToPx(FULL_BLOCK_CM);

            const newWall = {
                id: state.nextId++,
                x1: cx - lenPx / 2 + offset,
                y1: cy + offset,
                x2: cx + lenPx / 2 + offset,
                y2: cy + offset,
                rows: clamp(state.totalWallRows, 2, MAX_WALL_ROWS),
                openings: []
            };
            alignWallToGrid(newWall);
            state.walls.push(newWall);
            state.selectedWallId = newWall.id;
            state.selectedOpeningId = null;
            updateInspector();
            render();
            showToast('Added a 400 mm wall');
        }

function addOpeningToSelectedWall() {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall || getWallRows(wall) < 4) return;

            const slot = findFreeSlotForOpening(wall, 100);
            if (!slot) {
                showToast('No free space (min. 200 mm) for a non-overlapping opening!');
                return;
            }

            const newOp = {
                id: state.nextId++,
                offset: cmToPx(slot.startCm + slot.lenCm / 2),
                length: cmToPx(slot.lenCm),
                type: 'window',
                startRow: Math.min(4, getWallRows(wall) - 3),
                rowCount: Math.max(1, Math.min(4, getWallRows(wall) - Math.min(4, getWallRows(wall) - 3) - 2))
            };
            wall.openings.push(newOp);
            clampWallOpenings(wall);
            state.selectedOpeningId = newOp.id;
            updateInspector();
            render();
            showToast(`Added a ${slot.lenCm * MM_PER_CM} mm opening (position ${slot.startCm * MM_PER_CM}–${(slot.startCm + slot.lenCm) * MM_PER_CM} mm)`);
        }

function loadDemoHouse() {
    state.walls = [];
    state.migrationNotes = [];
    state.nextId = 1;
    state.totalWallRows = 17;
    document.getElementById('sliderTotalRows').value = 17;
    const cx = snapWorldCoordinate((state.canvas.width / 2 - state.panX) / state.zoom);
    const cy = snapWorldCoordinate((state.canvas.height / 2 - state.panY) / state.zoom);
    const x = cx - cmToPx(300), y = cy - cmToPx(200);
    const wall = (x1, y1, x2, y2, rows = 17) => ({id: state.nextId++, x1, y1, x2, y2, rows, openings: []});
    const half = WALL_THICKNESS / 2;
    const top = wall(x, y + half, x + cmToPx(600), y + half);
    const bottom = wall(x, y + cmToPx(400) - half, x + cmToPx(600), y + cmToPx(400) - half);
    const left = wall(x + half, y, x + half, y + cmToPx(400));
    const right = wall(x + cmToPx(600) - half, y, x + cmToPx(600) - half, y + cmToPx(400));
    const cell = snapToHalfBlockCellCenterCm(300, 600);
    const partition = wall(x + cmToPx(cell.centerCm), y + WALL_THICKNESS, x + cmToPx(cell.centerCm), y + cmToPx(400) - WALL_THICKNESS, 15);
    const opening = (host, start, width, startRow, rowCount, type) => host.openings.push({id: state.nextId++, offset: cmToPx(start + width / 2), length: cmToPx(width), startRow, rowCount, type});
    opening(top, 80, 120, 5, 6, 'window');
    opening(bottom, 80, 100, 1, 11, 'door');
    opening(left, 140, 120, 5, 6, 'window');
    opening(partition, 160, 80, 2, 10, 'window');
    state.walls.push(top, bottom, left, right, partition);
    state.selectedWallId = top.id;
    state.selectedOpeningId = top.openings[0].id;
    updateInspector(); render();
}
