(function(){
const V3=THREE.Vector3, D=Math.PI/180, $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const safeUrl=u=>/^https?:\/\//i.test(String(u||""))?esc(u):"#";

/* ---------- finishes (linear colour, metalness, roughness) ---------- */
const FIN={
  ur_joint:[[.278,.278,.278],.35,.42], ur_blue:[[.49,.678,.8],.02,.5], ur_black:[[.03,.03,.033],0,.75], ur_tube:[[.80,.80,.80],.65,.32],
  steel:[[.70,.71,.72],.92,.28], steel_dark:[[.22,.23,.25],.85,.4], blackox:[[.03,.03,.035],.75,.42], zinc:[[.66,.68,.72],.9,.32],
  ptfe:[[.86,.86,.84],0,.55], bearing:[[.55,.57,.6],.95,.22], gear_rigid:[[.48,.49,.52],.92,.33], gear_flex:[[.66,.67,.69],.96,.22],
  motor:[[.12,.125,.135],.7,.45], copper:[[.80,.32,.10],1,.32], magnet:[[.30,.30,.32],.75,.38], friction:[[.16,.07,.03],0,.9],
  brake:[[.42,.44,.47],.88,.33], spring:[[.55,.57,.6],.92,.28], solenoid:[[.09,.09,.10],.4,.5], encoder:[[.08,.09,.10],.3,.18],
  pcb:[[.01,.14,.04],.1,.5], chip:[[.015,.015,.015],.2,.6],
  fr_white:[[.86,.86,.86],0,.42], fr_grey:[[.62,.66,.68],.15,.45], fr_dark:[[.025,.025,.028],.1,.55], fr_blue:[[.02,.30,.55],0,.4],
  led_red:[[.9,.02,.02],0,.4], led_green:[[.02,.8,.1],0,.4],
  arx_black:[[.022,.022,.024],.35,.5], arx_motor:[[.06,.062,.068],.75,.38], arx_alu:[[.55,.56,.58],.9,.3], decal:[[.75,.75,.75],0,.6],
  rubber:[[.02,.02,.02],0,.9], white:[[.85,.85,.85],0,.5], user:[[.68,.73,.76],.25,.5]
};
const PROV={mesh:['Official mesh','p-mesh'],doc:['Documented spec','p-doc'],std:['Standard part','p-std'],est:['Estimated','p-est'],user:['Imported','p-user']};
const KINDNAME={shell:'Exterior',hardware:'Hardware',fastener:'Fastener',internal:'Internal',user:'Imported'};
const layerOf=k=>k==='internal'?'internal':(k==='fastener'||k==='hardware')?'hw':'shell';

/* ---------- scene ---------- */
const stage=$('#stage');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
stage.prepend(renderer.domElement);
const scene=new THREE.Scene();
const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(new THREE.RoomEnvironment(),0.04).texture;
const camera=new THREE.PerspectiveCamera(36,1,.005,50);
camera.position.set(1.2,.9,1.3);
const controls=new THREE.OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.target.set(0,.4,0);
const key=new THREE.DirectionalLight(0xffffff,.9); key.position.set(2,3.2,1.5); scene.add(key);
scene.add(new THREE.HemisphereLight(0xffffff,0x55606a,.35));
let grid=null; const accent=new THREE.Color();
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}
function applyTheme(){
  scene.background=new THREE.Color(css('--stage'));
  if(grid){scene.remove(grid);grid.geometry.dispose();}
  grid=new THREE.GridHelper(3,30,new THREE.Color(css('--grid')),new THREE.Color(css('--grid2'))); scene.add(grid);
  accent.set(css('--accent')); refresh();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
function resize(){const r=stage.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix(); if(typeof computeFraming==='function'&&world&&!userMoved){computeFraming();applyFraming();}}
new ResizeObserver(resize).observe(stage);

/* ---------- state ---------- */
let world=null, arms=[], pickables=[], manifest=null, T=0, anim=null, focusAnim=null;
let selected=null, hovered=null, isolate=false, xray=false;
const layers={shell:true,hw:true,internal:true};
let current='ur5e', config='single';
const cache={};

function eulerRPY(r){return new THREE.Euler(r[0],r[1],r[2],'ZYX')}
function makeMat(fin){
  const f=FIN[fin]||FIN.user;
  const m=new THREE.MeshStandardMaterial({color:new THREE.Color(f[0][0],f[0][1],f[0][2]),metalness:f[1],roughness:f[2],envMapIntensity:.9});
  if(fin==='led_red'||fin==='led_green'){m.emissive=m.color.clone();m.emissiveIntensity=.8}
  m.userData.baseEmissive=m.emissive.clone(); m.userData.baseEI=m.emissiveIntensity;
  return m;
}

/* ---------- loading packs ---------- */
async function loadPack(id){
  if(cache[id]) return cache[id];
  setLoading('Loading official meshes…');
  const man=await (await fetch('models/'+id+'.json')).json();
  const res=await fetch(man.glb);
  if(!res.ok) throw new Error('model file '+man.glb+' returned '+res.status);
  let buf;
  if(/\.txt$/.test(man.glb)){ setLoading('Decoding mesh data…'); const b64=(await res.text()).trim(); const bin=atob(b64); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); buf=u.buffer; }
  else buf=await res.arrayBuffer();
  const gltf=await new Promise((res,rej)=>new THREE.GLTFLoader().parse(buf,'',res,rej));
  cache[id]={man,scene:gltf.scene};
  return cache[id];
}
function setLoading(s){const l=$('#loading'); if(s){l.textContent=s;l.hidden=false}else l.hidden=true}

/* Build one arm from a pack: link groups, joint origin/rotation groups, parts re-parented into link frames */
function buildArm(pack,label,offsetY){
  const man=pack.man, src=pack.scene.clone(true);
  const linkSrc={}; src.children.forEach(n=>{ if(n.name.startsWith('L__')) linkSrc[n.name.slice(3)]=n; });
  const links={}, joints=[], origins=[], parts=[];
  const root=new THREE.Group();
  const mk=name=>{ if(!links[name]){ links[name]=new THREE.Group(); links[name].name=name; } return links[name]; };
  mk(man.root); root.add(links[man.root]);
  man.joints.forEach(j=>{
    const parent=mk(j.parent), child=mk(j.child);
    const o=new THREE.Group(); o.position.fromArray(j.xyz); o.setRotationFromEuler(eulerRPY(j.rpy||[0,0,0]));
    parent.add(o); const r=new THREE.Group(); o.add(r); r.add(child);
    const off=new V3().fromArray(j.xyz);
    const u=off.length()>1e-5?off.clone().normalize():(j.type==='fixed'?new V3():new V3().fromArray(j.axis||[0,0,1]).applyQuaternion(o.quaternion).normalize());
    origins.push({obj:o,base:o.position.clone(),u});
    if(j.type!=='fixed') joints.push({j,rot:r,axis:new V3().fromArray(j.axis).normalize(),q:0});
  });
  Object.keys(linkSrc).forEach(name=>{
    const g=mk(name), s=linkSrc[name];
    [...s.children].forEach(c=>{
      const meta=man.parts[c.name]; if(!meta) return;
      c.traverse(o=>{ if(o.isMesh){ o.material=makeMat(meta.finish); o.userData.meta=meta; o.userData.id=label+c.name; o.userData.arm=label; pickables.push(o);} });
      g.add(c); c.userData.base=c.position.clone(); c.userData.meta=meta;
      if(meta.explode){ c.userData.dir=new V3().fromArray(meta.explode.dir).normalize(); }
      parts.push(c);
    });
  });
  const holder=new THREE.Group(); holder.rotation.x=-Math.PI/2; holder.position.z=-offsetY; holder.add(root);
  const arm={label,man,root,holder,links,joints,origins,parts};
  poseArm(arm,man.home);
  return arm;
}
function poseArm(arm,qs){
  arm.joints.forEach((r,i)=>{ if(qs&&qs[i]!=null) r.q=qs[i]; });
  arm.joints.forEach(r=>{
    if(r.j.mimic){ const s=arm.joints.find(x=>x.j.name===r.j.mimic); if(s) r.q=s.q*(r.j.multiplier==null?1:r.j.multiplier)+(r.j.offset||0); }
    if(r.j.type==='prismatic') r.rot.position.copy(r.axis).multiplyScalar(r.q); else r.rot.quaternion.setFromAxisAngle(r.axis,r.q); });
}

/* ---------- explode ---------- */
const ss=(x)=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x)};
function applyExplode(noFrame){
  const s1=ss(T/.45), s2=ss((T-.28)/.45), s3=ss((T-.52)/.45);
  arms.forEach(a=>{
    const lam=(a.man.spread||.1);
    a.origins.forEach(o=>o.obj.position.copy(o.base).addScaledVector(o.u,lam*s1));
    a.parts.forEach(p=>{
      const e=p.userData.meta.explode; if(!e||!p.userData.dir){ return; }
      let d=e.dist||0, s=e.stage===3?s3:s2;
      if(e.stack!=null) d=(e.base||0)+e.stack*(e.stackGap||.012);
      if(e.ownAxis) { p.position.copy(p.userData.base).addScaledVector(p.userData.dir,d*s); return; }
      p.position.copy(p.userData.base).addScaledVector(p.userData.dir,d*s);
    });
  });
  $('#tVal').textContent=T.toFixed(2); $('#tBig').textContent=T.toFixed(2);
  if(!noFrame&&typeof applyFraming==='function') applyFraming();
}

/* ---------- appearance ---------- */
function refresh(){
  pickables.forEach(m=>{
    const meta=m.userData.meta, mat=m.material, id=m.userData.id;
    const sel=selected&&id===selected.userData.id, hov=hovered&&id===hovered.userData.id;
    if(sel||hov){ mat.emissive.copy(accent); mat.emissiveIntensity=sel?.55:.25; }
    else { mat.emissive.copy(mat.userData.baseEmissive); mat.emissiveIntensity=mat.userData.baseEI; }
    const lay=layerOf(meta.kind);
    m.visible=layers[lay];
    let op=1;
    if(xray&&meta.kind==='shell'&&!sel) op=.14;
    if(isolate&&selected&&!sel) op=Math.min(op,.06);
    const tr=op<1; if(mat.transparent!==tr){ mat.transparent=tr; mat.needsUpdate=true; } mat.opacity=op; mat.depthWrite=!tr;
  });
}

/* ---------- build / rebuild ---------- */
async function rebuild(){
  let pack;
  try{ pack=current==='import'?importPack:await loadPack(current); }
  catch(e){ setLoading('Could not load the model files: '+e.message); return; }
  if(world){ scene.remove(world); world.traverse(o=>{ if(o.isMesh) o.material.dispose(); }); }
  world=new THREE.Group(); scene.add(world); arms=[]; pickables=[]; selected=null; hovered=null; manifest=pack.man;
  const offs=config==='bi'?[1,-1]:[0];
  offs.forEach((s,i)=>{
    const lbl=config==='bi'?(i===0?'L·':'R·'):'';
    const arm=buildArm(pack,lbl,s*(pack.man.bimanualY||.4)); arms.push(arm); world.add(arm.holder);
  });
  setLoading(null);
  applyExplode(); applyTheme(); buildJointUI(); buildIndex(); fitView(); updatePlate(); showCard(null); buildFacts();
}
function updatePlate(){
  const m=manifest; $('#plateName').textContent=m.name+(config==='bi'?' ×2':''); $('#plateSpec').textContent=m.spec||'';
  const ps=Object.values(m.parts);
  const n=k=>ps.filter(p=>k(p)).length;
  const c=[['Parts',ps.length],['Official mesh',n(p=>p.prov==='mesh')],['Fasteners',n(p=>p.kind==='fastener')],['Internals',n(p=>p.kind==='internal')]];
  $('#counts').innerHTML=c.map(([k,v])=>`<div><b>${v}</b><span>${k}</span></div>`).join('');
}
let framing=null, userMoved=false;
controls.addEventListener('start',()=>{ userMoved=true; focusAnim=null; });
function boundsNow(){
  world.updateMatrixWorld(true);
  const box=new THREE.Box3();
  arms.forEach(a=>a.parts.forEach(p=>{ if(p.userData.meta.kind!=='internal'||T>.2) box.expandByObject(p); }));
  return box;
}
function frameFor(box){
  const c=box.getCenter(new V3()), sz=box.getSize(new V3());
  const fovV=camera.fov*D, fovH=2*Math.atan(Math.tan(fovV/2)*camera.aspect);
  const r=sz.length()/2;
  const dist=Math.max(r/Math.sin(Math.min(fovV,fovH)/2)*.96, .3);
  return {c,dist};
}
const FR_N=8;
function computeFraming(){
  if(!world) return;
  const t0=T, fr=[];
  for(let i=0;i<=FR_N;i++){ T=i/FR_N; applyExplode(true); fr.push(frameFor(boundsNow())); }
  T=t0; applyExplode(true);
  framing={fr,dir:new V3(.8,.42,.95).normalize()};
}
function applyFraming(){
  if(userMoved||!framing) return;
  const x=Math.min(FR_N,Math.max(0,T*FR_N)), i=Math.min(FR_N-1,Math.floor(x)), f=x-i;
  const a=framing.fr[i], b=framing.fr[i+1];
  const c=a.c.clone().lerp(b.c,f), d=a.dist+(b.dist-a.dist)*f;
  controls.target.copy(c); camera.position.copy(c).addScaledVector(framing.dir,d);
  camera.near=d/200; camera.far=d*40; camera.updateProjectionMatrix();
}
function fitView(){ userMoved=false; computeFraming(); applyFraming(); controls.update(); }

/* ---------- picking ---------- */
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2(); let downAt=null, hoverQ=false, lastMove=null;
function hit(e){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc,camera);
  const hits=ray.intersectObjects(pickables.filter(m=>m.visible&&!(m.material.transparent&&m.material.opacity<.2)),false);
  return hits[0]?hits[0].object:null;
}
renderer.domElement.addEventListener('pointerdown',e=>{downAt=[e.clientX,e.clientY]});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!downAt) return; const mv=Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1]); downAt=null; if(mv>6) return;
  select(hit(e),false);
});
renderer.domElement.addEventListener('pointermove',e=>{ if(e.pointerType!=='mouse') return; lastMove=e; if(hoverQ) return; hoverQ=true;
  requestAnimationFrame(()=>{hoverQ=false; const o=hit(lastMove); renderer.domElement.style.cursor=o?'pointer':'grab';
    if((o&&o.userData.id)!==(hovered&&hovered.userData.id)){hovered=o;refresh();}}); });
function select(o,focus){
  selected=o; refresh(); showCard(o);
  document.querySelectorAll('.plist button').forEach(b=>b.setAttribute('aria-current',String(!!o&&b.dataset.id===o.userData.id)));
  if(o&&focus){ const c=new THREE.Box3().setFromObject(o).getCenter(new V3()); focusTo(c); }
}
function focusTo(c){ userMoved=true; focusAnim={from:controls.target.clone(),to:c,t0:performance.now()}; }

/* ---------- inspector ---------- */
function fmtmm(v){return (v*1000).toFixed(1)}
function showCard(o){
  const c=$('#card');
  if(!o){ c.innerHTML=`<div class="k">NOTHING SELECTED</div><div class="t">Tap any part</div><p>Every part carries its provenance. Teal parts are the manufacturer's own meshes, blue are documented specs, violet are standard ISO/DIN parts placed at documented positions, amber are estimates labelled as such.</p><p class="hint">Raise the slider past 0.3 to pull actuators out along their joint axes, past 0.55 to back the screws out along their own axes.</p>`; return; }
  const m=o.userData.meta, pv=PROV[m.prov]||PROV.user;
  const box=new THREE.Box3().setFromObject(o), sz=box.getSize(new V3());
  const lk=(manifest.links&&manifest.links[m.link])||{};
  let rows=`<dt>Link</dt><dd>${esc(lk.name||m.link)}${lk.mass!=null?` · ${lk.mass} kg`:''}</dd>`;
  if(m.conn) rows+=`<dt>Connection</dt><dd>${esc(m.conn)}</dd>`;
  if(m.joint){ const j=manifest.joints.find(x=>x.name===m.joint); if(j) rows+=`<dt>Joint</dt><dd>${esc(j.label||j.name)}</dd>`; }
  if(m.spec) Object.entries(m.spec).forEach(([k,v])=>rows+=`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`);
  if(m.dims) rows+=`<dt>Measured</dt><dd>${esc(m.dims)}</dd>`;
  rows+=`<dt>Envelope</dt><dd>${fmtmm(sz.x)} × ${fmtmm(sz.y)} × ${fmtmm(sz.z)} mm (world axes)</dd><dt>Triangles</dt><dd>${(m.tris||0).toLocaleString()}</dd>`;
  const srcs=(m.src||[]).map(k=>manifest.sources[k]).filter(Boolean);
  c.innerHTML=`<div class="k">${esc((o.userData.arm||'')+(KINDNAME[m.kind]||m.kind)).toUpperCase()} · ${esc(o.userData.id.replace(/^[LR]·/,''))}</div>
    <div class="t">${esc(m.label)}</div><span class="badge ${pv[1]}"><i></i>${pv[0]}</span>
    <p>${esc(m.note||'')}</p><dl>${rows}</dl>
    ${srcs.length?`<ul>${srcs.map(s=>`<li><a href="${safeUrl(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a></li>`).join('')}</ul>`:''}`;
}

/* ---------- parts index ---------- */
function buildIndex(){
  const box=$('#index'); box.innerHTML='';
  const arm=arms[0]; if(!arm) return;
  const groups={};
  arm.parts.forEach(p=>{
    const m=p.userData.meta; const g=layerOf(m.kind)==='shell'?'Exterior':layerOf(m.kind)==='hw'?'Hardware & fasteners':'Internals';
    (groups[g]=groups[g]||[]).push(p);
  });
  ['Exterior','Hardware & fasteners','Internals'].forEach(g=>{
    const list=groups[g]; if(!list) return;
    const d=document.createElement('details'); d.className='grp';
    d.innerHTML=`<summary>${g}<span>${list.length}</span></summary><div class="plist"></div>`;
    const pl=d.querySelector('.plist');
    list.sort((a,b)=>(a.userData.meta.link+a.userData.meta.label).localeCompare(b.userData.meta.link+b.userData.meta.label));
    list.forEach(p=>{
      const m=p.userData.meta, pv=PROV[m.prov]||PROV.user;
      const mesh=p.isMesh?p:p.children.find(c=>c.isMesh)||p;
      const b=document.createElement('button'); b.className=pv[1]; b.dataset.id=mesh.userData.id;
      const lk=(manifest.links&&manifest.links[m.link]&&manifest.links[m.link].name)||m.link;
      b.innerHTML=`<i></i><span style="color:var(--ink)">${esc(m.label)}</span><em>${esc(lk)}</em>`;
      b.onclick=()=>select(mesh,true);
      b.dataset.q=(m.label+' '+lk+' '+(m.spec?Object.values(m.spec).join(' '):'')).toLowerCase();
      pl.appendChild(b);
    });
    box.appendChild(d);
  });
  applyFilter();
}
function applyFilter(){
  const q=($('#pfilter').value||'').trim().toLowerCase();
  document.querySelectorAll('#index details.grp').forEach(d=>{
    let n=0; d.querySelectorAll('.plist button').forEach(b=>{ const ok=!q||b.dataset.q.includes(q); b.hidden=!ok; if(ok) n++; });
    d.querySelector('summary span').textContent=q?`${n} match${n===1?'':'es'}`:d.querySelectorAll('.plist button').length;
    if(q) d.open=n>0;
  });
}
$('#pfilter').addEventListener('input',applyFilter);
function buildFacts(){
  $('#facts').innerHTML=(manifest.facts||[]).map(f=>`<li>${esc(f)}</li>`).join('');
  $('#sources').innerHTML=Object.values(manifest.sources||{}).map(s=>`<a href="${safeUrl(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a>`).join('');
}

/* ---------- joints UI ---------- */
function buildJointUI(){
  const box=$('#joints'); box.innerHTML='';
  const sel=$('#armSel'); sel.hidden=arms.length<2;
  const a=arms[0]; if(!a||!a.joints.length){ box.innerHTML='<p class="hint">No movable joints.</p>'; return; }
  a.joints.forEach((r,i)=>{
    if(r.j.mimic) return;
    const pr=r.j.type==='prismatic';
    const lo=Math.max(r.j.lower!=null?r.j.lower:-Math.PI,-2*Math.PI), hi=Math.min(r.j.upper!=null?r.j.upper:Math.PI,2*Math.PI);
    const row=document.createElement('div'); row.className='row';
    const fmt=v=>pr?(v*1000).toFixed(0)+' mm':(v/D).toFixed(0)+'°';
    row.innerHTML=`<label for="q${i}">${esc(r.j.label||r.j.name)}</label><input id="q${i}" type="range" min="${lo}" max="${hi}" step="0.001" value="${r.q}"><output>${fmt(r.q)}</output>`;
    box.appendChild(row);
    row.querySelector('input').addEventListener('input',e=>{
      const v=+e.target.value; const tg=sel.hidden||sel.value==='both'?arms:[arms[+sel.value]];
      tg.forEach(arm=>{ if(arm.joints[i]) arm.joints[i].q=v; poseArm(arm); });
      row.querySelector('output').textContent=fmt(v);
    });
  });
}
$('#home').onclick=()=>{arms.forEach(a=>poseArm(a,a.man.home)); buildJointUI();};
$('#zero').onclick=()=>{arms.forEach(a=>poseArm(a,a.joints.map(r=>r.j.type==='prismatic'?r.q:0))); buildJointUI();};

/* ---------- controls ---------- */
function sync(){
  document.querySelectorAll('#models button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.m===current)));
  document.querySelectorAll('#configs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.c===config)));
}
document.querySelectorAll('#models button').forEach(b=>b.onclick=()=>{current=b.dataset.m;sync();rebuild();});
document.querySelectorAll('#configs button').forEach(b=>b.onclick=()=>{config=b.dataset.c;sync();rebuild();});
document.querySelectorAll('#layers button').forEach(b=>b.onclick=()=>{const l=b.dataset.l;layers[l]=!layers[l];b.setAttribute('aria-pressed',String(layers[l]));refresh();});
$('#explode').addEventListener('input',e=>{T=+e.target.value;anim=null;applyExplode();});
$('#play').onclick=()=>{anim={from:T,to:T<.5?1:0,t0:performance.now(),dur:matchMedia('(prefers-reduced-motion: reduce)').matches?1:2600};};
$('#xray').onclick=e=>{xray=!xray;e.currentTarget.setAttribute('aria-pressed',String(xray));refresh();};
$('#isolate').onclick=e=>{isolate=!isolate;e.currentTarget.setAttribute('aria-pressed',String(isolate));refresh();};
$('#fit').onclick=fitView;

/* ---------- import (URDF primitives + skeleton, or GLB) ---------- */
let importPack=null;
function nums(s,d){return s?s.trim().split(/\s+/).map(Number):d}
function urdfToPack(text){
  const doc=new DOMParser().parseFromString(text,'application/xml');
  const robot=doc.querySelector('robot'); if(!robot) throw new Error('no <robot> element; is this a URDF?');
  const root=new THREE.Group(); const parts={}; let n=0, meshRefs=0;
  const linkNodes={};
  robot.querySelectorAll(':scope > link').forEach(l=>{
    const name=l.getAttribute('name'); const g=new THREE.Group(); g.name='L__'+name; root.add(g); linkNodes[name]=g;
    l.querySelectorAll(':scope > visual').forEach(v=>{
      const o=v.querySelector('origin'), geo=v.querySelector('geometry'); if(!geo) return;
      let G=null; const b=geo.querySelector('box'),c=geo.querySelector('cylinder'),s=geo.querySelector('sphere');
      if(b) G=new THREE.BoxGeometry(...nums(b.getAttribute('size')));
      else if(c){G=new THREE.CylinderGeometry(+c.getAttribute('radius'),+c.getAttribute('radius'),+c.getAttribute('length'),28);G.rotateX(Math.PI/2);}
      else if(s) G=new THREE.SphereGeometry(+s.getAttribute('radius'),24,16);
      else { meshRefs++; return; }
      const m=new THREE.Mesh(G); m.position.fromArray(nums(o&&o.getAttribute('xyz'),[0,0,0])); m.setRotationFromEuler(eulerRPY(nums(o&&o.getAttribute('rpy'),[0,0,0])));
      const id='U'+(++n); m.name=id; g.add(m); parts[id]={label:name+' visual',kind:'user',finish:'user',prov:'user',link:name,note:'Primitive visual from the imported URDF.'};
    });
  });
  const joints=[]; const kids=new Set();
  robot.querySelectorAll(':scope > joint').forEach(j=>{
    const o=j.querySelector('origin'),a=j.querySelector('axis'),lm=j.querySelector('limit'), type=j.getAttribute('type');
    const jj={name:j.getAttribute('name'),label:j.getAttribute('name'),type:type==='continuous'?'revolute':type,parent:j.querySelector('parent').getAttribute('link'),child:j.querySelector('child').getAttribute('link'),
      xyz:nums(o&&o.getAttribute('xyz'),[0,0,0]),rpy:nums(o&&o.getAttribute('rpy'),[0,0,0]),axis:nums(a&&a.getAttribute('xyz'),[1,0,0]),
      lower:lm&&lm.getAttribute('lower')!=null?+lm.getAttribute('lower'):-Math.PI, upper:lm&&lm.getAttribute('upper')!=null?+lm.getAttribute('upper'):Math.PI,
      effort:lm?+lm.getAttribute('effort'):null};
    joints.push(jj); kids.add(jj.child);
    // skeleton tube from parent frame origin to this joint origin
    const v=new V3().fromArray(jj.xyz); const g=linkNodes[jj.parent];
    if(g&&v.length()>1e-4){ const r=Math.max(.008,Math.min(.03,v.length()*.12));
      const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,v.length(),20)); m.position.copy(v).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new V3(0,1,0),v.clone().normalize());
      const id='U'+(++n); m.name=id; g.add(m); parts[id]={label:jj.parent+' → '+jj.child+' link',kind:'user',finish:'user',prov:'user',link:jj.parent,note:'Skeleton segment drawn from the joint origin offset (no mesh available).',explode:null}; }
  });
  const rootName=Object.keys(linkNodes).find(k=>!kids.has(k))||Object.keys(linkNodes)[0];
  const links={}; Object.keys(linkNodes).forEach(k=>links[k]={name:k});
  return {man:{id:'import',name:robot.getAttribute('name')||'Imported URDF',spec:`${joints.filter(j=>j.type!=='fixed').length}-DoF · imported URDF${meshRefs?` · ${meshRefs} mesh refs drawn as skeleton`:''}`,root:rootName,joints,home:null,links,parts,sources:{},facts:['Imported file: primitives and joint frames come from your URDF; meshes it references cannot be fetched here.'],spread:.08},scene:root};
}
async function glbToPack(buf,name){
  const gltf=await new Promise((res,rej)=>new THREE.GLTFLoader().parse(buf,'',res,rej));
  const sc=gltf.scene; sc.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(sc), size=box.getSize(new V3()).length()||1, k=1/size;
  const holderL=new THREE.Group(); holderL.name='L__model';
  const parts={}; let n=0; const ctr=box.getCenter(new V3());
  sc.traverse(o=>{ if(!o.isMesh) return;
    const id='G'+(++n); const m=new THREE.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld));
    m.geometry.translate(-ctr.x,-box.min.y,-ctr.z); m.geometry.scale(k,k,k); m.geometry.rotateX(Math.PI/2);
    m.geometry.computeBoundingBox(); const c=m.geometry.boundingBox.getCenter(new V3());
    m.name=id; holderL.add(m);
    const dir=c.clone().sub(new V3(0,0,.35));
    parts[id]={label:o.name||('mesh '+n),kind:'user',finish:'user',prov:'user',link:'model',note:'Mesh from the imported file. Explodes away from the model centre.',explode:{dir:dir.lengthSq()>1e-8?dir.normalize().toArray():[0,0,1],dist:c.length()*.6,stage:2}};
  });
  const root=new THREE.Group(); root.add(holderL);
  return {man:{id:'import',name:name,spec:`imported GLB · ${n} meshes`,root:'model',joints:[],home:null,links:{model:{name:'model'}},parts,sources:{},facts:['Imported GLB: each mesh explodes away from the model centre.'],spread:0},scene:root};
}
function loadFile(f){
  const ext=f.name.split('.').pop().toLowerCase(), rd=new FileReader();
  rd.onload=async()=>{ try{
      importPack=(ext==='glb'||ext==='gltf')?await glbToPack(rd.result,f.name.replace(/\.[^.]+$/,'')):urdfToPack(rd.result);
      current='import'; config='single'; sync(); rebuild(); setStatus('Loaded '+f.name);
    }catch(e){ setStatus('Could not read '+f.name+': '+e.message); } };
  (ext==='glb'||ext==='gltf')?rd.readAsArrayBuffer(f):rd.readAsText(f);
}
$('#file').addEventListener('change',e=>{if(e.target.files[0]) loadFile(e.target.files[0]); e.target.value='';});
['dragenter','dragover'].forEach(ev=>stage.addEventListener(ev,e=>{e.preventDefault();$('#drop').hidden=false;}));
['dragleave','drop'].forEach(ev=>stage.addEventListener(ev,e=>{e.preventDefault();$('#drop').hidden=true;}));
stage.addEventListener('drop',e=>{const f=e.dataTransfer.files[0]; if(f) loadFile(f);});
function setStatus(s){$('#status').textContent=s}

/* ---------- loop ---------- */
function loop(now){
  if(anim){const p=Math.min(1,(now-anim.t0)/anim.dur);T=anim.from+(anim.to-anim.from)*ss(p);$('#explode').value=T;applyExplode();if(p>=1)anim=null;}
  if(focusAnim){const p=Math.min(1,(now-focusAnim.t0)/500);controls.target.lerpVectors(focusAnim.from,focusAnim.to,ss(p));if(p>=1)focusAnim=null;}
  controls.update(); renderer.render(scene,camera); requestAnimationFrame(loop);
}
window.__teardown={get info(){return {calls:renderer.info.render.calls,tris:renderer.info.render.triangles,geoms:renderer.info.memory.geometries,progs:renderer.info.programs.length}},hitAt:(x,y)=>{const o=hit({clientX:x,clientY:y});return o?o.userData.meta.label:null},get arms(){return arms},get pickables(){return pickables},setT:v=>{T=v;applyExplode()},select:(i)=>select(pickables[i],true),camera,controls,ready:false};
resize(); applyTheme(); rebuild().then(()=>{window.__teardown.ready=true;}); requestAnimationFrame(loop);
})();
