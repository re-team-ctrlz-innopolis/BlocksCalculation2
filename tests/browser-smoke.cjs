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
        const file = path.resolve(root, '.' + (name === '/' ? '/BlocksCalculation2.html' : name));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
        fs.readFile(file, (error, data) => {
            if (error) { res.writeHead(404); res.end(); return; }
            const types = {'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
            res.setHeader('Content-Type', types[path.extname(file)] || 'text/html');
            res.end(data);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/BlocksCalculation2.html`;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blocks-browser-'));
    const executable = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync);
    if (!executable) throw new Error('Install Chrome or Edge to run this smoke test.');
    const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank'], {windowsHide: true, stdio: 'ignore'});
    let socket;
    try {
        const portFile = path.join(profile, 'DevToolsActivePort');
        for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await new Promise(r => setTimeout(r, 100));
        const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
        const initialUrl = process.argv.includes('--offline-only') ? 'about:blank' : url;
        const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(initialUrl)}`, {method: 'PUT'})).json();
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', reject, {once: true}); });
        let serial = 0;
        const pending = new Map(), errors = [], networkRequests = [], failedResources = [];
        socket.addEventListener('message', e => {
            const message = JSON.parse(e.data);
            if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
            if (message.method === 'Network.requestWillBeSent' && /^https?:/.test(message.params.request.url)) networkRequests.push(message.params.request.url);
            if (message.method === 'Network.loadingFailed') failedResources.push(message.params.errorText);
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
        const reloadPage = async () => {
            const loaded = new Promise((resolve,reject) => {
                const timer=setTimeout(()=>{socket.removeEventListener('message',listener);reject(new Error('Reload timed out'));},30000);
                const listener=e=>{if(JSON.parse(e.data).method==='Page.loadEventFired'){clearTimeout(timer);socket.removeEventListener('message',listener);resolve();}};
                socket.addEventListener('message',listener);
            });
            await call('Page.reload');await loaded;
        };
        await call('Runtime.enable');
        await call('Page.enable');
        if (process.argv.includes('--offline-only')) {
            // Start from a blank tab in a new profile: neither CDN code nor cached fonts can help.
            await call('Network.enable');
            await call('Network.setCacheDisabled', {cacheDisabled:true});
            await call('Network.setBlockedURLs', {urls:['http://*','https://*']});
            await call('Page.navigate', {url:'file:///'+root.replaceAll('\\','/')+'/BlocksCalculation2.html'});
        }
        for (let i = 0; i < 100; i++) {
            if (await evaluate('typeof validateProject === "function" && document.readyState === "complete"')) break;
            await new Promise(r => setTimeout(r, 200));
        }
        assert.deepEqual(await evaluate('validateProject().errors'), []);
        await evaluate('if(document.getElementById("tutorialDialog").open)document.getElementById("btnTutorialClose").click();');
        if (process.argv.includes('--limits-only')) {
            await evaluate(`state.walls=[{id:1,x1:0,y1:10,x2:400,y2:10,rows:17,openings:[]}];
                state.nextId=2;state.selectedWallId=1;state.selectedOpeningId=null;state.migrationNotes=[];
                updateInspector();render();
                document.getElementById('sliderWallLength').value=1200000;
                document.getElementById('sliderWallLength').dispatchEvent(new Event('change',{bubbles:true}));`);
            assert.equal(await evaluate('getWallLengthCm(state.walls[0])*MM_PER_CM'),1200000);
            assert.equal(await evaluate('document.getElementById("sliderWallLength").hasAttribute("max")'),false);
            assert.deepEqual(await evaluate('validateProject().errors'),[]);
            await evaluate(`window.visibleElevationPixel=()=>{
                const g=state.elevationGeometry,w=getPartnerWall(g.wallId);
                const b=buildWallRowLayout(w,1,getAllWallJoints()).blocks.find(b=>{
                    const x=g.startX+b.startCm*g.scaleX-g.scrollOffset;
                    return x>=0 && x+b.lenCm*g.scaleX<=state.elevCanvas.width;
                });
                const x=Math.floor(g.startX+(b.startCm+b.lenCm/2)*g.scaleX-g.scrollOffset);
                const y=Math.floor(g.padTop+(getWallRows(w)-0.5)*g.rowH);
                return Array.from(state.elevCtx.getImageData(x,y,1,1).data).slice(0,3);
            };`);
            assert.deepEqual(await evaluate('visibleElevationPixel()'),[37,99,235], 'Long-wall elevation paints full blocks');
            await evaluate(`state.walls[0].openings=[{id:2,offset:119940,length:80,type:'window',startRow:3,rowCount:3}];
                state.nextId=3;updateInspector();render();
                document.getElementById('elevationViewport').scrollLeft=9999999;`);
            await new Promise(resolve=>setTimeout(resolve,100));
            assert.deepEqual(await evaluate('visibleElevationPixel()'),[37,99,235], 'End of a long elevation paints full blocks');
            assert.equal(await evaluate('state.elevCanvas.width<=document.getElementById("elevationViewport").clientWidth'),true);
            const openingPoint = await evaluate(`(()=>{
                const g=state.elevationGeometry,w=state.walls[0],op=w.openings[0],r=state.elevCanvas.getBoundingClientRect();
                return {x:r.left+g.startX+op.offset*g.scaleX-g.scrollOffset,
                    y:r.top+g.padTop+(getWallRows(w)-op.startRow-Math.floor(op.rowCount/2)+0.5)*g.rowH};
            })()`);
            await call('Input.dispatchMouseEvent',{type:'mousePressed',...openingPoint,button:'left',clickCount:1});
            await call('Input.dispatchMouseEvent',{type:'mouseReleased',...openingPoint,button:'left',clickCount:1});
            assert.equal(await evaluate('state.selectedOpeningId'),2,'Opening selection accounts for the virtual scroll offset');
            const screenshot = await call('Page.captureScreenshot',{format:'png'});
            const screenshotPath=path.join(os.tmpdir(),'blocks-long-wall.png');
            fs.writeFileSync(screenshotPath,Buffer.from(screenshot.data,'base64'));
            const longProject = await evaluate('JSON.stringify(projectSnapshot())');
            await evaluate('restoreProject(JSON.parse('+JSON.stringify(longProject)+'));updateInspector();render();');
            assert.equal(await evaluate('JSON.stringify(projectSnapshot())'),longProject);
            await evaluate(`state.walls=Array.from({length:499},(_,i)=>({id:i+1,x1:0,y1:i*40+10,x2:400,y2:i*40+10,rows:17,openings:[]}));
                state.nextId=500;state.selectedWallId=1;state.selectedOpeningId=null;updateInspector();render();
                document.getElementById('btnAddWall').click();
                Object.assign(state.walls[499],{x1:0,y1:19970,x2:400,y2:19970});updateInspector();render();`);
            assert.equal(await evaluate('state.walls.length'),500);
            assert.equal(await evaluate('document.getElementById("btnAddWall").disabled'),true);
            assert.deepEqual(await evaluate('validateProject().errors'),[]);
            const project500 = await evaluate('JSON.stringify(projectSnapshot())');
            await evaluate('addNewWall();restoreProject(JSON.parse('+JSON.stringify(project500)+'));updateInspector();render();');
            assert.equal(await evaluate('JSON.stringify(projectSnapshot())'),project500);
            assert.equal(await evaluate(`(()=>{const data=projectSnapshot();data.walls=[...data.walls,{...data.walls[0],id:501}];
                try{restoreProject(data);return false;}catch(error){return error.message.includes('500 walls');}})()`),true);
            assert.equal(await evaluate('JSON.stringify(projectSnapshot())'),project500);
            await evaluate('removeWall(500);');
            assert.equal(await evaluate('document.getElementById("btnAddWall").disabled'),false);
            assert.deepEqual(errors,[]);
            console.log('PASS: unrestricted wall length, visible elevation, 500-wall creation and JSON round trip, 501-wall rejection and re-enabled Add wall.');
            console.log('Screenshot: '+screenshotPath);
            return;
        }
        if (process.argv.includes('--offline-only')) {
            const qaDir = path.resolve(root, '../tmp', 'offline-qa-' + Date.now());
            fs.mkdirSync(qaDir, {recursive:true});
            await evaluate('document.fonts.ready');
            assert.equal(await evaluate('document.fonts.check("400 14px Inter") && Array.from(document.fonts).some(f=>f.family==="Inter" && f.status==="loaded")'),true);
            assert.equal(await evaluate('getComputedStyle(document.body).display'),'flex');
            assert.equal(await evaluate('getComputedStyle(document.querySelector("header")).display'),'grid');
            assert.equal(await evaluate('getComputedStyle(document.body).backgroundColor'),'rgb(2, 6, 23)');
            assert.equal(await evaluate('document.querySelector("aside").getBoundingClientRect().width'),384);
            assert.ok(await evaluate('state.canvas.width>500 && state.canvas.height>200 && state.elevCanvas.height>0'));
            const screenshot = await call('Page.captureScreenshot', {format:'png'});
            fs.writeFileSync(path.join(qaDir,'desktop.png'),Buffer.from(screenshot.data,'base64'));

            // Exercise dynamically styled controls and a new project, rather than only the built-in sample.
            await evaluate(`state.walls=[];state.migrationNotes=[];state.selectedWallId=null;state.selectedOpeningId=null;
                resetEditHistory();updateInspector();render();document.getElementById('btnAddWall').click();
                document.getElementById('sliderWallLength').value=4000;
                document.getElementById('sliderWallLength').dispatchEvent(new Event('change',{bubbles:true}));
                document.getElementById('btnAddOpening').click();document.querySelector('[data-optype=door]').click();`);
            assert.equal(await evaluate('state.walls.length'),1);
            assert.equal(await evaluate('state.walls[0].openings.length'),1);
            assert.equal(await evaluate('document.getElementById("openingEditorTitle").textContent'),'Door #1');
            assert.equal(await evaluate('getComputedStyle(document.querySelector("#openingsList .opening-select span span")).color'),'rgb(52, 211, 153)');
            assert.deepEqual(await evaluate('validateProject().errors'),[]);
            const savedProject = await evaluate('JSON.stringify(projectSnapshot())');
            await call('Browser.setDownloadBehavior', {behavior:'allow',downloadPath:qaDir});
            await evaluate('window.showSaveFilePicker=undefined;');
            for (const id of ['btnSaveProject','btnExportCsv','btnSavePdf']) {
                await evaluate(`document.getElementById('fileMenu').open=true;document.getElementById('${id}').click();`);
            }
            for (const name of ['blocks-project.json','blocks-quantities.csv','blocks-quantities.pdf']) {
                const file = path.join(qaDir,name);
                for(let i=0;!fs.existsSync(file)&&i<100;i++) await new Promise(resolve=>setTimeout(resolve,100));
                assert.ok(fs.existsSync(file), name+' downloads without a network');
            }
            assert.deepEqual(JSON.parse(fs.readFileSync(path.join(qaDir,'blocks-project.json'),'utf8')),JSON.parse(savedProject));
            assert.ok(fs.readFileSync(path.join(qaDir,'blocks-quantities.csv'),'utf8').includes('TOTAL'));
            assert.equal(fs.readFileSync(path.join(qaDir,'blocks-quantities.pdf')).subarray(0,5).toString(),'%PDF-');

            await evaluate(`document.getElementById('sliderWallLength').value=6000;
                document.getElementById('sliderWallLength').dispatchEvent(new Event('change',{bubbles:true}));`);
            assert.notEqual(await evaluate('JSON.stringify(projectSnapshot())'),savedProject);
            const {root:domRoot} = await call('DOM.getDocument');
            const {nodeId} = await call('DOM.querySelector',{nodeId:domRoot.nodeId,selector:'#projectFile'});
            await call('DOM.setFileInputFiles',{nodeId,files:[path.join(qaDir,'blocks-project.json')]});
            for(let i=0;await evaluate('JSON.stringify(projectSnapshot())')!==savedProject&&i<100;i++) await new Promise(resolve=>setTimeout(resolve,50));
            assert.equal(await evaluate('JSON.stringify(projectSnapshot())'),savedProject);
            await evaluate('window.offlinePrintCalls=0;window.print=()=>{offlinePrintCalls++;};printReport();');
            await evaluate('loadQuantityReportFont()');
            assert.equal(await evaluate('offlinePrintCalls'),1);
            const printed = await call('Page.printToPDF',{preferCSSPageSize:true,displayHeaderFooter:false});
            fs.writeFileSync(path.join(qaDir,'printed.pdf'),Buffer.from(printed.data,'base64'));
            assert.ok(Buffer.from(printed.data,'base64').length>1000);
            await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
            await evaluate('resizeCanvases();');
            assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));
            const mobile = await call('Page.captureScreenshot',{format:'png'});
            fs.writeFileSync(path.join(qaDir,'mobile.png'),Buffer.from(mobile.data,'base64'));
            assert.deepEqual(networkRequests,[], 'The app must not attempt any HTTP/HTTPS requests');
            assert.deepEqual(failedResources,[], 'All local resources must load');
            assert.deepEqual(errors,[]);
            console.log('PASS: cold offline file launch, local styles/font, editing, JSON save/load, CSV, PDF, print and responsive layout; zero HTTP/HTTPS requests.');
            console.log('OFFLINE_QA_DIR='+qaDir);
            return;
        }
        if (process.argv.includes('--pdf-only')) {
            const qaDir = path.resolve(root, '../tmp/pdfs', 'qa-' + Date.now());
            fs.mkdirSync(qaDir, {recursive: true});
            await evaluate('window.pdfPrintCalls=0;window.print=()=>{window.pdfPrintCalls++;};');
            assert.equal(await evaluate('document.getElementById("btnSavePdf").textContent'), 'Save PDF…');
            assert.equal(await evaluate('document.getElementById("btnPrint").textContent'), 'Print…');
            // Substitute only the native chooser, then exercise a real browser file writer.
            await evaluate(`(async()=>{window.pdfTestDirectory=await navigator.storage.getDirectory();
                window.pdfTestHandle=await pdfTestDirectory.getFileHandle('chosen-report.pdf',{create:true});
                window.pdfPickerOptions=null;
                window.showSaveFilePicker=async options=>{window.pdfPickerOptions=options;return pdfTestHandle;};
                await exportPdf();})()`);
            assert.equal(await evaluate('pdfPickerOptions.suggestedName'),'blocks-quantities.pdf');
            assert.equal(await evaluate('(async()=>(await (await pdfTestHandle.getFile()).text()).slice(0,5))()'),'%PDF-');
            assert.equal(await evaluate('pdfPrintCalls'),0);
            await evaluate(`(async()=>{window.pdfCancelWork=0;window.pdfRealCreate=createPdfReport;
                createPdfReport=(...args)=>{pdfCancelWork++;return pdfRealCreate(...args);};
                window.showSaveFilePicker=async()=>{throw new DOMException('Cancelled','AbortError');};
                await exportPdf();createPdfReport=pdfRealCreate;})()`);
            assert.equal(await evaluate('pdfCancelWork'),0);
            // Include a wide-opening notice and Unicode notes in the rendered sample.
            await evaluate(`setOpeningBoundsCm(state.walls[0].openings[0],80,160);
                state.migrationNotes=['Unicode note: '+String.fromCharCode(1058,1077,1089,1090)+' '+String.fromCharCode(8212)+' 400'+String.fromCharCode(215)+'200'+String.fromCharCode(215)+'200 mm'];
                updateInspector();render();`);
            assert.deepEqual(await evaluate('validateProject().errors'), []);
            const downloadPdf = async name => {
                const downloadDir = path.join(qaDir, name);
                fs.mkdirSync(downloadDir);
                await call('Browser.setDownloadBehavior', {behavior:'allow', downloadPath:downloadDir});
                const before = await evaluate('JSON.stringify(projectSnapshot())');
                const expected = await evaluate('({rows:getProjectReport(),warnings:validateProject().warnings})');
                await evaluate('window.showSaveFilePicker=undefined;'); // Unsupported-browser download path.
                await evaluate('document.getElementById("fileMenu").open=true;document.getElementById("btnSavePdf").click();');
                const saved = path.join(downloadDir, 'blocks-quantities.pdf');
                for (let i=0;!fs.existsSync(saved)&&i<100;i++) await new Promise(resolve=>setTimeout(resolve,100));
                assert.ok(fs.existsSync(saved), 'Save PDF downloads a file');
                assert.equal(fs.readFileSync(saved).subarray(0,5).toString(), '%PDF-');
                fs.writeFileSync(path.join(downloadDir,'expected.json'),JSON.stringify(expected,null,2));
                assert.equal(await evaluate('pdfPrintCalls'),0);
                assert.equal(await evaluate('document.getElementById("fileMenu").open'),false);
                assert.equal(await evaluate('JSON.stringify(projectSnapshot())'),before);
                // Capture the browser's actual print rendering for visual comparison with the download.
                await evaluate('printReport()');
                assert.equal(await evaluate('pdfPrintCalls'),1);
                assert.equal(await evaluate('document.querySelector("#printReport h1").textContent'),
                    'BlocksCalculator — Blocks quantities');
                assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("#printReport tbody tr"),tr=>Array.from(tr.cells,td=>td.textContent))'),
                    await evaluate('getQuantityReportContent(getProjectReport(),validateProject().warnings).body.map(row=>row.map(String))'));
                assert.equal(await evaluate('document.fonts.check("12px BlocksReport")'),true);
                const printed = await call('Page.printToPDF', {preferCSSPageSize:true, displayHeaderFooter:false});
                fs.writeFileSync(path.join(downloadDir,'printed.pdf'),Buffer.from(printed.data,'base64'));
                await evaluate('window.pdfPrintCalls=0;');
            };
            await downloadPdf('sample-house');
            await evaluate(`state.walls=Array.from({length:500},(_,i)=>({id:i+1,x1:0,y1:i*40+10,x2:i===0?20000:400,y2:i*40+10,rows:17,openings:[]}));
                state.nextId=501;state.migrationNotes=[];state.selectedWallId=2;state.selectedOpeningId=null;updateInspector();render();`);
            assert.deepEqual(await evaluate('validateProject().errors'),[]);
            await downloadPdf('large-project');
            await evaluate('document.getElementById("btnPrint").click();');
            for(let i=0;await evaluate('pdfPrintCalls')===0&&i<100;i++) await new Promise(resolve=>setTimeout(resolve,20));
            assert.equal(await evaluate('pdfPrintCalls'),1);
            await evaluate('state.walls.push({...state.walls[0],id:999});updateInspector();');
            assert.equal(await evaluate('document.getElementById("btnSavePdf").disabled && document.getElementById("btnPrint").disabled && document.getElementById("btnExportCsv").disabled'),true);
            await call('Network.enable');
            await call('Network.setBlockedURLs',{urls:['http://*','https://*']});
            await call('Page.navigate',{url:'file:///'+root.replaceAll('\\','/')+'/BlocksCalculation2.html'});
            for(let i=0;i<100;i++){
                if(await evaluate('document.readyState==="complete" && typeof exportPdf==="function" && typeof state!=="undefined" && state.walls.length>0'))break;
                await new Promise(resolve=>setTimeout(resolve,100));
            }
            await evaluate('window.pdfPrintCalls=0;window.print=()=>{window.pdfPrintCalls++;};');
            await downloadPdf('offline-file');
            assert.deepEqual(errors,[]);
            console.log('PASS: chosen-file PDF saving, cancellation, fallback downloads, separate print action, pagination, blocked invalid exports and offline local-file export.');
            console.log('PDF_QA_DIR='+qaDir);
            return;
        }
        const navigationProject = await evaluate('JSON.stringify(projectSnapshot())');
        if (!process.argv.includes('--navigation-only')) {
            for (const screen of [{width:1366,height:768},{width:800,height:600}]) {
                await call('Emulation.setDeviceMetricsOverride', {...screen,deviceScaleFactor:1,mobile:false});
                await new Promise(resolve => setTimeout(resolve, 150));
                await evaluate(`state.walls=[{id:1,x1:0,y1:10,x2:1000,y2:10,rows:17,openings:[]}];
                    state.nextId=2;state.selectedWallId=1;state.selectedOpeningId=null;updateInspector();render();
                    document.getElementById('btnAddOpening').click();`);
                assert.equal(await evaluate('state.walls[0].openings.length'), 1);
                const beforeScrolling = await evaluate('JSON.stringify(projectSnapshot())');
                for (const id of ['inputWallRows','sliderWallLength']) {
                    const point = await evaluate(`(() => {
                        const input=document.getElementById(${JSON.stringify(id)});
                        input.scrollIntoView({block:'center'});input.focus();
                        const r=input.getBoundingClientRect();
                        return {x:r.left+r.width/2,y:r.top+r.height/2};
                    })()`);
                    const scrollBefore = await evaluate('document.querySelector("aside").scrollTop');
                    await call('Input.dispatchMouseEvent', {type:'mouseWheel',...point,deltaX:0,deltaY:120});
                    await new Promise(resolve => setTimeout(resolve, 200));
                    assert.ok(await evaluate('document.querySelector("aside").scrollTop') > scrollBefore,
                        `Wheel over focused ${id} scrolls the panel at ${screen.width}px`);
                    assert.equal(await evaluate('JSON.stringify(projectSnapshot())'), beforeScrolling,
                        'Scrolling must not change wall dimensions or openings');
                }
                await evaluate('document.querySelector("aside").scrollTop=99999;');
                assert.ok(await evaluate(`(() => {
                    const panel=document.querySelector('aside').getBoundingClientRect();
                    const slider=document.getElementById('sliderOpRowCount').getBoundingClientRect();
                    return slider.top>=panel.top && slider.bottom<=panel.bottom;
                })()`), 'Opening height remains reachable at the bottom of the panel');
            }
            await call('Emulation.clearDeviceMetricsOverride');
            await new Promise(resolve => setTimeout(resolve, 150));
            await evaluate(`restoreProject(${navigationProject});updateInspector();render();resetEditHistory();
                document.querySelector('aside').scrollTop=0;`);
            if (process.argv.includes('--scroll-only')) {
                assert.deepEqual(errors, []);
                console.log('PASS: inspector scrolls after adding an opening, including over focused number fields, without changing the project.');
                return;
            }
        }
        const allWallsVisible = () => evaluate(`(() => {
            const canvas=state.canvas.getBoundingClientRect();
            const bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
            for(const w of state.walls){
                const horizontal=Math.abs(w.y2-w.y1)<0.001, half=WALL_THICKNESS/2;
                bounds.left=Math.min(bounds.left,Math.min(w.x1,w.x2)-(horizontal?0:half));
                bounds.right=Math.max(bounds.right,Math.max(w.x1,w.x2)+(horizontal?0:half));
                bounds.top=Math.min(bounds.top,Math.min(w.y1,w.y2)-(horizontal?half:0));
                bounds.bottom=Math.max(bounds.bottom,Math.max(w.y1,w.y2)+(horizontal?half:0));
            }
            for(const name of ['left','right'])bounds[name]=bounds[name]*state.zoom+state.panX;
            for(const name of ['top','bottom'])bounds[name]=bounds[name]*state.zoom+state.panY;
            if(bounds.left<0||bounds.top<0||bounds.right>canvas.width||bounds.bottom>canvas.height)return false;
            return ['planLegend','planNavigation'].every(id=>{
                const r=document.getElementById(id).getBoundingClientRect();
                return bounds.right<=r.left-canvas.left||bounds.left>=r.right-canvas.left||
                    bounds.bottom<=r.top-canvas.top||bounds.top>=r.bottom-canvas.top;
            });
        })()`);
        assert.ok(await evaluate('document.getElementById("planNavigationHint").getBoundingClientRect().height>0'));
        const emptyPoint = await evaluate('(()=>{const r=state.canvas.getBoundingClientRect();return {x:r.right-40,y:r.top+40};})()');
        await call('Input.dispatchMouseEvent', {type:'mouseMoved',x:emptyPoint.x,y:emptyPoint.y});
        assert.equal(await evaluate('state.canvas.style.cursor'), 'grab');
        await call('Input.dispatchMouseEvent', {type:'mousePressed',x:emptyPoint.x,y:emptyPoint.y,button:'left',clickCount:1});
        await call('Input.dispatchMouseEvent', {type:'mouseMoved',x:emptyPoint.x-30,y:emptyPoint.y+20,buttons:1});
        await call('Input.dispatchMouseEvent', {type:'mouseReleased',x:emptyPoint.x-30,y:emptyPoint.y+20,button:'left',clickCount:1});
        assert.deepEqual(await evaluate('({x:state.panX,y:state.panY})'), {x:-30,y:20});
        await evaluate('state.selectedWallId=state.walls[0].id;updateInspector();state.panX=-5000;state.panY=3000;state.zoom=4;document.getElementById("btnFitProject").click();');
        assert.ok(await allWallsVisible(), 'All walls fit without overlapping the desktop controls');
        assert.equal(await evaluate('JSON.stringify(projectSnapshot())'), navigationProject);
        assert.equal(await evaluate('state.selectedWallId'), 1);
        assert.equal(await evaluate('editHistory.length'), 0);
        if(process.argv.includes('--navigation-only')){
            const shot=await call('Page.captureScreenshot',{format:'png'});
            fs.writeFileSync(path.join(os.tmpdir(),'blocks-navigation-desktop.png'),Buffer.from(shot.data,'base64'));
        }
        await evaluate(`state.walls=[{id:1,x1:-20000,y1:-9990,x2:-10000,y2:-9990,rows:10,openings:[]},
            {id:2,x1:20010,y1:10000,x2:20010,y2:15000,rows:10,openings:[]}];state.selectedWallId=null;resetEditHistory();
            updateInspector();document.getElementById('btnFitProject').click();`);
        assert.ok(await allWallsVisible(), 'Distant walls fit below the previous minimum zoom');
        assert.ok(await evaluate('state.zoom>0 && state.zoom<0.25'));
        const fittedZoom=await evaluate('state.zoom');
        await evaluate('document.getElementById("btnZoomOut").click();');
        assert.ok(await evaluate('state.zoom')<=fittedZoom);
        await evaluate('document.getElementById("btnZoomIn").click();');
        assert.ok(await evaluate('state.zoom')>fittedZoom);
        await evaluate('restoreProject('+navigationProject+');updateInspector();render();resetEditHistory();');
        await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
        await new Promise(resolve=>setTimeout(resolve,200));
        await evaluate('document.getElementById("btnFitProject").click();');
        assert.ok(await allWallsVisible(), 'All walls fit beside the controls on a narrow screen');
        assert.ok(await evaluate(`(()=>{const r=document.getElementById('planNavigation').getBoundingClientRect(),c=state.canvas.getBoundingClientRect();
            return r.left>=c.left && r.right<=c.right && r.top>=c.top && r.bottom<=c.bottom;})()`));
        if(process.argv.includes('--navigation-only')){
            const shot=await call('Page.captureScreenshot',{format:'png'});
            fs.writeFileSync(path.join(os.tmpdir(),'blocks-navigation-mobile.png'),Buffer.from(shot.data,'base64'));
        }
        await evaluate('state.walls=[];document.getElementById("btnFitProject").click();');
        assert.deepEqual(await evaluate('[state.zoom,state.panX,state.panY]'),[1,0,0]);
        await call('Emulation.clearDeviceMetricsOverride');
        await new Promise(resolve=>setTimeout(resolve,200));
        await evaluate('restoreProject('+navigationProject+');resetZoom();updateInspector();render();resetEditHistory();');
        if(process.argv.includes('--navigation-only')){
            assert.deepEqual(errors,[]);
            console.log('PASS: visible navigation hint, mouse panning, fit project, small zooms, narrow screen, empty drawing and unchanged edit history.');
            return;
        }
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
            {id:11,x1:500,y1:190,x2:900,y2:190,rows:10,openings:[]},
            {id:12,x1:900,y1:490,x2:500,y2:490,rows:10,openings:[]},
            {id:13,x1:650,y1:200,x2:650,y2:480,rows:10,openings:[]}
        ];state.nextId=14;state.selectedWallId=13;state.selectedOpeningId=null;updateInspector();render();`);
        const canvasTop = await evaluate('state.canvas.getBoundingClientRect().top');
        const drag = async (x1,y1,x2,y2) => {
            const top = await evaluate('state.canvas.getBoundingClientRect().top');
            await call('Input.dispatchMouseEvent',{type:'mousePressed',x:x1,y:top+y1,button:'left',clickCount:1});
            await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:x2,y:top+y2,button:'left',buttons:1});
            await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:x2,y:top+y2,button:'left',clickCount:1});
        };
        await drag(650,340,657,343);
        assert.deepEqual(await evaluate('({x1:state.walls[2].x1,y1:state.walls[2].y1,x2:state.walls[2].x2,y2:state.walls[2].y2})'),{x1:650,y1:200,x2:650,y2:480});
        assert.equal(await evaluate('getAllWallJoints().filter(j=>j.type==="T").length'),2);
        await drag(650,340,720,440);
        assert.equal(await evaluate('getAllWallJoints().filter(j=>j.type==="T").length'),0);
        const movedBranch = await evaluate('getWallCenter(state.walls[2])');
        await drag(movedBranch.x,movedBranch.y,654,341);
        assert.deepEqual(await evaluate('({x1:state.walls[2].x1,y1:state.walls[2].y1,x2:state.walls[2].x2,y2:state.walls[2].y2})'),{x1:650,y1:200,x2:650,y2:480});
        await drag(650,200,654,202);
        assert.equal(await evaluate('getWallLengthCm(state.walls[2])'),280);
        assert.deepEqual(await evaluate('validateProject().errors'),[]);
        const beforeHandleTurn = await evaluate('JSON.stringify(projectSnapshot())');
        const handle = await evaluate('({p:getWallEndCellCenter(state.walls[2],"start"),h:getRotateHandlePos(state.walls[2])})');
        await drag(handle.h.x,handle.h.y,handle.p.x-(handle.h.y-handle.p.y),handle.p.y+(handle.h.x-handle.p.x));
        assert.equal(await evaluate('getWallAngleDeg(state.walls[2])'),180);
        assert.equal(await evaluate('isWallOnGrid(state.walls[2])'),true);
        await evaluate('undoLastEdit();');
        assert.equal(await evaluate('JSON.stringify(projectSnapshot())'),beforeHandleTurn);
        await evaluate('restoreProject(JSON.parse(dragSceneBackup));updateInspector();render();saveProjectLocally();resetEditHistory();');
        // Reproduce the user's cross-partition: both faces now lie on one grid.
        const nested = await evaluate(`(() => {
            const left=state.walls[2],middle=state.walls[4],x1=left.x1+10,x2=middle.x1-10,y=left.y1+90;
            state.walls.push({id:state.nextId++,x1:x1+40,y1:y+40,x2:x2+40,y2:y+40,rows:10,openings:[]});
            state.selectedWallId=state.walls.at(-1).id;state.selectedOpeningId=null;updateInspector();render();
            return {x:(x1+x2)/2,y};
        })()`);
        await drag(nested.x+40,nested.y+40,nested.x+2,nested.y+1);
        assert.equal(await evaluate('getWallLengthCm(state.walls.at(-1))'),280);
        assert.equal(await evaluate('getAllWallJoints().filter(j=>j.type==="T" && j.branchWallId===state.walls.at(-1).id).length'),2,
            JSON.stringify(await evaluate(`({wall:state.walls.at(-1),pan:[state.panX,state.panY],canvas:state.canvas.getBoundingClientRect().toJSON(),source:document.elementFromPoint(${nested.x+40},${canvasTop+nested.y+40})?.outerHTML.slice(0,180)})`)));
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
        assert.equal(await evaluate('document.getElementById("valTotalRows").textContent'), '4 courses / 800 mm');
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
        assert.ok(await evaluate('document.getElementById("toastText").textContent.includes("200 mm")'));
        // Opening can move both horizontally and vertically on the elevation.
        const point = await evaluate(`(() => {const g=state.elevationGeometry,w=state.walls[0],op=w.openings[0],r=state.elevCanvas.getBoundingClientRect();return {x:r.left+g.startX+160*g.scaleX,y:r.top+g.padTop+(getWallRows(w)-op.startRow-op.rowCount/2+0.5)*g.rowH,rowH:g.rowH};})()`);
        await call('Input.dispatchMouseEvent', {type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1});
        await call('Input.dispatchMouseEvent', {type: 'mouseMoved', x: point.x, y: point.y + point.rowH, button: 'left', buttons: 1});
        await call('Input.dispatchMouseEvent', {type: 'mouseReleased', x: point.x, y: point.y + point.rowH, button: 'left', clickCount: 1});
        assert.equal(await evaluate('state.walls[0].openings[0].startRow'), 4);
        await evaluate('window.csvCapture=null; downloadFile=(name,content,type)=>{window.csvCapture={name,content,type}}; document.getElementById("btnExportCsv").click();');
        assert.equal(await evaluate('csvCapture.name'), 'blocks-quantities.csv');
        assert.ok(await evaluate('csvCapture.content.includes("TOTAL")'));
        await evaluate('window.print=()=>{}; printReport();');
        await evaluate('loadQuantityReportFont()');
        assert.equal(await evaluate('document.querySelectorAll("#printReport tr").length'), 6);
        const pdf = await call('Page.printToPDF', {printBackground: true});
        assert.ok(Buffer.from(pdf.data, 'base64').length > 1000);
        const quantity = await evaluate('document.getElementById("totAllBlocks").textContent');
        await reloadPage();
        for (let i = 0; i < 100; i++) {
            if (await evaluate('typeof state !== "undefined" && document.readyState === "complete" && state.walls.length===5')) break;
            await new Promise(r => setTimeout(r, 100));
        }
        assert.equal(await evaluate('state.walls[0].rows'), 16);
        assert.equal(await evaluate('document.getElementById("totAllBlocks").textContent'), quantity);
        // Imported review examples remain editable, but cannot produce a final bill.
        const validProject = await evaluate('JSON.stringify(projectSnapshot())');
        const legacy = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','legacy-nested-partition.json'),'utf8'));
        await evaluate(`restoreProject(${JSON.stringify(legacy)});updateInspector();render();saveProjectLocally();`);
        assert.deepEqual(await evaluate('validateProject().errors'),[]);
        assert.equal(await evaluate('getWallLengthCm(getPartnerWall(10))'),280);
        assert.ok(await evaluate('document.getElementById("projectStatus").textContent.includes("3000 to 2800 mm")'));
        assert.equal(await evaluate('JSON.parse(localStorage.getItem(LOCAL_PROJECT_KEY)).planGeometry'), 'modular-cells-v3');
        for (const [file, message] of [
            ['overlap-at-endpoint.json', 'overlap outside a supported L-corner'],
            ['short-double-corner.json', 'overlap']
        ]) {
            const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8'));
            await evaluate(`restoreProject(${JSON.stringify(fixture)});updateInspector();render();`);
            assert.ok(await evaluate(`document.getElementById('projectStatus').textContent.includes(${JSON.stringify(message)})`), file);
            assert.equal(await evaluate('document.getElementById("btnPrint").disabled && document.getElementById("btnExportCsv").disabled'), true, file);
            assert.ok(await evaluate('document.getElementById("resultsStatus").textContent.includes("Draft quantities")'), file);
            assert.equal(await evaluate('getProjectReport()'), null, file);
        }
        await evaluate(`restoreProject(${validProject});updateInspector();render();`);
        assert.deepEqual(await evaluate('validateProject().errors'), []);
        assert.equal(await evaluate('document.getElementById("btnPrint").disabled || document.getElementById("btnExportCsv").disabled'), false);
        // Invalid geometry disables both final output actions.
        await evaluate('state.walls.push({...state.walls[0],id:999,openings:[]}); updateInspector();');
        assert.equal(await evaluate('document.getElementById("btnPrint").disabled && document.getElementById("btnExportCsv").disabled'), true);
        await evaluate('document.getElementById("btnClearAll").click();');
        assert.equal(await evaluate('state.walls.length'), 0);
        await evaluate('document.getElementById("btnAddWall").click();');
        assert.equal(await evaluate('getWallLengthCm(state.walls[0])'), 400);
        assert.equal(await evaluate('Number(document.getElementById("inputWallRows").max)'), 17);
        assert.equal(await evaluate('Number(document.getElementById("sliderTotalRows").max)'), 17);
        await evaluate('document.getElementById("inputWallRows").value=17; document.getElementById("inputWallRows").dispatchEvent(new Event("change",{bubbles:true}));');
        assert.equal(await evaluate('state.walls[0].rows'), 17);
        assert.equal(await evaluate('document.getElementById("valWallHeight").textContent'), '3400 mm');
        assert.equal(await evaluate('getProjectReport()[0].height'), 3400);
        assert.equal(await evaluate('document.getElementById("btnPrint").disabled'), false);
        await evaluate('document.getElementById("inputWallRows").value=18; document.getElementById("inputWallRows").dispatchEvent(new Event("change",{bubbles:true}));');
        assert.equal(await evaluate('state.walls[0].rows'), 17);
        assert.ok(await evaluate('document.getElementById("toastText").textContent.includes("2–17")'));
        await evaluate('document.getElementById("sliderTotalRows").value=16; document.getElementById("sliderTotalRows").dispatchEvent(new Event("input",{bubbles:true}));');
        assert.equal(await evaluate('state.walls[0].rows'), 16);
        await evaluate('document.getElementById("sliderTotalRows").value=17; document.getElementById("sliderTotalRows").dispatchEvent(new Event("input",{bubbles:true}));');
        assert.equal(await evaluate('state.walls[0].rows'), 17);
        assert.ok(await evaluate('document.getElementById("valTotalRows").textContent.includes("3400 mm")'));
        assert.deepEqual(await evaluate('validateProject().errors'), []);
        await evaluate('document.getElementById("btnAddOpening").click();document.getElementById("sliderOpStartRow").value=1;document.getElementById("sliderOpStartRow").dispatchEvent(new Event("input",{bubbles:true}));');
        // In a 17-course wall, a 15-course opening leaves two courses above it.
        await evaluate('document.getElementById("sliderOpRowCount").value=15;document.getElementById("sliderOpRowCount").dispatchEvent(new Event("input",{bubbles:true}));');
        assert.ok(await evaluate('document.getElementById("projectStatus").textContent.includes("three courses above") && document.getElementById("projectStatus").textContent.includes("2 available")'));
        assert.equal(await evaluate('document.getElementById("btnPrint").disabled && document.getElementById("btnExportCsv").disabled'), true);
        await evaluate('document.getElementById("sliderOpRowCount").value=14;document.getElementById("sliderOpRowCount").dispatchEvent(new Event("input",{bubbles:true}));');
        assert.deepEqual(await evaluate('validateProject().errors'), []);
        assert.equal(await evaluate('document.getElementById("btnPrint").disabled || document.getElementById("btnExportCsv").disabled'), false);
        await evaluate('document.querySelector("[data-optype=door]").click();');
        assert.equal(await evaluate('state.walls[0].openings[0].startRow'), 1);
        assert.equal(await evaluate('document.getElementById("sliderOpStartRow").disabled'), true);
        assert.equal(await evaluate('document.getElementById("doorFloorNote").classList.contains("hidden")'), false);
        // Even an explicitly dispatched input event cannot raise a door.
        await evaluate('document.getElementById("sliderOpStartRow").value=4;document.getElementById("sliderOpStartRow").dispatchEvent(new Event("input",{bubbles:true}));');
        assert.equal(await evaluate('state.walls[0].openings[0].startRow'), 1);
        await evaluate('document.getElementById("sliderOpRowCount").value=8;document.getElementById("sliderOpRowCount").dispatchEvent(new Event("input",{bubbles:true}));');
        assert.equal(await evaluate('state.walls[0].openings[0].rowCount'), 8);
        const dragSelectedOpening = async (horizontalCm, rowsUp) => {
            const p = await evaluate(`(() => {
                const g=state.elevationGeometry,w=getPartnerWall(g.wallId),op=w.openings.find(o=>o.id===state.selectedOpeningId),r=state.elevCanvas.getBoundingClientRect();
                return {x:r.left+g.startX+op.offset*g.scaleX,y:r.top+g.padTop+(getWallRows(w)-op.startRow-op.rowCount/2+0.5)*g.rowH,scaleX:g.scaleX,rowH:g.rowH};
            })()`);
            await call('Input.dispatchMouseEvent', {type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
            await call('Input.dispatchMouseEvent', {type:'mouseMoved',x:p.x+horizontalCm*p.scaleX,y:p.y-rowsUp*p.rowH,button:'left',buttons:1});
            await call('Input.dispatchMouseEvent', {type:'mouseReleased',x:p.x+horizontalCm*p.scaleX,y:p.y-rowsUp*p.rowH,button:'left',clickCount:1});
        };
        const doorOffset = await evaluate('state.walls[0].openings[0].offset');
        await dragSelectedOpening(40,2);
        assert.equal(await evaluate('state.walls[0].openings[0].startRow'), 1);
        assert.equal(await evaluate('state.walls[0].openings[0].offset'), doorOffset+40);
        for (const type of ['window','arch']) {
            await evaluate(`document.querySelector('[data-optype=${type}]').click();`);
            assert.equal(await evaluate('document.getElementById("sliderOpStartRow").disabled'), false);
            assert.equal(await evaluate('document.getElementById("doorFloorNote").classList.contains("hidden")'), true);
            await evaluate('document.getElementById("sliderOpStartRow").value=3;document.getElementById("sliderOpStartRow").dispatchEvent(new Event("input",{bubbles:true}));');
            assert.equal(await evaluate('state.walls[0].openings[0].startRow'), 3);
            await dragSelectedOpening(0,2);
            assert.equal(await evaluate('state.walls[0].openings[0].startRow'), 5, type);
        }
        // A saved raised door is loaded unchanged for correction, with exports blocked.
        await evaluate('const raisedDoor=JSON.parse(JSON.stringify(projectSnapshot()));raisedDoor.walls[0].openings[0].type="door";restoreProject(raisedDoor);updateInspector();render();');
        assert.equal(await evaluate('state.walls[0].openings[0].startRow'), 5);
        assert.ok(await evaluate('document.getElementById("projectStatus").textContent.includes("must start at course 1")'));
        assert.equal(await evaluate('document.getElementById("btnPrint").disabled && document.getElementById("btnExportCsv").disabled'), true);
        await evaluate('document.querySelector("[data-optype=door]").click();');
        assert.equal(await evaluate('state.walls[0].openings[0].startRow'), 1);
        assert.deepEqual(await evaluate('validateProject().errors'), []);
        assert.equal(await evaluate('document.getElementById("btnPrint").disabled || document.getElementById("btnExportCsv").disabled'), false);
        const currentProject = await evaluate('JSON.stringify(projectSnapshot())');
        const legacyRaw = JSON.stringify(legacy);
        await evaluate(`window.removeEventListener('beforeunload',saveProjectLocally);localStorage.removeItem(LOCAL_PROJECT_KEY);localStorage.setItem('blocks-calculator-v1',${JSON.stringify(legacyRaw)});`);
        await reloadPage();
        assert.deepEqual(await evaluate('validateProject().errors'),[]);
        assert.equal(await evaluate('getWallLengthCm(getPartnerWall(10))'),280);
        await evaluate('saveProjectLocally();');
        assert.equal(await evaluate('localStorage.getItem("blocks-calculator-v1")'),legacyRaw);
        assert.equal(await evaluate('JSON.parse(localStorage.getItem(LOCAL_PROJECT_KEY)).planGeometry'),'modular-cells-v3');
        await evaluate(`restoreProject(${currentProject});updateInspector();render();saveProjectLocally();`);
        await call('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: false});
        await new Promise(r => setTimeout(r, 200));
        assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
        assert.ok(await evaluate('state.canvas.width > 0 && state.elevCanvas.height > 0'));
        assert.deepEqual(errors, []);
        console.log('PASS: rendering, drag/rotation, nested T-junctions, heights/openings, CSV/print, persistence, legacy migration, validation, door floor constraint.');
        console.log('Screenshot: ' + image);
    } finally {
        socket?.close(); browser.kill(); server.close();
    }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
