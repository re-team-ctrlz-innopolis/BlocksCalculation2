function addNewWall() {
            const cx = state.canvas.width / 2;
            const cy = state.canvas.height / 2;
            const offset = (state.walls.length % 5) * 30;
            const lenPx = mmToPx(FULL_BLOCK_MM);

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
            showToast('Added a 400 mm wall');
        }

// function addTPartitionWall() {
//             const hostWall = state.walls.find(w => w.id === state.selectedWallId) || state.walls[0];
//             if (!hostWall) {
//                 addNewWall();
//                 return;
//             }

//             const hostLenMm = getWallLengthMm(hostWall);
//             // Snap to a 200 mm half-block cell near the center of the wall.
//             const cell = snapToHalfBlockCellCenterMm(hostLenMm / 2, hostLenMm);
//             const attachPt = wallLocalToWorld(hostWall, mmToPx(cell.centerMm), 0);

//             const hostAngle = getWallAngleRad(hostWall);
//             const perpAngle = hostAngle + Math.PI / 2;
//             const branchLenPx = mmToPx(300);

//             const newWall = {
//                 id: state.nextId++,
//                 x1: attachPt.x,
//                 y1: attachPt.y,
//                 x2: attachPt.x + Math.cos(perpAngle) * branchLenPx,
//                 y2: attachPt.y + Math.sin(perpAngle) * branchLenPx,
//                 openings: [
//                     {
//                         id: state.nextId++,
//                         offset: mmToPx(150),
//                         length: mmToPx(100),
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
//             showToast(`T-partition attached to a half-block cell (${cell.cellStartMm}–${cell.cellEndMm} mm) on wall #${hostWall.id}`);
//         }

function addOpeningToSelectedWall() {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;

            const slot = findFreeSlotForOpening(wall, FULL_BLOCK_MM);
            if (!slot) {
                showToast('No free space (min. 200 mm) for a non-overlapping opening!');
                return;
            }

            const newOp = {
                id: state.nextId++,
                offset: mmToPx(slot.startMm + slot.lenMm / 2),
                length: mmToPx(slot.lenMm),
                type: 'window',
                startRow: 2,
                rowCount: Math.min(4, Math.max(1, state.totalWallRows - 1))
            };
            wall.openings.push(newOp);
            clampWallOpenings(wall);
            state.selectedOpeningId = newOp.id;
            updateInspector();
            render();
            showToast(`Added a ${slot.lenMm} mm opening (position ${slot.startMm}–${slot.startMm + slot.lenMm} mm)`);
        }

function loadDemoHouse() {
            state.walls = [];
            state.nextId = 1;

            const cx = Math.round((state.canvas.width / 2) / HALF_BLOCK_PX) * HALF_BLOCK_PX;
            const cy = Math.round((state.canvas.height / 2) / HALF_BLOCK_PX) * HALF_BLOCK_PX;

            const wPx = mmToPx(2400);
            const hPx = mmToPx(1600);

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
                    { id: state.nextId++, offset: mmToPx(600), length: mmToPx(400), type: 'window', startRow: 4, rowCount: 4 },
                    { id: state.nextId++, offset: mmToPx(1800), length: mmToPx(400), type: 'window', startRow: 4, rowCount: 4 }
                ]
            };

            // Bottom wall with a door and a window.
            const wBot = {
                id: state.nextId++,
                x1: leftX, y1: botY,
                x2: rightX, y2: botY,
                openings: [
                    { id: state.nextId++, offset: mmToPx(600), length: mmToPx(400), type: 'door', startRow: 1, rowCount: 7 },
                    { id: state.nextId++, offset: mmToPx(1800), length: mmToPx(600), type: 'window', startRow: 4, rowCount: 4 }
                ]
            };

            // Left wall.
            const wLeft = {
                id: state.nextId++,
                x1: leftX, y1: topY,
                x2: leftX, y2: botY,
                openings: [
                    { id: state.nextId++, offset: mmToPx(800), length: mmToPx(400), type: 'window', startRow: 4, rowCount: 4 }
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
            const tCell = snapToHalfBlockCellCenterMm(1200, 2400);
            const tCellCenterX = leftX + mmToPx(tCell.centerMm);
            const wTPartition = {
                id: state.nextId++,
                x1: tCellCenterX, y1: topY,
                x2: tCellCenterX, y2: botY,
                openings: [
                    { id: state.nextId++, offset: mmToPx(800), length: mmToPx(400), type: 'window', startRow: 2, rowCount: 4 }
                ]
            };

            state.walls.push(wTop, wBot, wLeft, wRight, wTPartition);
            state.walls.forEach(w => clampWallOpenings(w));

            state.selectedWallId = wTop.id;
            state.selectedOpeningId = wTop.openings[0].id;
            updateInspector();
            render();
        }
