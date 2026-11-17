function getPointerPos(e) {
            const rect = state.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left - state.panX) / state.zoom,
                y: (clientY - rect.top - state.panY) / state.zoom
            };
        }

function startCameraPan(e) {
            const pointer = e.touches ? e.touches[0] : e;
            state.dragState = {
                type: 'pan_camera',
                startClientX: pointer.clientX,
                startClientY: pointer.clientY,
                panX: state.panX,
                panY: state.panY
            };
            state.canvas.style.cursor = 'grabbing';
            e.preventDefault();
        }

function handlePointerDown(e) {
            // Middle-button dragging pans even when the pointer is over a wall.
            if (!e.touches && e.button === 1) {
                state.activeSnapPreview = null;
                startCameraPan(e);
                return;
            }
            if (!e.touches && e.button !== 0) return;
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
                        const { startCm, endCm } = getOpeningBoundsCm(op);
                        const projection = getWallPlanProjection(selWall);
                        const startPx = projection.project(startCm);
                        const endPx = projection.project(endCm);

                        if (Math.abs(loc.along - startPx) <= 8 / state.zoom) {
                            state.selectedOpeningId = op.id;
                            state.dragState = {
                                type: 'resize_opening_start',
                                wall: selWall,
                                opening: op,
                                fixedEndCm: endCm
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
                                fixedStartCm: startCm
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
                                grabDeltaPx: cmToPx(getWallPlanProjection(selWall).unproject(loc.along)) - op.offset
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
                        const { startCm, endCm } = getOpeningBoundsCm(op);
                        if (loc.along >= getWallPlanProjection(w).project(startCm) && loc.along <= getWallPlanProjection(w).project(endCm)) {
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
                            grabDeltaPx: cmToPx(getWallPlanProjection(w).unproject(loc.along)) - clickedOp.offset
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
            startCameraPan(e);
            updateInspector();
            render();
        }

function handlePointerMove(e) {
            if (!state.dragState) return;
            if (state.dragState.type === 'pan_camera') {
                const pointer = e.touches ? e.touches[0] : e;
                state.panX = state.dragState.panX + pointer.clientX - state.dragState.startClientX;
                state.panY = state.dragState.panY + pointer.clientY - state.dragState.startClientY;
                render();
                return;
            }
            const pos = getPointerPos(e);

            const wall = state.dragState.wall;
            state.activeSnapPreview = null;

            if (state.dragState.type === 'move_wall') {
                let dx = pos.x - state.dragState.startX;
                let dy = pos.y - state.dragState.startY;

                let nx1 = state.dragState.origX1 + dx;
                let ny1 = state.dragState.origY1 + dy;
                let nx2 = state.dragState.origX2 + dx;
                let ny2 = state.dragState.origY2 + dy;

                const placement = snapWallTranslation(wall, {x1: nx1, y1: ny1, x2: nx2, y2: ny2});
                wall.x1 = placement.x1; wall.y1 = placement.y1;
                wall.x2 = placement.x2; wall.y2 = placement.y2;
                state.activeSnapPreview = placement.snaps[0] || null;

            } else if (state.dragState.type === 'endpoint_1' || state.dragState.type === 'endpoint_2') {
                state.activeSnapPreview = resizeWallEndpoint(wall, state.dragState.type === 'endpoint_1', pos);

            } else if (state.dragState.type === 'rotate_wall') {
                const center = getWallCenter(wall);
                let angleDeg = Math.round(Math.atan2(pos.y - center.y, pos.x - center.x) * 180 / Math.PI + 90);
                if (angleDeg > 180) angleDeg -= 360;
                if (angleDeg < -180) angleDeg += 360;

                setWallAngleFromCenter(wall, angleDeg);

            } else if (state.dragState.type === 'move_opening') {
                const loc = worldToWallLocal(wall, pos.x, pos.y);
                const { lenCm } = getOpeningBoundsCm(state.dragState.opening);
                const desiredCenterPx = cmToPx(getWallPlanProjection(wall).unproject(loc.along)) - state.dragState.grabDeltaPx;
                const desiredStartCm = snapCmToGrid(pxToCm(desiredCenterPx - state.dragState.opening.length / 2));

                // Строгое ограничение коридора между соседними проёмами
                const limits = getOpeningLimitsCm(wall, state.dragState.opening);
                const clampedStartCm = clamp(desiredStartCm, limits.minCm, limits.maxCm - lenCm);

                setOpeningBoundsCm(state.dragState.opening, clampedStartCm, lenCm);

            } else if (state.dragState.type === 'resize_opening_start') {
                const loc = worldToWallLocal(wall, pos.x, pos.y);
                const limits = getOpeningLimitsCm(wall, state.dragState.opening);

                const newStartCm = clamp(
                    snapCmToGrid(getWallPlanProjection(wall).unproject(loc.along)),
                    limits.minCm,
                    state.dragState.fixedEndCm - HALF_BLOCK_CM
                );
                const newLenCm = state.dragState.fixedEndCm - newStartCm;
                setOpeningBoundsCm(state.dragState.opening, newStartCm, newLenCm);

            } else if (state.dragState.type === 'resize_opening_end') {
                const loc = worldToWallLocal(wall, pos.x, pos.y);
                const limits = getOpeningLimitsCm(wall, state.dragState.opening);

                const newEndCm = clamp(
                    snapCmToGrid(getWallPlanProjection(wall).unproject(loc.along)),
                    state.dragState.fixedStartCm + HALF_BLOCK_CM,
                    limits.maxCm
                );
                const newLenCm = newEndCm - state.dragState.fixedStartCm;
                setOpeningBoundsCm(state.dragState.opening, state.dragState.fixedStartCm, newLenCm);
            }

            updateInspector();
            render();
        }

function handlePointerUp() {
            if (!state.dragState) return;
            if (state.dragState.type !== 'pan_camera') saveProjectLocally();
            state.dragState = null;
            state.activeSnapPreview = null;
            state.canvas.style.cursor = '';
            render();
        }

function bindEvents() {
state.canvas.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', handlePointerUp);
        window.addEventListener('blur', handlePointerUp);

        state.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handlePointerDown(e); }, { passive: false });
        window.addEventListener('touchmove', (e) => { if (state.dragState) { e.preventDefault(); handlePointerMove(e); } }, { passive: false });
        window.addEventListener('touchend', handlePointerUp);
        window.addEventListener('touchcancel', handlePointerUp);

        state.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (state.dragState || e.deltaY === 0) return;
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
            state.walls.forEach(w => { w.rows = state.totalWallRows; clampWallOpenings(w); });
            updateInspector();
            render();
        });

        document.getElementById('sliderWallLength').addEventListener('change', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            setWallLengthFromCenter(wall, Number(e.target.value));
            updateInspector();
            render();
        });

        for (const [id, turn] of [['btnRotateLeft', -90], ['btnRotateRight', 90]]) {
            document.getElementById(id).addEventListener('click', () => {
                const wall = state.walls.find(w => w.id === state.selectedWallId);
                if (!wall) return;
                setWallAngleFromCenter(wall, getWallAngleDeg(wall) + turn);
                updateInspector(); render();
            });
        }

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
                    op.startRow = 4;
                    op.rowCount = Math.min(4, Math.max(1, getWallRows(wall) - 3));
                } else {
                    op.startRow = 1;
                    op.rowCount = Math.min(7, getWallRows(wall));
                }
                updateInspector();
                render();
            });
        });

        document.getElementById('sliderOpeningOffset').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            const op = wall.openings.find(o => o.id === state.selectedOpeningId);
            if (!op) return;

            const limits = getOpeningLimitsCm(wall, op);
            const { lenCm } = getOpeningBoundsCm(op);
            const startCm = clamp(snapCmToGrid(Number(e.target.value)), limits.minCm, limits.maxCm - lenCm);

            setOpeningBoundsCm(op, startCm, lenCm);
            updateInspector();
            render();
        });

        document.getElementById('sliderOpeningLength').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            const op = wall.openings.find(o => o.id === state.selectedOpeningId);
            if (!op) return;

            const limits = getOpeningLimitsCm(wall, op);
            const { startCm } = getOpeningBoundsCm(op);
            const newLenCm = clamp(snapCmToGrid(Number(e.target.value)), HALF_BLOCK_CM, limits.maxCm - startCm);

            setOpeningBoundsCm(op, startCm, newLenCm);
            updateInspector();
            render();
        });

        document.getElementById('sliderOpStartRow').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            const op = wall.openings.find(o => o.id === state.selectedOpeningId);
            if (!op) return;
            op.startRow = clamp(Number(e.target.value), 1, getWallRows(wall));
            op.rowCount = clamp(op.rowCount || 1, 1, getWallRows(wall) - op.startRow + 1);
            updateInspector();
            render();
        });

        document.getElementById('sliderOpRowCount').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            const op = wall.openings.find(o => o.id === state.selectedOpeningId);
            if (!op) return;
            op.rowCount = clamp(Number(e.target.value), 1, getWallRows(wall) - (op.startRow || 1) + 1);
            updateInspector();
            render();
        });

        // =========================================================================
        // ДЕМО-КОНФИГУРАЦИЯ ДОМА С УГЛОВЫМИ (L) И Т-ОБРАЗНЫМИ СОЕДИНЕНИЯМИ
        // =========================================================================
}
