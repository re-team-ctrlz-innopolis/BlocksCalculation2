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
            for (let x = Math.floor(left / HALF_BLOCK_PX) * HALF_BLOCK_PX; x <= right; x += HALF_BLOCK_PX) {
                state.ctx.strokeStyle = '#111827';
                state.ctx.beginPath();
                state.ctx.moveTo(x, top);
                state.ctx.lineTo(x, bottom);
                state.ctx.stroke();
            }
            for (let y = Math.floor(top / HALF_BLOCK_PX) * HALF_BLOCK_PX; y <= bottom; y += HALF_BLOCK_PX) {
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
            const lenMm = getWallLengthMm(w);
            const angle = getWallAngleRad(w);

            state.ctx.save();
            state.ctx.translate(w.x1, w.y1);
            state.ctx.rotate(angle);

            // Highlight 200 mm half-block boundaries and their centers for T-joint snapping.
            for (let cellStartMm = HALF_BLOCK_MM; cellStartMm <= lenMm - FULL_BLOCK_MM; cellStartMm += HALF_BLOCK_MM) {
                const startPx = mmToPx(cellStartMm);
                const centerPx = mmToPx(cellStartMm + HALF_BLOCK_MM / 2);
                const isActiveCell = state.activeSnapPreview && Math.abs(state.activeSnapPreview.cellStartMm - cellStartMm) < 1;

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

function drawWall(wall, isSelected, allJoints, controlLayout) {
            const lenPx = getWallLength(wall);
            const lenMm = getWallLengthMm(wall);
            const angle = getWallAngleRad(wall);
            const halfThick = WALL_THICKNESS / 2;

            // Calculate this wall's course layout, including automatic control joints.
            const baseLayout = buildWallRowLayout(wall, state.activePlanRow, allJoints, controlLayout);

            // Если конец стены входит в L-угол, удлиняем визуальный контур на половину толщины (halfThick).
            // Если конец стены примыкает в Т-стык ("на клей"), отступаем от оси основной стены на её полутолщину (-halfThick),
            // чтобы примыкающая стена визуально стыковалась ровно к боковой грани блока основной стены без нахлёста.
            const extStartPx = baseLayout.cornerState.startIsLCorner
                ? halfThick
                : (baseLayout.cornerState.startIsTButt ? -halfThick : 0);
            const extEndPx = baseLayout.cornerState.endIsLCorner
                ? halfThick
                : (baseLayout.cornerState.endIsTButt ? -halfThick : 0);

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

            for (const b of baseLayout.blocks) {
                // Масштабируем координаты на случай внешнего углового нахлёста (L) или примыкания встык к боковой грани (T)
                let bx = mmToPx(b.startMm);
                let bw = mmToPx(b.lenMm);

                if (b.startMm === 0 && baseLayout.cornerState.startConnected) {
                    bx -= extStartPx;
                    bw += extStartPx;
                } else if (b.startMm === HALF_BLOCK_MM && baseLayout.cornerState.startIsLCorner && baseLayout.cornerState.startInsetMm === HALF_BLOCK_MM) {
                    bx -= extStartPx;
                    bw += extStartPx;
                }

                if (b.startMm + b.lenMm === lenMm && baseLayout.cornerState.endConnected) {
                    bw += extEndPx;
                } else if (b.startMm + b.lenMm === lenMm - HALF_BLOCK_MM && baseLayout.cornerState.endIsLCorner && baseLayout.cornerState.endInsetMm === HALF_BLOCK_MM) {
                    bw += extEndPx;
                }

                const isFull = b.kind === 'full';

                // Тело Лего-блока
                state.ctx.fillStyle = isFull ? '#2563eb' : '#d97706';
                state.ctx.strokeStyle = '#0f172a';
                state.ctx.lineWidth = 1.2;
                state.ctx.beginPath();
                state.ctx.roundRect(bx + 0.8, -halfThick + 1.5, bw - 1.6, WALL_THICKNESS - 3, 3);
                state.ctx.fill();
                state.ctx.stroke();

                // Two studs mark a 400 mm block; one marks a 200 mm half block.
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

            for (const jointMm of baseLayout.controlJointsMm) {
                const jointX = mmToPx(jointMm);
                state.ctx.strokeStyle = '#e879f9';
                state.ctx.lineWidth = 2 / state.zoom;
                state.ctx.setLineDash([5 / state.zoom, 3 / state.zoom]);
                state.ctx.beginPath();
                state.ctx.moveTo(jointX, -halfThick + 1);
                state.ctx.lineTo(jointX, halfThick - 1);
                state.ctx.stroke();
                state.ctx.setLineDash([]);
                state.ctx.fillStyle = '#f5d0fe';
                state.ctx.font = `${9 / state.zoom}px Inter, sans-serif`;
                state.ctx.textAlign = 'center';
                state.ctx.fillText('CJ', jointX, -halfThick - 8 / state.zoom);
            }

            for (const segment of baseLayout.unfilledSegments) {
                const markerX = mmToPx((segment.startMm + segment.endMm) / 2);
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
                const startRow = op.startRow || 1;
                const endRow = startRow + (op.rowCount || 7) - 1;
                const isOpeningInCourse = state.activePlanRow >= startRow && state.activePlanRow <= endRow;
                const isProjectedWindow = op.type === 'window' && !isOpeningInCourse;
                if (!isOpeningInCourse && !isProjectedWindow) continue;

                const { startMm, lenMm } = getOpeningBoundsMm(op);
                const ox = mmToPx(startMm);
                const ow = mmToPx(lenMm);
                const isOpSelected = isSelected && (op.id === state.selectedOpeningId);

                if (isProjectedWindow) {
                    state.ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
                    state.ctx.fillRect(ox, -halfThick + 1, ow, WALL_THICKNESS - 2);
                    state.ctx.strokeStyle = '#38bdf8';
                    state.ctx.lineWidth = 1.5 / state.zoom;
                    state.ctx.setLineDash([4 / state.zoom, 3 / state.zoom]);
                    state.ctx.strokeRect(ox + 1, -halfThick + 1, Math.max(0, ow - 2), WALL_THICKNESS - 2);
                    state.ctx.setLineDash([]);
                } else {
                    state.ctx.fillStyle = '#0f172a';
                    state.ctx.fillRect(ox, -halfThick + 1, ow, WALL_THICKNESS - 2);
                }

                if (op.type === 'window' && !isProjectedWindow) {
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
                state.ctx.fillText(`${lenMm}`, 0, 0);
                state.ctx.restore();
            }

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
            state.ctx.fillText(`${lenMm} mm`, 0, 0);
            state.ctx.restore();

            for (const mark of [
                { x: 0, label: 'L', color: '#38bdf8' },
                { x: lenPx, label: 'R', color: '#fbbf24' }
            ]) {
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

function drawElevationView(allJoints, controlLayout) {
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
            const wallLenMm = getWallLengthMm(wall);
            const stats = calculateWallBlocks(wall, joints, controlLayout);
            titleEl.textContent = `Elevation: Wall #${wall.id} (${wallLenMm} mm × ${state.totalWallRows} courses)`;
            subEl.textContent = `Full 400 mm blocks: ${stats.fullCount} | Half 200 mm blocks: ${stats.halfCount} | Control joints: ${controlLayout.count} | Unfilled: ${stats.unfilledMm} mm`;

            const padLeft = 44;
            const padRight = 24;
            const padTop = 14;
            const padBottom = 22;

            const availW = Math.max(100, w - padLeft - padRight);
            const availH = Math.max(40, h - padTop - padBottom);

            const scaleX = Math.min(availW / wallLenMm, 1.8);
            const drawWallW = wallLenMm * scaleX;
            const startX = padLeft + (availW - drawWallW) / 2;
            const rowH = availH / state.totalWallRows;

            state.elevCtx.fillStyle = '#38bdf8';
            state.elevCtx.font = 'bold 9px Inter, sans-serif';
            state.elevCtx.textBaseline = 'bottom';
            state.elevCtx.textAlign = 'left';
            state.elevCtx.fillText('LEFT / START (x1)', startX, padTop - 2);
            state.elevCtx.fillStyle = '#fbbf24';
            state.elevCtx.textAlign = 'right';
            state.elevCtx.fillText('RIGHT / END (x2)', startX + drawWallW, padTop - 2);

            // Отрисовка рядов снизу вверх (1-й ряд внизу)
            for (let r = 1; r <= state.totalWallRows; r++) {
                const y = padTop + (state.totalWallRows - r) * rowH;
                const layout = buildWallRowLayout(wall, r, joints, controlLayout);

                // Номер ряда слева
                if (state.totalWallRows <= 14 || r % 2 === 1) {
                    //state.elevCtx.fillStyle = (r === state.activePlanRow) ? '#fbbf24' : '#64748b';
                    state.elevCtx.fillStyle = '#64748b';
                    state.elevCtx.font = '10px Inter, sans-serif';
                    state.elevCtx.textAlign = 'right';
                    state.elevCtx.textBaseline = 'middle';
                    state.elevCtx.fillText(`C${r}`, startX - 8, y + rowH / 2);
                }

                // Draw the 200 mm corner overlap contributed by the perpendicular wall.
                if (layout.cornerState.startIsLCorner && layout.cornerState.startInsetMm === HALF_BLOCK_MM) {
                    const bx = startX;
                    const bw = HALF_BLOCK_MM * scaleX;
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

                if (layout.cornerState.endIsLCorner && layout.cornerState.endInsetMm === HALF_BLOCK_MM) {
                    const bx = startX + (wallLenMm - HALF_BLOCK_MM) * scaleX;
                    const bw = HALF_BLOCK_MM * scaleX;
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
                    const bx = startX + b.startMm * scaleX;
                    const bw = b.lenMm * scaleX;
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
                    const markerX = startX + ((segment.startMm + segment.endMm) / 2) * scaleX;
                    state.elevCtx.fillStyle = '#f87171';
                    state.elevCtx.fillRect(markerX - 1, y + 1, 2, Math.max(2, rowH - 2));
                }

                // Проёмы в этом ряду
                for (const op of layout.openingsInRow) {
                    const ox = startX + op.startMm * scaleX;
                    const ow = op.lenMm * scaleX;
                    state.elevCtx.fillStyle = op.type === 'window'
                        ? 'rgba(56, 189, 248, 0.16)'
                        : 'rgba(16, 185, 129, 0.16)';
                    state.elevCtx.fillRect(ox, y, ow, rowH);
                }

                for (const jointMm of layout.controlJointsMm) {
                    const jointX = startX + jointMm * scaleX;
                    state.elevCtx.strokeStyle = '#e879f9';
                    state.elevCtx.lineWidth = 2;
                    state.elevCtx.setLineDash([4, 3]);
                    state.elevCtx.beginPath();
                    state.elevCtx.moveTo(jointX, y);
                    state.elevCtx.lineTo(jointX, y + rowH);
                    state.elevCtx.stroke();
                    state.elevCtx.setLineDash([]);
                }
            }

            // Millimetre ruler below the elevation.
            state.elevCtx.fillStyle = '#94a3b8';
            state.elevCtx.font = '10px Inter, sans-serif';
            state.elevCtx.textAlign = 'center';
            const stepMm = wallLenMm > 2400 ? FULL_BLOCK_MM : HALF_BLOCK_MM;
            for (let mm = 0; mm <= wallLenMm; mm += stepMm) {
                const x = startX + mm * scaleX;
                state.elevCtx.fillText(`${mm}`, x, padTop + availH + 13);
            }

            // Индикатор клеевого шва (Т-стыка) по краям примыкающей стены на развёртке
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
                const endX = startX + wallLenMm * scaleX;
                state.elevCtx.strokeStyle = '#22d3ee';
                state.elevCtx.lineWidth = 3;
                state.elevCtx.beginPath();
                state.elevCtx.moveTo(endX, padTop);
                state.elevCtx.lineTo(endX, padTop + availH);
                state.elevCtx.stroke();
            }

            // Highlight the 200 mm host-wall cell used by each attached T-partition.
            const hostTJoints = joints.filter(jt => jt.type === 'T' && jt.hostWallId === wall.id);
            for (const jt of hostTJoints) {
                const cellX = startX + jt.cellStartMm * scaleX;
                const cellW = HALF_BLOCK_MM * scaleX;

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
                state.elevCtx.fillText(`T-joint (${jt.cellStartMm}–${jt.cellEndMm})`, cellX + cellW / 2, padTop - 3);
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
            const controlLayout = getControlJointLayout();

            // Show half-block snap divisions while dragging a T-joint.
            if (state.activeSnapPreview && state.activeSnapPreview.type === 'T') {
                drawHostWallSnapTicks(state.activeSnapPreview.wallId);
            }

            // Сначала рисуем невыбранные стены, затем выбранную поверх
            for (const w of state.walls) {
                if (w.id !== state.selectedWallId) drawWall(w, false, allJoints, controlLayout);
            }
            const selWall = state.walls.find(w => w.id === state.selectedWallId);
            if (selWall) drawWall(selWall, true, allJoints, controlLayout);

            drawConnectedJoints();
            state.ctx.restore();
            drawElevationView(allJoints, controlLayout);
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
