// Convert old axis-based L corners to full shared cells. Work on detached wall
// objects so a failed conversion never replaces the user's current project.
function migrateLegacyGeometry(walls) {
    const original = JSON.parse(JSON.stringify(walls));
    const sorted = [...walls].sort((a, b) => a.id - b.id);
    const byId = new Map(walls.map(w => [w.id, w]));
    const key = (w, end) => `${w.id}:${end}`;
    const parent = new Map(), oldPoints = new Map(), cornerNodes = new Set();
    const point = (w, end) => end === 'start' ? {x:w.x1,y:w.y1} : {x:w.x2,y:w.y2};
    const find = k => { if (parent.get(k) !== k) parent.set(k, find(parent.get(k))); return parent.get(k); };
    const unite = (a, b) => { parent.set(find(b), find(a)); };
    for (const w of sorted) for (const end of ['start', 'end']) {
        const k = key(w, end); parent.set(k, k); oldPoints.set(k, point(w, end));
    }
    const corners = [], tees = [];
    for (let i = 0; i < sorted.length; i++) for (let k = i + 1; k < sorted.length; k++) {
        const a = sorted[i], b = sorted[k];
        if (!arePerpendicular(a, b)) continue;
        let shared = false;
        for (const ea of ['start', 'end']) for (const eb of ['start', 'end']) {
            const pa = point(a, ea), pb = point(b, eb);
            if (dist(pa.x,pa.y,pb.x,pb.y) > 0.01) continue;
            unite(key(a,ea),key(b,eb)); cornerNodes.add(key(a,ea)); cornerNodes.add(key(b,eb));
            corners.push({wallA:a.id,endA:ea,wallB:b.id,endB:eb}); shared = true;
        }
        if (shared) continue;
        for (const [branch, host] of [[a,b],[b,a]]) for (const end of ['start','end']) {
            const p = point(branch,end), other = point(branch,end === 'start' ? 'end' : 'start');
            const local = worldToWallLocal(host,p.x,p.y);
            if (local.along < HALF_BLOCK_PX-0.01 || local.along > getWallLength(host)-HALF_BLOCK_PX+0.01) continue;
            if (Math.abs(local.perp)>0.01 && Math.abs(Math.abs(local.perp)-WALL_THICKNESS/2)>0.01) continue;
            const side = Math.sign(worldToWallLocal(host,other.x,other.y).perp);
            if (side) tees.push({branchId:branch.id,hostId:host.id,end,side});
        }
    }
    const adjacency = new Map();
    const add = (a,b,dx,dy) => {
        if (!adjacency.has(a)) adjacency.set(a,[]);
        adjacency.get(a).push({to:b,dx,dy});
    };
    const direction = w => {
        const n = getWallLength(w);
        return {x:Math.round((w.x2-w.x1)/n),y:Math.round((w.y2-w.y1)/n)};
    };
    for (const w of sorted) {
        const a=find(key(w,'start')), b=find(key(w,'end')), u=direction(w);
        const n=getWallLength(w)-HALF_BLOCK_PX;
        add(a,b,u.x*n,u.y*n); add(b,a,-u.x*n,-u.y*n);
    }
    const centres = new Map();
    const snapCentre = v => Math.round((v-HALF_BLOCK_PX/2)/HALF_BLOCK_PX)*HALF_BLOCK_PX+HALF_BLOCK_PX/2;
    for (const w of sorted) for (const end of ['start','end']) {
        const root=find(key(w,end));
        if (centres.has(root)) continue;
        const member = [...parent.keys()].find(k=>find(k)===root && cornerNodes.has(k));
        const estimate = member ? oldPoints.get(member) : getWallEndCellCenter(w,end);
        centres.set(root,{x:snapCentre(estimate.x),y:snapCentre(estimate.y)});
        const queue=[root];
        for (let index=0; index<queue.length; index++) {
            const from=queue[index], p=centres.get(from);
            for (const edge of adjacency.get(from)||[]) {
                const next={x:p.x+edge.dx,y:p.y+edge.dy}, previous=centres.get(edge.to);
                if (previous) {
                    if (dist(previous.x,previous.y,next.x,next.y)>0.01)
                        throw new Error('Legacy L-corner dimensions conflict on the 200 mm grid. The current project has been kept.');
                } else { centres.set(edge.to,next); queue.push(edge.to); }
            }
        }
    }
    for (const w of sorted) {
        const u=direction(w), a=centres.get(find(key(w,'start'))), b=centres.get(find(key(w,'end')));
        w.x1=a.x-u.x*HALF_BLOCK_PX/2; w.y1=a.y-u.y*HALF_BLOCK_PX/2;
        w.x2=b.x+u.x*HALF_BLOCK_PX/2; w.y2=b.y+u.y*HALF_BLOCK_PX/2;
    }
    // Hosts can themselves be partitions. Repeat in ID order until dependent
    // branches settle, without mutating lengths during ordinary drag gestures.
    let settled = false;
    for (let pass=0;pass<=walls.length;pass++) {
        let changed=false;
        for (const w of sorted) {
            const links=tees.filter(t=>t.branchId===w.id);
            if (!links.length) continue;
            if (new Set(links.map(t=>t.end)).size!==links.length)
                throw new Error(`Wall #${w.id}: ambiguous legacy T-junction. The current project has been kept.`);
            const u=direction(w), start=point(w,'start'), end=point(w,'end'), options=[];
            const points=link=>getWallFaceSnapPoints(byId.get(link.hostId),w).filter(p=>p.side===link.side);
            const addOption=(a,b)=>{
                const dx=b.x-a.x,dy=b.y-a.y,n=dx*u.x+dy*u.y;
                if (Math.abs(dx*u.y-dy*u.x)>0.01 || n<cmToPx(MIN_WALL_CM) || n>cmToPx(MAX_WALL_CM) || Math.abs(pxToCm(n)-snapCmToGrid(pxToCm(n)))>0.01) return;
                if (w.openings.some(op=>getOpeningBoundsCm(op).endCm>pxToCm(n)-HALF_BLOCK_CM)) return;
                options.push({a,b,cost:dist(a.x,a.y,start.x,start.y)+dist(b.x,b.y,end.x,end.y)});
            };
            if (links.length===2) {
                const first=links.find(t=>t.end==='start'), last=links.find(t=>t.end==='end');
                for (const a of points(first)) for (const b of points(last)) addOption(a,b);
            } else {
                const link=links[0], otherEnd=link.end==='start'?'end':'start';
                const fixed=corners.some(c=>(c.wallA===w.id&&c.endA===otherEnd)||(c.wallB===w.id&&c.endB===otherEnd));
                for (const p of points(link)) {
                    if (link.end==='start') addOption(p,fixed?end:{x:p.x+u.x*getWallLength(w),y:p.y+u.y*getWallLength(w)});
                    else addOption(fixed?start:{x:p.x-u.x*getWallLength(w),y:p.y-u.y*getWallLength(w)},p);
                }
            }
            options.sort((a,b)=>a.cost-b.cost||a.a.x-b.a.x||a.a.y-b.a.y||a.b.x-b.b.x||a.b.y-b.b.y);
            const best=options[0];
            if (!best) throw new Error(`Wall #${w.id}: its old T-junction cannot fit the 200 mm grid without moving an opening. The current project has been kept.`);
            if (best.cost>0.01) changed=true;
            w.x1=best.a.x;w.y1=best.a.y;w.x2=best.b.x;w.y2=best.b.y;
        }
        if (!changed) { settled=true;break; }
    }
    if (!settled) throw new Error('Legacy T-junctions could not be aligned consistently. The current project has been kept.');
    // Recheck corner constraints after dependent T branches have been resized.
    for (const c of corners) {
        const a=getWallEndCellCenter(byId.get(c.wallA),c.endA),b=getWallEndCellCenter(byId.get(c.wallB),c.endB);
        if (dist(a.x,a.y,b.x,b.y)>0.01) throw new Error('Converting a T-junction would disconnect an L-corner. The current project has been kept.');
    }
    const notes=['Converted an older project to the common 200 mm grid. Review wall positions and dimensions.'];
    for (const w of walls) {
        const before=getWallLengthCm(original.find(o=>o.id===w.id)),after=getWallLengthCm(w);
        if (before!==after) notes.push(`Wall #${w.id}: length changed from ${before * MM_PER_CM} to ${after * MM_PER_CM} mm to fit between wall faces.`);
    }
    return notes;
}
