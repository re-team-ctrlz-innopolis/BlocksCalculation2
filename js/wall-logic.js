function dist(x1, y1, x2, y2) {
            return Math.hypot(x2 - x1, y2 - y1);
        }

function clamp(val, min, max) {
            return Math.max(min, Math.min(max, val));
        }

function cmToPx(cm) {
            return cm * PX_PER_CM;
        }

function pxToCm(px) {
            return px / PX_PER_CM;
        }

function snapCmToGrid(cm) {
            return Math.round(cm / BLOCK_GRID_CM) * BLOCK_GRID_CM;
        }

function getWallLength(w) {
            return dist(w.x1, w.y1, w.x2, w.y2);
        }

function getWallLengthCm(w) {
            return Math.max(MIN_WALL_CM, snapCmToGrid(pxToCm(getWallLength(w))));
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

function getWallEndCellCenter(wall, endName) {
    const along = endName === 'start' ? HALF_BLOCK_PX / 2 : getWallLength(wall) - HALF_BLOCK_PX / 2;
    return wallLocalToWorld(wall, along, 0);
}

function snapWallStartToGrid(wall, x = wall.x1, y = wall.y1) {
    const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);
    const step = HALF_BLOCK_PX, half = step / 2;
    const snap = (value, phase) => Math.round((value - phase) / step) * step + phase;
    return {x: snap(x, horizontal ? 0 : half), y: snap(y, horizontal ? half : 0)};
}

function alignWallToGrid(wall) {
    const start = snapWallStartToGrid(wall);
    const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);
    const sign = Math.sign(horizontal ? wall.x2 - wall.x1 : wall.y2 - wall.y1);
    const length = cmToPx(getWallLengthCm(wall));
    wall.x1 = start.x; wall.y1 = start.y;
    wall.x2 = start.x + (horizontal ? sign * length : 0);
    wall.y2 = start.y + (horizontal ? 0 : sign * length);
}

function isWallOnGrid(wall) {
    const start = snapWallStartToGrid(wall);
    return dist(start.x, start.y, wall.x1, wall.y1) < 0.001;
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

function getOpeningBoundsCm(op) {
            const lenCm = Math.max(HALF_BLOCK_CM, snapCmToGrid(pxToCm(op.length)));
            const startCm = Math.max(HALF_BLOCK_CM, snapCmToGrid(pxToCm(op.offset - op.length / 2)));
            return { startCm, endCm: startCm + lenCm, lenCm };
        }

function setOpeningBoundsCm(op, startCm, lenCm) {
            const s = snapCmToGrid(startCm);
            const l = Math.max(HALF_BLOCK_CM, snapCmToGrid(lenCm));
            op.length = cmToPx(l);
            op.offset = cmToPx(s + l / 2);
        }

// Opening rectangles use half-open ranges: touching edges do not overlap.
function getOpeningRowRange(op) {
    const startRow = op.startRow || 1;
    return { startRow, endRow: startRow + (op.rowCount || 1) };
}

function openingWidthsOverlap(a, b) {
    const x = getOpeningBoundsCm(a), y = getOpeningBoundsCm(b);
    return x.startCm < y.endCm && y.startCm < x.endCm;
}

function openingRowsOverlap(a, b) {
    const x = getOpeningRowRange(a), y = getOpeningRowRange(b);
    return x.startRow < y.endRow && y.startRow < x.endRow;
}

function openingsOverlap(a, b) {
    return openingWidthsOverlap(a, b) && openingRowsOverlap(a, b);
}

function getOpeningLimitsCm(wall, targetOp) {
    const target = getOpeningBoundsCm(targetOp);
    let minCm = HALF_BLOCK_CM, maxCm = getWallLengthCm(wall) - HALF_BLOCK_CM;
    for (const other of wall.openings) {
        if (other.id === targetOp.id || !openingRowsOverlap(targetOp, other)) continue;
        const bounds = getOpeningBoundsCm(other);
        if (bounds.endCm <= target.startCm) minCm = Math.max(minCm, bounds.endCm);
        if (bounds.startCm >= target.endCm) maxCm = Math.min(maxCm, bounds.startCm);
    }
    return { minCm, maxCm };
}

function getOpeningVerticalLimits(wall, targetOp) {
    const target = getOpeningRowRange(targetOp);
    let minRow = targetOp.type === 'window' ? 2 : 1;
    let maxEndRow = getWallRows(wall) + 1;
    for (const other of wall.openings) {
        if (other.id === targetOp.id || !openingWidthsOverlap(targetOp, other)) continue;
        const rows = getOpeningRowRange(other);
        if (rows.endRow <= target.startRow) minRow = Math.max(minRow, rows.endRow);
        if (rows.startRow >= target.endRow) maxEndRow = Math.min(maxEndRow, rows.startRow);
    }
    return { minRow, maxEndRow };
}

function tryUpdateOpening(wall, op, changes, notify = false) {
    const candidate = { ...op, ...changes };
    const current = getOpeningBoundsCm(op);
    setOpeningBoundsCm(candidate, changes.startCm ?? current.startCm, changes.lenCm ?? current.lenCm);
    delete candidate.startCm;
    delete candidate.lenCm;
    const start = pxToCm(candidate.offset - candidate.length / 2), rows = getOpeningRowRange(candidate);
    if (!Number.isFinite(start) || !Number.isFinite(candidate.length) ||
        start < HALF_BLOCK_CM || start + pxToCm(candidate.length) > getWallLengthCm(wall) - HALF_BLOCK_CM ||
        !Number.isInteger(candidate.startRow) || !Number.isInteger(candidate.rowCount) || candidate.rowCount < 1 ||
        rows.startRow < (candidate.type === 'window' ? 2 : 1) || rows.endRow > getWallRows(wall) + 1 ||
        (candidate.type === 'door' && candidate.startRow !== 1)) {
        if (notify) showToast('Keep the opening inside the wall. Doors start at floor level.');
        return false;
    }
    if (wall.openings.some(other => other.id !== op.id && openingsOverlap(candidate, other))) {
        if (notify) showToast('Openings cannot overlap. Move or resize the opening first.');
        return false;
    }
    Object.assign(op, candidate);
    return true;
}

function clampWallOpenings(wall) {
    // Preserve 2D positions and sizes: repacking a single horizontal row destroys stacked openings.
    // Wall resizing is bounded by the rightmost opening; height changes are validated separately.
    wall.openings.sort((a, b) => a.offset - b.offset);
}

function findFreeSlotForOpening(wall, desiredLenCm = 100) {
    const height = getWallRows(wall), wallEnd = getWallLengthCm(wall) - HALF_BLOCK_CM;
    // Search for a window position, retaining the existing three-course lintel clearance.
    for (let rowCount = Math.min(4, height - 4); rowCount >= 1; rowCount--) {
        const maxStart = height - rowCount - 2;
        const preferred = Math.min(4, maxStart);
        const starts = [...new Set([preferred, ...Array.from({ length: Math.max(0, maxStart - 1) }, (_, i) => i + 2)])];
        for (const startRow of starts) {
            if (startRow < 2) continue;
            const endRow = startRow + rowCount;
            const blockers = wall.openings.filter(op => {
                const rows = getOpeningRowRange(op);
                return rows.startRow < endRow + 3 && startRow < rows.endRow + 3;
            }).map(getOpeningBoundsCm).sort((a, b) => a.startCm - b.startCm);
            const gaps = [];
            let cursor = HALF_BLOCK_CM;
            for (const bounds of blockers) {
                if (Math.min(bounds.startCm, wallEnd) > cursor) gaps.push({ startCm: cursor, freeCm: Math.min(bounds.startCm, wallEnd) - cursor });
                cursor = Math.max(cursor, bounds.endCm);
            }
            if (cursor < wallEnd) gaps.push({ startCm: cursor, freeCm: wallEnd - cursor });
            const gap = gaps.find(g => g.freeCm >= desiredLenCm) || gaps.find(g => g.freeCm >= HALF_BLOCK_CM);
            if (!gap) continue;
            const lenCm = Math.min(desiredLenCm, snapCmToGrid(gap.freeCm));
            const startCm = snapCmToGrid(gap.startCm + (gap.freeCm - lenCm) / 2);
            return { startCm, lenCm, startRow, rowCount };
        }
    }
    return null;
}

function getMinAllowedWallLengthCm(wall) {
    return wall.openings.reduce((length, op) => Math.max(length, getOpeningBoundsCm(op).endCm + HALF_BLOCK_CM), MIN_WALL_CM);
}

function setWallLength(wall, newLenCm) {
            if (!Number.isFinite(newLenCm) || newLenCm % BLOCK_GRID_CM !== 0) {
                showToast('Use multiples of 200 mm. Cutting blocks is not supported.');
                return;
            }
            const minAllowed = getMinAllowedWallLengthCm(wall);
            const clampedCm = clamp(snapCmToGrid(newLenCm), minAllowed, MAX_WALL_CM);
            const newLenPx = cmToPx(clampedCm);
            const angle = getWallAngleRad(wall);
            // Keep the first face fixed; changing length by one cell must not
            // shift both ends by half a cell and break the common grid.
            wall.x2 = wall.x1 + Math.cos(angle) * newLenPx;
            wall.y2 = wall.y1 + Math.sin(angle) * newLenPx;
            clampWallOpenings(wall);
        }

        function snapAngleTo90(angleDeg) {
                    return Math.round(angleDeg / 90) * 90;
        }

function setWallAngle(wall, angleDeg) {
                    const snappedAngleDeg = snapAngleTo90(angleDeg);
            const angleRad = snappedAngleDeg * Math.PI / 180;
            const lenPx = cmToPx(getWallLengthCm(wall));
            // The first cell centre is a grid-aligned, repeatable rotation pivot.
            const pivot = getWallEndCellCenter(wall, 'start');
            const half = HALF_BLOCK_PX / 2;
            wall.x1 = pivot.x - Math.cos(angleRad) * half;
            wall.y1 = pivot.y - Math.sin(angleRad) * half;
            wall.x2 = wall.x1 + Math.cos(angleRad) * lenPx;
            wall.y2 = wall.y1 + Math.sin(angleRad) * lenPx;
            alignWallToGrid(wall);
        }

function snapToHalfBlockCellCenterCm(rawAlongCm, wallLenCm) {
            // Keep T-joints outside the 20 cm corner margins.
            const minCellStartCm = HALF_BLOCK_CM;
            const maxCellStartCm = Math.max(HALF_BLOCK_CM, wallLenCm - FULL_BLOCK_CM);
            const rawCellStartCm = Math.round((rawAlongCm - HALF_BLOCK_CM / 2) / HALF_BLOCK_CM) * HALF_BLOCK_CM;
            const cellStartCm = clamp(rawCellStartCm, minCellStartCm, maxCellStartCm);
            return {
                centerCm: cellStartCm + HALF_BLOCK_CM / 2,
                cellStartCm,
                cellEndCm: cellStartCm + HALF_BLOCK_CM
            };
        }

function getWallFaceSnapPoints(host, moving) {
    const points = [], length = getWallLengthCm(host);
    for (let cellStartCm = HALF_BLOCK_CM; cellStartCm <= length - FULL_BLOCK_CM; cellStartCm += HALF_BLOCK_CM) {
        if (host.openings.some(op => {
            const b = getOpeningBoundsCm(op);
            return b.startCm < cellStartCm + HALF_BLOCK_CM && b.endCm > cellStartCm && (!moving || op.startRow <= getWallRows(moving));
        })) continue;
        const centerCm = cellStartCm + HALF_BLOCK_CM / 2;
        for (const side of [-1, 1]) {
            const point = wallLocalToWorld(host, cmToPx(centerCm), side * WALL_THICKNESS / 2);
            points.push({...point, wallId: host.id, type: 'T', side, offsetCm: centerCm,
                cellStartCm, cellEndCm: cellStartCm + HALF_BLOCK_CM});
        }
    }
    return points;
}

function getSnapCandidates(x, y, excludeWallId, endName = 'start') {
    const moving = state.walls.find(w => w.id === excludeWallId);
    const radius = SNAP_RADIUS / state.zoom;
    const candidates = [];
    const add = point => {
        point.x = Math.round(point.x * 1e9) / 1e9;
        point.y = Math.round(point.y * 1e9) / 1e9;
        const distance = dist(x, y, point.x, point.y);
        if (distance <= radius) candidates.push({...point, distance});
    };
    for (const host of state.walls) {
        if (host.id === excludeWallId || (moving && !arePerpendicular(moving, host))) continue;
        if (moving) {
            const angle = getWallAngleRad(moving), sign = endName === 'start' ? 1 : -1;
            for (const hostEnd of ['start', 'end']) {
                const cell = getWallEndCellCenter(host, hostEnd);
                add({x: cell.x - sign * Math.cos(angle) * HALF_BLOCK_PX / 2,
                    y: cell.y - sign * Math.sin(angle) * HALF_BLOCK_PX / 2,
                    wallId: host.id, type: 'L', hostEnd,
                    offsetCm: hostEnd === 'start' ? 0 : getWallLengthCm(host)});
            }
        }
        const local = worldToWallLocal(host, x, y);
        if (Math.abs(local.perp) > radius + WALL_THICKNESS / 2) continue;
        for (const point of getWallFaceSnapPoints(host, moving)) add(point);
    }
    return candidates.sort((a, b) => a.distance - b.distance || a.type.localeCompare(b.type) || a.wallId - b.wallId || a.offsetCm - b.offsetCm || (a.side || 0) - (b.side || 0));
}

function findSnapPoint(x, y, excludeWallId) {
    return getSnapCandidates(x, y, excludeWallId)[0] || null;
}

function snapWorldCoordinate(value) {
    const step = cmToPx(POSITION_GRID_CM);
    return Math.round(value / step) * step;
}

function snapWallTranslation(wall, proposed) {
    const onSide = (point, otherX, otherY) => {
        if (point.type !== 'T') return true;
        const host = state.walls.find(w => w.id === point.wallId);
        return worldToWallLocal(host, otherX, otherY).perp * point.side > WALL_THICKNESS / 2;
    };
    const first = getSnapCandidates(proposed.x1, proposed.y1, wall.id, 'start').filter(p => onSide(p, proposed.x2, proposed.y2));
    const second = getSnapCandidates(proposed.x2, proposed.y2, wall.id, 'end').filter(p => onSide(p, proposed.x1, proposed.y1));
    const options = [];
    for (const [end, points, other] of [[1, first, second], [2, second, first]]) {
        for (const point of points) {
            const dx = point.x - proposed['x' + end], dy = point.y - proposed['y' + end];
            const otherEnd = end === 1 ? 2 : 1;
            const paired = other.find(p => Math.abs(p.x - proposed['x' + otherEnd] - dx) < 0.001 && Math.abs(p.y - proposed['y' + otherEnd] - dy) < 0.001);
            options.push({dx, dy, snaps: paired ? [point, paired] : [point], distance: Math.hypot(dx, dy), point, end});
        }
    }
    options.sort((a, b) => b.snaps.length - a.snaps.length || a.distance - b.distance || a.point.type.localeCompare(b.point.type) || a.point.wallId - b.point.wallId || a.point.offsetCm - b.point.offsetCm || a.end - b.end);
    const best = options[0];
    const gridStart = snapWallStartToGrid(wall, proposed.x1, proposed.y1);
    const dx = best ? best.dx : gridStart.x - proposed.x1;
    const dy = best ? best.dy : gridStart.y - proposed.y1;
    return {x1: proposed.x1 + dx, y1: proposed.y1 + dy, x2: proposed.x2 + dx, y2: proposed.y2 + dy, snaps: best?.snaps || []};
}

function resizeWallEndpoint(wall, first, position) {
    const anchor = first ? {x: wall.x2, y: wall.y2} : {x: wall.x1, y: wall.y1};
    const length = getWallLength(wall);
    const ux = ((first ? wall.x1 : wall.x2) - anchor.x) / length;
    const uy = ((first ? wall.y1 : wall.y2) - anchor.y) / length;
    const minimum = getMinAllowedWallLengthCm(wall);
    const candidates = getSnapCandidates(position.x, position.y, wall.id, first ? 'start' : 'end').filter(p => {
        const dx = p.x - anchor.x, dy = p.y - anchor.y;
        const along = pxToCm(dx * ux + dy * uy);
        if (p.type === 'T') {
            const host = state.walls.find(w => w.id === p.wallId);
            if (worldToWallLocal(host, anchor.x, anchor.y).perp * p.side <= WALL_THICKNESS / 2) return false;
        }
        return Math.abs(dx * uy - dy * ux) < 0.001 && along >= minimum && along <= MAX_WALL_CM && Math.abs(along - snapCmToGrid(along)) < 0.001;
    });
    const snap = candidates[0];
    const along = pxToCm((position.x - anchor.x) * ux + (position.y - anchor.y) * uy);
    const finalLength = cmToPx(clamp(snapCmToGrid(along), minimum, MAX_WALL_CM));
    const point = snap || {x: anchor.x + ux * finalLength, y: anchor.y + uy * finalLength};
    if (first) { wall.x1 = point.x; wall.y1 = point.y; }
    else { wall.x2 = point.x; wall.y2 = point.y; }
    clampWallOpenings(wall);
    return snap || null;
}

function getAllWallJoints() {
    const joints = [], eps = 0.01;
    for (let i = 0; i < state.walls.length; i++) for (let k = i + 1; k < state.walls.length; k++) {
        const a = state.walls[i], b = state.walls[k];
        if (!arePerpendicular(a, b)) continue;
        let corner = null;
        for (const endA of ['start', 'end']) for (const endB of ['start', 'end']) {
            const ca = getWallEndCellCenter(a, endA), cb = getWallEndCellCenter(b, endB);
            if (!corner && dist(ca.x, ca.y, cb.x, cb.y) <= eps) {
                const primary = a.id < b.id;
                corner = {type: 'L', x: ca.x, y: ca.y,
                    wallA: primary ? a.id : b.id, wallB: primary ? b.id : a.id,
                    endA: primary ? endA : endB, endB: primary ? endB : endA};
            }
        }
        if (corner) { joints.push(corner); continue; }
        for (const [branch, host] of [[a, b], [b, a]]) for (const end of ['start', 'end']) {
            const x = end === 'start' ? branch.x1 : branch.x2;
            const y = end === 'start' ? branch.y1 : branch.y2;
            const loc = worldToWallLocal(host, x, y), length = getWallLength(host);
            const onAxis = Math.abs(loc.perp) <= eps;
            const onFace = Math.abs(Math.abs(loc.perp) - WALL_THICKNESS / 2) <= eps;
            if (loc.along < HALF_BLOCK_PX - eps || loc.along > length - HALF_BLOCK_PX + eps || (!onAxis && !onFace)) continue;
            const cell = snapToHalfBlockCellCenterCm(pxToCm(loc.along), getWallLengthCm(host));
            joints.push({type: 'T', legacyAxis: onAxis, x, y, hostWallId: host.id,
                branchWallId: branch.id, branchEnd: end, offsetCm: cell.centerCm,
                cellStartCm: cell.cellStartCm, cellEndCm: cell.cellEndCm});
        }
    }
    return joints;
}

function getWallEndCornerState(wall, rowIndex, allJoints) {
            const isOddRow = (rowIndex % 2 === 1);
            const state = {
                startConnected: false,
                startIsLCorner: false,
                startIsTButt: false,
                startInsetCm: 0,      // 0 cm or a 20 cm inset for the alternating corner course.
                startPartnerWallId: null,
                endConnected: false,
                endIsLCorner: false,
                endIsTButt: false,
                endInsetCm: 0,
                endPartnerWallId: null
            };

            for (const jt of allJoints) {
                const partnerId = jt.type === "L" ? (jt.wallA === wall.id ? jt.wallB : jt.wallA) : jt.hostWallId;
                const partner = getPartnerWall(partnerId);
                if (partner && rowIndex > getWallRows(partner)) continue;
                if (jt.type === 'L') {
                    if (jt.wallA === wall.id) {
                        // wallA takes the corner in odd courses and yields 20 cm in even courses.
                        const inset = isOddRow ? 0 : HALF_BLOCK_CM;
                        if (jt.endA === 'start') {
                            state.startConnected = true;
                            state.startIsLCorner = true;
                            state.startInsetCm = inset;
                            state.startPartnerWallId = jt.wallB;
                        } else {
                            state.endConnected = true;
                            state.endIsLCorner = true;
                            state.endInsetCm = inset;
                            state.endPartnerWallId = jt.wallB;
                        }
                    } else if (jt.wallB === wall.id) {
                        // wallB yields 20 cm in odd courses and takes the corner in even courses.
                        const inset = isOddRow ? HALF_BLOCK_CM : 0;
                        if (jt.endB === 'start') {
                            state.startConnected = true;
                            state.startIsLCorner = true;
                            state.startInsetCm = inset;
                            state.startPartnerWallId = jt.wallA;
                        } else {
                            state.endConnected = true;
                            state.endIsLCorner = true;
                            state.endInsetCm = inset;
                            state.endPartnerWallId = jt.wallA;
                        }
                    }
                } else if (jt.type === 'T' && jt.branchWallId === wall.id) {
                    // Report p.9 / manual p.67: butt connection with metal straps
                    // and concrete-filled cavities. No shared blocks are subtracted.
                    if (jt.branchEnd === 'start') {
                        state.startConnected = true;
                        state.startIsTButt = true;
                        state.startInsetCm = 0;
                        state.startPartnerWallId = jt.hostWallId;
                    } else {
                        state.endConnected = true;
                        state.endIsTButt = true;
                        state.endInsetCm = 0;
                        state.endPartnerWallId = jt.hostWallId;
                    }
                }
            }
            return state;
        }

function decomposeSegmentIntoBlocks(startCm, endCm, seamPhase) {
            const blocks = [];
            const segLen = endCm - startCm;
            if (segLen <= 0) return { blocks, unfilledSegments: [] };
            if (segLen < HALF_BLOCK_CM) {
                return { blocks, unfilledSegments: [{ startCm, endCm }] };
            }

            // A segment exactly 20 cm long fits one half block.
            if (segLen === HALF_BLOCK_CM) {
                blocks.push({ startCm, lenCm: HALF_BLOCK_CM, kind: 'half' });
                return { blocks, unfilledSegments: [] };
            }

            let curStart = startCm;
            const curEnd = endCm;

            // Use a half block when a reveal or free end starts between this course's full-block joints.
            if (curEnd - curStart >= HALF_BLOCK_CM && (curStart % FULL_BLOCK_CM) !== seamPhase) {
                blocks.push({
                    startCm: curStart,
                    lenCm: HALF_BLOCK_CM,
                    kind: 'half'
                });
                curStart += HALF_BLOCK_CM;
            }

            // Fill with exact 40 cm full blocks before adding any remaining halves.
            while (curEnd - curStart >= FULL_BLOCK_CM) {
                blocks.push({
                    startCm: curStart,
                    lenCm: FULL_BLOCK_CM,
                    kind: 'full'
                });
                curStart += FULL_BLOCK_CM;
            }

            // Fit 20 cm half blocks and leave any smaller remainder visible.
            while (curEnd - curStart >= HALF_BLOCK_CM) {
                blocks.push({
                    startCm: curStart,
                    lenCm: HALF_BLOCK_CM,
                    kind: 'half'
                });
                curStart += HALF_BLOCK_CM;
            }

            return {
                blocks,
                unfilledSegments: curStart < curEnd ? [{ startCm: curStart, endCm: curEnd }] : []
            };
        }

function getWallBondPhase(wall, rowIndex, allJoints) {
    // Anchor the bond to course 1, independently of which neighbours reach the current course.
    // Only corner insets stop above a shorter wall; the 200 mm course offset must continue.
    const firstCorner = getWallEndCornerState(wall, 1, allJoints);
    let firstPhase = 0;
    if (firstCorner.startIsLCorner) firstPhase = firstCorner.startInsetCm % FULL_BLOCK_CM;
    else if (firstCorner.endIsLCorner) firstPhase = (getWallLengthCm(wall) - firstCorner.endInsetCm) % FULL_BLOCK_CM;
    return (firstPhase + (rowIndex - 1) * HALF_BLOCK_CM) % FULL_BLOCK_CM;
}

function buildWallRowLayout(wall, rowIndex, precomputedJoints = null) {
            const wallLenCm = getWallLengthCm(wall);
            const allJoints = precomputedJoints || getAllWallJoints();
            const cornerState = getWallEndCornerState(wall, rowIndex, allJoints);

            // Реальные границы кладки текущей стены в данном ряду с учётом угловой перевязки:
            // If a perpendicular wall occupies the corner, masonry starts after its 20 cm half-block.
            const rowStartCm = cornerState.startInsetCm;
            const rowEndCm = Math.max(rowStartCm, wallLenCm - cornerState.endInsetCm);

            const seamPhase = getWallBondPhase(wall, rowIndex, allJoints);

            // Находим проёмы, которые попадают в данный ряд по высоте
            const activeOps = wall.openings
                .filter(op => {
                    const sRow = op.startRow || 1;
                    const eRow = sRow + (op.rowCount || 7) - 1;
                    return rowIndex >= sRow && rowIndex <= eRow;
                })
                .map(op => ({
                    ...getOpeningBoundsCm(op),
                    type: op.type,
                    id: op.id
                }))
                .sort((a, b) => a.startCm - b.startCm);

            // T-connections leave host masonry continuous; metal ties/concrete are not block deductions.
            const tPocketOps = [];
            const allGaps = [...activeOps].sort((a, b) => a.startCm - b.startCm);

            const segments = [];
            let cursor = rowStartCm;

            for (const gap of allGaps) {
                const segStart = cursor;
                const segEnd = clamp(gap.startCm, cursor, rowEndCm);
                if (segEnd > segStart) {
                    segments.push({ startCm: segStart, endCm: segEnd });
                }
                cursor = clamp(gap.endCm, cursor, rowEndCm);
            }

            if (cursor < rowEndCm) {
                segments.push({ startCm: cursor, endCm: rowEndCm });
            }

            const rowBlocks = [];
            const unfilledSegments = [];
            for (const seg of segments) {
                const cuts = getControlJoints(wall).filter(x => x > seg.startCm && x < seg.endCm);
                const bounds = [seg.startCm, ...cuts, seg.endCm];
                for (let i = 0; i < bounds.length - 1; i++) {
                    const start = bounds[i], end = bounds[i + 1];
                    // Split at the joint without resetting the wall's bond or forcing halves.
                    // The actual course phase and joint position determine the end blocks.
                    const result = decomposeSegmentIntoBlocks(start, end, seamPhase);
                    rowBlocks.push(...result.blocks);
                    unfilledSegments.push(...result.unfilledSegments);
                }
            }

            return {
                blocks: rowBlocks,
                openingsInRow: activeOps,
                tPocketsInRow: tPocketOps,
                unfilledSegments,
                unfilledCm: unfilledSegments.reduce((sum, segment) => sum + segment.endCm - segment.startCm, 0),
                cornerState,
                rowStartCm,
                rowEndCm
            };
        }

function calculateWallBlocks(wall, precomputedJoints = null) {
            let fullCount = 0;
            let halfCount = 0;
            let unfilledCm = 0;
            const joints = precomputedJoints || getAllWallJoints();

            for (let r = 1; r <= getWallRows(wall); r++) {
                const layout = buildWallRowLayout(wall, r, joints);
                unfilledCm += layout.unfilledCm;
                for (const b of layout.blocks) {
                    if (b.kind === 'full') fullCount++;
                    else halfCount++;
                }
            }
            return {
                fullCount,
                halfCount,
                unfilledCm,
                totalCount: fullCount + halfCount
            };
        }
