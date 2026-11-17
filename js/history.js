// One checkpoint per completed edit/drag; selection and camera motion are not edits.
const editHistory = [];
let historyCurrent = null;

function historySnapshot() {
    return {project: JSON.stringify(projectSnapshot()), wall: state.selectedWallId, opening: state.selectedOpeningId};
}
function updateUndoButton() {
    const button = document.getElementById('btnUndo');
    if (button) button.disabled = editHistory.length === 0;
}
function resetEditHistory() {
    editHistory.length = 0;
    historyCurrent = historySnapshot();
    updateUndoButton();
}
function commitEditHistory() {
    if (!historyCurrent) return;
    const next = historySnapshot();
    if (next.project === historyCurrent.project) return;
    editHistory.push(historyCurrent);
    if (editHistory.length > 50) editHistory.shift();
    historyCurrent = next;
    updateUndoButton();
}
function undoLastEdit() {
    commitEditHistory();
    const previous = editHistory.pop();
    if (!previous) return;
    state.dragState = null;
    state.activeSnapPreview = null;
    state.canvas.style.cursor = '';
    state.cancelElevationDrag?.();
    const project = JSON.parse(previous.project);
    state.walls = project.walls;
    state.nextId = project.nextId;
    state.totalWallRows = project.totalWallRows;
    state.selectedWallId = previous.wall;
    state.selectedOpeningId = previous.opening;
    document.getElementById('sliderTotalRows').value = state.totalWallRows;
    historyCurrent = previous;
    updateInspector(); render(); updateUndoButton(); saveProjectLocally();
    showToast('Last edit undone');
}
function bindHistoryEvents() {
    document.getElementById('btnUndo').addEventListener('click', undoLastEdit);
    document.addEventListener('keydown', e => {
        if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
        const target = e.target;
        // Preserve native text undo while editing a field.
        if (target.isContentEditable || target.closest?.('textarea, input:not([type="range"])')) return;
        e.preventDefault(); undoLastEdit();
    });
}
