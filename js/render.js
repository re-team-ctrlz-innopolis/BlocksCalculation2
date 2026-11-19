let toastTimer;

function showToast(message) {
            const box = document.getElementById('toastBox');
            const txt = document.getElementById('toastText');
            txt.textContent = message;
            box.classList.remove('opacity-0');
            box.classList.add('opacity-100');
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => {
                box.classList.remove('opacity-100');
                box.classList.add('opacity-0');
            }, 2600);
        }

function resizeCanvases() {
            const container = document.getElementById('canvasContainer');
            state.canvas.width = container.clientWidth;
            state.canvas.height = container.clientHeight;

            const elevParent = state.elevCanvas.parentElement;
            state.elevCanvas.width = elevParent.clientWidth;
            state.elevCanvas.height = elevParent.clientHeight;

            render();
        }

function drawGrid() {
            const w = state.canvas.width;
            const h = state.canvas.height;
            const left = -state.panX / state.zoom;
            const top = -state.panY / state.zoom;
            const right = left + w / state.zoom;
            const bottom = top + h / state.zoom;
            state.ctx.save();
            state.ctx.fillStyle = '#090d16';
            state.ctx.fillRect(left, top, right - left, bottom - top);

            state.ctx.lineWidth = 1 / state.zoom;
            const gridStep = cmToPx(POSITION_GRID_CM) * state.zoom >= 6 ? cmToPx(POSITION_GRID_CM) : HALF_BLOCK_PX;
            for (let x = Math.floor(left / gridStep) * gridStep; x <= right; x += gridStep) {
                state.ctx.strokeStyle = '#111827';
                state.ctx.beginPath();
                state.ctx.moveTo(x, top);
                state.ctx.lineTo(x, bottom);
                state.ctx.stroke();
            }
            for (let y = Math.floor(top / gridStep) * gridStep; y <= bottom; y += gridStep) {
                state.ctx.strokeStyle = '#111827';
                state.ctx.beginPath();
                state.ctx.moveTo(left, y);
                state.ctx.lineTo(right, y);
                state.ctx.stroke();
            }
            for (let x = Math.floor(left / FULL_BLOCK_PX) * FULL_BLOCK_PX; x <= right; x += FULL_BLOCK_PX) {
                state.ctx.strokeStyle = '#1e293b';
                state.ctx.beginPath();
                state.ctx.moveTo(x, top);
                state.ctx.lineTo(x, bottom);
                state.ctx.stroke();
            }
            for (let y = Math.floor(top / FULL_BLOCK_PX) * FULL_BLOCK_PX; y <= bottom; y += FULL_BLOCK_PX) {
                state.ctx.strokeStyle = '#1e293b';
                state.ctx.beginPath();
                state.ctx.moveTo(left, y);
                state.ctx.lineTo(right, y);
                state.ctx.stroke();
            }
            state.ctx.restore();
        }

function drawHostWallSnapTicks(hostWallId) {
            const w = state.walls.find(item => item.id === hostWallId);
            if (!w) return;
            const lenCm = getWallLengthCm(w);
            const angle = getWallAngleRad(w);

            state.ctx.save();
            state.ctx.translate(w.x1, w.y1);
            state.ctx.rotate(angle);

            // Highlight 20 cm half-block boundaries and their centers for T-joint snapping.
            for (let cellStartCm = HALF_BLOCK_CM; cellStartCm <= lenCm - FULL_BLOCK_CM; cellStartCm += HALF_BLOCK_CM) {
                const startPx = cmToPx(cellStartCm);
                const centerPx = cmToPx(cellStartCm + HALF_BLOCK_CM / 2);
                const isActiveCell = state.activeSnapPreview && Math.abs(state.activeSnapPreview.cellStartCm - cellStartCm) < 1;

                if (isActiveCell) {
                    state.ctx.fillStyle = 'rgba(34, 211, 238, 0.28)';
                    state.ctx.fillRect(startPx, -WALL_THICKNESS / 2 - 4, HALF_BLOCK_PX, WALL_THICKNESS + 8);
                }

                // Граница половинки блока
                state.ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
                state.ctx.lineWidth = 1;
                state.ctx.beginPath();
                state.ctx.moveTo(startPx, -WALL_THICKNESS / 2 - 5);
                state.ctx.lineTo(startPx, WALL_THICKNESS / 2 + 5);
                state.ctx.stroke();

                // Центр половинки блока (точка привязки оси примыкающей стены)
                state.ctx.fillStyle = isActiveCell ? '#ffffff' : '#22d3ee';
                state.ctx.beginPath();
                state.ctx.arc(centerPx, 0, isActiveCell ? 4 : 2.5, 0, Math.PI * 2);
                state.ctx.fill();
            }
            state.ctx.restore();
        }

// A fixed 1:1 mapping: attaching a wall must never redistribute its seams.
function getPlanProjection(layout) {
            return {
                project: cmToPx,
                unproject: pxToCm,
                blocks: layout.blocks.map(block => ({...block, x: cmToPx(block.startCm), width: cmToPx(block.lenCm)}))
            };
        }

function getWallPlanProjection(wall) {
            return getPlanProjection(buildWallRowLayout(
                {...wall, openings: wall.openings.map(op => ({...op, startRow: 1, rowCount: getWallRows(wall)}))},
                state.activePlanRow
            ));
        }

function drawWall(wall, isSelected, allJoints) {
            const lenPx = getWallLength(wall);
            const lenCm = getWallLengthCm(wall);
            const angle = getWallAngleRad(wall);
            const halfThick = WALL_THICKNESS / 2;

            // Рассчитываем раскладку для выбранного на плане ряда (1-й или 2-й) с учётом угловой перевязки
            const baseLayout = buildWallRowLayout(
                { ...wall, openings: wall.openings.map(o => ({ ...o, startRow: 1, rowCount: getWallRows(wall) })) },
                state.activePlanRow,
                allJoints
            );
            const projection = getPlanProjection(baseLayout);

            // Outline, blocks and snap markers use the same local coordinates.
            const extStartPx = 0;
            const extEndPx = 0;

            state.ctx.save();
            state.ctx.translate(wall.x1, wall.y1);
            state.ctx.rotate(angle);

            // Тень и подложка стены
            state.ctx.fillStyle = '#1e293b';
            state.ctx.strokeStyle = isSelected ? '#60a5fa' : '#475569';
            state.ctx.lineWidth = isSelected ? 2.5 : 1.5;
            state.ctx.beginPath();
            state.ctx.roundRect(-extStartPx, -halfThick, lenPx + extStartPx + extEndPx, WALL_THICKNESS, 3);
            state.ctx.fill();
            state.ctx.stroke();

            for (const [atStart, inset] of [[true, baseLayout.cornerState.startInsetCm], [false, baseLayout.cornerState.endInsetCm]]) {
                if (!inset) continue;
                const x = atStart ? 0 : lenPx - cmToPx(inset);
                state.ctx.fillStyle = '#164e3b';
                state.ctx.fillRect(x, -halfThick + 1, cmToPx(inset), WALL_THICKNESS - 2);
                state.ctx.strokeStyle = '#34d399';
                state.ctx.lineWidth = 1;
                state.ctx.strokeRect(x + 0.5, -halfThick + 1.5, cmToPx(inset) - 1, WALL_THICKNESS - 3);
            }

            for (const b of projection.blocks) {
                const bx = b.x;
                const bw = b.width;

                const isFull = b.kind === 'full';

                // Тело Лего-блока
                state.ctx.fillStyle = isFull ? '#2563eb' : '#d97706';
                state.ctx.strokeStyle = '#0f172a';
                state.ctx.lineWidth = 1.2;
                state.ctx.beginPath();
                state.ctx.roundRect(bx + 0.8, -halfThick + 1.5, bw - 1.6, WALL_THICKNESS - 3, 3);
                state.ctx.fill();
                state.ctx.stroke();

                // Two studs mark a 40 cm block; one marks a 20 cm half block.
                const studsCount = isFull ? 2 : 1;
                for (let s = 0; s < studsCount; s++) {
                    const studX = bx + (bw / studsCount) * (s + 0.5);
                    state.ctx.fillStyle = isFull ? '#60a5fa' : '#fbbf24';
                    state.ctx.strokeStyle = isFull ? '#1d4ed8' : '#92400e';
                    state.ctx.lineWidth = 1;
                    state.ctx.beginPath();
                    state.ctx.arc(studX, 0, 4.2, 0, Math.PI * 2);
                    state.ctx.fill();
                    state.ctx.stroke();
                }
            }

            for (const segment of baseLayout.unfilledSegments) {
                const markerX = projection.project((segment.startCm + segment.endCm) / 2);
                state.ctx.save();
                state.ctx.strokeStyle = '#f87171';
                state.ctx.lineWidth = 2 / state.zoom;
                state.ctx.beginPath();
                state.ctx.moveTo(markerX, -halfThick + 1);
                state.ctx.lineTo(markerX, halfThick - 1);
                state.ctx.stroke();
                state.ctx.restore();
            }

            // Отрисовка проёмов поверх стены (с гарантией отсутствия наложений)
            for (const op of wall.openings) {
                const { startCm, lenCm } = getOpeningBoundsCm(op);
                const ox = projection.project(startCm);
                const ow = projection.project(startCm + lenCm) - ox;
                const isOpSelected = isSelected && (op.id === state.selectedOpeningId);

                // Фон проёма
                state.ctx.fillStyle = '#0f172a';
                state.ctx.fillRect(ox, -halfThick + 1, ow, WALL_THICKNESS - 2);

                if (op.type === 'window') {
                    // Окно: двойная голубая линия стеклопакета
                    state.ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
                    state.ctx.fillRect(ox, -halfThick + 2, ow, WALL_THICKNESS - 4);
                    state.ctx.strokeStyle = '#38bdf8';
                    state.ctx.lineWidth = 2;
                    state.ctx.beginPath();
                    state.ctx.moveTo(ox, -3);
                    state.ctx.lineTo(ox + ow, -3);
                    state.ctx.moveTo(ox, 3);
                    state.ctx.lineTo(ox + ow, 3);
                    state.ctx.stroke();
                } else if (op.type === 'door') {
                    // Дверь: полотно и дуга открывания
                    state.ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
                    state.ctx.fillRect(ox, -halfThick + 2, ow, WALL_THICKNESS - 4);
                    state.ctx.strokeStyle = '#34d399';
                    state.ctx.lineWidth = 1.8;
                    state.ctx.beginPath();
                    state.ctx.moveTo(ox, -halfThick);
                    state.ctx.lineTo(ox, -halfThick - Math.min(ow, 34));
                    state.ctx.stroke();

                    state.ctx.setLineDash([3, 3]);
                    state.ctx.beginPath();
                    state.ctx.arc(ox, -halfThick, Math.min(ow, 34), -Math.PI / 2, 0);
                    state.ctx.stroke();
                    state.ctx.setLineDash([]);
                } else {
                    // Арка / пустой проём
                    state.ctx.fillStyle = 'rgba(168, 85, 247, 0.18)';
                    state.ctx.fillRect(ox, -halfThick + 2, ow, WALL_THICKNESS - 4);
                    state.ctx.strokeStyle = '#c084fc';
                    state.ctx.setLineDash([4, 3]);
                    state.ctx.lineWidth = 1.5;
                    state.ctx.strokeRect(ox + 1, -halfThick + 2, ow - 2, WALL_THICKNESS - 4);
                    state.ctx.setLineDash([]);
                }

                // Рамка выделенного проёма и маркеры изменения его ширины
                if (isOpSelected) {
                    state.ctx.strokeStyle = '#facc15';
                    state.ctx.lineWidth = 2;
                    state.ctx.strokeRect(ox, -halfThick - 2, ow, WALL_THICKNESS + 4);

                    // Левая и правая ручки проёма
                    state.ctx.fillStyle = '#facc15';
                    state.ctx.fillRect(ox - 3, -6, 6, 12);
                    state.ctx.fillRect(ox + ow - 3, -6, 6, 12);
                }

                // Подпись размера проёма
                state.ctx.save();
                state.ctx.translate(ox + ow / 2, 0);
                if (angle > Math.PI / 2 || angle < -Math.PI / 2) state.ctx.rotate(Math.PI);
                state.ctx.fillStyle = '#f8fafc';
                state.ctx.font = 'bold 9px Inter, sans-serif';
                state.ctx.textAlign = 'center';
                state.ctx.textBaseline = 'middle';
                state.ctx.fillText(`${lenCm}`, 0, 0);
                state.ctx.restore();
            }

            // Control-joint positions are part of the layout, not extra blocks.
            state.ctx.save();
            state.ctx.strokeStyle = '#f472b6';
            state.ctx.lineWidth = 2 / state.zoom;
            state.ctx.setLineDash([4, 3]);
            for (const joint of getControlJoints(wall)) {
                const x = projection.project(joint);
                state.ctx.beginPath();
                state.ctx.moveTo(x, -halfThick - 5);
                state.ctx.lineTo(x, halfThick + 5);
                state.ctx.stroke();
            }
            state.ctx.restore();

            // Подпись общей длины стены
            state.ctx.save();
            state.ctx.translate(lenPx / 2, -halfThick - 11);
            if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
                state.ctx.rotate(Math.PI);
                state.ctx.translate(0, -WALL_THICKNESS - 22);
            }
            state.ctx.fillStyle = isSelected ? '#93c5fd' : '#94a3b8';
            state.ctx.font = '600 11px Inter, sans-serif';
            state.ctx.textAlign = 'center';
            state.ctx.fillText(`${lenCm * MM_PER_CM} mm`, 0, 0);
            state.ctx.restore();

            if (isSelected) {
                for (const mark of [{ x: 0, label: 'L', color: '#38bdf8' }, { x: lenPx, label: 'R', color: '#fbbf24' }]) {
                    state.ctx.save();
                    state.ctx.translate(mark.x, halfThick + 14 / state.zoom);
                    state.ctx.rotate(-angle);
                    state.ctx.fillStyle = '#0f172a';
                    state.ctx.strokeStyle = mark.color;
                    state.ctx.lineWidth = 1 / state.zoom;
                    state.ctx.beginPath();
                    state.ctx.arc(0, 0, 7 / state.zoom, 0, Math.PI * 2);
                    state.ctx.fill();
                    state.ctx.stroke();
                    state.ctx.fillStyle = '#f8fafc';
                    state.ctx.font = `bold ${9 / state.zoom}px Inter, sans-serif`;
                    state.ctx.textAlign = 'center';
                    state.ctx.textBaseline = 'middle';
                    state.ctx.fillText(mark.label, 0, 0);
                    state.ctx.restore();
                }
            }

            state.ctx.restore();

            // Если стена выбрана — рисуем ручки на концах и рычаг поворота
            if (isSelected) {
                const rotPos = getRotateHandlePos(wall);
                const center = getWallCenter(wall);

                state.ctx.save();
                // Линия к рычагу поворота
                state.ctx.strokeStyle = '#facc15';
                state.ctx.lineWidth = 1.5;
                state.ctx.setLineDash([3, 3]);
                state.ctx.beginPath();
                state.ctx.moveTo(center.x, center.y);
                state.ctx.lineTo(rotPos.x, rotPos.y);
                state.ctx.stroke();
                state.ctx.setLineDash([]);

                // Кружок рычага поворота
                state.ctx.fillStyle = '#facc15';
                state.ctx.strokeStyle = '#0f172a';
                state.ctx.lineWidth = 2;
                state.ctx.beginPath();
                state.ctx.arc(rotPos.x, rotPos.y, 7, 0, Math.PI * 2);
                state.ctx.fill();
                state.ctx.stroke();

                // Ручки на концах стены (x1,y1) и (x2,y2)
                for (const pt of [{ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }]) {
                    state.ctx.fillStyle = '#3b82f6';
                    state.ctx.strokeStyle = '#ffffff';
                    state.ctx.lineWidth = 2;
                    state.ctx.beginPath();
                    state.ctx.arc(pt.x, pt.y, ENDPOINT_RADIUS, 0, Math.PI * 2);
                    state.ctx.fill();
                    state.ctx.stroke();
                }
                state.ctx.restore();
            }
        }

function drawConnectedJoints() {
            const joints = getAllWallJoints();
            state.ctx.save();

            for (const jt of joints) {
                if (jt.type === 'L') {
                    // Зелёный индикатор углового стыка
                    state.ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
                    state.ctx.strokeStyle = '#10b981';
                    state.ctx.lineWidth = 2;
                    state.ctx.beginPath();
                    state.ctx.arc(jt.x, jt.y, 11, 0, Math.PI * 2);
                    state.ctx.fill();
                    state.ctx.stroke();

                    state.ctx.fillStyle = '#a7f3d0';
                    state.ctx.font = 'bold 8px Inter, sans-serif';
                    state.ctx.textAlign = 'center';
                    state.ctx.textBaseline = 'middle';
                    state.ctx.fillText('L', jt.x, jt.y);
                } else if (jt.type === 'T') {
                    // Бирюзовый индикатор Т-образного стыка
                    state.ctx.fillStyle = 'rgba(6, 182, 212, 0.32)';
                    state.ctx.strokeStyle = '#22d3ee';
                    state.ctx.lineWidth = 2.2;
                    state.ctx.beginPath();
                    state.ctx.arc(jt.x, jt.y, 12, 0, Math.PI * 2);
                    state.ctx.fill();
                    state.ctx.stroke();

                    state.ctx.fillStyle = '#cffafe';
                    state.ctx.font = 'bold 9px Inter, sans-serif';
                    state.ctx.textAlign = 'center';
                    state.ctx.textBaseline = 'middle';
                    state.ctx.fillText('T', jt.x, jt.y);
                }
            }

            // Если сейчас активно магнитное притягивание — подсвечиваем его
            if (state.activeSnapPreview) {
                const isT = state.activeSnapPreview.type === 'T';
                state.ctx.strokeStyle = isT ? '#22d3ee' : '#10b981';
                state.ctx.lineWidth = 2.5;
                state.ctx.beginPath();
                state.ctx.arc(state.activeSnapPreview.x, state.activeSnapPreview.y, 16, 0, Math.PI * 2);
                state.ctx.stroke();
            }

            state.ctx.restore();
        }

function drawElevationView(allJoints) {
            const w = state.elevCanvas.width;
            const h = state.elevCanvas.height;
            state.elevCtx.clearRect(0, 0, w, h);
            state.elevCtx.fillStyle = '#0b1120';
            state.elevCtx.fillRect(0, 0, w, h);

            const wall = state.walls.find(item => item.id === state.selectedWallId) || state.walls[0];
            const titleEl = document.getElementById('elevationTitle');
            const subEl = document.getElementById('elevationSubtitle');

            if (!wall) {
                titleEl.textContent = 'Block layout (side view by courses)';
                subEl.textContent = '— add a wall';
                return;
            }

            const joints = allJoints || getAllWallJoints();
            const wallLenCm = getWallLengthCm(wall);
            const stats = calculateWallBlocks(wall, joints);
            titleEl.textContent = `Elevation: Wall #${wall.id} (${wallLenCm * MM_PER_CM} mm × ${getWallRows(wall)} courses)`;
            subEl.textContent = `Full 400 mm blocks: ${stats.fullCount} | Half 200 mm blocks: ${stats.halfCount}${stats.unfilledCm > 0 ? ` | Remainder across courses: ${Math.round(stats.unfilledCm * MM_PER_CM)} mm` : ''}`;

            const padLeft = 44;
            const padRight = 24;
            const padTop = 18;
            const padBottom = 22;

            const availW = Math.max(100, w - padLeft - padRight);
            const availH = Math.max(40, h - padTop - padBottom);

            const scaleX = Math.min(availW / wallLenCm, 1.8);
            const drawWallW = wallLenCm * scaleX;
            const startX = padLeft + (availW - drawWallW) / 2;
            const rowH = availH / getWallRows(wall);
            state.elevationGeometry = {wallId: wall.id, startX, scaleX, padTop, availH, rowH};

            state.elevCtx.fillStyle = '#38bdf8';
            state.elevCtx.font = '600 11px Inter, sans-serif';
            state.elevCtx.textBaseline = 'bottom';
            // Labels extend outwards from the wall ends, so short walls cannot make them overlap.
            state.elevCtx.textAlign = 'right';
            state.elevCtx.fillText('Start', startX, padTop - 4);
            state.elevCtx.fillStyle = '#fbbf24';
            state.elevCtx.textAlign = 'left';
            state.elevCtx.fillText('End', startX + drawWallW, padTop - 4);

            // Отрисовка рядов снизу вверх (1-й ряд внизу)
            for (let r = 1; r <= getWallRows(wall); r++) {
                const y = padTop + (getWallRows(wall) - r) * rowH;
                const layout = buildWallRowLayout(wall, r, joints);

                // Номер ряда слева
                if (getWallRows(wall) <= 14 || r % 2 === 1) {
                    //state.elevCtx.fillStyle = (r === state.activePlanRow) ? '#fbbf24' : '#64748b';
                    state.elevCtx.fillStyle = '#64748b';
                    state.elevCtx.font = '10px Inter, sans-serif';
                    state.elevCtx.textAlign = 'right';
                    state.elevCtx.textBaseline = 'middle';
                    state.elevCtx.fillText(`C${r}`, startX - 8, y + rowH / 2);
                }

                // Draw the 20 cm corner overlap contributed by the perpendicular wall.
                if (layout.cornerState.startIsLCorner && layout.cornerState.startInsetCm === HALF_BLOCK_CM) {
                    const bx = startX;
                    const bw = HALF_BLOCK_CM * scaleX;
                    state.elevCtx.fillStyle = '#1e293b';
                    state.elevCtx.strokeStyle = '#10b981';
                    state.elevCtx.lineWidth = 1;
                    state.elevCtx.beginPath();
                    state.elevCtx.roundRect(bx + 0.5, y + 0.5, Math.max(2, bw - 1), Math.max(2, rowH - 1), 2);
                    state.elevCtx.fill();
                    state.elevCtx.stroke();

                    if (bw >= 18 && rowH >= 10) {
                        state.elevCtx.fillStyle = '#6ee7b7';
                        state.elevCtx.font = 'bold 8px Inter, sans-serif';
                        state.elevCtx.textAlign = 'center';
                        state.elevCtx.textBaseline = 'middle';
                        state.elevCtx.fillText('corner', bx + bw / 2, y + rowH / 2);
                    }
                }

                if (layout.cornerState.endIsLCorner && layout.cornerState.endInsetCm === HALF_BLOCK_CM) {
                    const bx = startX + (wallLenCm - HALF_BLOCK_CM) * scaleX;
                    const bw = HALF_BLOCK_CM * scaleX;
                    state.elevCtx.fillStyle = '#1e293b';
                    state.elevCtx.strokeStyle = '#10b981';
                    state.elevCtx.lineWidth = 1;
                    state.elevCtx.beginPath();
                    state.elevCtx.roundRect(bx + 0.5, y + 0.5, Math.max(2, bw - 1), Math.max(2, rowH - 1), 2);
                    state.elevCtx.fill();
                    state.elevCtx.stroke();

                    if (bw >= 18 && rowH >= 10) {
                        state.elevCtx.fillStyle = '#6ee7b7';
                        state.elevCtx.font = 'bold 8px Inter, sans-serif';
                        state.elevCtx.textAlign = 'center';
                        state.elevCtx.textBaseline = 'middle';
                        state.elevCtx.fillText('corner', bx + bw / 2, y + rowH / 2);
                    }
                }

                // Blocks in this course
                for (const b of layout.blocks) {
                    const bx = startX + b.startCm * scaleX;
                    const bw = b.lenCm * scaleX;
                    const isFull = b.kind === 'full';

                    state.elevCtx.fillStyle = isFull ? '#2563eb' : '#d97706';
                    state.elevCtx.strokeStyle = '#0f172a';
                    state.elevCtx.lineWidth = 1;
                    state.elevCtx.beginPath();
                    state.elevCtx.roundRect(bx + 0.5, y + 0.5, Math.max(2, bw - 1), Math.max(2, rowH - 1), 2);
                    state.elevCtx.fill();
                    state.elevCtx.stroke();

                    // Label blocks when there is enough room.
                    if (bw >= 22 && rowH >= 11) {
                        state.elevCtx.fillStyle = isFull ? '#dbeafe' : '#fef3c7';
                        state.elevCtx.font = 'bold 9px Inter, sans-serif';
                        state.elevCtx.textAlign = 'center';
                        state.elevCtx.textBaseline = 'middle';
                        state.elevCtx.fillText(isFull ? '400' : '200', bx + bw / 2, y + rowH / 2);
                    }
                }

                for (const segment of layout.unfilledSegments) {
                    const markerX = startX + ((segment.startCm + segment.endCm) / 2) * scaleX;
                    state.elevCtx.fillStyle = '#f87171';
                    state.elevCtx.fillRect(markerX - 1, y + 1, 2, Math.max(2, rowH - 2));
                }

                // Проёмы в этом ряду
                for (const op of layout.openingsInRow) {
                    const ox = startX + op.startCm * scaleX;
                    const ow = op.lenCm * scaleX;
                    state.elevCtx.fillStyle = op.type === 'window'
                        ? 'rgba(56, 189, 248, 0.16)'
                        : op.type === 'door'
                            ? 'rgba(16, 185, 129, 0.16)'
                            : 'rgba(168, 85, 247, 0.16)';
                    state.elevCtx.fillRect(ox, y, ow, rowH);
                }
            }

            state.elevCtx.save();
            state.elevCtx.strokeStyle = '#f472b6';
            state.elevCtx.lineWidth = 2;
            state.elevCtx.setLineDash([4, 3]);
            for (const joint of getControlJoints(wall)) {
                const x = startX + joint * scaleX;
                state.elevCtx.beginPath();
                state.elevCtx.moveTo(x, padTop);
                state.elevCtx.lineTo(x, padTop + availH);
                state.elevCtx.stroke();
            }
            state.elevCtx.restore();

            // Millimetre ruler below the elevation.
            state.elevCtx.fillStyle = '#94a3b8';
            state.elevCtx.font = '10px Inter, sans-serif';
            state.elevCtx.textAlign = 'center';
            const stepCm = wallLenCm > 600 ? FULL_BLOCK_CM : HALF_BLOCK_CM;
            for (let cm = 0; cm <= wallLenCm; cm += stepCm) {
                const x = startX + cm * scaleX;
                state.elevCtx.fillText(`${cm * MM_PER_CM}`, x, padTop + availH + 13);
            }

            // Mark the tied butt connection at the ends of a T-branch.
            const cornerInfo = getWallEndCornerState(wall, 1, joints);
            if (cornerInfo.startIsTButt) {
                state.elevCtx.strokeStyle = '#22d3ee';
                state.elevCtx.lineWidth = 3;
                state.elevCtx.beginPath();
                state.elevCtx.moveTo(startX, padTop);
                state.elevCtx.lineTo(startX, padTop + availH);
                state.elevCtx.stroke();
            }
            if (cornerInfo.endIsTButt) {
                const endX = startX + wallLenCm * scaleX;
                state.elevCtx.strokeStyle = '#22d3ee';
                state.elevCtx.lineWidth = 3;
                state.elevCtx.beginPath();
                state.elevCtx.moveTo(endX, padTop);
                state.elevCtx.lineTo(endX, padTop + availH);
                state.elevCtx.stroke();
            }

            // Highlight the 20 cm host-wall cell used by each attached T-partition.
            const hostTJoints = joints.filter(jt => jt.type === 'T' && jt.hostWallId === wall.id);
            for (const jt of hostTJoints) {
                const cellX = startX + jt.cellStartCm * scaleX;
                const cellW = HALF_BLOCK_CM * scaleX;

                state.elevCtx.save();
                state.elevCtx.fillStyle = 'rgba(34, 211, 238, 0.12)';
                state.elevCtx.fillRect(cellX, padTop, cellW, availH);

                state.elevCtx.strokeStyle = '#22d3ee';
                state.elevCtx.lineWidth = 1.5;
                state.elevCtx.setLineDash([4, 3]);
                state.elevCtx.strokeRect(cellX, padTop, cellW, availH);
                state.elevCtx.setLineDash([]);

                state.elevCtx.fillStyle = '#67e8f9';
                state.elevCtx.font = 'bold 9px Inter, sans-serif';
                state.elevCtx.textAlign = 'center';
                state.elevCtx.fillText(`T-joint (${jt.cellStartCm}–${jt.cellEndCm})`, cellX + cellW / 2, padTop - 3);
                state.elevCtx.restore();
            }
        }

function render() {
            state.ctx.save();
            state.ctx.setTransform(1, 0, 0, 1, 0, 0);
            state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
            state.ctx.setTransform(state.zoom, 0, 0, state.zoom, state.panX, state.panY);
            drawGrid();

            const allJoints = getAllWallJoints();

            // Show half-block snap divisions while dragging a T-joint.
            if (state.activeSnapPreview && state.activeSnapPreview.type === 'T') {
                drawHostWallSnapTicks(state.activeSnapPreview.wallId);
            }

            // Сначала рисуем невыбранные стены, затем выбранную поверх
            for (const w of state.walls) {
                if (w.id !== state.selectedWallId) drawWall(w, false, allJoints);
            }
            const selWall = state.walls.find(w => w.id === state.selectedWallId);
            if (selWall) drawWall(selWall, true, allJoints);

            drawConnectedJoints();
            state.ctx.restore();
            drawElevationView(allJoints);
        }

function updateZoomLabel() {
            document.getElementById('zoomLevel').textContent = `${Math.round(state.zoom * 100)}%`;
        }

function zoomAt(screenX, screenY, factor) {
            const nextZoom = clamp(state.zoom * factor, MIN_ZOOM, MAX_ZOOM);
            if (nextZoom === state.zoom) return;

            const worldX = (screenX - state.panX) / state.zoom;
            const worldY = (screenY - state.panY) / state.zoom;
            state.zoom = nextZoom;
            state.panX = screenX - worldX * nextZoom;
            state.panY = screenY - worldY * nextZoom;
            updateZoomLabel();
            render();
        }

function resetZoom() {
            state.zoom = 1;
            state.panX = 0;
            state.panY = 0;
            updateZoomLabel();
            render();
        }
