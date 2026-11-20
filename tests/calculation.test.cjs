const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function app(withInteractions = false) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            width: 1000, height: 700, value: '', style: {}, listeners: {},
            getContext: () => ({}), getBoundingClientRect: () => ({left:0,top:0}),
            addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
            querySelector: () => element('file-menu-summary'), querySelectorAll: () => [],
            setPointerCapture() {}
        });
        return elements.get(id);
    };
    const typeButtons = ['window','door'].map(type => Object.assign(element('type-' + type), {dataset:{optype:type}}));
    const context = vm.createContext({console, document: {
        getElementById: element, addEventListener() {},
        querySelectorAll: selector => selector === '.opening-type-btn' ? typeButtons : []
    }, window: {addEventListener() {}, confirm:()=>true}, updateInspector() {}, render() {}, showToast() {}});
    for (const file of ['constants', 'state', 'wall-logic', 'geometry-migration', 'wall-actions', 'project', 'history']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), context);
    if (withInteractions) {
        for (const file of ['render','interactions']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), context);
        vm.runInContext('render=()=>{};showToast=()=>{};bindEvents();bindProjectEvents();',context);
    }
    return code => vm.runInContext(code, context);
}
const wall = `(id, x1, y1, x2, y2, rows = 10) => ({id, x1, y1, x2, y2, rows, openings: []})`;

test('400 cm wall: odd and even courses bond differently without cutting', () => {
    const run = app();
    run(`const make = ${wall}; state.walls = [make(1,0,10,400,10)];`);
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
    run(`const make = ${wall}; state.walls=[make(1,0,10,400,10,10),make(2,10,0,10,400,4)];`);
    assert.equal(run('getAllWallJoints().length'), 1);
    assert.equal(run('buildWallRowLayout(state.walls[0],1).blocks.reduce((s,b)=>s+b.lenCm,0)+buildWallRowLayout(state.walls[1],1).blocks.reduce((s,b)=>s+b.lenCm,0)'), 780);
    assert.equal(run('buildWallRowLayout(state.walls[0],6).rowStartCm'), 0);
    assert.equal(run('calculateWallBlocks(state.walls[1]).fullCount + calculateWallBlocks(state.walls[1]).halfCount > 0'), true);
});

test('T joints preserve host masonry; intersections with openings are rejected', () => {
    const run = app();
    run(`const make = ${wall}; state.walls=[make(1,0,10,400,10),make(2,150,20,150,220)];`);
    assert.equal(run('getAllWallJoints()[0].type'), 'T');
    assert.equal(run('buildWallRowLayout(state.walls[0],1).blocks.reduce((s,b)=>s+b.lenCm,0)'), 400);
    run(`state.walls[0].openings=[{id:3,offset:150,length:100,startRow:1,rowCount:4,type:'arch'}];`);
    assert.ok(run('validateProject().errors.some(s=>s.includes("T-junction"))'));
});

test('openings remove only their active courses and retain all other masonry', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10)]; state.walls[0].openings=[{id:2,offset:160,length:80,startRow:3,rowCount:4,type:'window'}];`);
    assert.equal(run('buildWallRowLayout(state.walls[0],2).blocks.reduce((s,b)=>s+b.lenCm,0)'), 400);
    assert.equal(run('buildWallRowLayout(state.walls[0],3).blocks.reduce((s,b)=>s+b.lenCm,0)'), 320);
    assert.equal(run('buildWallRowLayout(state.walls[0],7).blocks.reduce((s,b)=>s+b.lenCm,0)'), 400);
    assert.equal(run('validateProject().errors.length'), 0);
});

test('5 m control joints reserve one half block on each side in every second course', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,10,1200,10)];`);
    assert.equal(run('getControlJoints(state.walls[0]).join(",")'), '500,1000');
    assert.equal(run('buildWallRowLayout(state.walls[0],2).blocks.some(b=>b.startCm<500 && b.startCm+b.lenCm>500)'), false);
    assert.equal(run('buildWallRowLayout(state.walls[0],2).blocks.filter(b=>[480,500].includes(b.startCm) && b.kind==="half").length'), 2);
    assert.equal(run('buildWallRowLayout(state.walls[0],2).blocks.some(b=>b.startCm<1000 && b.startCm+b.lenCm>1000)'), false);
    assert.equal(run('buildWallRowLayout(state.walls[0],2).blocks.filter(b=>[980,1000].includes(b.startCm) && b.kind==="half").length'), 2);
    assert.equal(run('validateProject().errors.length'), 0);
});

test('control joint near an L-corner uses full-half | half instead of three halves | half', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,10,540,10),make(2,530,0,530,140)];`);
    assert.equal(run('getAllWallJoints().filter(j=>j.type==="L").length'),1);
    assert.equal(run('JSON.stringify(buildWallRowLayout(state.walls[0],2).blocks.filter(b=>b.startCm>=440).map(b=>[b.startCm,b.lenCm,b.kind]))'),
        '[[440,40,"full"],[480,20,"half"],[500,20,"half"]]');
    assert.equal(run('calculateWallBlocks(state.walls[0]).unfilledCm'),0);
    assert.equal(run('validateProject().errors.length'),0);
});

test('control joints stay at fixed 5 m intervals and report openings in their clearance zones', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,10,600,10)]; state.walls[0].openings=[{id:2,offset:300,length:120,startRow:4,rowCount:3,type:'window'}];`);
    assert.equal(run('getControlJoints(state.walls[0]).join(",")'), '500');
    assert.ok(run('validateProject().errors.some(s=>s.includes("control-joint detail"))'));
    run(`state.walls[0].openings=[{id:2,offset:270,length:500,startRow:4,rowCount:3,type:'window'}];`);
    assert.ok(run('validateProject().errors.some(s=>s.includes("control-joint detail"))'));
});

test('invalid lengths, overlapping walls, X crossings and wide lintels block final reports', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,10,410,10)];`);
    assert.ok(run('validateProject().errors.some(s=>s.includes("200 mm modules"))'));
    run('state.walls=[make(1,0,10,400,10),make(2,0,10,400,10)];');
    assert.ok(run('validateProject().errors.some(s=>s.includes("overlap"))'));
    run('state.walls=[make(1,0,10,400,10),make(2,200,-100,200,100)];');
    assert.ok(run('validateProject().errors.some(s=>s.includes("X intersections"))'));
    run(`state.walls=[make(1,0,10,400,10)]; state.walls[0].openings=[{id:2,offset:200,length:160,startRow:1,rowCount:4,type:'door'}];`);
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
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10),make(2,160,0,160,200)];`);
    assert.ok(run('validateProject().errors.some(s=>s.includes("highlighted host-wall cell"))'));
    run('state.walls=[make(1,0,10,400,10),make(2,0,20,400,20)];');
    assert.ok(run('validateProject().errors.some(s=>s.includes("wall thickness"))'));
});

test('five-metre wall needs no control joint; one extra module needs one', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,10,500,10)];`);
    assert.equal(run('getControlJoints(state.walls[0]).length'), 0);
    run('state.walls[0].x2=520;');
    assert.equal(run('getControlJoints(state.walls[0]).length'), 1);
    assert.equal(run('validateProject().errors.length'), 0);
});

test('100,000 mm wall limit and exact control-joint multiples are enforced', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,10,10000,10)];`);
    assert.equal(run('validateProject().errors.length'), 0);
    assert.equal(run('getControlJoints(state.walls[0]).length'), 19);
    run('state.walls[0].x2=10020;');
    assert.ok(run('validateProject().errors.some(s=>s.includes("100000 mm"))'));
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
            state.walls=[make(1,0,10,length,10)];
            for (let r=1;r<=MAX_WALL_ROWS;r++) {
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

test('redo restores edits, selection and quantities; repeated undo/redo preserves history', () => {
    const run = app();
    run('loadDemoHouse(); resetEditHistory(); const original=JSON.stringify(projectSnapshot()); const originalSelection=state.selectedWallId; state.selectedWallId=state.walls.at(-1).id; state.walls[0].rows=15; state.nextId+=1; saveProjectLocally(); const edited=JSON.stringify(projectSnapshot()); const editedSelection=state.selectedWallId; const editedFull=calculateWallBlocks(state.walls[0]).fullCount;');
    for (let i=0;i<2;i++) {
        run('undoLastEdit();');
        assert.equal(run('JSON.stringify(projectSnapshot())===original'), true);
        assert.equal(run('state.selectedWallId===originalSelection'), true);
        assert.equal(run('document.getElementById("btnRedo").disabled'), false);
        run('redoLastEdit();');
        assert.equal(run('JSON.stringify(projectSnapshot())===edited'), true);
        assert.equal(run('state.selectedWallId===editedSelection'), true);
        assert.equal(run('calculateWallBlocks(state.walls[0]).fullCount===editedFull'), true);
        assert.equal(run('document.getElementById("btnRedo").disabled'), true);
    }
});

test('new edits clear redo, while no-op saves and camera changes preserve it', () => {
    const run=app();
    run('loadDemoHouse(); resetEditHistory(); state.walls[0].rows=15; saveProjectLocally(); undoLastEdit(); state.panX=80; saveProjectLocally();');
    assert.equal(run('redoHistory.length'),1);
    run('state.walls[0].rows=14; saveProjectLocally(); const edited=JSON.stringify(projectSnapshot()); redoLastEdit();');
    assert.equal(run('redoHistory.length'),0);
    assert.equal(run('JSON.stringify(projectSnapshot())===edited'),true);
    assert.equal(run('document.getElementById("btnRedo").disabled'),true);
    run('resetEditHistory();');
    assert.equal(run('document.getElementById("btnUndo").disabled'),true);
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
    run(`const make=${wall}; const a=make(1,0,10,600,10), b=make(2,600,410,0,410), branch=make(3,150,20,150,400); state.walls=[a,b,branch];`);
    for (const zoom of [0.25,1,4]) {
        run(`state.zoom=${zoom};`);
        assert.equal(run('JSON.stringify(snapWallTranslation(branch,{x1:154,y1:21,x2:154,y2:401}).snaps.map(p=>[p.x,p.y]).sort((a,b)=>a[1]-b[1]))'), '[[150,20],[150,400]]');
        assert.equal(run('snapWallTranslation(branch,{x1:154,y1:21,x2:154,y2:401}).x1'),150);
    }
    run('state.walls=[branch,b,a];');
    assert.equal(run('snapWallTranslation(branch,{x1:154,y1:21,x2:154,y2:401}).snaps.length'),2);
    assert.equal(run('snapWallTranslation({...branch,x1:150,y1:400,x2:150,y2:20},{x1:154,y1:401,x2:154,y2:21}).snaps.length'),2);
});

test('T candidates use the physical face and never the host axis or an opening', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,10,600,10),make(2,150,20,150,400)];`);
    assert.equal(run('getSnapCandidates(153,19,2).filter(p=>p.type==="T").some(p=>p.y===10)'),false);
    assert.equal(run('getSnapCandidates(153,19,2)[0].y'),20);
    run(`state.walls[0].openings=[{id:3,offset:160,length:80,startRow:1,rowCount:4,type:'door'}];`);
    assert.equal(run('getSnapCandidates(150,20,2).filter(p=>p.type==="T" && p.offsetCm===150).length'),0);
});

test('endpoint resize preserves its axis and only previews exactly achievable joints', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,10,600,10),make(2,150,20,150,400)];`);
    assert.equal(run('resizeWallEndpoint(state.walls[1],true,{x:154,y:22}).y'),20);
    assert.equal(run('state.walls[1].x1'),150);
    run('state.walls[0].y1=15;state.walls[0].y2=15;');
    assert.equal(run('resizeWallEndpoint(state.walls[1],true,{x:150,y:25})'),null);
    assert.equal(run('getWallLengthCm(state.walls[1])'),380);
});

test('free movement uses the world grid and preserves wall length', () => {
    const run=app();
    run(`const make=${wall}; const branch=make(1,10,0,10,400);state.walls=[branch];`);
    assert.equal(run('JSON.stringify(snapWallTranslation(branch,{x1:123.4,y1:103.9,x2:123.4,y2:503.9}))'), '{"x1":130,"y1":100,"x2":130,"y2":500,"snaps":[]}');
});

test('old projects with axis T connections migrate to faces exactly once', () => {
    const run=app();
    const saved = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','legacy-sample-house.json'),'utf8'));
    run(`restoreProject(${JSON.stringify(saved)});`);
    const migrated = run('JSON.stringify(projectSnapshot())');
    assert.equal(run('getWallLengthCm(state.walls[4])'),360);
    assert.equal(run('validateProject().errors.length'),0);
    run('restoreProject(JSON.parse(JSON.stringify(projectSnapshot())));');
    assert.equal(run('JSON.stringify(projectSnapshot())'),migrated);
});

test('review fixtures load for editing but block final reports with specific errors', () => {
    const run = app();
    for (const [file, message] of [
        ['overlap-at-endpoint.json', 'overlap outside a supported L-corner'],
        ['short-double-corner.json', 'overlap']
    ]) {
        const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8'));
        run(`restoreProject(${JSON.stringify(fixture)});`);
        assert.equal(run('state.walls.length'), fixture.walls.length);
        assert.ok(run(`validateProject().errors.some(s=>s.includes(${JSON.stringify(message)}))`), file);
        assert.equal(run('getProjectReport()'), null, file);
    }
});

test('perpendicular footprint overlaps are rejected in every orientation and wall order', () => {
    const run = app();
    run(`const make=${wall};`);
    for (const branchX of [0, 5, 395, 400, 405]) for (let turn = 0; turn < 4; turn++) for (let reverse = 0; reverse < 4; reverse++) for (const swap of [false, true]) {
        const walls = [
            {id:1,x1:0,y1:0,x2:400,y2:0,rows:10,openings:[]},
            {id:2,x1:branchX,y1:-10,x2:branchX,y2:190,rows:10,openings:[]}
        ];
        for (let i = 0; i < walls.length; i++) {
            const w = walls[i];
            for (let t = 0; t < turn; t++) {
                [w.x1, w.y1] = [-w.y1, w.x1];
                [w.x2, w.y2] = [-w.y2, w.x2];
            }
            if (reverse & (1 << i)) {
                [w.x1, w.x2] = [w.x2, w.x1];
                [w.y1, w.y2] = [w.y2, w.y1];
            }
        }
        if (swap) walls.reverse();
        run(`state.walls=${JSON.stringify(walls)};`);
        assert.ok(run('validateProject().errors.some(s=>s.includes("overlap") || s.includes("X intersections"))'), JSON.stringify({branchX,turn,reverse,swap}));
        assert.equal(run('getProjectReport()'), null);
    }
});

test('valid L and face T joints and walls touching without area overlap remain allowed', () => {
    const run = app();
    run(`const make=${wall};`);
    for (const branch of [
        'make(2,10,0,10,200)',
        'make(2,390,20,390,-180)',
        'make(2,150,20,150,220)',
        'make(2,150,0,150,-200)',
        'make(2,410,-100,410,100)',
        'make(2,410,20,410,220)',
        'make(2,430,-100,430,100)'
    ]) {
        run(`state.walls=[make(1,0,10,400,10),${branch}];`);
        for (const swap of [false, true]) {
            if (swap) run('state.walls.reverse();');
            assert.equal(run('JSON.stringify(validateProject().errors)'), '[]', branch);
            assert.notEqual(run('getProjectReport()'), null, branch);
        }
    }
});

test('a single short corner cell cannot be shared by three walls', () => {
    const run = app();
    run(`const make=${wall};`);
    for (const shortId of [1, 3]) {
        const partners = shortId === 1 ? [2,3] : [1,2];
        run(`state.walls=[make(${partners[0]},10,0,10,400,2),make(${partners[1]},10,20,10,-380,4),make(${shortId},0,10,20,10,10)];`);
        assert.ok(run('validateProject().errors.some(s=>s.includes("more than two walls"))'));
        assert.equal(run('getProjectReport()'), null);
        // Above both shorter partners, the short wall has no corner deductions.
        assert.equal(run('buildWallRowLayout(state.walls[2],5).blocks.length'), 1);
    }
});

test('a 40 cm wall fits two corner insets exactly and conserves masonry per course', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,10,0,10,400),make(2,30,0,30,400),make(3,0,10,40,10)];`);
    assert.equal(run('JSON.stringify(validateProject().errors)'), '[]');
    for (const row of [1,2]) {
        assert.equal(run(`state.walls.reduce((sum,w)=>sum+buildWallRowLayout(w,${row}).blocks.reduce((s,b)=>s+b.lenCm,0),0)`),800);
    }
    assert.notEqual(run('getProjectReport()'), null);
});

test('200 mm block height permits 17 courses within 3.5 m and rejects 18', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10,17)];`);
    assert.equal(run('MAX_WALL_HEIGHT_CM'), 350);
    assert.equal(run('MAX_WALL_ROWS'), 17);
    assert.equal(run('FULL_BLOCK_MM'), 400);
    assert.equal(run('HALF_BLOCK_MM'), 200);
    assert.equal(run('BLOCK_HEIGHT_MM'), 200);
    assert.equal(run('BLOCK_DEPTH_MM'), 200);
    assert.equal(run('COURSE_HEIGHT_CM * MM_PER_CM'), 200);
    assert.equal(run('JSON.stringify(validateProject().errors)'), '[]');
    assert.equal(run('getProjectReport()[0].height'), 3400);
    assert.equal(run('getProjectReport()[0].fullCount'), 162);
    assert.equal(run('getProjectReport()[0].halfCount'), 16);
    run('state.walls[0].rows=18;');
    assert.ok(run('validateProject().errors.some(s=>s.includes("2–17 courses"))'));
    assert.equal(run('getProjectReport()'), null);
});

test('17-course projects and openings round trip; malformed imports are atomic', () => {
    const run = app();
    run(`const make=${wall}; state.totalWallRows=17; state.walls=[make(1,0,10,400,10,17)]; state.walls[0].openings=[{id:2,offset:160,length:80,startRow:14,rowCount:1,type:'window'}]; const saved=JSON.stringify(projectSnapshot()); restoreProject(JSON.parse(saved)); const before=JSON.stringify(getProjectReport());`);
    assert.equal(run('state.totalWallRows'), 17);
    assert.equal(run('state.walls[0].rows'), 17);
    assert.equal(run('state.walls[0].openings[0].startRow'), 14);
    assert.equal(run('JSON.stringify(validateProject().errors)'), '[]');
    assert.throws(() => run('const badWall=JSON.parse(saved); badWall.walls[0].rows=20; restoreProject(badWall);'), /height/);
    assert.equal(run('JSON.stringify(getProjectReport())===before'), true);
    assert.throws(() => run('const badDefault=JSON.parse(saved); badDefault.totalWallRows=20; restoreProject(badDefault);'), /height/);
    assert.equal(run('JSON.stringify(getProjectReport())===before'), true);
});

test('older 19-course projects remain editable without trimming walls or openings', () => {
    const run = app();
    run(`loadDemoHouse(); const saved=JSON.parse(JSON.stringify(projectSnapshot())); saved.totalWallRows=19; saved.walls[0].rows=19; saved.walls[0].openings[0].startRow=18; saved.walls[0].openings[0].rowCount=1; const opening=JSON.stringify(saved.walls[0].openings[0]); restoreProject(saved);`);
    assert.equal(run('state.totalWallRows'),19);
    assert.equal(run('state.walls[0].rows'),19);
    assert.deepEqual(JSON.parse(run('JSON.stringify(state.walls[0].openings[0])')),JSON.parse(run('opening')));
    assert.ok(run('validateProject().errors.some(s=>s.includes("2–17 courses"))'));
    assert.equal(run('getProjectReport()'),null);
    run('state.walls[0].rows=17; state.walls[0].openings[0].startRow=10;');
    assert.equal(run('getProjectReport()[0].height'),3400);
});

test('CSV exports use 200 mm courses and the corrected three-dimensional block sizes', () => {
    const run = app();
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10,10)]; let csv=''; downloadFile=(name,content)=>{csv=content;}; exportCsv();`);
    assert.equal(run('getProjectReport()[0].height'),2000);
    assert.ok(run('csv.includes("1,4000,2000,10,")'));
    assert.ok(run('csv.includes("400×200×200 mm") && csv.includes("200×200×200 mm")'));
    assert.ok(run('csv.includes("mortar joints excluded")'));
});

test('lintels require exactly three or more complete courses above the opening', () => {
    const run = app();
    run(`const make=${wall};`);
    for (const height of [4,10,17]) for (const startRow of [1,3]) for (const coursesAbove of [0,1,2,3,4]) {
        const rowCount = height - coursesAbove - startRow + 1;
        if (rowCount < 1) continue;
        run(`state.walls=[make(1,0,10,400,10,${height})]; state.walls[0].openings=[{id:2,offset:160,length:80,startRow:${startRow},rowCount:${rowCount},type:'${startRow === 1 ? 'door' : 'window'}'}];`);
        const scenario = JSON.stringify({height,startRow,rowCount,coursesAbove});
        assert.equal(run('validateProject().errors.some(s=>s.includes("three courses above"))'), coursesAbove < 3, scenario);
        if (coursesAbove < 3) {
            assert.ok(run(`validateProject().errors.some(s=>s.includes('(${coursesAbove} available)'))`), scenario);
            assert.equal(run('getProjectReport()'), null, scenario);
        } else {
            assert.equal(run('JSON.stringify(validateProject().errors)'), '[]', scenario);
            assert.notEqual(run('getProjectReport()'), null, scenario);
        }
    }
});

test('doors start at the first course while windows and generic openings may be raised', () => {
    const run = app();
    run(`const make=${wall};`);
    for (const type of ['door','window','arch']) for (const startRow of [1,2,5]) {
        run(`state.walls=[make(1,0,10,400,10,17)]; state.walls[0].openings=[{id:2,offset:160,length:80,startRow:${startRow},rowCount:4,type:'${type}'}];`);
        const invalid = type === 'door' && startRow !== 1;
        assert.equal(run('validateProject().errors.some(s=>s.includes("must start at course 1"))'), invalid, `${type}, row ${startRow}`);
        assert.equal(run('getProjectReport() === null'), invalid, `${type}, row ${startRow}`);
    }
});

test('imported raised doors keep their position but block reports until corrected', () => {
    const run = app();
    run(`const make=${wall}; state.totalWallRows=17; state.walls=[make(1,0,10,400,10,17)]; state.walls[0].openings=[{id:2,offset:160,length:80,startRow:3,rowCount:4,type:'door'}]; const saved=JSON.stringify(projectSnapshot()); restoreProject(JSON.parse(saved));`);
    assert.equal(run('state.walls[0].openings[0].startRow'), 3);
    assert.ok(run('validateProject().errors.some(s=>s.includes("must start at course 1"))'));
    assert.equal(run('getProjectReport()'), null);
    run('state.walls[0].openings[0].startRow=1;');
    assert.equal(run('JSON.stringify(validateProject().errors)'), '[]');
    assert.notEqual(run('getProjectReport()'), null);
});

test('a nested partition snaps to both wall faces on the common grid', () => {
    const run = app();
    run(`loadDemoHouse(); const left=state.walls[2],middle=state.walls[4];const branch={id:state.nextId++,x1:left.x1+10,y1:left.y1+90,x2:middle.x1-10,y2:left.y1+90,rows:10,openings:[]};state.walls.push(branch);`);
    assert.equal(run('getWallLengthCm(branch)'),280);
    for (const zoom of [0.25,1,4]) {
        run(`state.zoom=${zoom}; const moved${zoom*100}=snapWallTranslation(branch,{x1:branch.x1+2,y1:branch.y1+1,x2:branch.x2+2,y2:branch.y2+1});`);
        assert.equal(run(`moved${zoom*100}.snaps.length`),2);
        assert.equal(run(`moved${zoom*100}.x1 === branch.x1 && moved${zoom*100}.x2 === branch.x2 && moved${zoom*100}.y1 === branch.y1`),true);
    }
    assert.equal(run('getAllWallJoints().filter(j=>j.type==="T" && j.branchWallId===branch.id).length'),2);
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
    assert.notEqual(run('getProjectReport()'),null);
});

test('L snapping shares a complete end cell in both directions and all rotations', () => {
    const run=app();
    for (const reverse of [false,true]) for (let turn=0;turn<4;turn++) {
        const host={id:1,x1:0,y1:10,x2:400,y2:10,rows:10,openings:[]};
        const branch={id:2,x1:10,y1:0,x2:10,y2:200,rows:10,openings:[]};
        if(reverse){[branch.x1,branch.x2]=[branch.x2,branch.x1];[branch.y1,branch.y2]=[branch.y2,branch.y1];}
        for(const w of [host,branch])for(let i=0;i<turn;i++){
            [w.x1,w.y1]=[-w.y1,w.x1];[w.x2,w.y2]=[-w.y2,w.x2];
        }
        run(`state.walls=${JSON.stringify([host,branch])};Object.assign(state.walls[1],snapWallTranslation(state.walls[1],{x1:${branch.x1+2},y1:${branch.y1+1},x2:${branch.x2+2},y2:${branch.y2+1}}));`);
        assert.equal(run('getAllWallJoints().filter(j=>j.type==="L").length'),1);
        assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
        assert.equal(run('isWallOnGrid(state.walls[1])'),true);
    }
});

test('rendered block cells cover masonry exactly once, including corners and nested T joints', () => {
    const run=app();
    run(`loadDemoHouse();const left=state.walls[2],middle=state.walls[4];state.walls.push({id:state.nextId++,x1:left.x1+10,y1:left.y1+90,x2:middle.x1-10,y2:left.y1+90,rows:10,openings:[]});
    function verifyCells(){
        const joints=getAllWallJoints();
        const key=p=>Math.round(p.x)+','+Math.round(p.y);
        for(let row=1;row<=19;row++){
            const expected=new Set(),actual=new Set();
            for(const w of state.walls){
                if(row>getWallRows(w))continue;
                for(let x=10;x<getWallLengthCm(w);x+=20){
                    if(w.openings.some(op=>row>=op.startRow && row<op.startRow+op.rowCount && x>getOpeningBoundsCm(op).startCm && x<getOpeningBoundsCm(op).endCm))continue;
                    expected.add(key(wallLocalToWorld(w,x,0)));
                }
                for(const b of buildWallRowLayout(w,row,joints).blocks)for(let x=b.startCm+10;x<b.startCm+b.lenCm;x+=20){
                    const p=wallLocalToWorld(w,x,0),k=key(p);
                    if(actual.has(k) || Math.abs((p.x-10)/20-Math.round((p.x-10)/20))>0.001 || Math.abs((p.y-10)/20-Math.round((p.y-10)/20))>0.001)return false;
                    actual.add(k);
                }
            }
            if(expected.size!==actual.size || [...expected].some(k=>!actual.has(k)))return false;
        }
        return true;
    }`);
    for(let turn=0;turn<4;turn++){
        assert.equal(run('verifyCells()'),true,`rotation ${turn}`);
        run('for(const w of state.walls){[w.x1,w.y1]=[-w.y1,w.x1];[w.x2,w.y2]=[-w.y2,w.x2];}');
    }
});

test('length changes and four quarter turns preserve the common grid without drift', () => {
    const run=app();
    run(`const make=${wall};state.walls=[make(1,0,10,400,10)];const w=state.walls[0];setWallLength(w,420);`);
    assert.equal(run('isWallOnGrid(w)'),true);
    assert.equal(run('w.x1'),0);
    assert.equal(run('w.x2'),420);
    run('const before=JSON.stringify(w);for(let i=0;i<4;i++)setWallAngle(w,getWallAngleDeg(w)+90);');
    assert.equal(run('JSON.stringify(w)===before'),true);
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
});

test('saved examples load without migration, allow reports, and survive a JSON round trip', () => {
    for (const name of ['sample-house', 'nested-partition']) {
        const run = app();
        const file = fs.readFileSync(path.join(__dirname, '../examples', name + '.json'), 'utf8');
        const saved = JSON.parse(file);
        assert.equal(saved.planGeometry, 'modular-cells-v3');
        assert.deepEqual(saved.migrationNotes, []);
        assert.ok(saved.walls.every(w => w.rows <= 17 && w.openings.every(o => ['window', 'door'].includes(o.type))));
        run(`restoreProject(${JSON.stringify(saved)});`);
        assert.equal(run('JSON.stringify(validateProject().errors)'), '[]');
        assert.deepEqual(JSON.parse(run('JSON.stringify(projectSnapshot())')), saved);
        assert.equal(run('getWallLengthCm(getPartnerWall(5))'), 360);
        assert.equal(run('getAllWallJoints().filter(j => j.type === "L").length'), 4);
        assert.equal(run('getAllWallJoints().filter(j => j.type === "T").length'), name === 'nested-partition' ? 4 : 2);
        if (name === 'nested-partition') assert.equal(run('getWallLengthCm(getPartnerWall(10))'), 280);
        run('const report = JSON.stringify(getProjectReport()); const snapshot = JSON.stringify(projectSnapshot()); restoreProject(JSON.parse(snapshot));');
        assert.notEqual(run('getProjectReport()'), null);
        assert.equal(run('JSON.stringify(getProjectReport())'), run('report'));
        assert.equal(run('JSON.stringify(state.migrationNotes)'), '[]');
    }
});

test('legacy screenshot plan migrates to a 280 cm nested partition without changing openings', () => {
    const run=app();
    const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','legacy-nested-partition.json'),'utf8'));
    run(`const original=${JSON.stringify(fixture)};const originalJSON=JSON.stringify(original);restoreProject(original);`);
    assert.equal(run('getWallLengthCm(getPartnerWall(5))'),360);
    assert.equal(run('getWallLengthCm(getPartnerWall(10))'),280);
    assert.equal(run('getAllWallJoints().filter(j=>j.type==="L").length'),4);
    assert.equal(run('getAllWallJoints().filter(j=>j.type==="T").length'),4);
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
    assert.deepEqual(JSON.parse(run('JSON.stringify(state.walls.map(w=>({id:w.id,openings:w.openings})))')),
        fixture.walls.map(w=>({id:w.id,openings:w.openings})));
    assert.equal(run('JSON.stringify(original)===originalJSON'),true);
    assert.ok(run('state.migrationNotes.some(s=>s.includes("300 to 280"))'));
    run('const converted=JSON.stringify(projectSnapshot());restoreProject(JSON.parse(converted));');
    assert.equal(run('JSON.stringify(projectSnapshot())===converted'),true);
});

test('a failed legacy conversion is atomic and never moves or drops an opening', () => {
    const run=app();
    const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','legacy-sample-house.json'),'utf8'));
    fixture.walls[4].openings=[{id:20,offset:350,length:20,startRow:1,rowCount:4,type:'arch'}];
    run(`loadDemoHouse();const before=JSON.stringify(projectSnapshot());const input=${JSON.stringify(fixture)};const untouched=JSON.stringify(input);`);
    assert.throws(()=>run('restoreProject(input)'),/without moving an opening/);
    assert.equal(run('JSON.stringify(projectSnapshot())===before'),true);
    assert.equal(run('JSON.stringify(input)===untouched'),true);
});

test('new-format off-grid walls are reported without being silently repositioned', () => {
    const run=app();
    run(`loadDemoHouse();const data=JSON.parse(JSON.stringify(projectSnapshot()));data.walls[0].y1+=1;data.walls[0].y2+=1;restoreProject(data);`);
    assert.equal(run('state.walls[0].y1===data.walls[0].y1'),true);
    assert.ok(run('validateProject().errors.some(s=>s.includes("common 20 cm grid"))'));
    assert.equal(run('getProjectReport()'),null);
});

test('projects predating face T junctions migrate their axis attachments', () => {
    const run=app();
    const walls=[
        {id:1,x1:0,y1:0,x2:600,y2:0,rows:10,openings:[]},
        {id:2,x1:0,y1:400,x2:600,y2:400,rows:10,openings:[]},
        {id:3,x1:150,y1:0,x2:150,y2:400,rows:10,openings:[]}
    ];
    run(`restoreProject({version:1,model:'nominal-400-200-mm',walls:${JSON.stringify(walls)},totalWallRows:10});`);
    assert.equal(run('getWallLengthCm(state.walls[2])'),380);
    assert.equal(run('state.walls[2].y1'),20);
    assert.equal(run('state.walls[2].y2'),400);
    assert.equal(run('getAllWallJoints().filter(j=>j.type==="T").length'),2);
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
});

test('conflicting legacy corner dimensions and future geometry formats keep the current project', () => {
    const run=app();
    const points=[[0,0],[400,0],[400,200],[600,200],[600,400],[0,400]];
    const walls=points.map((p,i)=>({id:i+1,x1:p[0],y1:p[1],x2:points[(i+1)%points.length][0],y2:points[(i+1)%points.length][1],rows:10,openings:[]}));
    run(`loadDemoHouse();const before=JSON.stringify(projectSnapshot());const input={version:1,model:'nominal-400-200-mm',planGeometry:'face-t-v2',walls:${JSON.stringify(walls)},totalWallRows:10};`);
    assert.throws(()=>run('restoreProject(input)'),/corner dimensions conflict/);
    assert.equal(run('JSON.stringify(projectSnapshot())===before'),true);
    assert.throws(()=>run("const future=JSON.parse(before);future.planGeometry='unknown-future-format';restoreProject(future);"),/Unsupported plan geometry/);
    assert.equal(run('JSON.stringify(projectSnapshot())===before'),true);
});

test('stacked openings share a horizontal footprint and remove masonry only in their own rows', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10,17)]; state.walls[0].openings=[
        {id:2,offset:120,length:80,startRow:2,rowCount:3,type:'window'},
        {id:3,offset:120,length:120,startRow:8,rowCount:3,type:'window'}];`);
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
    assert.equal(run('openingsOverlap(...state.walls[0].openings)'),false);
    assert.equal(run('openingWidthsOverlap(...state.walls[0].openings)'),true);
    for (const [row, length] of [[1,400],[2,320],[4,320],[5,400],[7,400],[8,280],[10,280],[11,400]]) {
        assert.equal(run(`buildWallRowLayout(state.walls[0],${row}).blocks.reduce((sum,b)=>sum+b.lenCm,0)`),length);
    }
    assert.equal(run('Array.from({length:17},(_,i)=>buildWallRowLayout(state.walls[0],i+1).blocks.reduce((sum,b)=>sum+b.lenCm,0)).reduce((sum,n)=>sum+n,0)'),6200);
    assert.notEqual(run('getProjectReport()'),null);
});

test('rectangular intersection detects partial overlap, containment and shared rows; touching edges are not overlap', () => {
    const run=app();
    run("const a={id:2,offset:100,length:80,startRow:2,rowCount:3,type:'window'};");
    for (const [offset,startRow,rowCount,expected] of [[120,3,3,true],[100,3,1,true],[100,1,10,true],[180,2,3,false],[100,5,3,false],[140,4,2,true],[140,5,2,false]]) {
        assert.equal(run(`openingsOverlap(a,{id:3,offset:${offset},length:80,startRow:${startRow},rowCount:${rowCount},type:'window'})`),expected);
    }
});

test('horizontal edits can pass under an upper opening but cannot intersect another rectangle', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10,17)]; const upper={id:2,offset:100,length:80,startRow:9,rowCount:3,type:'window'}; const lower={id:3,offset:280,length:80,startRow:2,rowCount:3,type:'window'}; state.walls[0].openings=[upper,lower];`);
    assert.equal(run('getOpeningLimitsCm(state.walls[0],lower).minCm'),20);
    assert.equal(run('tryUpdateOpening(state.walls[0],lower,{startCm:60})'),true);
    assert.equal(run('getOpeningBoundsCm(lower).startCm'),60);
    run('const before=JSON.stringify(lower);');
    for (const change of ['{startRow:8}','{rowCount:9}','{startCm:-20}','{startCm:380}']) {
        assert.equal(run(`tryUpdateOpening(state.walls[0],lower,${change})`),false);
        assert.equal(run('JSON.stringify(lower)===before'),true);
    }
    assert.equal(run('getOpeningVerticalLimits(state.walls[0],lower).maxEndRow'),9);
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
});

test('width changes and door conversion reject collisions without partially changing the opening', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10,17)]; const a={id:2,offset:60,length:80,startRow:2,rowCount:3,type:'window'}, b={id:3,offset:180,length:80,startRow:3,rowCount:3,type:'window'}; state.walls[0].openings=[a,b]; const before=JSON.stringify(a);`);
    assert.equal(run('tryUpdateOpening(state.walls[0],a,{lenCm:160})'),false);
    assert.equal(run('JSON.stringify(a)===before'),true);
    run(`b.offset=60;b.startRow=9;const upperBefore=JSON.stringify(b);`);
    assert.equal(run("tryUpdateOpening(state.walls[0],b,{type:'door',startRow:1})"),false);
    assert.equal(run('JSON.stringify(b)===upperBefore'),true);
});

test('wall edits preserve stacked positions and use the rightmost opening for the minimum length', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,10,160,10,17)]; state.walls[0].openings=[{id:2,offset:80,length:120,startRow:2,rowCount:3,type:'window'},{id:3,offset:80,length:120,startRow:8,rowCount:3,type:'window'}]; const before=JSON.stringify(state.walls[0].openings); clampWallOpenings(state.walls[0]);`);
    assert.equal(run('getMinAllowedWallLengthCm(state.walls[0])'),160);
    assert.equal(run('JSON.stringify(state.walls[0].openings)===before'),true);
    run('setWallLength(state.walls[0],140);');
    assert.equal(run('getWallLengthCm(state.walls[0])'),160);
    assert.equal(run('JSON.stringify(state.walls[0].openings)===before'),true);
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
});

test('adding an opening can use free vertical space when the entire horizontal range is occupied', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,10,160,10,17)]; state.walls[0].openings=[{id:2,offset:80,length:120,startRow:2,rowCount:3,type:'window'}]; state.selectedWallId=1; state.nextId=3; const slot=findFreeSlotForOpening(state.walls[0],100);`);
    assert.equal(run('slot.startRow>=8'),true);
    run('addOpeningToSelectedWall();');
    assert.equal(run('state.walls[0].openings.length'),2);
    assert.equal(run('openingsOverlap(...state.walls[0].openings)'),false);
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
});

test('stacked JSON round trips preserve coordinates; intersecting imports fail atomically', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10,17)]; state.walls[0].openings=[{id:2,offset:100,length:80,type:'window',startRow:2,rowCount:3},{id:3,offset:100,length:80,type:'window',startRow:8,rowCount:3}]; state.nextId=4; const saved=JSON.stringify(projectSnapshot()); restoreProject(JSON.parse(saved)); const counts=JSON.stringify(getProjectReport()); const before=JSON.stringify(projectSnapshot());`);
    assert.equal(run('JSON.stringify(projectSnapshot())===saved'),true);
    assert.notEqual(run('getProjectReport()'),null);
    assert.throws(()=>run('const bad=JSON.parse(saved);bad.walls[0].openings[1].startRow=3;restoreProject(bad);'),/overlap/);
    assert.equal(run('JSON.stringify(projectSnapshot())===before'),true);
    assert.equal(run('JSON.stringify(getProjectReport())===counts'),true);
});

test('stacked openings retain the existing three-course lintel clearance', () => {
    const run=app();
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10,17)]; state.walls[0].openings=[{id:2,offset:100,length:80,startRow:2,rowCount:3,type:'window'},{id:3,offset:100,length:80,startRow:7,rowCount:3,type:'window'}];`);
    assert.equal(run('openingsOverlap(...state.walls[0].openings)'),false);
    assert.ok(run('validateProject().errors.some(s=>s.includes("three courses above opening #2 before another opening"))'));
    assert.equal(run('getProjectReport()'),null);
    run('state.walls[0].openings[1].startRow=8;');
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
});

test('property input handlers permit stacking and stop height, position and type edits at collisions', () => {
    const run=app(true);
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10,17)]; state.walls[0].openings=[{id:2,offset:100,length:80,type:'window',startRow:9,rowCount:3},{id:3,offset:280,length:80,type:'window',startRow:2,rowCount:3}]; state.selectedWallId=1;state.selectedOpeningId=3; const lower=state.walls[0].openings[1];`);
    run('document.getElementById("sliderOpeningOffset").listeners.input[0]({target:{value:600}});');
    assert.equal(run('getOpeningBoundsCm(lower).startCm'),60);
    run('document.getElementById("sliderOpStartRow").listeners.input[0]({target:{value:9}});');
    assert.equal(run('lower.startRow'),6);
    assert.equal(run('openingsOverlap(...state.walls[0].openings)'),false);
    run('document.getElementById("sliderOpStartRow").listeners.input[0]({target:{value:2}}); document.getElementById("sliderOpRowCount").listeners.input[0]({target:{value:12}});');
    assert.equal(run('lower.rowCount'),7);
    assert.equal(run('openingsOverlap(...state.walls[0].openings)'),false);
    run('document.getElementById("sliderOpRowCount").listeners.input[0]({target:{value:3}}); state.selectedOpeningId=2; document.getElementById("type-door").listeners.click[0]();');
    assert.equal(run('state.walls[0].openings[0].type'),'window');
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
});

test('elevation pointer handlers move below another opening, reject collision and retain undo/redo', () => {
    const run=app(true);
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10,17)]; state.walls[0].openings=[{id:2,offset:100,length:80,type:'window',startRow:9,rowCount:3},{id:3,offset:280,length:80,type:'window',startRow:2,rowCount:3}]; state.selectedWallId=1;state.selectedOpeningId=3;state.nextId=4;state.elevationGeometry={wallId:1,startX:0,scaleX:1,padTop:0,rowH:10};resetEditHistory();`);
    run('state.elevCanvas.listeners.pointerdown[0]({clientX:280,clientY:145,pointerId:1}); state.elevCanvas.listeners.pointermove[0]({clientX:100,clientY:145});');
    assert.equal(run('getOpeningBoundsCm(state.walls[0].openings[1]).startCm'),60);
    run('state.elevCanvas.listeners.pointermove[0]({clientX:100,clientY:75});');
    assert.equal(run('state.walls[0].openings[1].startRow'),2);
    assert.equal(run('openingsOverlap(...state.walls[0].openings)'),false);
    run('state.elevCanvas.listeners.pointerup[0]();undoLastEdit();');
    assert.equal(run('getOpeningBoundsCm(state.walls[0].openings[1]).startCm'),240);
    run('redoLastEdit();');
    assert.equal(run('getOpeningBoundsCm(state.walls[0].openings[1]).startCm'),60);
    assert.equal(run('JSON.stringify(validateProject().errors)'),'[]');
});

test('plan selection and dragging prefer the selected stacked opening', () => {
    const run=app(true);
    run(`const make=${wall}; state.walls=[make(1,0,10,400,10,17)]; state.walls[0].openings=[{id:2,offset:100,length:80,type:'window',startRow:9,rowCount:3},{id:3,offset:100,length:80,type:'window',startRow:2,rowCount:3}]; state.selectedWallId=1;state.selectedOpeningId=3;`);
    assert.equal(run('getPlanOpenings(state.walls[0]).at(-1).id'),3);
    run('handlePointerDown({clientX:100,clientY:10,button:0});');
    assert.equal(run('state.selectedOpeningId'),3);
    run('handlePointerUp();state.selectedOpeningId=2;handlePointerDown({clientX:100,clientY:10,button:0});');
    assert.equal(run('state.selectedOpeningId'),2);
});
