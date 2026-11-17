const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function app() {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {width: 1000, height: 700, value: '', style: {}, getContext: () => ({})});
        return elements.get(id);
    };
    const context = vm.createContext({console, document: {getElementById: element}, updateInspector() {}, render() {}, showToast() {}});
    for (const file of ['constants', 'state', 'wall-logic', 'wall-actions', 'project', 'history']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), context);
    return code => vm.runInContext(code, context);
}
const wall = `(id, x1, y1, x2, y2, rows = 10) => ({id, x1, y1, x2, y2, rows, openings: []})`;

test('400 cm wall: odd and even courses bond differently without cutting', () => {
    const run = app();
    run(`const make = ${wall}; state.walls = [make(1,0,0,400,0)];`);
    assert.equal(run('buildWallRowLayout(state.walls[0],1).blocks.length'), 10);
    assert.equal(run('buildWallRowLayout(state.walls[0],2).blocks.filter(b=>b.kind==="half").length'), 2);
    assert.equal(run('calculateWallBlocks(state.walls[0]).fullCount'), 95);
    assert.equal(run('calculateWallBlocks(state.walls[0]).halfCount'), 10);
    assert.equal(run('validateProject().errors.length'), 0);
});

test('nominal 20 cm half fills the whole segment', () => {
    const run = app();
    assert.equal(run('decomposeSegmentIntoBlocks(0,20,0).blocks[0].kind'), 'half');
    assert.equal(run('decomposeSegmentIntoBlocks(0,20,0).unfilledSegments.length'), 0);
});

test('L corner is counted once; higher courses lose the corner inset above the shorter partner', () => {
    const run = app();
    run(`const make = ${wall}; state.walls=[make(1,0,0,400,0,10),make(2,0,0,0,400,4)];`);
    assert.equal(run('getAllWallJoints().length'), 1);
    assert.equal(run('buildWallRowLayout(state.walls[0],1).blocks.reduce((s,b)=>s+b.lenCm,0)+buildWallRowLayout(state.walls[1],1).blocks.reduce((s,b)=>s+b.lenCm,0)'), 780);
    assert.equal(run('buildWallRowLayout(state.walls[0],6).rowStartCm'), 0);
    assert.equal(run('calculateWallBlocks(state.walls[1]).fullCount + calculateWallBlocks(state.walls[1]).halfCount > 0'), true);
});

test('T joints preserve host masonry; intersections with openings are rejected', () => {
    const run = app();
    run(`const make = ${wall}; state.walls=[make(1,0,0,400,0),make(2,150,0,150,200)];`);
    assert.equal(run('getAllWallJoints()[0].type'), 'T');
    assert.equal(run('buildWallRowLayout(state.walls[0],1).blocks.reduce((s,b)=>s+b.lenCm,0)'), 400);
    run(`state.walls[0].openings=[{id:3,offset:150,length:100,startRow:1,rowCount:4,type:'arch'}];`);
    assert.ok(run('validateProject().errors.some(s=>s.includes("T-junction"))'));
});

test('openings remove only their active courses and retain all other masonry', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,0,400,0)]; state.walls[0].openings=[{id:2,offset:160,length:80,startRow:3,rowCount:4,type:'window'}];`);
    assert.equal(run('buildWallRowLayout(state.walls[0],2).blocks.reduce((s,b)=>s+b.lenCm,0)'), 400);
    assert.equal(run('buildWallRowLayout(state.walls[0],3).blocks.reduce((s,b)=>s+b.lenCm,0)'), 320);
    assert.equal(run('buildWallRowLayout(state.walls[0],7).blocks.reduce((s,b)=>s+b.lenCm,0)'), 400);
    assert.equal(run('validateProject().errors.length'), 0);
});

test('long walls have sections at most 5 m and half-block ends every second course', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,0,1200,0)];`);
    assert.equal(run('getControlJoints(state.walls[0]).join(",")'), '400,800');
    assert.equal(run('buildWallRowLayout(state.walls[0],2).blocks.some(b=>b.startCm<400 && b.startCm+b.lenCm>400)'), false);
    assert.equal(run('buildWallRowLayout(state.walls[0],2).blocks.find(b=>b.startCm===400).kind'), 'half');
    assert.equal(run('buildWallRowLayout(state.walls[0],2).blocks.find(b=>b.startCm+b.lenCm===400).kind'), 'half');
    assert.equal(run('validateProject().errors.length'), 0);
});

test('control joints avoid openings and report impossible placement', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,0,600,0)]; state.walls[0].openings=[{id:2,offset:300,length:120,startRow:4,rowCount:3,type:'window'}];`);
    assert.ok(run('getControlJoints(state.walls[0]).every(x=>x<220 || x>380)'));
    run(`state.walls[0].openings=[{id:2,offset:270,length:500,startRow:4,rowCount:3,type:'window'}];`);
    assert.ok(run('validateProject().errors.some(s=>s.includes("cannot place control joints"))'));
});

test('invalid lengths, overlapping walls, X crossings and wide lintels block final reports', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,0,410,0)];`);
    assert.ok(run('validateProject().errors.some(s=>s.includes("20 cm modules"))'));
    run('state.walls=[make(1,0,0,400,0),make(2,0,0,400,0)];');
    assert.ok(run('validateProject().errors.some(s=>s.includes("overlap"))'));
    run('state.walls=[make(1,0,0,400,0),make(2,200,-100,200,100)];');
    assert.ok(run('validateProject().errors.some(s=>s.includes("X intersections"))'));
    run(`state.walls=[make(1,0,0,400,0)]; state.walls[0].openings=[{id:2,offset:200,length:160,startRow:1,rowCount:4,type:'door'}];`);
    assert.equal(run('getProjectReport()'), null);
});

test('sample house passes validation with individual wall heights and control joints', () => {
    const run = app(); run('loadDemoHouse();');
    assert.equal(run('JSON.stringify(validateProject().errors)'), '[]');
    assert.equal(run('state.walls[4].rows'), 15);
    assert.ok(run('getControlJoints(state.walls[0]).length > 0'));
});

test('project round trip preserves quantities; malformed imports are atomic', () => {
    const run = app(); run('loadDemoHouse(); const snapshot=JSON.stringify(projectSnapshot()); const before=JSON.stringify(getProjectReport()); restoreProject(JSON.parse(snapshot));');
    assert.equal(run('JSON.stringify(getProjectReport())===before'), true);
    assert.throws(() => run('const bad=JSON.parse(snapshot); bad.walls[1].id=bad.walls[0].id; restoreProject(bad);'), /duplicate/);
    assert.equal(run('JSON.stringify(getProjectReport())===before'), true);
    assert.throws(() => run('const corrupt=JSON.parse(snapshot); corrupt.walls[0].x2+=1; restoreProject(corrupt);'), /20 cm grid/);
});

test('non-cell T attachments and nearby overlapping parallel walls are invalid', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,0,400,0),make(2,160,0,160,200)];`);
    assert.ok(run('validateProject().errors.some(s=>s.includes("highlighted host-wall cell"))'));
    run('state.walls=[make(1,0,0,400,0),make(2,0,10,400,10)];');
    assert.ok(run('validateProject().errors.some(s=>s.includes("wall thickness"))'));
});

test('five-metre wall needs no control joint; one extra module needs one', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,0,500,0)];`);
    assert.equal(run('getControlJoints(state.walls[0]).length'), 0);
    run('state.walls[0].x2=520;');
    assert.equal(run('getControlJoints(state.walls[0]).length'), 1);
    assert.equal(run('validateProject().errors.length'), 0);
});

test('lowering and restoring height preserves openings and reports temporary overflow', () => {
    const run = app();
    run('loadDemoHouse(); const originalOpenings=JSON.stringify(state.walls[0].openings); const otherHeight = state.walls[1].rows; state.walls[0].rows=6; clampWallOpenings(state.walls[0]);');
    assert.equal(run('JSON.stringify(state.walls[0].openings)===originalOpenings'), true);
    assert.equal(run('state.walls[1].rows === otherHeight'), true);
    assert.ok(run('validateProject().errors.some(s=>s.includes("outside the wall height"))'));
    run('const low=JSON.stringify(projectSnapshot()); restoreProject(JSON.parse(low)); state.walls[0].rows=17; clampWallOpenings(state.walls[0]);');
    assert.deepEqual(JSON.parse(run('JSON.stringify(state.walls[0].openings)')), JSON.parse(run('originalOpenings')));
    assert.equal(run('validateProject().errors.length'), 0);
});

test('all supported nominal lengths conserve masonry across rows and control joints', () => {
    const run = app();
    run(`const make=${wall};`);
    assert.equal(run(`(() => {
        for (let length=20;length<=2400;length+=20) {
            state.walls=[make(1,0,0,length,0)];
            for (let r=1;r<=17;r++) {
                const layout=buildWallRowLayout(state.walls[0],r);
                const covered=layout.blocks.reduce((s,b)=>s+b.lenCm,0);
                if(covered!==length || layout.unfilledCm!==0) return false;
            }
        }
        return true;
    })()`), true);
});

test('undo restores deletion, next IDs, heights and recalculated quantities', () => {
    const run = app();
    run('loadDemoHouse(); resetEditHistory(); const original=JSON.stringify(projectSnapshot()); state.walls.pop(); saveProjectLocally(); undoLastEdit();');
    assert.equal(run('JSON.stringify(projectSnapshot())===original'), true);
    run('state.walls[0].rows=15; saveProjectLocally(); state.walls[0].rows=14; saveProjectLocally(); undoLastEdit();');
    assert.equal(run('state.walls[0].rows'), 15);
    run('undoLastEdit();');
    assert.equal(run('JSON.stringify(projectSnapshot())===original'), true);
});

test('a whole drag is one undo; no-op saves and camera changes do not add history', () => {
    const run = app();
    run('loadDemoHouse(); resetEditHistory(); state.panX=80; state.zoom=2; saveProjectLocally();');
    assert.equal(run('editHistory.length'), 0);
    run('const originalX=state.walls[0].x1; state.walls[0].x1+=10; state.walls[0].x1+=10; saveProjectLocally();');
    assert.equal(run('editHistory.length'), 1);
    run('undoLastEdit();');
    assert.equal(run('state.walls[0].x1===originalX'), true);
    assert.equal(run('state.panX'), 80);
    assert.equal(run('state.zoom'), 2);
});

test('a partition snaps to both parallel wall faces, independently of endpoint and wall order', () => {
    const run=app();
    run(`const make=${wall}; const a=make(1,0,0,600,0), b=make(2,600,400,0,400), branch=make(3,150,10,150,390); state.walls=[a,b,branch];`);
    for (const zoom of [0.25,1,4]) {
        run(`state.zoom=${zoom};`);
        assert.equal(run('JSON.stringify(snapWallTranslation(branch,{x1:154,y1:11,x2:154,y2:391}).snaps.map(p=>[p.x,p.y]).sort((a,b)=>a[1]-b[1]))'), '[[150,10],[150,390]]');
        assert.equal(run('snapWallTranslation(branch,{x1:154,y1:11,x2:154,y2:391}).x1'),150);
    }
    run('state.walls=[branch,b,a];');
    assert.equal(run('snapWallTranslation(branch,{x1:154,y1:11,x2:154,y2:391}).snaps.length'),2);
    assert.equal(run('snapWallTranslation(branch,{x1:154,y1:391,x2:154,y2:11}).snaps.length'),2);
});

test('T candidates use the physical face and never the host axis or an opening', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,0,600,0),make(2,150,10,150,390)];`);
    assert.equal(run('getSnapCandidates(153,9,2).filter(p=>p.type==="T").some(p=>p.y===0)'),false);
    assert.equal(run('getSnapCandidates(153,9,2)[0].y'),10);
    run(`state.walls[0].openings=[{id:3,offset:160,length:80,startRow:1,rowCount:4,type:'door'}];`);
    assert.equal(run('getSnapCandidates(150,10,2).filter(p=>p.type==="T" && p.offsetCm===150).length'),0);
});

test('endpoint resize preserves its axis and only previews exactly achievable joints', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,0,600,0),make(2,150,10,150,390)];`);
    assert.equal(run('resizeWallEndpoint(state.walls[1],true,{x:154,y:12}).y'),10);
    assert.equal(run('state.walls[1].x1'),150);
    run('state.walls[0].y1=5;state.walls[0].y2=5;');
    assert.equal(run('resizeWallEndpoint(state.walls[1],true,{x:150,y:15})'),null);
    assert.equal(run('getWallLengthCm(state.walls[1])'),380);
});

test('free movement uses the world grid and preserves wall length', () => {
    const run=app();
    run(`const make=${wall}; const branch=make(1,0,0,0,400);state.walls=[branch];`);
    assert.equal(run('JSON.stringify(snapWallTranslation(branch,{x1:123.4,y1:103.9,x2:123.4,y2:503.9}))'), '{"x1":120,"y1":100,"x2":120,"y2":500,"snaps":[]}');
});

test('old projects with axis T connections migrate to faces exactly once', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,0,600,0),make(2,0,400,600,400),make(3,150,0,150,400)];const saved=projectSnapshot();delete saved.planGeometry;restoreProject(saved);`);
    assert.equal(run('state.walls[2].y1'),10);
    assert.equal(run('state.walls[2].y2'),390);
    assert.equal(run('validateProject().errors.length'),0);
    run('restoreProject(JSON.parse(JSON.stringify(projectSnapshot())));');
    assert.equal(run('state.walls[2].y1'),10);
    assert.equal(run('state.walls[2].y2'),390);
});
