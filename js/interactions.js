function getPointerPos(e) {
            const rect = state.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left - state.panX) / state.zoom,
                y: (clientY - rect.top - state.panY) / state.zoom
            };
        }

function handlePointerDown(e) {
            const pos = getPointerPos(e);
            state.activeSnapPreview = null;

            // 1. Если есть выбранная стена — сначала проверяем её элементы управления (ручки концов, поворот, проёмы)
            const selWall = state.walls.find(w => w.id === state.selectedWallId);
            if (selWall) {
                // Рычаг поворота
                const rotPos = getRotateHandlePos(selWall);
                if (dist(pos.x, pos.y, rotPos.x, rotPos.y) <= 12 / state.zoom) {
                    state.dragState = { type: 'rotate_wall', wall: selWall };
                    return;
                }

                // Концы выбранной стены
                if (dist(pos.x, pos.y, selWall.x1, selWall.y1) <= (ENDPOINT_RADIUS + 4) / state.zoom) {
                    state.dragState = { type: 'endpoint_1', wall: selWall };
                    return;
                }
                if (dist(pos.x, pos.y, selWall.x2, selWall.y2) <= (ENDPOINT_RADIUS + 4) / state.zoom) {
                    state.dragState = { type: 'endpoint_2', wall: selWall };
                    return;
                }

                // Проверка клика по проёму выбранной стены (или его краям для изменения ширины)
                const loc = worldToWallLocal(selWall, pos.x, pos.y);
                if (Math.abs(loc.perp) <= WALL_THICKNESS / 2 + 6 / state.zoom) {
                    for (const op of selWall.openings) {
                        const { startMm, endMm } = getOpeningBoundsMm(op);
                        const startPx = mmToPx(startMm);
                        const endPx = mmToPx(endMm);

                        if (Math.abs(loc.along - startPx) <= 8 / state.zoom) {
                            state.selectedOpeningId = op.id;
                            state.dragState = {
                                type: 'resize_opening_start',
                                wall: selWall,
                                opening: op,
                                fixedEndMm: endMm
                            };
                            updateInspector();
                            render();
                            return;
                        }
                        if (Math.abs(loc.along - endPx) <= 8 / state.zoom) {
                            state.selectedOpeningId = op.id;
                            state.dragState = {
                                type: 'resize_opening_end',
                                wall: selWall,
                                opening: op,
                                fixedStartMm: startMm
                            };
                            updateInspector();
                            render();
                            return;
                        }
                        if (loc.along >= startPx && loc.along <= endPx) {
                            state.selectedOpeningId = op.id;
                            state.dragState = {
                                type: 'move_opening',
                                wall: selWall,
                                opening: op,
                                grabDeltaPx: loc.along - op.offset
                            };
                            updateInspector();
                            render();
                            return;
                        }
                    }
                }
            }

            // 2. Проверяем попадание по любой стене (сверху вниз)
            for (let i = state.walls.length - 1; i >= 0; i--) {
                const w = state.walls[i];
                const len = getWallLength(w);
                const loc = worldToWallLocal(w, pos.x, pos.y);

                if (loc.along >= -6 / state.zoom && loc.along <= len + 6 / state.zoom && Math.abs(loc.perp) <= WALL_THICKNESS / 2 + 4 / state.zoom) {
                    state.selectedWallId = w.id;

                    // Проверяем, не кликнули ли прямо в проём этой стены
                    let clickedOp = null;
                    for (const op of w.openings) {
                        const { startMm, endMm } = getOpeningBoundsMm(op);
                        if (loc.along >= mmToPx(startMm) && loc.along <= mmToPx(endMm)) {
                            clickedOp = op;
                            break;
                        }
                    }

                    if (clickedOp) {
                        state.selectedOpeningId = clickedOp.id;
                        state.dragState = {
                            type: 'move_opening',
                            wall: w,
                            opening: clickedOp,
                            grabDeltaPx: loc.along - clickedOp.offset
                        };
                    } else {
                        state.selectedOpeningId = w.openings[0] ? w.openings[0].id : null;
                        state.dragState = {
                            type: 'move_wall',
                            wall: w,
                            startX: pos.x,
                            startY: pos.y,
                            origX1: w.x1,
                            origY1: w.y1,
                            origX2: w.x2,
                            origY2: w.y2
                        };
                    }

                    updateInspector();
                    render();
                    return;
                }
            }

            // Клик в пустое место — снимаем выделение
            state.selectedWallId = null;
            state.selectedOpeningId = null;
            updateInspector();
            render();
        }

function handlePointerMove(e) {
            const pos = getPointerPos(e);
            if (!state.dragState) return;

            const wall = state.dragState.wall;
            state.activeSnapPreview = null;

            if (state.dragState.type === 'move_wall') {
                let dx = pos.x - state.dragState.startX;
                let dy = pos.y - state.dragState.startY;

                let nx1 = state.dragState.origX1 + dx;
                let ny1 = state.dragState.origY1 + dy;
                let nx2 = state.dragState.origX2 + dx;
                let ny2 = state.dragState.origY2 + dy;

                // Проверяем магнитную привязку обоих концов стены (как L, так и T-соединения)
                const snap1 = findSnapPoint(nx1, ny1, wall.id);
                const snap2 = findSnapPoint(nx2, ny2, wall.id);

                if (snap1) {
                    const sdx = snap1.x - nx1;
                    const sdy = snap1.y - ny1;
                    nx1 += sdx;
                    ny1 += sdy;
                    nx2 += sdx;
                    ny2 += sdy;
                    state.activeSnapPreview = snap1;
                } else if (snap2) {
                    const sdx = snap2.x - nx2;
                    const sdy = snap2.y - ny2;
                    nx1 += sdx;
                    ny1 += sdy;
                    nx2 += sdx;
                    ny2 += sdy;
                    state.activeSnapPreview = snap2;
                }

                wall.x1 = nx1;
                wall.y1 = ny1;
                wall.x2 = nx2;
                wall.y2 = ny2;

            } else if (state.dragState.type === 'endpoint_1' || state.dragState.type === 'endpoint_2') {
                const isFirst = state.dragState.type === 'endpoint_1';
                const anchorX = isFirst ? wall.x2 : wall.x1;
                const anchorY = isFirst ? wall.y2 : wall.y1;

                let targetX = pos.x;
                let targetY = pos.y;

                const snap = findSnapPoint(targetX, targetY, wall.id);
                if (snap) {
                    targetX = snap.x;
                    targetY = snap.y;
                    state.activeSnapPreview = snap;
                }

                const rawDistPx = dist(anchorX, anchorY, targetX, targetY);
                const minAllowedMm = getMinAllowedWallLengthMm(wall);
                const snappedLenMm = clamp(snapMmToGrid(pxToMm(rawDistPx)), minAllowedMm, MAX_WALL_MM);
                const finalLenPx = mmToPx(snappedLenMm);
                const angle = snapAngleTo90(Math.atan2(targetY - anchorY, targetX - anchorX) * 180 / Math.PI) * Math.PI / 180;

                if (isFirst) {
                    wall.x1 = anchorX + Math.cos(angle) * finalLenPx;
                    wall.y1 = anchorY + Math.sin(angle) * finalLenPx;
                } else {
                    wall.x2 = anchorX + Math.cos(angle) * finalLenPx;
                    wall.y2 = anchorY + Math.sin(angle) * finalLenPx;
                }
                clampWallOpenings(wall);

            } else if (state.dragState.type === 'rotate_wall') {
                const center = getWallCenter(wall);
                let angleDeg = Math.round(Math.atan2(pos.y - center.y, pos.x - center.x) * 180 / Math.PI + 90);
                if (angleDeg > 180) angleDeg -= 360;
                if (angleDeg < -180) angleDeg += 360;

                setWallAngleFromCenter(wall, angleDeg);

            } else if (state.dragState.type === 'move_opening') {
                const loc = worldToWallLocal(wall, pos.x, pos.y);
                const { lenMm } = getOpeningBoundsMm(state.dragState.opening);
                const desiredCenterPx = loc.along - state.dragState.grabDeltaPx;
                const desiredStartMm = snapMmToGrid(pxToMm(desiredCenterPx - state.dragState.opening.length / 2));

                // Строгое ограничение коридора между соседними проёмами
                const limits = getOpeningLimitsMm(wall, state.dragState.opening);
                const clampedStartMm = clamp(desiredStartMm, limits.minMm, limits.maxMm - lenMm);

                setOpeningBoundsMm(state.dragState.opening, clampedStartMm, lenMm);

            } else if (state.dragState.type === 'resize_opening_start') {
                const loc = worldToWallLocal(wall, pos.x, pos.y);
                const limits = getOpeningLimitsMm(wall, state.dragState.opening);

                const newStartMm = clamp(
                    snapMmToGrid(pxToMm(loc.along)),
                    limits.minMm,
                    state.dragState.fixedEndMm - HALF_BLOCK_MM
                );
                const newLenMm = state.dragState.fixedEndMm - newStartMm;
                setOpeningBoundsMm(state.dragState.opening, newStartMm, newLenMm);

            } else if (state.dragState.type === 'resize_opening_end') {
                const loc = worldToWallLocal(wall, pos.x, pos.y);
                const limits = getOpeningLimitsMm(wall, state.dragState.opening);

                const newEndMm = clamp(
                    snapMmToGrid(pxToMm(loc.along)),
                    state.dragState.fixedStartMm + HALF_BLOCK_MM,
                    limits.maxMm
                );
                const newLenMm = newEndMm - state.dragState.fixedStartMm;
                setOpeningBoundsMm(state.dragState.opening, state.dragState.fixedStartMm, newLenMm);
            }

            updateInspector();
            render();
        }

function handlePointerUp() {
            state.dragState = null;
            state.activeSnapPreview = null;
            render();
        }

function bindEvents() {
state.canvas.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', handlePointerUp);

        state.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handlePointerDown(e); }, { passive: false });
        window.addEventListener('touchmove', (e) => { if (state.dragState) { e.preventDefault(); handlePointerMove(e); } }, { passive: false });
        window.addEventListener('touchend', handlePointerUp);

        document.getElementById('canvasContainer').addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            const rect = state.canvas.getBoundingClientRect();
            zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
        }, { passive: false });

        document.getElementById('btnZoomIn').addEventListener('click', () => {
            zoomAt(state.canvas.width / 2, state.canvas.height / 2, ZOOM_STEP);
        });
        document.getElementById('btnZoomOut').addEventListener('click', () => {
            zoomAt(state.canvas.width / 2, state.canvas.height / 2, 1 / ZOOM_STEP);
        });
        document.getElementById('btnZoomReset').addEventListener('click', resetZoom);
        document.getElementById('btnPrintBom').addEventListener('click', () => {
            if (!document.getElementById('btnPrintBom').disabled) window.print();
        });

        document.getElementById('btnAddWall').addEventListener('click', addNewWall);
        document.getElementById('btnAddOpening').addEventListener('click', addOpeningToSelectedWall);

        document.getElementById('btnToggleTips').addEventListener('click', (e) => {
            const button = e.currentTarget;
            const tips = document.getElementById('planTips');
            const icon = document.getElementById('tipsToggleIcon');
            const isExpanded = button.getAttribute('aria-expanded') === 'true';

            button.setAttribute('aria-expanded', String(!isExpanded));
            tips.classList.toggle('hidden', isExpanded);
            icon.textContent = isExpanded ? '+' : '−';
        });

        // document.getElementById('btnToggleRowView').addEventListener('click', () => {
        //     state.activePlanRow = state.activePlanRow === 1 ? 2 : 1;
        //     document.getElementById('rowViewText').textContent =
        //         state.activePlanRow === 1 ? 'План: 1-й ряд (нечёт)' : 'План: 2-й ряд (чёт)';
        //     document.getElementById('rowViewDot').className =
        //         state.activePlanRow === 1 ? 'w-2.5 h-2.5 rounded-full bg-amber-400' : 'w-2.5 h-2.5 rounded-full bg-blue-400';
        //     render();
        // });

        document.getElementById('btnClearAll').addEventListener('click', () => {
            state.walls = [];
            state.selectedWallId = null;
            state.selectedOpeningId = null;
            updateInspector();
            render();
            showToast('Drawing cleared');
        });

        document.getElementById('btnDemoHouse').addEventListener('click', loadDemoHouse);

        document.getElementById('sliderTotalRows').addEventListener('input', (e) => {
            state.totalWallRows = Number(e.target.value);
            state.walls.forEach(w => clampWallOpenings(w));
            updateInspector();
            render();
        });

        document.getElementById('sliderWallLength').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            setWallLengthFromCenter(wall, Number(e.target.value));
            updateInspector();
            render();
        });

        document.getElementById('sliderWallAngle').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            setWallAngleFromCenter(wall, Number(e.target.value));
            updateInspector();
            render();
        });

        document.querySelectorAll('.quick-angle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const wall = state.walls.find(w => w.id === state.selectedWallId);
                if (!wall) return;
                setWallAngleFromCenter(wall, Number(btn.dataset.angle));
                updateInspector();
                render();
            });
        });

        document.getElementById('btnDeleteWall').addEventListener('click', () => {
            state.walls = state.walls.filter(w => w.id !== state.selectedWallId);
            state.selectedWallId = state.walls[0] ? state.walls[0].id : null;
            state.selectedOpeningId = null;
            updateInspector();
            render();
            showToast('Wall deleted');
        });

        document.getElementById('btnDeleteOpening').addEventListener('click', () => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            wall.openings = wall.openings.filter(o => o.id !== state.selectedOpeningId);
            state.selectedOpeningId = wall.openings[0] ? wall.openings[0].id : null;
            updateInspector();
            render();
            showToast('Opening deleted');
        });

        document.querySelectorAll('.opening-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const wall = state.walls.find(w => w.id === state.selectedWallId);
                if (!wall) return;
                const op = wall.openings.find(o => o.id === state.selectedOpeningId);
                if (!op) return;
                op.type = btn.dataset.optype;
                if (op.type === 'window') {
                    op.startRow = Math.max(2, op.startRow || 2);
                    op.rowCount = Math.min(op.rowCount || 4, state.totalWallRows - op.startRow + 1);
                } else {
                    op.startRow = 1;
                    op.rowCount = Math.min(op.rowCount || 7, state.totalWallRows);
                }
                clampWallOpenings(wall);
                updateInspector();
                render();
            });
        });

        document.getElementById('sliderOpeningOffset').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            const op = wall.openings.find(o => o.id === state.selectedOpeningId);
            if (!op) return;

            const limits = getOpeningLimitsMm(wall, op);
            const { lenMm } = getOpeningBoundsMm(op);
            const startMm = clamp(snapMmToGrid(Number(e.target.value)), limits.minMm, limits.maxMm - lenMm);

            setOpeningBoundsMm(op, startMm, lenMm);
            updateInspector();
            render();
        });

        document.getElementById('sliderOpeningLength').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            const op = wall.openings.find(o => o.id === state.selectedOpeningId);
            if (!op) return;

            const limits = getOpeningLimitsMm(wall, op);
            const { startMm } = getOpeningBoundsMm(op);
            const newLenMm = clamp(snapMmToGrid(Number(e.target.value)), HALF_BLOCK_MM, limits.maxMm - startMm);

            setOpeningBoundsMm(op, startMm, newLenMm);
            updateInspector();
            render();
        });

        document.getElementById('sliderOpStartRow').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            const op = wall.openings.find(o => o.id === state.selectedOpeningId);
            if (!op) return;
            op.startRow = clamp(Number(e.target.value), 2, state.totalWallRows);
            op.rowCount = clamp(op.rowCount || 1, 1, state.totalWallRows - op.startRow + 1);
            updateInspector();
            render();
        });

        document.getElementById('sliderOpRowCount').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            const op = wall.openings.find(o => o.id === state.selectedOpeningId);
            if (!op) return;
            op.rowCount = clamp(Number(e.target.value), 1, state.totalWallRows - (op.startRow || 1) + 1);
            updateInspector();
            render();
        });

        // =========================================================================
        // ДЕМО-КОНФИГУРАЦИЯ ДОМА С УГЛОВЫМИ (L) И Т-ОБРАЗНЫМИ СОЕДИНЕНИЯМИ
        // =========================================================================
}
