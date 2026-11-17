function dist(x1, y1, x2, y2) {
            return Math.hypot(x2 - x1, y2 - y1);
        }

function clamp(val, min, max) {
            return Math.max(min, Math.min(max, val));
        }

function mmToPx(mm) {
            return mm * PX_PER_MM;
        }

function pxToMm(px) {
            return px / PX_PER_MM;
        }

function snapMmToGrid(mm) {
            return Math.round(mm / BLOCK_GRID_MM) * BLOCK_GRID_MM;
        }

function getWallLength(w) {
            return dist(w.x1, w.y1, w.x2, w.y2);
        }

function getWallLengthMm(w) {
            return Math.max(MIN_WALL_MM, snapMmToGrid(pxToMm(getWallLength(w))));
        }

function getWallAngleRad(w) {
            return Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
        }

function getWallAngleDeg(w) {
            return Math.round(getWallAngleRad(w) * 180 / Math.PI);
        }

function getWallCenter(w) {
            return { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 };
        }

function worldToWallLocal(w, wx, wy) {
            const dx = wx - w.x1;
            const dy = wy - w.y1;
            const angle = getWallAngleRad(w);
            const cos = Math.cos(-angle);
            const sin = Math.sin(-angle);
            return {
                along: dx * cos - dy * sin,
                perp: dx * sin + dy * cos
            };
        }

function wallLocalToWorld(w, along, perp) {
            const angle = getWallAngleRad(w);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            return {
                x: w.x1 + along * cos - perp * sin,
                y: w.y1 + along * sin + perp * cos
            };
        }

function getRotateHandlePos(w) {
            const len = getWallLength(w);
            return wallLocalToWorld(w, len / 2, -WALL_THICKNESS / 2 - 26);
        }

function getOpeningBoundsMm(op) {
            const lenMm = Math.max(HALF_BLOCK_MM, snapMmToGrid(pxToMm(op.length)));
            const startMm = Math.max(HALF_BLOCK_MM, snapMmToGrid(pxToMm(op.offset - op.length / 2)));
            return { startMm, endMm: startMm + lenMm, lenMm };
        }

function setOpeningBoundsMm(op, startMm, lenMm) {
            const s = snapMmToGrid(startMm);
            const l = Math.max(HALF_BLOCK_MM, snapMmToGrid(lenMm));
            op.length = mmToPx(l);
            op.offset = mmToPx(s + l / 2);
        }

function getOpeningLimitsMm(wall, targetOp) {
            const wallLenMm = getWallLengthMm(wall);
            const sorted = [...wall.openings].sort((a, b) => a.offset - b.offset);
            const idx = sorted.findIndex(o => o.id === targetOp.id);

            let minMm = HALF_BLOCK_MM;
            let maxMm = wallLenMm - HALF_BLOCK_MM;

            if (idx > 0) {
                const prev = getOpeningBoundsMm(sorted[idx - 1]);
                minMm = prev.endMm;
            }
            if (idx !== -1 && idx < sorted.length - 1) {
                const next = getOpeningBoundsMm(sorted[idx + 1]);
                maxMm = next.startMm;
            }
            return { minMm, maxMm };
        }

function clampWallOpenings(wall) {
            const wallLenMm = getWallLengthMm(wall);
            wall.openings.sort((a, b) => a.offset - b.offset);
            let cursorMm = HALF_BLOCK_MM;

            for (let i = 0; i < wall.openings.length; i++) {
                const op = wall.openings[i];
                const remainingOps = wall.openings.length - 1 - i;
                const maxEndForThis = wallLenMm - HALF_BLOCK_MM - remainingOps * HALF_BLOCK_MM;
                let { startMm, lenMm } = getOpeningBoundsMm(op);

                startMm = clamp(startMm, cursorMm, Math.max(cursorMm, maxEndForThis - HALF_BLOCK_MM));
                lenMm = clamp(lenMm, HALF_BLOCK_MM, Math.max(HALF_BLOCK_MM, maxEndForThis - startMm));

                setOpeningBoundsMm(op, startMm, lenMm);
                if (op.type === 'door') {
                    op.startRow = 1;
                } else {
                    op.startRow = clamp(op.startRow || 2, 2, state.totalWallRows);
                }
                const defaultRowCount = op.type === 'door' ? 7 : 4;
                op.rowCount = clamp(op.rowCount || defaultRowCount, 1, state.totalWallRows - op.startRow + 1);
                cursorMm = startMm + lenMm;
            }
        }

function findFreeSlotForOpening(wall, desiredLenMm = FULL_BLOCK_MM) {
            const wallLenMm = getWallLengthMm(wall);
            const sorted = [...wall.openings]
                .map(op => getOpeningBoundsMm(op))
                .sort((a, b) => a.startMm - b.startMm);

            const gaps = [];
            let cursor = HALF_BLOCK_MM;
            for (const b of sorted) {
                if (b.startMm > cursor) {
                    gaps.push({ startMm: cursor, freeMm: b.startMm - cursor });
                }
                cursor = Math.max(cursor, b.endMm);
            }
            if (wallLenMm - HALF_BLOCK_MM > cursor) {
                gaps.push({ startMm: cursor, freeMm: (wallLenMm - HALF_BLOCK_MM) - cursor });
            }

            const bestGap = gaps.find(g => g.freeMm >= desiredLenMm) || gaps.find(g => g.freeMm >= HALF_BLOCK_MM);
            if (!bestGap) return null;

            const actualLenMm = Math.min(desiredLenMm, snapMmToGrid(bestGap.freeMm));
            const startMm = snapMmToGrid(bestGap.startMm + (bestGap.freeMm - actualLenMm) / 2);
            return { startMm, lenMm: actualLenMm };
        }

function getMinAllowedWallLengthMm(wall) {
            if (!wall.openings || wall.openings.length === 0) return MIN_WALL_MM;
            const totalOpeningsMm = wall.openings.reduce((acc, op) => acc + getOpeningBoundsMm(op).lenMm, 0);
            return Math.max(MIN_WALL_MM, totalOpeningsMm + HALF_BLOCK_MM * 2);
        }

function setWallLengthFromCenter(wall, newLenMm) {
            const minAllowed = getMinAllowedWallLengthMm(wall);
            const clampedMm = clamp(snapMmToGrid(newLenMm), minAllowed, MAX_WALL_MM);
            const newLenPx = mmToPx(clampedMm);
            const center = getWallCenter(wall);
            const angle = getWallAngleRad(wall);
            const half = newLenPx / 2;

            wall.x1 = center.x - Math.cos(angle) * half;
            wall.y1 = center.y - Math.sin(angle) * half;
            wall.x2 = center.x + Math.cos(angle) * half;
            wall.y2 = center.y + Math.sin(angle) * half;
            clampWallOpenings(wall);
        }

        function snapAngleTo90(angleDeg) {
                    return Math.round(angleDeg / 90) * 90;
        }

function setWallAngleFromCenter(wall, angleDeg) {
                    const snappedAngleDeg = snapAngleTo90(angleDeg);
            const angleRad = snappedAngleDeg * Math.PI / 180;
            const lenPx = mmToPx(getWallLengthMm(wall));
            const center = getWallCenter(wall);
            const half = lenPx / 2;

            wall.x1 = center.x - Math.cos(angleRad) * half;
            wall.y1 = center.y - Math.sin(angleRad) * half;
            wall.x2 = center.x + Math.cos(angleRad) * half;
            wall.y2 = center.y + Math.sin(angleRad) * half;
        }

function snapToHalfBlockCellCenterMm(rawAlongMm, wallLenMm) {
            // Keep T-joints outside the half-block corner margins.
            const minCellStartMm = HALF_BLOCK_MM;
            const maxCellStartMm = Math.max(HALF_BLOCK_MM, wallLenMm - FULL_BLOCK_MM);
            const rawCellStartMm = Math.round((rawAlongMm - HALF_BLOCK_MM / 2) / HALF_BLOCK_MM) * HALF_BLOCK_MM;
            const cellStartMm = clamp(rawCellStartMm, minCellStartMm, maxCellStartMm);
            return {
                centerMm: cellStartMm + HALF_BLOCK_MM / 2, // Центр половинки блока (25, 75, 125...)
                cellStartMm,                               // Начало половинки блока (0, 50, 100...)
                cellEndMm: cellStartMm + HALF_BLOCK_MM     // Конец половинки блока (50, 100, 150...)
            };
        }

function findSnapPoint(x, y, excludeWallId) {
            let best = null;
            const snapRadius = SNAP_RADIUS / state.zoom;
            let minDist = snapRadius;

            for (const w of state.walls) {
                if (w.id === excludeWallId) continue;

                // 1. Угловые L-соединения (конец-в-конец)
                const d1 = dist(x, y, w.x1, w.y1);
                if (d1 < minDist) {
                    minDist = d1;
                    best = {
                        x: w.x1,
                        y: w.y1,
                        wallId: w.id,
                        type: 'L',
                        offsetMm: 0
                    };
                }
                const d2 = dist(x, y, w.x2, w.y2);
                if (d2 < minDist) {
                    minDist = d2;
                    best = {
                        x: w.x2,
                        y: w.y2,
                        wallId: w.id,
                        type: 'L',
                        offsetMm: getWallLengthMm(w)
                    };
                }

                // T-joints snap to a 200 mm half-block cell on the host wall.
                const lenPx = getWallLength(w);
                const lenMm = getWallLengthMm(w);
                if (lenMm >= FULL_BLOCK_MM * 2) {
                    const loc = worldToWallLocal(w, x, y);
                    if (loc.along > HALF_BLOCK_PX * 0.5 && loc.along < lenPx - HALF_BLOCK_PX * 0.5 && Math.abs(loc.perp) < snapRadius) {
                        const cell = snapToHalfBlockCellCenterMm(pxToMm(loc.along), lenMm);
                        const snappedAlongPx = mmToPx(cell.centerMm);
                        const pt = wallLocalToWorld(w, snappedAlongPx, 0);
                        const dp = dist(x, y, pt.x, pt.y);
                        if (dp < minDist) {
                            minDist = dp;
                            best = {
                                x: pt.x,
                                y: pt.y,
                                wallId: w.id,
                                type: 'T',
                                offsetMm: cell.centerMm,
                                cellStartMm: cell.cellStartMm,
                                cellEndMm: cell.cellEndMm
                            };
                        }
                    }
                }
            }
            return best;
        }

function getAllWallJoints() {
            const joints = [];
            const eps = 2.0;

            for (let i = 0; i < state.walls.length; i++) {
                const a = state.walls[i];
                const endpointsA = [
                    { x: a.x1, y: a.y1, endName: 'start' },
                    { x: a.x2, y: a.y2, endName: 'end' }
                ];

                for (const ep of endpointsA) {
                    for (let j = 0; j < state.walls.length; j++) {
                        if (i === j) continue;
                        const b = state.walls[j];

                        // Проверка L-соединения (конец-в-конец)
                        const matchBStart = dist(ep.x, ep.y, b.x1, b.y1) <= eps;
                        const matchBEnd = dist(ep.x, ep.y, b.x2, b.y2) <= eps;

                        if (matchBStart || matchBEnd) {
                            const aOther = ep.endName === 'start'
                                ? { x: a.x2, y: a.y2 }
                                : { x: a.x1, y: a.y1 };
                            const bOther = matchBStart
                                ? { x: b.x2, y: b.y2 }
                                : { x: b.x1, y: b.y1 };
                            const aDx = aOther.x - ep.x;
                            const aDy = aOther.y - ep.y;
                            const bDx = bOther.x - ep.x;
                            const bDy = bOther.y - ep.y;
                            const perpendicular = Math.abs(aDx * bDx + aDy * bDy) <=
                                0.001 * Math.hypot(aDx, aDy) * Math.hypot(bDx, bDy);

                            if (perpendicular && !joints.some(jt => jt.type === 'L' && dist(jt.x, jt.y, ep.x, ep.y) <= eps)) {
                                const firstIsPrimary = a.id < b.id;
                                joints.push({
                                    type: 'L',
                                    x: ep.x,
                                    y: ep.y,
                                    wallA: firstIsPrimary ? a.id : b.id,
                                    endA: firstIsPrimary ? ep.endName : (matchBStart ? 'start' : 'end'),
                                    wallB: firstIsPrimary ? b.id : a.id,
                                    endB: firstIsPrimary ? (matchBStart ? 'start' : 'end') : ep.endName
                                });
                            }
                        } else {
                            // Проверка Т-соединения (конец стены A приклеен к одной половине блока стены B)
                            const lenB = getWallLength(b);
                            const lenBMm = getWallLengthMm(b);
                            if (lenB > 0) {
                                const loc = worldToWallLocal(b, ep.x, ep.y);
                                if (loc.along >= HALF_BLOCK_PX - eps && loc.along <= lenB - HALF_BLOCK_PX + eps && Math.abs(loc.perp) <= eps) {
                                    const cell = snapToHalfBlockCellCenterMm(pxToMm(loc.along), lenBMm);
                                    if (!joints.some(jt => jt.type === 'T' && jt.hostWallId === b.id && Math.abs(jt.offsetMm - cell.centerMm) < 10 && jt.branchWallId === a.id)) {
                                        joints.push({
                                            type: 'T',
                                            x: ep.x,
                                            y: ep.y,
                                            hostWallId: b.id,
                                            branchWallId: a.id,
                                            branchEnd: ep.endName,
                                            offsetMm: cell.centerMm,
                                            cellStartMm: cell.cellStartMm,
                                            cellEndMm: cell.cellEndMm
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            return joints;
        }

function getControlJointLayout(walls = state.walls) {
            const adjacency = new Map(walls.map(wall => [wall.id, new Set()]));
            const eps = 2;

            for (let i = 0; i < walls.length; i++) {
                const a = walls[i];
                const aDx = a.x2 - a.x1;
                const aDy = a.y2 - a.y1;
                const aLength = Math.hypot(aDx, aDy);
                if (!aLength) continue;

                for (let j = i + 1; j < walls.length; j++) {
                    const b = walls[j];
                    const bDx = b.x2 - b.x1;
                    const bDy = b.y2 - b.y1;
                    const bLength = Math.hypot(bDx, bDy);
                    if (!bLength) continue;
                    const cross = (aDx * bDy - aDy * bDx) / (aLength * bLength);
                    if (Math.abs(cross) > 0.001) continue;

                    const endpointsA = [{ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }];
                    const endpointsB = [{ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }];
                    if (endpointsA.some(pa => endpointsB.some(pb => dist(pa.x, pa.y, pb.x, pb.y) <= eps))) {
                        adjacency.get(a.id).add(b.id);
                        adjacency.get(b.id).add(a.id);
                    }
                }
            }

            const offsetsByWall = new Map(walls.map(wall => [wall.id, []]));
            const zonesByWall = new Map(walls.map(wall => [wall.id, []]));
            const visited = new Set();
            let count = 0;

            for (const root of walls) {
                if (visited.has(root.id)) continue;
                const component = [];
                const pending = [root.id];
                visited.add(root.id);
                while (pending.length) {
                    const wallId = pending.pop();
                    const wall = walls.find(item => item.id === wallId);
                    if (wall) component.push(wall);
                    for (const neighborId of adjacency.get(wallId) || []) {
                        if (!visited.has(neighborId)) {
                            visited.add(neighborId);
                            pending.push(neighborId);
                        }
                    }
                }
                const axisLength = getWallLength(component[0]);
                const axisX = (component[0].x2 - component[0].x1) / axisLength;
                const axisY = (component[0].y2 - component[0].y1) / axisLength;
                const projections = component.flatMap(wall => [
                    wall.x1 * axisX + wall.y1 * axisY,
                    wall.x2 * axisX + wall.y2 * axisY
                ]);
                const runStartMm = pxToMm(Math.min(...projections));
                const runEndMm = pxToMm(Math.max(...projections));

                for (let jointMm = runStartMm + CONTROL_JOINT_SPACING_MM;
                    jointMm < runEndMm - pxToMm(eps);
                    jointMm += CONTROL_JOINT_SPACING_MM) {
                    count++;
                    const jointProjection = mmToPx(jointMm);
                    const zoneStartProjection = jointProjection - mmToPx(2 * HALF_BLOCK_MM);
                    const zoneEndProjection = jointProjection + mmToPx(2 * HALF_BLOCK_MM);
                    for (const wall of component) {
                        const wallLength = getWallLength(wall);
                        const wallAxisX = (wall.x2 - wall.x1) / wallLength;
                        const wallAxisY = (wall.y2 - wall.y1) / wallLength;
                        const startProjection = wall.x1 * axisX + wall.y1 * axisY;
                        const direction = wallAxisX * axisX + wallAxisY * axisY;
                        const endProjection = startProjection + wallLength * direction;
                        const minProjection = Math.min(startProjection, endProjection);
                        const maxProjection = Math.max(startProjection, endProjection);

                        if (jointProjection >= minProjection - eps && jointProjection <= maxProjection + eps) {
                            const offsetMm = pxToMm((jointProjection - startProjection) / direction);
                            const clampedOffsetMm = clamp(offsetMm, 0, getWallLengthMm(wall));
                            const offsets = offsetsByWall.get(wall.id);
                            if (!offsets.some(existing => Math.abs(existing - clampedOffsetMm) < 1)) {
                                offsets.push(clampedOffsetMm);
                            }
                        }

                        const clippedStartProjection = Math.max(zoneStartProjection, minProjection);
                        const clippedEndProjection = Math.min(zoneEndProjection, maxProjection);
                        if (clippedEndProjection - clippedStartProjection > eps) {
                            const localA = pxToMm((clippedStartProjection - startProjection) / direction);
                            const localB = pxToMm((clippedEndProjection - startProjection) / direction);
                            const zone = {
                                startMm: clamp(Math.min(localA, localB), 0, getWallLengthMm(wall)),
                                endMm: clamp(Math.max(localA, localB), 0, getWallLengthMm(wall))
                            };
                            zonesByWall.get(wall.id).push(zone);
                        }
                    }
                }
            }

            return { offsetsByWall, zonesByWall, count };
        }

function validateGeometry(controlLayout = getControlJointLayout()) {
            const errors = [];
            if (state.walls.length === 0) return ['Add at least one wall to calculate a bill of materials.'];

            for (const wall of state.walls) {
                const rawLengthMm = pxToMm(getWallLength(wall));
                const wallLabel = `Wall #${wall.id}`;
                if (rawLengthMm < MIN_WALL_MM || rawLengthMm > MAX_WALL_MM) {
                    errors.push(`${wallLabel} must be between ${MIN_WALL_MM} mm and ${MAX_WALL_MM} mm.`);
                } else if (Math.abs(rawLengthMm - snapMmToGrid(rawLengthMm)) > 1) {
                    errors.push(`${wallLabel} length must be a multiple of ${BLOCK_GRID_MM} mm.`);
                }

                const angle = getWallAngleDeg(wall);
                if (Math.abs(angle - snapAngleTo90(angle)) > 0.5) {
                    errors.push(`${wallLabel} must be aligned to a 90° angle.`);
                }

                const wallLengthMm = pxToMm(getWallLength(wall));
                const openings = wall.openings.map(op => ({
                    id: op.id,
                    startMm: pxToMm(op.offset - op.length / 2),
                    lengthMm: pxToMm(op.length)
                })).sort((a, b) => a.startMm - b.startMm);
                let previousEndMm = HALF_BLOCK_MM;

                for (const opening of openings) {
                    const endMm = opening.startMm + opening.lengthMm;
                    if (opening.lengthMm < HALF_BLOCK_MM ||
                        Math.abs(opening.lengthMm - snapMmToGrid(opening.lengthMm)) > 1 ||
                        Math.abs(opening.startMm - snapMmToGrid(opening.startMm)) > 1) {
                        errors.push(`${wallLabel}, opening #${opening.id} must use ${BLOCK_GRID_MM} mm block modules.`);
                    }
                    if (opening.startMm < HALF_BLOCK_MM || endMm > wallLengthMm - HALF_BLOCK_MM) {
                        errors.push(`${wallLabel}, opening #${opening.id} must leave at least one half-block at each wall end.`);
                    }
                    if (opening.startMm < previousEndMm) {
                        errors.push(`${wallLabel} has overlapping openings.`);
                    }
                    const op = wall.openings.find(item => item.id === opening.id);
                    if (op.type === 'window' && (op.startRow || 1) < 2) {
                        errors.push(`${wallLabel}, window #${opening.id} must start at course 2 or higher.`);
                    } else if (op.type === 'door' && (op.startRow || 1) !== 1) {
                        errors.push(`${wallLabel}, door #${opening.id} must start at course 1.`);
                    } else if (op.type !== 'window' && op.type !== 'door') {
                        errors.push(`${wallLabel}, opening #${opening.id} has an unsupported type.`);
                    }
                    previousEndMm = Math.max(previousEndMm, endMm);
                }
            }

            const joints = getAllWallJoints();
            for (let i = 0; i < state.walls.length; i++) {
                const a = state.walls[i];
                const arx = a.x2 - a.x1;
                const ary = a.y2 - a.y1;
                for (let j = i + 1; j < state.walls.length; j++) {
                    const b = state.walls[j];
                    const brx = b.x2 - b.x1;
                    const bry = b.y2 - b.y1;
                    const cross = arx * bry - ary * brx;
                    const qpx = b.x1 - a.x1;
                    const qpy = b.y1 - a.y1;
                    const names = `Walls #${a.id} and #${b.id}`;

                    if (Math.abs(cross) <= 0.001 * getWallLength(a) * getWallLength(b)) {
                        if (Math.abs(qpx * ary - qpy * arx) > 2 * getWallLength(a)) continue;
                        const useX = Math.abs(arx) >= Math.abs(ary);
                        const aMin = Math.min(useX ? a.x1 : a.y1, useX ? a.x2 : a.y2);
                        const aMax = Math.max(useX ? a.x1 : a.y1, useX ? a.x2 : a.y2);
                        const bMin = Math.min(useX ? b.x1 : b.y1, useX ? b.x2 : b.y2);
                        const bMax = Math.max(useX ? b.x1 : b.y1, useX ? b.x2 : b.y2);
                        if (Math.min(aMax, bMax) - Math.max(aMin, bMin) > 2) {
                            errors.push(`${names} overlap along the same line.`);
                        }
                        continue;
                    }

                    const t = (qpx * bry - qpy * brx) / cross;
                    const u = (qpx * ary - qpy * arx) / cross;
                    const aLength = getWallLength(a);
                    const bLength = getWallLength(b);
                    const tTolerance = 2 / aLength;
                    const uTolerance = 2 / bLength;
                    if (t < -tTolerance || t > 1 + tTolerance ||
                        u < -uTolerance || u > 1 + uTolerance) continue;

                    const aAtEnd = t <= tTolerance || t >= 1 - tTolerance;
                    const bAtEnd = u <= uTolerance || u >= 1 - uTolerance;
                    const hasSupportedJoint = joints.some(joint =>
                        (joint.type === 'L' &&
                            ((joint.wallA === a.id && joint.wallB === b.id) ||
                                (joint.wallA === b.id && joint.wallB === a.id))) ||
                        (joint.type === 'T' &&
                            ((joint.branchWallId === a.id && joint.hostWallId === b.id) ||
                                (joint.branchWallId === b.id && joint.hostWallId === a.id)))
                    );
                    if ((!aAtEnd && !bAtEnd) || !hasSupportedJoint) {
                        errors.push(`${names} intersect without a valid L- or T-joint.`);
                    }
                }
            }

            for (const wall of state.walls) {
                const openingBounds = wall.openings.map(op => getOpeningBoundsMm(op));
                for (const zone of controlLayout.zonesByWall.get(wall.id) || []) {
                    if (openingBounds.some(op => op.startMm < zone.endMm && op.endMm > zone.startMm)) {
                        errors.push(`Wall #${wall.id} has an opening in the half-block zone around a control joint.`);
                    }
                }
            }

            return [...new Set(errors)];
        }

function getWallEndCornerState(wall, rowIndex, allJoints) {
            const isOddRow = (rowIndex % 2 === 1);
            const state = {
                startConnected: false,
                startIsLCorner: false,
                startIsTButt: false,
                startInsetMm: 0,      // 0 mm or a 200 mm inset for the alternating corner course.
                startPartnerWallId: null,
                endConnected: false,
                endIsLCorner: false,
                endIsTButt: false,
                endInsetMm: 0,
                endPartnerWallId: null
            };

            for (const jt of allJoints) {
                if (jt.type === 'L') {
                    if (jt.wallA === wall.id) {
                        // wallA takes the corner in odd courses and yields 200 mm in even courses.
                        const inset = isOddRow ? 0 : HALF_BLOCK_MM;
                        if (jt.endA === 'start') {
                            state.startConnected = true;
                            state.startIsLCorner = true;
                            state.startInsetMm = inset;
                            state.startPartnerWallId = jt.wallB;
                        } else {
                            state.endConnected = true;
                            state.endIsLCorner = true;
                            state.endInsetMm = inset;
                            state.endPartnerWallId = jt.wallB;
                        }
                    } else if (jt.wallB === wall.id) {
                        // wallB yields 200 mm in odd courses and takes the corner in even courses.
                        const inset = isOddRow ? HALF_BLOCK_MM : 0;
                        if (jt.endB === 'start') {
                            state.startConnected = true;
                            state.startIsLCorner = true;
                            state.startInsetMm = inset;
                            state.startPartnerWallId = jt.wallA;
                        } else {
                            state.endConnected = true;
                            state.endIsLCorner = true;
                            state.endInsetMm = inset;
                            state.endPartnerWallId = jt.wallA;
                        }
                    }
                } else if (jt.type === 'T' && jt.branchWallId === wall.id) {
                    // В Т-соединении примыкающая перегородка НЕ образует перевязанный угол с основной стеной,
                    // а крепится к её боковой грани встык ("на клей") с использованием половинчатых блоков для перевязки рядов
                    if (jt.branchEnd === 'start') {
                        state.startConnected = true;
                        state.startIsTButt = true;
                        state.startInsetMm = 0;
                        state.startPartnerWallId = jt.hostWallId;
                    } else {
                        state.endConnected = true;
                        state.endIsTButt = true;
                        state.endInsetMm = 0;
                        state.endPartnerWallId = jt.hostWallId;
                    }
                }
            }
            return state;
        }

function decomposeSegmentIntoBlocks(startMm, endMm, seamPhase, preferSingleFullBlock = false) {
            const blocks = [];
            let curStart = startMm;
            const curEnd = endMm;

            if (preferSingleFullBlock && Math.abs(curEnd - curStart - FULL_BLOCK_MM) < 0.001) {
                blocks.push({ startMm: curStart, lenMm: FULL_BLOCK_MM, kind: 'full' });
                return {
                    blocks,
                    unfilledSegments: []
                };
            }

            if (curEnd - curStart >= HALF_BLOCK_MM && (curStart % FULL_BLOCK_MM) !== seamPhase) {
                blocks.push({ startMm: curStart, lenMm: HALF_BLOCK_MM, kind: 'half' });
                curStart += HALF_BLOCK_MM;
            }

            while (curEnd - curStart >= FULL_BLOCK_MM) {
                blocks.push({ startMm: curStart, lenMm: FULL_BLOCK_MM, kind: 'full' });
                curStart += FULL_BLOCK_MM;
            }

            while (curEnd - curStart >= HALF_BLOCK_MM) {
                blocks.push({ startMm: curStart, lenMm: HALF_BLOCK_MM, kind: 'half' });
                curStart += HALF_BLOCK_MM;
            }

            return {
                blocks,
                unfilledSegments: curStart < curEnd ? [{ startMm: curStart, endMm: curEnd }] : []
            };
        }

function buildWallRowLayout(wall, rowIndex, precomputedJoints = null, controlLayout = null) {
            const wallLenMm = getWallLengthMm(wall);
            const allJoints = precomputedJoints || getAllWallJoints();
            const allControlJoints = controlLayout || getControlJointLayout();
            const controlJointsMm = allControlJoints.offsetsByWall.get(wall.id) || [];
            const controlZonesMm = allControlJoints.zonesByWall.get(wall.id) || [];
            const cornerState = getWallEndCornerState(wall, rowIndex, allJoints);

            // Реальные границы кладки текущей стены в данном ряду с учётом угловой перевязки:
            // If a perpendicular wall occupies the corner, masonry starts after its 200 mm half-block.
            const rowStartMm = cornerState.startInsetMm;
            const rowEndMm = Math.max(rowStartMm, wallLenMm - cornerState.endInsetMm);

            // Alternate the 0 or 200 mm seam phase:
            // - Для углового L-соединения (startIsLCorner / endIsLCorner) фаза подбирается так,
            //   to preserve full 400 mm blocks at the corner.
            // - For T-joints or free ends, alternate the seam phase between 0 and 200 mm,
            //   using exact half blocks without cutting into the host wall.
            let seamPhase;
            if (cornerState.startIsLCorner) {
                seamPhase = rowStartMm % FULL_BLOCK_MM;
            } else if (cornerState.endIsLCorner) {
                seamPhase = rowEndMm % FULL_BLOCK_MM;
            } else {
                seamPhase = (rowIndex % 2 === 0) ? HALF_BLOCK_MM : 0;
            }

            // Находим проёмы, которые попадают в данный ряд по высоте
            const activeOps = wall.openings
                .filter(op => {
                    const sRow = op.startRow || 1;
                    const eRow = sRow + (op.rowCount || 7) - 1;
                    return rowIndex >= sRow && rowIndex <= eRow;
                })
                .map(op => ({
                    ...getOpeningBoundsMm(op),
                    type: op.type,
                    id: op.id
                }))
                .sort((a, b) => a.startMm - b.startMm);

            // При Т-соединении основная стена остаётся полностью цельной (примыкающая стена клеится встык снаружи)
            const tPocketOps = [];
            const allGaps = [...activeOps].sort((a, b) => a.startMm - b.startMm);

            const segments = [];
            let cursor = rowStartMm;

            for (const gap of allGaps) {
                const segStart = cursor;
                const segEnd = clamp(gap.startMm, cursor, rowEndMm);
                if (segEnd > segStart) {
                    segments.push({ startMm: segStart, endMm: segEnd });
                }
                cursor = clamp(gap.endMm, cursor, rowEndMm);
            }

            if (cursor < rowEndMm) {
                segments.push({ startMm: cursor, endMm: rowEndMm });
            }

            const controlSplitSegments = [];
            for (const segment of segments) {
                let splitStartMm = segment.startMm;
                const jointsInside = controlJointsMm
                    .filter(jointMm => jointMm > segment.startMm && jointMm < segment.endMm)
                    .sort((a, b) => a - b);
                for (const jointMm of jointsInside) {
                    controlSplitSegments.push({ startMm: splitStartMm, endMm: jointMm });
                    splitStartMm = jointMm;
                }
                if (splitStartMm < segment.endMm) {
                    controlSplitSegments.push({ startMm: splitStartMm, endMm: segment.endMm });
                }
            }

            const rowBlocks = [];
            const unfilledSegments = [];
            const forcedHalfBlocks = [];
            if (rowIndex % 2 === 0) {
                for (const zone of controlZonesMm) {
                    for (let blockStartMm = zone.startMm;
                        blockStartMm < zone.endMm - 1;
                        blockStartMm += HALF_BLOCK_MM) {
                        forcedHalfBlocks.push({ startMm: blockStartMm, endMm: blockStartMm + HALF_BLOCK_MM });
                    }
                }
            }

            for (const seg of controlSplitSegments) {
                const forced = forcedHalfBlocks
                    .filter(block => block.startMm >= seg.startMm && block.endMm <= seg.endMm)
                    .sort((a, b) => a.startMm - b.startMm);
                const hasForcedEdgeBlocks = forced.length > 0;
                const startsAtLCorner = seg.startMm === rowStartMm && cornerState.startIsLCorner;
                const endsAtLCorner = seg.endMm === rowEndMm && cornerState.endIsLCorner;
                let cursorMm = seg.startMm;
                for (let i = 0; i < forced.length; i++) {
                    const forcedBlock = forced[i];
                    const result = decomposeSegmentIntoBlocks(
                        cursorMm,
                        forcedBlock.startMm,
                        seamPhase,
                        hasForcedEdgeBlocks && i === 0 && startsAtLCorner
                    );
                    rowBlocks.push(...result.blocks);
                    unfilledSegments.push(...result.unfilledSegments);
                    rowBlocks.push({ startMm: forcedBlock.startMm, lenMm: HALF_BLOCK_MM, kind: 'half', controlJointBlock: true });
                    cursorMm = forcedBlock.endMm;
                }
                const result = decomposeSegmentIntoBlocks(
                    cursorMm,
                    seg.endMm,
                    seamPhase,
                    hasForcedEdgeBlocks && endsAtLCorner
                );
                rowBlocks.push(...result.blocks);
                unfilledSegments.push(...result.unfilledSegments);
            }

            return {
                blocks: rowBlocks,
                openingsInRow: activeOps,
                tPocketsInRow: tPocketOps,
                controlJointsMm,
                unfilledSegments,
                unfilledMm: unfilledSegments.reduce((sum, segment) => sum + segment.endMm - segment.startMm, 0),
                cornerState,
                rowStartMm,
                rowEndMm
            };
        }

function calculateWallBlocks(wall, precomputedJoints = null, controlLayout = null) {
            let fullCount = 0;
            let halfCount = 0;
            let unfilledMm = 0;
            const joints = precomputedJoints || getAllWallJoints();
            const allControlJoints = controlLayout || getControlJointLayout();

            for (let r = 1; r <= state.totalWallRows; r++) {
                const layout = buildWallRowLayout(wall, r, joints, allControlJoints);
                unfilledMm += layout.unfilledMm;
                for (const b of layout.blocks) {
                    if (b.kind === 'full') fullCount++;
                    else halfCount++;
                }
            }
            return {
                fullCount,
                halfCount,
                unfilledMm,
                totalCount: fullCount + halfCount
            };
        }
