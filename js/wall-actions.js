function addNewWall() {
            const cx = state.canvas.width / 2;
            const cy = state.canvas.height / 2;
            const offset = (state.walls.length % 5) * 30;
            const lenPx = cmToPx(400); // 400 см по умолчанию

            const newWall = {
                id: state.nextId++,
                x1: cx - lenPx / 2 + offset,
                y1: cy + offset,
                x2: cx + lenPx / 2 + offset,
                y2: cy + offset,
                openings: []
            };
            state.walls.push(newWall);
            state.selectedWallId = newWall.id;
            state.selectedOpeningId = null;
            updateInspector();
            render();
            showToast('Added a 400 cm wall');
        }

// function addTPartitionWall() {
//             const hostWall = state.walls.find(w => w.id === state.selectedWallId) || state.walls[0];
//             if (!hostWall) {
//                 addNewWall();
//                 return;
//             }

//             const hostLenCm = getWallLengthCm(hostWall);
//             // Snap to a 198 cm half-block cell near the center of the wall.
//             const cell = snapToHalfBlockCellCenterCm(hostLenCm / 2, hostLenCm);
//             const attachPt = wallLocalToWorld(hostWall, cmToPx(cell.centerCm), 0);

//             const hostAngle = getWallAngleRad(hostWall);
//             const perpAngle = hostAngle + Math.PI / 2;
//             const branchLenPx = cmToPx(300);

//             const newWall = {
//                 id: state.nextId++,
//                 x1: attachPt.x,
//                 y1: attachPt.y,
//                 x2: attachPt.x + Math.cos(perpAngle) * branchLenPx,
//                 y2: attachPt.y + Math.sin(perpAngle) * branchLenPx,
//                 openings: [
//                     {
//                         id: state.nextId++,
//                         offset: cmToPx(150),
//                         length: cmToPx(100),
//                         type: 'door',
//                         startRow: 1,
//                         rowCount: Math.min(7, state.totalWallRows)
//                     }
//                 ]
//             };
//             clampWallOpenings(newWall);
//             state.walls.push(newWall);
//             state.selectedWallId = newWall.id;
//             state.selectedOpeningId = newWall.openings[0].id;
//             updateInspector();
//             render();
//             showToast(`Т-перегородка приклеена к половине блока (${cell.cellStartCm}–${cell.cellEndCm} см) стены #${hostWall.id}`);
//         }

function addOpeningToSelectedWall() {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;

            const slot = findFreeSlotForOpening(wall, FULL_BLOCK_CM);
            if (!slot) {
                showToast('No free space (min. 198 cm) for a non-overlapping opening!');
                return;
            }

            const newOp = {
                id: state.nextId++,
                offset: cmToPx(slot.startCm + slot.lenCm / 2),
                length: cmToPx(slot.lenCm),
                type: 'window',
                startRow: 4,
                rowCount: Math.min(4, Math.max(1, state.totalWallRows - 4))
            };
            wall.openings.push(newOp);
            clampWallOpenings(wall);
            state.selectedOpeningId = newOp.id;
            updateInspector();
            render();
            showToast(`Added a ${slot.lenCm} cm opening (position ${slot.startCm}–${slot.startCm + slot.lenCm} cm)`);
        }

function loadDemoHouse() {
            state.walls = [];
            state.nextId = 1;

            const cx = Math.round((state.canvas.width / 2) / HALF_BLOCK_PX) * HALF_BLOCK_PX;
            const cy = Math.round((state.canvas.height / 2) / HALF_BLOCK_PX) * HALF_BLOCK_PX;

            const wPx = cmToPx(2400);
            const hPx = cmToPx(1600);

            const leftX = cx - wPx / 2;
            const rightX = cx + wPx / 2;
            const topY = cy - hPx / 2;
            const botY = cy + hPx / 2;

            // Top wall with two non-overlapping windows.
            const wTop = {
                id: state.nextId++,
                x1: leftX, y1: topY,
                x2: rightX, y2: topY,
                openings: [
                    { id: state.nextId++, offset: cmToPx(600), length: cmToPx(400), type: 'window', startRow: 4, rowCount: 4 },
                    { id: state.nextId++, offset: cmToPx(1800), length: cmToPx(400), type: 'window', startRow: 4, rowCount: 4 }
                ]
            };

            // Bottom wall with a door and a window.
            const wBot = {
                id: state.nextId++,
                x1: leftX, y1: botY,
                x2: rightX, y2: botY,
                openings: [
                    { id: state.nextId++, offset: cmToPx(600), length: cmToPx(400), type: 'door', startRow: 1, rowCount: 7 },
                    { id: state.nextId++, offset: cmToPx(1800), length: cmToPx(600), type: 'window', startRow: 4, rowCount: 4 }
                ]
            };

            // Left wall.
            const wLeft = {
                id: state.nextId++,
                x1: leftX, y1: topY,
                x2: leftX, y2: botY,
                openings: [
                    { id: state.nextId++, offset: cmToPx(800), length: cmToPx(400), type: 'window', startRow: 4, rowCount: 4 }
                ]
            };

            // Right wall.
            const wRight = {
                id: state.nextId++,
                x1: rightX, y1: topY,
                x2: rightX, y2: botY,
                openings: []
            };

            // Internal partition attached at the center of a valid half-block cell.
            const tCell = snapToHalfBlockCellCenterCm(1200, 2400);
            const tCellCenterX = leftX + cmToPx(tCell.centerCm);
            const wTPartition = {
                id: state.nextId++,
                x1: tCellCenterX, y1: topY,
                x2: tCellCenterX, y2: botY,
                openings: [
                    { id: state.nextId++, offset: cmToPx(800), length: cmToPx(400), type: 'arch', startRow: 1, rowCount: 7 }
                ]
            };

            state.walls.push(wTop, wBot, wLeft, wRight, wTPartition);
            state.walls.forEach(w => clampWallOpenings(w));

            state.selectedWallId = wTop.id;
            state.selectedOpeningId = wTop.openings[0].id;
            updateInspector();
            render();
        }
