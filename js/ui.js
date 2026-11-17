function updateBlockCalculator() {
            const allJoints = getAllWallJoints();
            const controlLayout = getControlJointLayout();
            const errors = validateGeometry(controlLayout);
            let grandFull = 0;
            let grandHalf = 0;
            let grandUnfilledMm = 0;
            const breakdownEl = document.getElementById('wallsBreakdownList');
            breakdownEl.innerHTML = '';
            const lCount = allJoints.filter(j => j.type === 'L').length;
            const tCount = allJoints.filter(j => j.type === 'T').length;
            const statusEl = document.getElementById('geometryStatus');
            const printButton = document.getElementById('btnPrintBom');
            const printArea = document.getElementById('bomPrintArea');

            statusEl.className = 'mb-3 rounded-lg border px-3 py-2 text-xs';
            statusEl.replaceChildren();

            if (errors.length) {
                statusEl.classList.add('border-rose-700', 'bg-rose-950/50', 'text-rose-200');
                const heading = document.createElement('p');
                heading.className = 'font-semibold mb-1';
                heading.textContent = 'Calculation blocked: fix the geometry below.';
                const list = document.createElement('ul');
                list.className = 'list-disc pl-4 space-y-0.5';
                for (const error of errors) {
                    const item = document.createElement('li');
                    item.textContent = error;
                    list.appendChild(item);
                }
                statusEl.append(heading, list);
                document.getElementById('totFullBlocks').textContent = '—';
                document.getElementById('totHalfBlocks').textContent = '—';
                document.getElementById('totAllBlocks').textContent = '—';
                document.getElementById('totUnfilled').textContent = 'Calculation unavailable';
                document.getElementById('calcWallsCount').textContent = `${state.walls.length} walls`;
                document.getElementById('totJointsBadge').textContent = `L: ${lCount} | T: ${tCount} | C: ${controlLayout.count}`;
                const errorItem = document.createElement('div');
                errorItem.className = 'text-rose-300';
                errorItem.textContent = 'Bill of materials unavailable until geometry errors are fixed.';
                breakdownEl.appendChild(errorItem);
                printButton.disabled = true;
                printArea.replaceChildren();
                return;
            }

            for (const w of state.walls) {
                const st = calculateWallBlocks(w, allJoints, controlLayout);
                grandFull += st.fullCount;
                grandHalf += st.halfCount;
                grandUnfilledMm += st.unfilledMm;

                const row = document.createElement('div');
                row.className = 'flex items-center justify-between bg-slate-900/80 px-2 py-1 rounded border border-slate-800';
                row.innerHTML = `
                    <span class="text-slate-300 font-medium">Wall #${w.id} (${getWallLengthMm(w)} mm)</span>
                    <span class="text-slate-400">
                        <b class="text-blue-400">${st.fullCount}</b>×400 +
                        <b class="text-amber-400">${st.halfCount}</b>×200
                        <span class="text-red-300">• ${st.unfilledMm} mm remainder across courses</span>
                    </span>
                `;
                breakdownEl.appendChild(row);
            }

            document.getElementById('calcWallsCount').textContent = `${state.walls.length} walls`;
            document.getElementById('valTotalRows').textContent = `${state.totalWallRows} courses`;
            document.getElementById('totFullBlocks').textContent = grandFull;
            document.getElementById('totHalfBlocks').textContent = grandHalf;
            document.getElementById('totAllBlocks').textContent = grandFull + grandHalf;
            document.getElementById('totJointsBadge').textContent = `L: ${lCount} | T: ${tCount} | C: ${controlLayout.count}`;
            document.getElementById('totUnfilled').textContent = `Unfilled: ${grandUnfilledMm} mm`;
            statusEl.classList.add(grandUnfilledMm ? 'border-amber-700' : 'border-emerald-700');
            statusEl.classList.add(grandUnfilledMm ? 'bg-amber-950/40' : 'bg-emerald-950/40');
            statusEl.classList.add(grandUnfilledMm ? 'text-amber-200' : 'text-emerald-200');
            statusEl.textContent = `Geometry valid${grandUnfilledMm ? `; set-out/course remainder: ${grandUnfilledMm} mm` : ''}. Automatic control joints: ${controlLayout.count}. Openings use 200 mm modules; windows start at course 2 or above.`;
            printButton.disabled = false;
            const bomRows = state.walls.map(wall => {
                const stats = calculateWallBlocks(wall, allJoints, controlLayout);
                return `<tr><td>Wall #${wall.id}</td><td>${getWallLengthMm(wall)} mm</td><td>${stats.fullCount}</td><td>${stats.halfCount}</td><td>${stats.unfilledMm}</td></tr>`;
            }).join('');
            printArea.innerHTML = `
                <h1>Blocks Calculator — Bill of Materials</h1>
                <p>Block sizes: full 400 × 200 × 176 mm; half 200 × 200 × 176 mm</p>
                <p>Set-out: course 1 uses full blocks only; unfilled remainders are reported. Windows start no earlier than course 2.</p>
                <p>Continuous-wall control joints: ${controlLayout.count} (every 5000 mm; zero-width marker)</p>
                <table>
                    <thead><tr><th>Wall</th><th>Length</th><th>Full blocks</th><th>Half-blocks</th><th>Unfilled (mm)</th></tr></thead>
                    <tbody>${bomRows}</tbody>
                    <tfoot><tr><th>Total</th><td></td><th>${grandFull}</th><th>${grandHalf}</th><th>${grandUnfilledMm}</th></tr></tfoot>
                </table>
                <p class="bom-total">Full blocks: ${grandFull} | Half-blocks: ${grandHalf} | Total: ${grandFull + grandHalf}</p>
            `;
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

            const lenMm = getWallLengthMm(wall);
            const minAllowedLenMm = getMinAllowedWallLengthMm(wall);
            const angleDeg = getWallAngleDeg(wall);
            const allJoints = getAllWallJoints();
            const controlLayout = getControlJointLayout();
            const geometryErrors = validateGeometry(controlLayout);
            const st = calculateWallBlocks(wall, allJoints, controlLayout);

            document.getElementById('inspWallName').textContent = `Wall #${wall.id}`;
            document.getElementById('inspWallBlocksBadge').textContent = geometryErrors.length
                ? 'Calculation blocked'
                : `${st.fullCount} full / ${st.halfCount} half`;

            // Информация об L и T соединениях выбранной стены
            const myL = allJoints.filter(j => j.type === 'L' && (j.wallA === wall.id || j.wallB === wall.id)).length;
            const myTBranch = allJoints.filter(j => j.type === 'T' && j.branchWallId === wall.id).length;
            const myTHost = allJoints.filter(j => j.type === 'T' && j.hostWallId === wall.id).length;
            document.getElementById('inspWallJointsInfo').textContent =
                `L-joints: ${myL} • T-joints: ${myTBranch + myTHost}`;

            // Ползунок длины стены с учётом ограничения по проёмам
            const sliderLen = document.getElementById('sliderWallLength');
            sliderLen.min = minAllowedLenMm;
            sliderLen.max = MAX_WALL_MM;
            sliderLen.step = BLOCK_GRID_MM;
            sliderLen.value = lenMm;
            document.getElementById('valWallLength').textContent = `${lenMm} mm`;
            document.getElementById('lblMinWallLen').textContent = `Min: ${minAllowedLenMm} mm`;

            const r1 = buildWallRowLayout(wall, 1, allJoints, controlLayout);
            const r1Full = r1.blocks.filter(b => b.kind === 'full').length;
            const r1Half = r1.blocks.filter(b => b.kind === 'half').length;
            document.getElementById('lblRow1Summary').textContent = geometryErrors.length
                ? 'Invalid geometry'
                : `${r1Full}×400, ${r1Half}×200, ${r1.unfilledMm} mm unfilled`;

            // Ползунок угла
            document.getElementById('sliderWallAngle').value = angleDeg;
            document.getElementById('valWallAngle').textContent = `${angleDeg}°`;

            // Check whether there is room for a new opening.
            const freeSlot = findFreeSlotForOpening(wall, HALF_BLOCK_MM);
            const btnAddOp = document.getElementById('btnAddOpening');
            btnAddOp.disabled = !freeSlot;
            btnAddOp.title = freeSlot
                ? 'Add an opening in available wall space'
                : 'No free space (min. 200 mm). Extend the wall or reduce the openings.';

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
                    const { startMm, endMm, lenMm } = getOpeningBoundsMm(op);
                    const isSel = op.id === state.selectedOpeningId;
                    const typeLabel = op.type === 'window' ? 'Window' : 'Door';
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
                            <span>${startMm}–${endMm} mm</span>
                        </div>
                        <span class="font-semibold text-slate-200">${lenMm} mm</span>
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

                const { startMm, lenMm } = getOpeningBoundsMm(selectedOp);
                const limits = getOpeningLimitsMm(wall, selectedOp);

                // Ползунок положения проёма (зажат между соседями)
                const sliderOpOffset = document.getElementById('sliderOpeningOffset');
                const maxStartMm = Math.max(limits.minMm, limits.maxMm - lenMm);
                sliderOpOffset.min = limits.minMm;
                sliderOpOffset.max = maxStartMm;
                sliderOpOffset.step = BLOCK_GRID_MM;
                sliderOpOffset.value = startMm;
                sliderOpOffset.disabled = (maxStartMm <= limits.minMm);

                document.getElementById('valOpeningOffset').textContent = `${startMm} mm`;
                document.getElementById('lblOpMinOffset').textContent = `Min: ${limits.minMm} mm`;
                document.getElementById('lblOpMaxOffset').textContent = `Max: ${maxStartMm} mm`;

                // Ползунок ширины проёма (не позволяет наехать на правого соседа)
                const maxLenAtCurrentPos = Math.max(HALF_BLOCK_MM, limits.maxMm - startMm);
                const sliderOpLen = document.getElementById('sliderOpeningLength');
                sliderOpLen.min = HALF_BLOCK_MM;
                sliderOpLen.max = maxLenAtCurrentPos;
                sliderOpLen.step = BLOCK_GRID_MM;
                sliderOpLen.value = lenMm;
                sliderOpLen.disabled = (maxLenAtCurrentPos <= HALF_BLOCK_MM);
                document.getElementById('valOpeningLength').textContent = `${lenMm} mm (max. ${maxLenAtCurrentPos} mm)`;

                // Ряды проёма по высоте
                const startCourseControl = document.getElementById('opStartRowControl');
                startCourseControl.classList.toggle('hidden', selectedOp.type === 'door');
                const sliderStartRow = document.getElementById('sliderOpStartRow');
                sliderStartRow.min = selectedOp.type === 'window' ? 2 : 1;
                sliderStartRow.max = state.totalWallRows;
                sliderStartRow.value = selectedOp.type === 'window' ? Math.max(2, selectedOp.startRow || 2) : 1;
                document.getElementById('valOpStartRow').textContent = sliderStartRow.value;

                const sliderRowCount = document.getElementById('sliderOpRowCount');
                sliderRowCount.max = Math.max(1, state.totalWallRows - (selectedOp.startRow || 1) + 1);
                sliderRowCount.value = selectedOp.rowCount || 7;
                document.getElementById('valOpRowCount').textContent = selectedOp.rowCount || 7;
            }
        }
