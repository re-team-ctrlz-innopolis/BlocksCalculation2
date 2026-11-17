function updateBlockCalculator() {
            let grandFull = 0;
            let grandHalf = 0;
            let grandUnfilledCm = 0;
            const breakdownEl = document.getElementById('wallsBreakdownList');
            breakdownEl.innerHTML = '';

            const allJoints = getAllWallJoints();
            const lCount = allJoints.filter(j => j.type === 'L').length;
            const tCount = allJoints.filter(j => j.type === 'T').length;

            for (const w of state.walls) {
                const st = calculateWallBlocks(w, allJoints);
                grandFull += st.fullCount;
                grandHalf += st.halfCount;
                grandUnfilledCm += st.unfilledCm;

                const row = document.createElement('div');
                row.className = 'flex items-center justify-between bg-slate-900/80 px-2 py-1 rounded border border-slate-800';
                row.innerHTML = `
                    <span class="text-slate-300 font-medium">Wall #${w.id} (${getWallLengthCm(w)} × ${formatCm(getWallRows(w) * COURSE_HEIGHT_CM)} cm)</span>
                    <span class="text-slate-400">
                        <b class="text-blue-400">${st.fullCount}</b>×40 +
                        <b class="text-amber-400">${st.halfCount}</b>×20
                        <span class="text-red-300">• ${st.unfilledCm} cm remainder across courses</span>
                    </span>
                `;
                row.tabIndex = 0;
                row.setAttribute('role', 'button');
                row.style.cursor = 'pointer';
                const select = () => { state.selectedWallId = w.id; state.selectedOpeningId = null; updateInspector(); render(); };
                row.addEventListener('click', select);
                row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
                breakdownEl.appendChild(row);
            }

            updateProjectStatus();
            document.getElementById('calcWallsCount').textContent = `${state.walls.length} walls`;
            document.getElementById('valTotalRows').textContent = `${state.totalWallRows} courses / ${formatCm(state.totalWallRows * COURSE_HEIGHT_CM)} cm`;
            document.getElementById('totFullBlocks').textContent = grandFull;
            document.getElementById('totHalfBlocks').textContent = grandHalf;
            document.getElementById('totAllBlocks').textContent = grandFull + grandHalf;
            document.getElementById('totJointsBadge').textContent = `L: ${lCount} | T: ${tCount}`;
            document.getElementById('totUnfilled').textContent = `Remainder across courses: ${grandUnfilledCm} cm`;
        }

function updateInspector() {
            updateBlockCalculator();

            const emptyPanel = document.getElementById('emptyInspector');
            const wallPanel = document.getElementById('wallInspector');
            const wall = state.walls.find(w => w.id === state.selectedWallId);

            if (!wall) {
                emptyPanel.classList.remove('hidden');
                wallPanel.classList.add('hidden');
                return;
            }

            emptyPanel.classList.add('hidden');
            wallPanel.classList.remove('hidden');

            document.getElementById('inputWallRows').value = getWallRows(wall);
            document.getElementById('valWallHeight').textContent = `${formatCm(getWallRows(wall) * COURSE_HEIGHT_CM)} cm`;
            document.getElementById('wallControlJoints').textContent = getControlJoints(wall).map(x => `${x} cm`).join(', ') || 'None required';
            const lenCm = getWallLengthCm(wall);
            const minAllowedLenCm = getMinAllowedWallLengthCm(wall);
            const angleDeg = getWallAngleDeg(wall);
            const st = calculateWallBlocks(wall);

            document.getElementById('inspWallName').textContent = `Wall #${wall.id}`;
            document.getElementById('inspWallBlocksBadge').textContent = `${st.fullCount} full / ${st.halfCount} half • ${st.unfilledCm} cm remainder`;

            // Информация об L и T соединениях выбранной стены
            const allJoints = getAllWallJoints();
            const myL = allJoints.filter(j => j.type === 'L' && (j.wallA === wall.id || j.wallB === wall.id)).length;
            const myTBranch = allJoints.filter(j => j.type === 'T' && j.branchWallId === wall.id).length;
            const myTHost = allJoints.filter(j => j.type === 'T' && j.hostWallId === wall.id).length;
            document.getElementById('inspWallJointsInfo').textContent =
                `L-joints: ${myL} • T-joints: ${myTBranch + myTHost}`;

            // Ползунок длины стены с учётом ограничения по проёмам
            const sliderLen = document.getElementById('sliderWallLength');
            sliderLen.min = minAllowedLenCm;
            sliderLen.max = MAX_WALL_CM;
            sliderLen.step = BLOCK_GRID_CM;
            sliderLen.value = lenCm;
            document.getElementById('valWallLength').textContent = `${lenCm} cm`;
            document.getElementById('lblMinWallLen').textContent = `Min: ${minAllowedLenCm} cm`;

            const r1 = buildWallRowLayout(wall, 1);
            const r1Full = r1.blocks.filter(b => b.kind === 'full').length;
            const r1Half = r1.blocks.filter(b => b.kind === 'half').length;
            document.getElementById('lblRow1Summary').textContent =
                `${r1Full}×40, ${r1Half}×20, ${r1.unfilledCm} cm unfilled`;

            // Ползунок угла
            document.getElementById('valWallDirection').textContent = Math.abs(Math.sin(getWallAngleRad(wall))) < 0.01 ? 'Horizontal' : 'Vertical';

            // Check whether there is room for a new opening.
            const freeSlot = findFreeSlotForOpening(wall, HALF_BLOCK_CM);
            const btnAddOp = document.getElementById('btnAddOpening');
            btnAddOp.disabled = !freeSlot || getWallRows(wall) < 4;
            btnAddOp.title = freeSlot
                ? 'Add an opening in available wall space'
                : 'No free space (min. 20 cm). Extend the wall or reduce the openings.';

            // Список проёмов стены
            const listEl = document.getElementById('openingsList');
            listEl.innerHTML = '';

            if (wall.openings.length === 0) {
                listEl.innerHTML = `<div class="text-xs text-slate-500 italic py-1">This wall has no openings yet</div>`;
                state.selectedOpeningId = null;
            } else {
                if (!wall.openings.some(o => o.id === state.selectedOpeningId)) {
                    state.selectedOpeningId = wall.openings[0].id;
                }

                const sortedOps = [...wall.openings].sort((a, b) => a.offset - b.offset);
                sortedOps.forEach((op, idx) => {
                    const { startCm, endCm, lenCm } = getOpeningBoundsCm(op);
                    const isSel = op.id === state.selectedOpeningId;
                    const typeLabel = op.type === 'window' ? 'Window' : op.type === 'door' ? 'Door' : 'Opening';
                    const badgeColor = op.type === 'window'
                        ? 'text-sky-400 border-sky-500/40 bg-sky-950/50'
                        : op.type === 'door'
                            ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/50'
                            : 'text-purple-400 border-purple-500/40 bg-purple-950/50';

                    const item = document.createElement('div');
                    item.className = `flex items-center justify-between px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs transition ${
                        isSel ? 'bg-slate-800 border-blue-500 text-white' : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                    }`;
                    item.innerHTML = `
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] px-1.5 py-0.5 rounded border ${badgeColor}">${typeLabel} #${idx + 1}</span>
                            <span>${startCm}–${endCm} cm</span>
                        </div>
                        <span class="font-semibold text-slate-200">${lenCm} cm</span>
                    `;
                    item.addEventListener('click', () => {
                        state.selectedOpeningId = op.id;
                        updateInspector();
                        render();
                    });
                    listEl.appendChild(item);
                });
            }

            // Редактор выбранного проёма
            const editorEl = document.getElementById('openingEditor');
            const selectedOp = wall.openings.find(o => o.id === state.selectedOpeningId);

            if (!selectedOp) {
                editorEl.classList.add('hidden');
            } else {
                editorEl.classList.remove('hidden');

                document.querySelectorAll('.opening-type-btn').forEach(btn => {
                    if (btn.dataset.optype === selectedOp.type) {
                        btn.className = 'opening-type-btn text-xs py-1.5 rounded-lg border border-blue-500 bg-blue-600/30 text-white font-semibold';
                    } else {
                        btn.className = 'opening-type-btn text-xs py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 font-medium hover:bg-slate-700';
                    }
                });

                const { startCm, lenCm } = getOpeningBoundsCm(selectedOp);
                const limits = getOpeningLimitsCm(wall, selectedOp);

                // Ползунок положения проёма (зажат между соседями)
                const sliderOpOffset = document.getElementById('sliderOpeningOffset');
                const maxStartCm = Math.max(limits.minCm, limits.maxCm - lenCm);
                sliderOpOffset.min = limits.minCm;
                sliderOpOffset.max = maxStartCm;
                sliderOpOffset.step = BLOCK_GRID_CM;
                sliderOpOffset.value = startCm;
                sliderOpOffset.disabled = (maxStartCm <= limits.minCm);

                document.getElementById('valOpeningOffset').textContent = `${startCm} cm`;
                document.getElementById('lblOpMinOffset').textContent = `Min: ${limits.minCm} cm`;
                document.getElementById('lblOpMaxOffset').textContent = `Max: ${maxStartCm} cm`;

                // Ползунок ширины проёма (не позволяет наехать на правого соседа)
                const maxLenAtCurrentPos = Math.max(HALF_BLOCK_CM, limits.maxCm - startCm);
                const sliderOpLen = document.getElementById('sliderOpeningLength');
                sliderOpLen.min = HALF_BLOCK_CM;
                sliderOpLen.max = maxLenAtCurrentPos;
                sliderOpLen.step = BLOCK_GRID_CM;
                sliderOpLen.value = lenCm;
                sliderOpLen.disabled = (maxLenAtCurrentPos <= HALF_BLOCK_CM);
                document.getElementById('valOpeningLength').textContent = `${lenCm} cm (max. ${maxLenAtCurrentPos} cm)`;

                // Ряды проёма по высоте
                const sliderStartRow = document.getElementById('sliderOpStartRow');
                sliderStartRow.max = Math.max(getWallRows(wall), selectedOp.startRow || 1);
                sliderStartRow.value = selectedOp.startRow || 1;
                document.getElementById('valOpStartRow').textContent = `${selectedOp.startRow || 1} (${formatCm(((selectedOp.startRow || 1) - 1) * COURSE_HEIGHT_CM)} cm sill)`;

                const sliderRowCount = document.getElementById('sliderOpRowCount');
                sliderRowCount.max = Math.max(selectedOp.rowCount || 1, getWallRows(wall) - (selectedOp.startRow || 1) + 1, 1);
                sliderRowCount.value = selectedOp.rowCount || 7;
                document.getElementById('valOpRowCount').textContent = `${selectedOp.rowCount || 7} (${formatCm((selectedOp.rowCount || 7) * COURSE_HEIGHT_CM)} cm)`;
            }
        }
