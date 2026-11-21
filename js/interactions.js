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
            state.canvas.focus?.({preventScroll: true});
            const pos = getPointerPos(e);
            state.activeSnapPreview = null;

            // 1. Если есть выбранная стена — сначала проверяем её элементы управления (ручки концов, поворот, проёмы)
            const selWall = state.walls.find(w => w.id === state.selectedWallId);
            if (selWall) {
                // Рычаг поворота
                const rotPos = getRotateHandlePos(selWall);
                if (dist(pos.x, pos.y, rotPos.x, rotPos.y) <= 12 / state.zoom) {
                    const pivot = getWallEndCellCenter(selWall, 'start');
                    const handleAngle = Math.atan2(rotPos.y - pivot.y, rotPos.x - pivot.x);
                    state.dragState = { type: 'rotate_wall', wall: selWall, pivot,
                        angleOffset: handleAngle - getWallAngleRad(selWall) };
                    state.selectedOpeningId = null;
                    updateInspector(); render();
                    return;
                }

                // Концы выбранной стены
                if (dist(pos.x, pos.y, selWall.x1, selWall.y1) <= (ENDPOINT_RADIUS + 4) / state.zoom) {
                    state.dragState = { type: 'endpoint_1', wall: selWall };
                    state.selectedOpeningId = null;
                    updateInspector(); render();
                    return;
                }
                if (dist(pos.x, pos.y, selWall.x2, selWall.y2) <= (ENDPOINT_RADIUS + 4) / state.zoom) {
                    state.dragState = { type: 'endpoint_2', wall: selWall };
                    state.selectedOpeningId = null;
                    updateInspector(); render();
                    return;
                }

                // Проверка клика по проёму выбранной стены (или его краям для изменения ширины)
                const loc = worldToWallLocal(selWall, pos.x, pos.y);
                if (Math.abs(loc.perp) <= WALL_THICKNESS / 2 + 6 / state.zoom) {
                    for (const op of getPlanOpenings(selWall).reverse()) {
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
                    for (const op of getPlanOpenings(w).reverse()) {
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
                        state.selectedOpeningId = null;
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
            if (!state.dragState) {
                const pos = getPointerPos(e);
                const overWall = state.walls.some(wall => {
                    const local = worldToWallLocal(wall, pos.x, pos.y);
                    return local.along >= -6 / state.zoom && local.along <= getWallLength(wall) + 6 / state.zoom &&
                        Math.abs(local.perp) <= WALL_THICKNESS / 2 + 4 / state.zoom;
                });
                state.canvas.style.cursor = overWall ? 'url("assets/cursors/white-cross.svg") 12 12, crosshair' : 'grab';
                return;
            }
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
                const {pivot, angleOffset} = state.dragState;
                let angleDeg = Math.round((Math.atan2(pos.y - pivot.y, pos.x - pivot.x) - angleOffset) * 180 / Math.PI);
                if (angleDeg > 180) angleDeg -= 360;
                if (angleDeg < -180) angleDeg += 360;

                setWallAngle(wall, angleDeg);

            } else if (state.dragState.type === 'move_opening') {
                const loc = worldToWallLocal(wall, pos.x, pos.y);
                const { lenCm } = getOpeningBoundsCm(state.dragState.opening);
                const desiredCenterPx = cmToPx(getWallPlanProjection(wall).unproject(loc.along)) - state.dragState.grabDeltaPx;
                const desiredStartCm = snapCmToGrid(pxToCm(desiredCenterPx - state.dragState.opening.length / 2));

                // Only openings occupying the same courses constrain horizontal movement.
                const limits = getOpeningLimitsCm(wall, state.dragState.opening);
                const clampedStartCm = clamp(desiredStartCm, limits.minCm, limits.maxCm - lenCm);

                tryUpdateOpening(wall, state.dragState.opening, { startCm: clampedStartCm, lenCm });

            } else if (state.dragState.type === 'resize_opening_start') {
                const loc = worldToWallLocal(wall, pos.x, pos.y);
                const limits = getOpeningLimitsCm(wall, state.dragState.opening);

                const newStartCm = clamp(
                    snapCmToGrid(getWallPlanProjection(wall).unproject(loc.along)),
                    limits.minCm,
                    state.dragState.fixedEndCm - HALF_BLOCK_CM
                );
                const newLenCm = state.dragState.fixedEndCm - newStartCm;
                tryUpdateOpening(wall, state.dragState.opening, { startCm: newStartCm, lenCm: newLenCm });

            } else if (state.dragState.type === 'resize_opening_end') {
                const loc = worldToWallLocal(wall, pos.x, pos.y);
                const limits = getOpeningLimitsCm(wall, state.dragState.opening);

                const newEndCm = clamp(
                    snapCmToGrid(getWallPlanProjection(wall).unproject(loc.along)),
                    state.dragState.fixedStartCm + HALF_BLOCK_CM,
                    limits.maxCm
                );
                const newLenCm = newEndCm - state.dragState.fixedStartCm;
                tryUpdateOpening(wall, state.dragState.opening, { startCm: state.dragState.fixedStartCm, lenCm: newLenCm });
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

function handleDeleteKeyDown(event) {
            if (!['Delete', 'Backspace'].includes(event.key) || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
            const target = event.target;
            if (target?.isContentEditable || target?.closest?.('input, textarea, select')) return;
            if (document.getElementById('fileMenu')?.open) return;
            if (document.getElementById('tutorialDialog')?.open) return;
            const wall = state.walls.find(item => item.id === state.selectedWallId);
            if (!wall) return;

            event.preventDefault();
            if (state.selectedOpeningId !== null && wall.openings.some(opening => opening.id === state.selectedOpeningId)) {
                removeOpening(wall.id, state.selectedOpeningId);
            } else {
                removeWall(wall.id);
            }
        }

function bindEvents() {
state.canvas.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', handlePointerUp);
        window.addEventListener('blur', handlePointerUp);
        window.addEventListener('keydown', handleDeleteKeyDown);

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
        document.getElementById('btnFitProject').addEventListener('click', fitProjectToView);

        document.getElementById('btnAddWall').addEventListener('click', addNewWall);
        document.getElementById('btnAddOpening').addEventListener('click', addOpeningToSelectedWall);

        // Let wheel gestures scroll the inspector instead of stepping a focused number input.
        for (const id of ['inputWallRows', 'sliderWallLength']) {
            const input = document.getElementById(id);
            input.addEventListener('wheel', () => {
                if (document.activeElement === input) input.blur();
            }, { passive: true });
        }

        const legendTabs = [...document.querySelectorAll('[data-legend-tab]')];
        const activateLegendTab = (tab, moveFocus = false) => {
            for (const item of legendTabs) {
                const isSelected = item === tab;
                item.setAttribute('aria-selected', String(isSelected));
                item.tabIndex = isSelected ? 0 : -1;
                document.getElementById(item.dataset.legendTab).hidden = !isSelected;
            }
            if (moveFocus) tab.focus();
        };
        legendTabs.forEach((tab, index) => {
            tab.addEventListener('click', () => activateLegendTab(tab));
            tab.addEventListener('keydown', event => {
                let nextIndex;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % legendTabs.length;
                else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + legendTabs.length) % legendTabs.length;
                else if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = legendTabs.length - 1;
                else return;
                event.preventDefault();
                activateLegendTab(legendTabs[nextIndex], true);
            });
        });

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
            if (!window.confirm('Clear all walls and openings?')) return;
            state.walls = [];
            state.migrationNotes = [];
            state.selectedWallId = null;
            state.selectedOpeningId = null;
            updateInspector();
            render();
        });

        document.getElementById('btnDemoHouse').addEventListener('click', () => {
            if (!window.confirm('Show the example? This replaces your current plan.')) return;
            loadDemoHouse();
        });

        document.getElementById('sliderTotalRows').addEventListener('input', (e) => {
            state.totalWallRows = Number(e.target.value);
            state.walls.forEach(w => { w.rows = state.totalWallRows; clampWallOpenings(w); });
            updateInspector();
            render();
        });

        document.getElementById('sliderWallLength').addEventListener('change', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            setWallLength(wall, Number(e.target.value) / MM_PER_CM);
            updateInspector();
            render();
        });

        for (const [id, turn] of [['btnRotateLeft', -90], ['btnRotateRight', 90]]) {
            document.getElementById(id).addEventListener('click', () => {
                const wall = state.walls.find(w => w.id === state.selectedWallId);
                if (!wall) return;
                setWallAngle(wall, getWallAngleDeg(wall) + turn);
                updateInspector(); render();
            });
        }

        document.getElementById('btnDeleteWall').addEventListener('click', () => {
            removeWall(state.selectedWallId);
        });

        document.getElementById('btnDeleteOpening').addEventListener('click', () => {
            removeOpening(state.selectedWallId, state.selectedOpeningId);
        });

        document.querySelectorAll('.opening-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const wall = state.walls.find(w => w.id === state.selectedWallId);
                if (!wall) return;
                const op = wall.openings.find(o => o.id === state.selectedOpeningId);
                if (!op) return;
                const type = btn.dataset.optype;
                if (op.type === type) return;
                if (type === 'window') {
                    tryUpdateOpening(wall, op, { type, startRow: Math.max(2, op.startRow),
                        rowCount: Math.min(op.rowCount, getWallRows(wall) - Math.max(2, op.startRow) + 1) }, true);
                } else {
                    tryUpdateOpening(wall, op, { type, startRow: 1, rowCount: op.rowCount }, true);
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
            const startCm = clamp(snapCmToGrid(Number(e.target.value) / MM_PER_CM), limits.minCm, limits.maxCm - lenCm);

            tryUpdateOpening(wall, op, { startCm, lenCm }, true);
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
            const newLenCm = clamp(snapCmToGrid(Number(e.target.value) / MM_PER_CM), HALF_BLOCK_CM, limits.maxCm - startCm);

            tryUpdateOpening(wall, op, { startCm, lenCm: newLenCm }, true);
            updateInspector();
            render();
        });

        document.getElementById('sliderOpStartRow').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            const op = wall.openings.find(o => o.id === state.selectedOpeningId);
            if (!op) return;
            const limits = getOpeningVerticalLimits(wall, op);
            const startRow = op.type === 'door' ? 1 : clamp(Number(e.target.value), limits.minRow, limits.maxEndRow - op.rowCount);
            tryUpdateOpening(wall, op, { startRow }, true);
            updateInspector();
            render();
        });

        document.getElementById('sliderOpRowCount').addEventListener('input', (e) => {
            const wall = state.walls.find(w => w.id === state.selectedWallId);
            if (!wall) return;
            const op = wall.openings.find(o => o.id === state.selectedOpeningId);
            if (!op) return;
            const limits = getOpeningVerticalLimits(wall, op);
            const rowCount = clamp(Number(e.target.value), 1, limits.maxEndRow - op.startRow);
            tryUpdateOpening(wall, op, { rowCount }, true);
            updateInspector();
            render();
        });

        // =========================================================================
        // ДЕМО-КОНФИГУРАЦИЯ ДОМА С УГЛОВЫМИ (L) И Т-ОБРАЗНЫМИ СОЕДИНЕНИЯМИ
        // =========================================================================
}
