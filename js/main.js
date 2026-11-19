bindEvents();
bindProjectEvents();
bindHistoryEvents();
window.addEventListener('resize', resizeCanvases);
resizeCanvases();
let restored = false;
try {
    // Write new projects under a new key, preserving the original legacy save.
    const saved = localStorage.getItem(LOCAL_PROJECT_KEY) || localStorage.getItem('blocks-calculator-v1');
    if (saved) { restoreProject(JSON.parse(saved)); restored = true; }
} catch (error) { showToast(`Saved project could not be restored: ${error.message} Original saved data is retained. Loading the sample.`); }
if (!restored) loadDemoHouse();
updateInspector();
render();
resetEditHistory();
