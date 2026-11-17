// No npm dependencies. Drives installed Chrome through the DevTools protocol.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');

async function main() {
    const root = path.resolve(__dirname, '..');
    const server = http.createServer((req, res) => {
        const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = path.resolve(root, '.' + (name === '/' ? '/draft.html' : name));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
        fs.readFile(file, (error, data) => {
            if (error) { res.writeHead(404); res.end(); return; }
            res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
            res.end(data);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/draft.html`;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blocks-browser-'));
    const executable = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync);
    if (!executable) throw new Error('Install Chrome or Edge to run this smoke test.');
    const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank'], {windowsHide: true, stdio: 'ignore'});
    let socket;
    try {
        const portFile = path.join(profile, 'DevToolsActivePort');
        for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await new Promise(r => setTimeout(r, 100));
        const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
        const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {method: 'PUT'})).json();
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', reject, {once: true}); });
        let serial = 0;
        const pending = new Map(), errors = [];
        socket.addEventListener('message', e => {
            const message = JSON.parse(e.data);
            if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
            if (message.id && pending.has(message.id)) {
                const {resolve, reject, timer} = pending.get(message.id); clearTimeout(timer); pending.delete(message.id);
                if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
            }
        });
        const call = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++serial;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
            pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id, method, params}));
        });
        const evaluate = async expression => {
            const result = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        };
        await call('Runtime.enable');
        await call('Page.enable');
        for (let i = 0; i < 100; i++) {
            if (await evaluate('typeof validateProject === "function" && document.readyState === "complete"')) break;
            await new Promise(r => setTimeout(r, 200));
        }
        assert.deepEqual(await evaluate('validateProject().errors'), []);
        assert.equal(await evaluate('state.walls.length'), 5);
        assert.equal(await evaluate('document.getElementById("btnPrint").disabled'), false);
        await evaluate('document.getElementById("planCourse").value="2"; document.getElementById("planCourse").dispatchEvent(new Event("change"));');
        assert.equal(await evaluate('state.activePlanRow'), 2);
        await evaluate('document.getElementById("planCourse").value="1"; document.getElementById("planCourse").dispatchEvent(new Event("change"));');
        assert.ok(await evaluate('state.canvas.width > 300 && state.canvas.height > 200'));
        assert.ok(await evaluate(`(() => {
            const joints=getAllWallJoints();
            for(const course of [1,2]) for(const wall of state.walls) {
                const layout=buildWallRowLayout({...wall,openings:[]},course,joints);
                const p=getPlanProjection(layout);
                if(!p.blocks.every(b=>b.width===cmToPx(b.lenCm))) return false;
                if(!p.blocks.every(b=>b.x===cmToPx(b.startCm))) return false;
                if(p.project(100)!==cmToPx(100)) return false;
                for(const x of [0,80,200]) if(Math.abs(p.unproject(p.project(x))-x)>0.001) return false;
            }
            return true;
        })()`));
        await evaluate(`window.dragSceneBackup=JSON.stringify(projectSnapshot());state.walls=[
            {id:11,x1:500,y1:180,x2:900,y2:180,rows:10,openings:[]},
            {id:12,x1:900,y1:480,x2:500,y2:480,rows:10,openings:[]},
            {id:13,x1:650,y1:190,x2:650,y2:470,rows:10,openings:[]}
        ];state.nextId=14;state.selectedWallId=13;state.selectedOpeningId=null;updateInspector();render();`);
        const canvasTop = await evaluate('state.canvas.getBoundingClientRect().top');
        const drag = async (x1,y1,x2,y2) => {
            await call('Input.dispatchMouseEvent',{type:'mousePressed',x:x1,y:canvasTop+y1,button:'left',clickCount:1});
            await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:x2,y:canvasTop+y2,button:'left',buttons:1});
            await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:x2,y:canvasTop+y2,button:'left',clickCount:1});
        };
        await drag(650,330,657,333);
        assert.deepEqual(await evaluate('({x1:state.walls[2].x1,y1:state.walls[2].y1,x2:state.walls[2].x2,y2:state.walls[2].y2})'),{x1:650,y1:190,x2:650,y2:470});
        assert.equal(await evaluate('getAllWallJoints().filter(j=>j.type==="T").length'),2);
        await drag(650,330,720,430);
        assert.equal(await evaluate('getAllWallJoints().filter(j=>j.type==="T").length'),0);
        await drag(720,430,654,331);
        assert.deepEqual(await evaluate('({x1:state.walls[2].x1,y1:state.walls[2].y1,x2:state.walls[2].x2,y2:state.walls[2].y2})'),{x1:650,y1:190,x2:650,y2:470});
        await drag(650,190,654,192);
        assert.equal(await evaluate('getWallLengthCm(state.walls[2])'),280);
        assert.deepEqual(await evaluate('validateProject().errors'),[]);
        await evaluate('restoreProject(JSON.parse(dragSceneBackup));updateInspector();render();saveProjectLocally();resetEditHistory();');
        const cameraBefore = await evaluate('JSON.stringify(state.walls)');
        const anchor = await evaluate('({x:(700-state.panX)/state.zoom,y:(400-state.panY)/state.zoom})');
        await evaluate('state.canvas.dispatchEvent(new WheelEvent("wheel",{deltaY:-100,clientX:700,clientY:state.canvas.getBoundingClientRect().top+400,bubbles:true,cancelable:true}));');
        assert.ok(await evaluate('state.zoom > 1'));
        const zoomAnchor = await evaluate('({x:(700-state.panX)/state.zoom,y:(400-state.panY)/state.zoom})');
        assert.ok(Math.abs(anchor.x - zoomAnchor.x) < 0.00001 && Math.abs(anchor.y - zoomAnchor.y) < 0.00001);
        await evaluate('resetZoom(); state.canvas.dispatchEvent(new MouseEvent("mousedown",{button:1,clientX:400,clientY:300,bubbles:true,cancelable:true})); window.dispatchEvent(new MouseEvent("mousemove",{clientX:460,clientY:340,bubbles:true})); window.dispatchEvent(new MouseEvent("mouseup",{button:1,bubbles:true}));');
        assert.deepEqual(await evaluate('({x:state.panX,y:state.panY})'), {x:60,y:40});
        assert.equal(await evaluate('JSON.stringify(state.walls)'), cameraBefore);
        await evaluate('resetZoom(); state.canvas.dispatchEvent(new MouseEvent("mousedown",{button:0,clientX:950,clientY:state.canvas.getBoundingClientRect().top+500,bubbles:true,cancelable:true})); window.dispatchEvent(new MouseEvent("mousemove",{clientX:920,clientY:state.canvas.getBoundingClientRect().top+520,bubbles:true})); window.dispatchEvent(new MouseEvent("mouseup",{button:0,bubbles:true}));');
        assert.deepEqual(await evaluate('({x:state.panX,y:state.panY})'), {x:-30,y:20});
        assert.equal(await evaluate('state.dragState'), null);
        assert.equal(await evaluate('JSON.stringify(state.walls)'), cameraBefore);
        await evaluate('resetZoom(); state.selectedWallId=state.walls[0].id; updateInspector(); render();');
        assert.equal(await evaluate('document.getElementById("sliderWallAngle")'), null);
        const beforeTurn = await evaluate('JSON.stringify(projectSnapshot())');
        await evaluate('document.getElementById("btnRotateRight").click();');
        assert.equal(await evaluate('document.getElementById("valWallDirection").textContent'), 'Vertical');
        await evaluate('document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"z",ctrlKey:true,bubbles:true,cancelable:true}));');
        assert.equal(await evaluate('JSON.stringify(projectSnapshot())'), beforeTurn);
        const beforeHeightChange = await evaluate('JSON.stringify(state.walls.map(w=>w.openings))');
        await evaluate('document.getElementById("sliderTotalRows").value=4; document.getElementById("sliderTotalRows").dispatchEvent(new Event("input",{bubbles:true}));');
        assert.equal(await evaluate('JSON.stringify(state.walls.map(w=>w.openings))'), beforeHeightChange);
        assert.equal(await evaluate('document.getElementById("btnPrint").disabled'), true);
        assert.ok(await evaluate('document.getElementById("valTotalRows").textContent.includes("71.6 cm")'));
        await evaluate('document.getElementById("sliderTotalRows").value=17; document.getElementById("sliderTotalRows").dispatchEvent(new Event("input",{bubbles:true}));');
        assert.equal(await evaluate('JSON.stringify(state.walls.map(w=>w.openings))'), beforeHeightChange);
        assert.deepEqual(await evaluate('validateProject().errors'), []);
        assert.ok(await evaluate(`(() => {
            const widths=[],original=state.ctx.roundRect;
            state.ctx.roundRect=function(x,y,w,h,r){if(Math.abs(h-(WALL_THICKNESS-3))<0.001)widths.push(w);return original.call(this,x,y,w,h,r)};
            try{drawWall(state.walls[0],false,getAllWallJoints());}finally{state.ctx.roundRect=original;render();}
            return widths.length>0 && widths.every(w=>Math.abs(w-(FULL_BLOCK_PX-1.6))<0.001 || Math.abs(w-(HALF_BLOCK_PX-1.6))<0.001);
        })()`));
        assert.equal(await evaluate('document.getElementById("valWallDirection").textContent'), 'Horizontal');
        await evaluate('document.getElementById("btnDeleteWall").click();');
        assert.equal(await evaluate('state.walls.length'), 4);
        await evaluate('document.getElementById("btnUndo").click();');
        assert.equal(await evaluate('JSON.stringify(projectSnapshot())'), beforeTurn);
        const css = await evaluate('getComputedStyle(document.querySelector("aside")).display');
        assert.equal(css, 'flex', 'Tailwind must load for layout inspection');
        const screenshot = await call('Page.captureScreenshot', {format: 'png'});
        const image = path.join(os.tmpdir(), 'blocks-mvp-desktop.png'); fs.writeFileSync(image, Buffer.from(screenshot.data, 'base64'));
        await evaluate('document.getElementById("inputWallRows").value=16; document.getElementById("inputWallRows").dispatchEvent(new Event("change",{bubbles:true}));');
        assert.equal(await evaluate('state.walls[0].rows'), 16);
        assert.equal(await evaluate('state.walls[1].rows'), 17);
        await evaluate('document.getElementById("sliderWallLength").value=601; document.getElementById("sliderWallLength").dispatchEvent(new Event("change",{bubbles:true}));');
        assert.equal(await evaluate('getWallLengthCm(state.walls[0])'), 600);
        assert.ok(await evaluate('document.getElementById("toastText").textContent.includes("20 cm")'));
        // Opening can move both horizontally and vertically on the elevation.
        const point = await evaluate(`(() => {const g=state.elevationGeometry,w=state.walls[0],op=w.openings[0],r=state.elevCanvas.getBoundingClientRect();return {x:r.left+g.startX+160*g.scaleX,y:r.top+g.padTop+(getWallRows(w)-op.startRow-op.rowCount/2+0.5)*g.rowH,rowH:g.rowH};})()`);
        await call('Input.dispatchMouseEvent', {type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1});
        await call('Input.dispatchMouseEvent', {type: 'mouseMoved', x: point.x, y: point.y + point.rowH, button: 'left', buttons: 1});
        await call('Input.dispatchMouseEvent', {type: 'mouseReleased', x: point.x, y: point.y + point.rowH, button: 'left', clickCount: 1});
        assert.equal(await evaluate('state.walls[0].openings[0].startRow'), 4);
        await evaluate('window.csvCapture=null; downloadFile=(name,content,type)=>{window.csvCapture={name,content,type}}; document.getElementById("btnExportCsv").click();');
        assert.equal(await evaluate('csvCapture.name'), 'blocks-materials.csv');
        assert.ok(await evaluate('csvCapture.content.includes("TOTAL")'));
        await evaluate('window.print=()=>{}; document.getElementById("btnPrint").click();');
        assert.equal(await evaluate('document.querySelectorAll("#printReport tr").length'), 6);
        const pdf = await call('Page.printToPDF', {printBackground: true});
        assert.ok(Buffer.from(pdf.data, 'base64').length > 1000);
        const quantity = await evaluate('document.getElementById("totAllBlocks").textContent');
        const reloaded = new Promise((resolve, reject) => {
            const timer = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error('Reload timed out')); }, 30000);
            const listener = e => {
                if (JSON.parse(e.data).method === 'Page.loadEventFired') {
                    clearTimeout(timer); socket.removeEventListener('message', listener); resolve();
                }
            };
            socket.addEventListener('message', listener);
        });
        await call('Page.reload');
        await reloaded;
        for (let i = 0; i < 100; i++) {
            if (await evaluate('typeof state !== "undefined" && document.readyState === "complete" && state.walls.length===5')) break;
            await new Promise(r => setTimeout(r, 100));
        }
        assert.equal(await evaluate('state.walls[0].rows'), 16);
        assert.equal(await evaluate('document.getElementById("totAllBlocks").textContent'), quantity);
        // Invalid geometry disables both final output actions.
        await evaluate('state.walls.push({...state.walls[0],id:999,openings:[]}); updateInspector();');
        assert.equal(await evaluate('document.getElementById("btnPrint").disabled && document.getElementById("btnExportCsv").disabled'), true);
        await evaluate('document.getElementById("btnClearAll").click();');
        assert.equal(await evaluate('state.walls.length'), 0);
        await evaluate('document.getElementById("btnAddWall").click();');
        assert.equal(await evaluate('getWallLengthCm(state.walls[0])'), 400);
        await call('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: false});
        await new Promise(r => setTimeout(r, 200));
        assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
        assert.ok(await evaluate('state.canvas.width > 0 && state.elevCanvas.height > 0'));
        assert.deepEqual(errors, []);
        console.log('PASS: render, individual heights, invalid dimensions, elevation drag, CSV, print report, persistence, validation, clear/add.');
        console.log('Screenshot: ' + image);
    } finally {
        socket?.close(); browser.kill(); server.close();
    }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
