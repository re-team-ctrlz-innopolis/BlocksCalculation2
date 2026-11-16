const state = {
    canvas: document.getElementById('planCanvas'),
    ctx: document.getElementById('planCanvas').getContext('2d'),
    elevCanvas: document.getElementById('elevationCanvas'),
    elevCtx: document.getElementById('elevationCanvas').getContext('2d'),
    walls: [], selectedWallId: null, selectedOpeningId: null, nextId: 1,
    totalWallRows: 10, activePlanRow: 1,
    zoom: 1, panX: 0, panY: 0,
    dragState: null, activeSnapPreview: null
};
