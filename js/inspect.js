/* Inspect 360° (additive). Finds the selected part from the Inspector's id line and the page's window.__teardown
   hook, then draws a copy of it in its own layer over the stage: it lifts out of the robot, glides to the centre and
   revolves slowly (a turntable about the vertical plus a gentle tilt, so top and underside come round), turns under
   a drag, zooms with the wheel or a pinch, and glides back to its place on Done or Esc. The page's scene, camera,
   selection and controls are never changed. */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const stage=$('#stage'), card=$('#card');
if(!stage||!card||!window.THREE) return;
const td=()=>window.__teardown;
const RM=window.matchMedia('(prefers-reduced-motion: reduce)');
const CFG={
  depth:1,                 // camera-space distance of the centred part, m
  fill:.5,                 // bounding radius as a share of half the shorter stage side
  zoomMin:.6, zoomMax:2.4,
  spin:.3,                 // turntable speed, rad/s (one turn ≈ 21 s)
  tilt:.45, tiltRate:.23,  // tilt amplitude (rad, ≈ 26°) and cycle rate (rad/s, ≈ 27 s)
  drag:.008,               // rad per pixel dragged
  resume:2.5,              // seconds of stillness before the revolve eases back in
  inDur:.7, outDur:.5,     // glide out of the robot / back into it, s
  veil:.86                 // how far the robot fades behind the part
};
const PROV={mesh:['Official mesh','p-mesh'],doc:['Documented spec','p-doc'],std:['Standard part','p-std'],est:['Estimated','p-est'],user:['Imported','p-user']};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ICON='<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M20.5 3.5v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const coarse=()=>window.matchMedia('(pointer: coarse)').matches;

/* ---- new elements, appended to the stage and hidden until used ---- */
const openBtn=document.createElement('button');
openBtn.type='button'; openBtn.id='ix-open'; openBtn.className='ix-open'; openBtn.hidden=true;
openBtn.title='Bring the selected part to the centre and turn it slowly (I)';
openBtn.innerHTML=ICON+'<span>Inspect 360°</span>';
const wrap=document.createElement('div');
wrap.id='ix'; wrap.className='ix'; wrap.hidden=true;
wrap.innerHTML='<div class="ix-veil"></div><canvas class="ix-canvas" tabindex="0" role="img"></canvas>'+
  '<div class="ix-scale" aria-hidden="true"><span></span><i></i></div>'+
  '<div class="ix-bar" role="toolbar" aria-label="Inspect 360°"><div class="ix-text"><div class="ix-name"></div><div class="ix-meta"></div></div>'+
  '<button type="button" class="ix-spin"></button><button type="button" class="ix-done">Done</button></div>'+
  '<span class="ix-sr" aria-live="polite"></span>';
stage.append(openBtn,wrap);
const el={veil:wrap.querySelector('.ix-veil'),cv:wrap.querySelector('.ix-canvas'),scale:wrap.querySelector('.ix-scale'),
  scaleBar:wrap.querySelector('.ix-scale i'),scaleText:wrap.querySelector('.ix-scale span'),name:wrap.querySelector('.ix-name'),
  meta:wrap.querySelector('.ix-meta'),spin:wrap.querySelector('.ix-spin'),done:wrap.querySelector('.ix-done'),sr:wrap.querySelector('.ix-sr')};
const say=msg=>{ el.sr.textContent=''; requestAnimationFrame(()=>{ el.sr.textContent=msg; }); };

/* ---- which part is selected: the Inspector's first line reads "[L·|R·]KIND · ID" ---- */
let selId=null, S=null;
function readSelection(){
  const k=card.querySelector('.k'), txt=k?k.textContent.trim():'';
  if(!txt||/NOTHING SELECTED/i.test(txt)) return null;
  const i=txt.lastIndexOf('·'); if(i<0) return null;
  const id=txt.slice(i+1).trim();
  return id?(/^[LR]·/.test(txt)?txt.slice(0,2):'')+id:null;
}
const meshesOf=id=>{ const t=td(); return t&&id?t.pickables.filter(m=>m.userData.id===id):[]; };
function syncSelection(){ selId=readSelection(); openBtn.hidden=!!S||!meshesOf(selId).length; }
new MutationObserver(syncSelection).observe(card,{childList:true,subtree:true,characterData:true});
const plate=$('#plateName');   // rewritten on every rebuild: arm, single/bimanual, import
if(plate) new MutationObserver(()=>{ if(S) finish(); syncSelection(); }).observe(plate,{childList:true,characterData:true,subtree:true});

/* ---- the inspect layer: its own renderer, lit like a part on a bench, everything in camera space ---- */
let R=null, scn=null, cam=null, failed=false;
function ensureRenderer(){
  if(R||failed) return R;
  try{
    R=new THREE.WebGLRenderer({canvas:el.cv,antialias:true,alpha:true});
    R.outputEncoding=THREE.sRGBEncoding; R.toneMapping=THREE.ACESFilmicToneMapping; R.toneMappingExposure=1;
    R.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); R.setClearColor(0x000000,0);
    scn=new THREE.Scene();
    const pm=new THREE.PMREMGenerator(R); scn.environment=pm.fromScene(new THREE.RoomEnvironment(),.04).texture; pm.dispose();
    const key=new THREE.DirectionalLight(0xffffff,1); key.position.set(-2,3,1.5); key.target.position.set(0,0,-CFG.depth);
    const rim=new THREE.DirectionalLight(0xffffff,.5); rim.position.set(2.5,-.3,-3.5); rim.target.position.set(0,0,-CFG.depth);
    scn.add(key,key.target,rim,rim.target,new THREE.HemisphereLight(0xffffff,0x55606a,.15));
    cam=new THREE.PerspectiveCamera(36,1,.005,50);
  }catch(e){ failed=true; R=null; }
  return R;
}

const V3=THREE.Vector3, M4=THREE.Matrix4, Qt=THREE.Quaternion;
const AX=new V3(1,0,0), _m=new M4(), _d=new M4(), _p=new V3(), _q=new Qt(), _s=new V3(), qT=new Qt(), q2=new Qt(), pT=new V3();
const clampPitch=p=>Math.max(-1.4,Math.min(1.4,p));
const clampZoom=z=>Math.max(CFG.zoomMin,Math.min(CFG.zoomMax,z));

/* Where the part sits in the robot right now, as a pivot pose in camera space. It follows the camera and any
   explode or joint motion: pivot = view × (part motion since opening) × inner⁻¹. */
function seenPose(){
  const c=td().camera; c.updateMatrixWorld();
  S.m0.updateWorldMatrix(true,false);
  _m.copy(c.matrixWorldInverse).multiply(_d.copy(S.m0.matrixWorld).multiply(S.w0inv)).multiply(S.innerInv);
  _m.decompose(_p,_q,_s);
  return {pos:_p.clone(),quat:_q.clone(),scale:_s.x};
}

function open(){
  const t=td(); if(S||!t||!t.ready) return;
  const ms=meshesOf(selId); if(!ms.length) return;
  if(!ensureRenderer()){ say('Inspect 360° needs a second 3D view, which this browser could not open.'); return; }
  const c=t.camera; c.updateMatrixWorld();
  const box=new THREE.Box3();
  ms.forEach(m=>{ m.updateWorldMatrix(true,false); box.expandByObject(m); });
  const sph=box.getBoundingSphere(new THREE.Sphere());
  // inner: world → camera-aligned axes, centred on the part, so the pivot alone carries position, turn and size
  const inner=new THREE.Group(); inner.matrixAutoUpdate=false;
  inner.matrix.extractRotation(c.matrixWorldInverse).multiply(new M4().makeTranslation(-sph.center.x,-sph.center.y,-sph.center.z));
  ms.forEach(m=>{
    const src=m.material, ud=src.userData||{};
    // the part's own finish, without the selection glow; both faces drawn for thin shells
    const mat=new THREE.MeshStandardMaterial({color:src.color.clone(),metalness:src.metalness,roughness:src.roughness,envMapIntensity:.65,
      emissive:(ud.baseEmissive||new THREE.Color(0)).clone(),emissiveIntensity:ud.baseEI!=null?ud.baseEI:0,side:THREE.DoubleSide});
    const k=new THREE.Mesh(m.geometry,mat); k.matrixAutoUpdate=false; k.matrix.copy(m.matrixWorld); inner.add(k);
  });
  const pivot=new THREE.Group(); pivot.add(inner); scn.add(pivot);
  const now=performance.now()/1000, meta=ms[0].userData.meta||{};
  S={ms,m0:ms[0],w0inv:ms[0].matrixWorld.clone().invert(),innerInv:inner.matrix.clone().invert(),pivot,inner,
     r:Math.max(sph.radius,1e-4),up:new V3(0,1,0).applyMatrix4(new M4().extractRotation(c.matrixWorldInverse)).normalize(),
     phase:'in',t0:now,last:now,w:0,h:0,barPx:-1,
     yaw:0,pitch:0,phi:0,zoom:1,gain:0,vYaw:0,vPitch:0,spin:!RM.matches,idleUntil:0,
     dragging:false,pointers:new Map(),pinch:0,lastPt:null,raf:0,outFrom:null,from:null};
  S.from=seenPose();
  pivot.position.copy(S.from.pos); pivot.quaternion.copy(S.from.quat); pivot.scale.setScalar(S.from.scale);
  cam.fov=c.fov; cam.near=c.near; cam.far=c.far; cam.updateProjectionMatrix();
  const pv=PROV[meta.prov]||PROV.user, man=t.arms[0]&&t.arms[0].man, lk=man&&man.links&&man.links[meta.link];
  el.name.innerHTML='<span class="badge '+pv[1]+'"><i></i>'+pv[0]+'</span><b>'+esc(meta.label||'Part')+'</b>';
  el.meta.textContent=[(ms[0].userData.arm||'')+((lk&&lk.name)||meta.link||''),
    coarse()?'drag to turn · pinch to zoom':'drag to turn · scroll to zoom · Esc to return'].filter(Boolean).join(' · ');
  setSpinButton();
  el.cv.setAttribute('aria-label',(meta.label||'Part')+'. Arrow keys turn it, plus and minus zoom, Space pauses, Escape returns it to the robot.');
  el.veil.style.opacity='0'; el.cv.style.opacity='0'; el.scale.classList.remove('on');
  wrap.hidden=false; openBtn.hidden=true;
  el.cv.focus({preventScroll:true});
  say('Inspecting '+(meta.label||'part')+'. Drag to turn it, scroll or pinch to zoom, Escape to put it back.');
  S.raf=requestAnimationFrame(frame);
}

function fitSize(){
  const w=el.cv.clientWidth||1, h=el.cv.clientHeight||1;
  if(w!==S.w||h!==S.h){ S.w=w; S.h=h; R.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); }
}

/* Scale bar: real length at the part's centre, picked so the bar is 56–150 px long. */
const STEPS=[.0002,.0005,.001,.002,.005,.01,.02,.05,.1,.2,.5,1];
function updateScaleBar(s){
  const pxPerM=s*(S.h/2)/(CFG.depth*Math.tan(THREE.MathUtils.degToRad(cam.fov)/2));
  let L=STEPS[STEPS.length-1];
  for(const v of STEPS){ if(v*pxPerM>=56){ L=v; break; } }
  const px=Math.round(L*pxPerM);
  if(px===S.barPx) return;
  S.barPx=px; el.scaleBar.style.width=px+'px';
  const mm=L*1000; el.scaleText.textContent=(mm>=1?mm.toFixed(0):mm.toFixed(1))+' mm';
}

function frame(now){
  if(!S) return;
  S.raf=requestAnimationFrame(frame);
  const ts=now/1000, dt=Math.min(Math.max(ts-S.last,0),.1); S.last=ts;
  fitSize();
  if(S.phase!=='out'){
    // the slow revolve eases in whenever the part is left alone; a flick carries on and fades
    const still=!S.dragging&&ts>=S.idleUntil;
    S.gain+=((S.spin&&still?1:0)-S.gain)*Math.min(1,dt*1.5);
    S.yaw+=CFG.spin*S.gain*dt; S.phi+=CFG.tiltRate*S.gain*dt;
    S.pitch+=(CFG.tilt*Math.sin(S.phi)-S.pitch)*Math.min(1,dt*.8)*S.gain;
    if(!S.dragging){ S.yaw+=S.vYaw*dt; S.pitch+=S.vPitch*dt; const k=Math.exp(-dt*3.5); S.vYaw*=k; S.vPitch*=k; }
    S.pitch=clampPitch(S.pitch);
  }
  // centred pose: turntable about the robot's vertical (as seen), then tilt about the view's horizontal
  const fit=CFG.fill*CFG.depth*Math.tan(THREE.MathUtils.degToRad(cam.fov)/2)*Math.min(1,cam.aspect);
  const s=fit/S.r*S.zoom;
  qT.setFromAxisAngle(AX,S.pitch).multiply(q2.setFromAxisAngle(S.up,S.yaw));
  pT.set(0,0,-CFG.depth);
  const P=S.pivot;
  if(S.phase==='in'){
    const p=RM.matches?1:Math.min(1,(ts-S.t0)/CFG.inDur), e=1-Math.pow(1-p,3);
    P.position.lerpVectors(S.from.pos,pT,e); P.quaternion.slerpQuaternions(S.from.quat,qT,e);
    P.scale.setScalar(S.from.scale+(s-S.from.scale)*e);
    el.veil.style.opacity=String(CFG.veil*e); el.cv.style.opacity=String(Math.min(1,p*6));
    if(p>=1){ S.phase='on'; el.scale.classList.add('on'); }
  }else if(S.phase==='on'){
    P.position.copy(pT); P.quaternion.copy(qT); P.scale.setScalar(s);
    updateScaleBar(s);
  }else{
    const p=RM.matches?1:Math.min(1,(ts-S.t0)/CFG.outDur), e=p*p*(3-2*p), to=seenPose();
    P.position.lerpVectors(S.outFrom.pos,to.pos,e); P.quaternion.slerpQuaternions(S.outFrom.quat,to.quat,e);
    P.scale.setScalar(S.outFrom.scale+(to.scale-S.outFrom.scale)*e);
    el.veil.style.opacity=String(CFG.veil*(1-e)); el.cv.style.opacity=String(Math.min(1,(1-p)*4));
    if(p>=1){ finish(); return; }
  }
  R.render(scn,cam);
}

/* Done / Esc: glide back into the robot, to wherever the part is now. */
function close(){
  if(!S||S.phase==='out') return;
  S.phase='out'; S.t0=performance.now()/1000;
  S.outFrom={pos:S.pivot.position.clone(),quat:S.pivot.quaternion.clone(),scale:S.pivot.scale.x};
  S.dragging=false; S.pointers.clear();
  el.scale.classList.remove('on'); el.cv.classList.remove('ix-grab');
}
function finish(){
  if(!S) return;
  cancelAnimationFrame(S.raf);
  scn.remove(S.pivot);
  S.inner.children.forEach(k=>k.material.dispose()); // the geometry belongs to the page, so it stays
  const hadFocus=wrap.contains(document.activeElement);
  S=null;
  wrap.hidden=true; el.veil.style.opacity='0'; el.cv.style.opacity='0'; el.scale.classList.remove('on');
  R.clear();
  syncSelection();
  if(hadFocus&&!openBtn.hidden) openBtn.focus({preventScroll:true});
}

function setSpinButton(){
  const on=!!(S&&S.spin);
  el.spin.textContent=on?'Pause':'Spin';
  el.spin.setAttribute('aria-label',on?'Pause the slow turn':'Resume the slow turn');
}
function toggleSpin(){ if(!S) return; S.spin=!S.spin; S.idleUntil=0; setSpinButton(); }

/* ---- input: drag turns, two fingers or the wheel zoom, keys turn and zoom ---- */
const pinchDist=m=>{ const [a,b]=[...m.values()]; return Math.hypot(a.x-b.x,a.y-b.y); };
el.cv.addEventListener('pointerdown',e=>{
  if(!S||S.phase==='out') return;
  S.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  try{ el.cv.setPointerCapture(e.pointerId); }catch(_){}
  if(S.pointers.size===1){ S.dragging=true; S.lastPt={x:e.clientX,y:e.clientY,t:performance.now()}; S.vYaw=S.vPitch=0; el.cv.classList.add('ix-grab'); }
  else if(S.pointers.size===2){ S.dragging=false; S.pinch=pinchDist(S.pointers); }
});
el.cv.addEventListener('pointermove',e=>{
  if(!S||!S.pointers.has(e.pointerId)) return;
  S.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(S.pointers.size>=2){ const d=pinchDist(S.pointers); if(S.pinch>0) S.zoom=clampZoom(S.zoom*d/S.pinch); S.pinch=d; return; }
  if(!S.dragging) return;
  const now=performance.now(), dx=e.clientX-S.lastPt.x, dy=e.clientY-S.lastPt.y, dt=Math.max(8,now-S.lastPt.t)/1000;
  S.yaw+=dx*CFG.drag;                              // drag right: the front turns right
  S.pitch=clampPitch(S.pitch+dy*CFG.drag);        // drag down: the top tips towards you
  S.vYaw=S.vYaw*.5+(dx*CFG.drag/dt)*.5; S.vPitch=S.vPitch*.5+(dy*CFG.drag/dt)*.5;
  S.lastPt={x:e.clientX,y:e.clientY,t:now};
  S.idleUntil=performance.now()/1000+CFG.resume;
});
function pointerEnd(e){
  if(!S||!S.pointers.has(e.pointerId)) return;
  S.pointers.delete(e.pointerId);
  if(S.pointers.size===1){ const p=[...S.pointers.values()][0]; S.dragging=true; S.lastPt={x:p.x,y:p.y,t:performance.now()}; S.vYaw=S.vPitch=0; return; }
  if(S.pointers.size===0){
    if(!S.lastPt||performance.now()-S.lastPt.t>90||RM.matches) S.vYaw=S.vPitch=0;   // a stop before letting go shouldn't fling
    S.vYaw=Math.max(-6,Math.min(6,S.vYaw)); S.vPitch=Math.max(-6,Math.min(6,S.vPitch));
    S.dragging=false; S.idleUntil=performance.now()/1000+CFG.resume; el.cv.classList.remove('ix-grab');
  }
}
el.cv.addEventListener('pointerup',pointerEnd);
el.cv.addEventListener('pointercancel',pointerEnd);
el.cv.addEventListener('wheel',e=>{ if(!S) return; e.preventDefault(); S.zoom=clampZoom(S.zoom*Math.exp(-e.deltaY*.0015)); },{passive:false});
el.cv.addEventListener('keydown',e=>{
  if(!S||e.altKey||e.ctrlKey||e.metaKey) return;
  const STEP=.26;   // ≈ 15° per press; held keys repeat
  const turn=(dy,dp)=>{
    if(RM.matches){ S.yaw+=dy; S.pitch=clampPitch(S.pitch+dp); }
    else { S.vYaw+=dy*3.5; S.vPitch+=dp*3.5; }   // an impulse that glides exactly one step
    S.idleUntil=performance.now()/1000+CFG.resume;
  };
  switch(e.key){
    case 'ArrowLeft': turn(-STEP,0); break;
    case 'ArrowRight': turn(STEP,0); break;
    case 'ArrowUp': turn(0,-STEP); break;
    case 'ArrowDown': turn(0,STEP); break;
    case '+': case '=': S.zoom=clampZoom(S.zoom*1.15); break;
    case '-': case '_': S.zoom=clampZoom(S.zoom/1.15); break;
    case ' ': toggleSpin(); break;
    default: return;
  }
  e.preventDefault();
});
window.addEventListener('keydown',e=>{
  const tag=e.target&&e.target.tagName;
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||e.altKey||e.ctrlKey||e.metaKey) return;
  if(S&&e.key==='Escape'){ close(); e.preventDefault(); }
  else if(!S&&(e.key==='i'||e.key==='I')&&!openBtn.hidden){ open(); e.preventDefault(); }
});
openBtn.addEventListener('click',open);
el.done.addEventListener('click',close);
el.spin.addEventListener('click',toggleSpin);
syncSelection();
})();
