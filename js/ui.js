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
                    <span class="text-slate-300 font-medium">Wall #${getWallNumber(w.id)} (${Math.round(getWallLengthCm(w) * MM_PER_CM)} × ${Math.round(getWallRows(w) * COURSE_HEIGHT_CM * MM_PER_CM)} mm)</span>
                    <span class="text-slate-400">
                        <b class="text-blue-400">${st.fullCount}</b> full ·
                        <b class="text-amber-400">${st.halfCount}</b> half
                        ${st.unfilledCm > 0 ? `<span class="text-red-300">• ${Math.round(st.unfilledCm * MM_PER_CM)} mm remainder across courses</span>` : ''}
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
            document.getElementById('calcWallsCount').textContent = `${state.walls.length} ${state.walls.length === 1 ? 'wall' : 'walls'}`;
            document.getElementById('valTotalRows').textContent = `${state.totalWallRows} courses / ${Math.round(state.totalWallRows * COURSE_HEIGHT_CM * MM_PER_CM)} mm`;
            document.getElementById('totFullBlocks').textContent = grandFull;
            document.getElementById('totHalfBlocks').textContent = grandHalf;
            document.getElementById('totAllBlocks').textContent = grandFull + grandHalf;
            document.getElementById('totJointsBadge').textContent = `L: ${lCount} | T: ${tCount}`;
            const unfilledEl = document.getElementById('totUnfilled');
            unfilledEl.textContent = grandUnfilledCm > 0 ? `Remainder across courses: ${Math.round(grandUnfilledCm * MM_PER_CM)} mm` : '';
            unfilledEl.classList.toggle('hidden', grandUnfilledCm <= 0);
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
            document.getElementById('valWallHeight').textContent = `${Math.round(getWallRows(wall) * COURSE_HEIGHT_CM * MM_PER_CM)} mm`;
            document.getElementById('wallControlJoints').textContent = getControlJoints(wall).map(x => `${Math.round(x * MM_PER_CM)} mm`).join(', ') || 'None';
            const lenCm = getWallLengthCm(wall);
            const minAllowedLenCm = getMinAllowedWallLengthCm(wall);
            document.getElementById('inspWallName').textContent = `Wall #${getWallNumber(wall.id)}`;
            document.getElementById('btnDeleteWall').title = state.selectedOpeningId === null
                ? 'Delete wall (Delete / Backspace)' : 'Delete wall and its openings';

            // Информация об L и T соединениях выбранной стены
            const allJoints = getAllWallJoints();
            const myL = allJoints.filter(j => j.type === 'L' && (j.wallA === wall.id || j.wallB === wall.id)).length;
            const myTBranch = allJoints.filter(j => j.type === 'T' && j.branchWallId === wall.id).length;
            const myTHost = allJoints.filter(j => j.type === 'T' && j.hostWallId === wall.id).length;
            document.getElementById('inspWallJointsInfo').textContent =
                myL || myTBranch || myTHost ? `Connections: ${myL} L · ${myTBranch + myTHost} T` : 'No connections';

            // Ползунок длины стены с учётом ограничения по проёмам
            const sliderLen = document.getElementById('sliderWallLength');
            sliderLen.min = minAllowedLenCm * MM_PER_CM;
            sliderLen.max = MAX_WALL_MM;
            sliderLen.step = BLOCK_GRID_CM * MM_PER_CM;
            sliderLen.value = lenCm * MM_PER_CM;
            document.getElementById('valWallLength').textContent = `${lenCm * MM_PER_CM} mm`;
            document.getElementById('lblMinWallLen').textContent = `Min: ${minAllowedLenCm * MM_PER_CM} mm`;

            // Ползунок угла
            document.getElementById('valWallDirection').textContent = Math.abs(Math.sin(getWallAngleRad(wall))) < 0.01 ? 'Horizontal' : 'Vertical';

            // Check whether there is room for a new opening.
            const freeSlot = findFreeSlotForOpening(wall, HALF_BLOCK_CM);
            const btnAddOp = document.getElementById('btnAddOpening');
            btnAddOp.disabled = !freeSlot;
            btnAddOp.title = getWallRows(wall) < 5 ? 'Use at least 5 courses to add a window and its lintel.' : freeSlot
                ? 'Add an opening'
                : 'No space for an opening. Lengthen the wall or reduce existing openings.';

            // Список проёмов стены
            const listEl = document.getElementById('openingsList');
            listEl.innerHTML = '';
            document.getElementById('stackedOpeningsNote').hidden = !wall.openings.some((op, i) =>
                wall.openings.slice(i + 1).some(other => openingWidthsOverlap(op, other)));

            if (wall.openings.length === 0) {
                listEl.innerHTML = `<div class="text-xs text-slate-500 py-1">No openings</div>`;
                state.selectedOpeningId = null;
            } else {
                if (!wall.openings.some(o => o.id === state.selectedOpeningId)) {
                    state.selectedOpeningId = null;
                }

                const sortedOps = getOrderedOpenings(wall);
                sortedOps.forEach(op => {
                    const { lenCm } = getOpeningBoundsCm(op);
                    const heightMm = Math.round((op.rowCount || 1) * COURSE_HEIGHT_CM * MM_PER_CM);
                    const isSel = op.id === state.selectedOpeningId;
                    const openingLabel = getOpeningLabel(wall.id, op.id);
                    const badgeColor = op.type === 'window'
                        ? 'text-sky-400 border-sky-500/40 bg-sky-950/50'
                        : op.type === 'door'
                            ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/50'
                            : 'text-purple-400 border-purple-500/40 bg-purple-950/50';

                    const item = document.createElement('div');
                    item.className = `flex items-center gap-3 px-2.5 py-1.5 rounded-lg border text-xs transition ${
                        isSel ? 'bg-slate-800 border-blue-500 text-white' : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                    }`;
                    item.innerHTML = `
                        <button type="button" class="opening-select min-w-0 flex-1 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" aria-pressed="${isSel}">
                            <span class="block">
                                <span class="text-[10px] px-1.5 py-0.5 rounded border ${badgeColor}">${openingLabel}</span>
                            </span>
                            <span class="mt-1 block font-semibold text-slate-200">${lenCm * MM_PER_CM} × ${heightMm} mm</span>
                        </button>
                        <button type="button" data-delete-opening="${op.id}" data-wall-id="${wall.id}" aria-label="Delete ${openingLabel.toLowerCase()}" title="Delete opening (Delete / Backspace)" class="opening-delete-button">Delete</button>
                    `;
                    const selectOpening = () => {
                        state.selectedOpeningId = op.id;
                        updateInspector();
                        render();
                    };
                    item.querySelector('.opening-select').addEventListener('click', selectOpening);
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
                document.getElementById('openingEditorTitle').textContent = getOpeningLabel(wall.id, selectedOp.id);

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
                sliderOpOffset.min = limits.minCm * MM_PER_CM;
                sliderOpOffset.max = maxStartCm * MM_PER_CM;
                sliderOpOffset.step = BLOCK_GRID_CM * MM_PER_CM;
                sliderOpOffset.value = startCm * MM_PER_CM;
                sliderOpOffset.disabled = (maxStartCm <= limits.minCm);

                document.getElementById('valOpeningOffset').textContent = `${startCm * MM_PER_CM} mm`;
                document.getElementById('lblOpMinOffset').textContent = `Min: ${limits.minCm * MM_PER_CM} mm`;
                document.getElementById('lblOpMaxOffset').textContent = `Max: ${maxStartCm * MM_PER_CM} mm`;

                // Ползунок ширины проёма (не позволяет наехать на правого соседа)
                const maxLenAtCurrentPos = Math.max(HALF_BLOCK_CM, limits.maxCm - startCm);
                const sliderOpLen = document.getElementById('sliderOpeningLength');
                sliderOpLen.min = HALF_BLOCK_MM;
                sliderOpLen.max = maxLenAtCurrentPos * MM_PER_CM;
                sliderOpLen.step = BLOCK_GRID_MM;
                sliderOpLen.value = lenCm * MM_PER_CM;
                sliderOpLen.disabled = (maxLenAtCurrentPos <= HALF_BLOCK_CM);
                document.getElementById('valOpeningLength').textContent = `${lenCm * MM_PER_CM} mm`;
                sliderOpLen.title = `Maximum width at this position: ${maxLenAtCurrentPos * MM_PER_CM} mm`;

                // Ряды проёма по высоте
                const verticalLimits = getOpeningVerticalLimits(wall, selectedOp);
                const sliderStartRow = document.getElementById('sliderOpStartRow');
                sliderStartRow.min = verticalLimits.minRow;
                sliderStartRow.max = Math.max(verticalLimits.minRow, selectedOp.startRow, verticalLimits.maxEndRow - selectedOp.rowCount);
                sliderStartRow.value = selectedOp.startRow;
                const isDoor = selectedOp.type === 'door';
                const bottomMm = Math.round((selectedOp.startRow - 1) * COURSE_HEIGHT_CM * MM_PER_CM);
                sliderStartRow.disabled = isDoor;
                sliderStartRow.classList.toggle('hidden', isDoor);
                sliderStartRow.title = `Bottom course: ${selectedOp.startRow}. One course is 200 mm.`;
                sliderStartRow.setAttribute('aria-valuetext', `${bottomMm} mm above floor, bottom course ${selectedOp.startRow}`);
                document.getElementById('doorFloorNote').classList.toggle('hidden', !isDoor);
                const startValue = document.getElementById('valOpStartRow');
                startValue.classList.toggle('hidden', isDoor);
                startValue.textContent = `${bottomMm} mm`;
                startValue.title = `Bottom course: ${selectedOp.startRow}`;

                const sliderRowCount = document.getElementById('sliderOpRowCount');
                sliderRowCount.max = Math.max(selectedOp.rowCount || 1, verticalLimits.maxEndRow - selectedOp.startRow, 1);
                sliderRowCount.value = selectedOp.rowCount || 7;
                const rowCount = selectedOp.rowCount || 7;
                const heightMm = Math.round(rowCount * COURSE_HEIGHT_CM * MM_PER_CM);
                const heightValue = document.getElementById('valOpRowCount');
                heightValue.textContent = `${heightMm} mm`;
                heightValue.title = `${rowCount} courses`;
                sliderRowCount.title = `${rowCount} courses. One course is 200 mm.`;
                sliderRowCount.setAttribute('aria-valuetext', `${heightMm} mm, ${rowCount} courses`);
            }
        }
