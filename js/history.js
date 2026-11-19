// One checkpoint per completed edit/drag; selection and camera motion are not edits.
const editHistory = [];
const redoHistory = [];
let historyCurrent = null;

function historySnapshot() {
    return {project: JSON.stringify(projectSnapshot()), wall: state.selectedWallId, opening: state.selectedOpeningId};
}
function updateUndoButton() {
    const button = document.getElementById('btnUndo');
    if (button) button.disabled = editHistory.length === 0;
    const redoButton = document.getElementById('btnRedo');
    if (redoButton) redoButton.disabled = redoHistory.length === 0;
}
function resetEditHistory() {
    editHistory.length = 0;
    redoHistory.length = 0;
    historyCurrent = historySnapshot();
    updateUndoButton();
}
function commitEditHistory() {
    if (!historyCurrent) return;
    const next = historySnapshot();
    if (next.project === historyCurrent.project) return;
    editHistory.push(historyCurrent);
    redoHistory.length = 0;
    if (editHistory.length > 50) editHistory.shift();
    historyCurrent = next;
    updateUndoButton();
}
function undoLastEdit() {
    commitEditHistory();
    const previous = editHistory.pop();
    if (!previous) return;
    redoHistory.push(historySnapshot());
    restoreHistorySnapshot(previous);
}
function redoLastEdit() {
    commitEditHistory();
    const next = redoHistory.pop();
    if (!next) return;
    editHistory.push(historySnapshot());
    restoreHistorySnapshot(next);
}
function restoreHistorySnapshot(snapshot) {
    state.dragState = null;
    state.activeSnapPreview = null;
    state.canvas.style.cursor = '';
    state.cancelElevationDrag?.();
    const project = JSON.parse(snapshot.project);
    state.walls = project.walls;
    state.nextId = project.nextId;
    state.totalWallRows = project.totalWallRows;
    state.migrationNotes = project.migrationNotes || [];
    state.selectedWallId = snapshot.wall;
    state.selectedOpeningId = snapshot.opening;
    document.getElementById('sliderTotalRows').value = state.totalWallRows;
    historyCurrent = snapshot;
    updateInspector(); render(); updateUndoButton(); saveProjectLocally();
}
function bindHistoryEvents() {
    document.getElementById('btnUndo').addEventListener('click', undoLastEdit);
    document.getElementById('btnRedo').addEventListener('click', redoLastEdit);
    document.addEventListener('keydown', e => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        const key = e.key.toLowerCase();
        const redo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
        if (key !== 'z' && !redo) return;
        const target = e.target;
        // Preserve native text undo while editing a field.
        if (target.isContentEditable || target.closest?.('textarea, input:not([type="range"])')) return;
        e.preventDefault();
        if (redo) redoLastEdit();
        else undoLastEdit();
    });
}
