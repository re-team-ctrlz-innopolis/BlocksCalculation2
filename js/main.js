bindEvents();
bindProjectEvents();
bindHistoryEvents();
window.addEventListener('resize', resizeCanvases);
resizeCanvases();
let restored = false;
try {
    const saved = localStorage.getItem('blocks-calculator-v1');
    if (saved) { restoreProject(JSON.parse(saved)); restored = true; }
} catch { showToast('Saved project could not be restored. Loading the sample.'); }
if (!restored) loadDemoHouse();
updateInspector();
render();
resetEditHistory();
