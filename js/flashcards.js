/* Flashcards (additive). Reads the page only through window.__teardown and existing DOM state;
   writes nothing outside #flashcards. "Locate in 3D" uses the page's own selection hook. */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const box=$('#fc'); if(!box) return;
const el={top:$('#fc-top'),bar:$('#fc-bar'),card:$('#fc-card'),pic:$('#fc-pic'),thumb:$('#fc-thumb'),name:$('#fc-name'),q:$('#fc-q'),back:$('#fc-back'),
  a:$('#fc-a'),root:$('#fc-root'),terms:$('#fc-terms'),prev:$('#fc-prev'),next:$('#fc-next'),flip:$('#fc-flip'),
  locate:$('#fc-locate'),hint:$('#fc-hint'),live:$('#fc-live'),empty:$('#fc-empty'),nav:$('#flashcards .fc-nav')};
const PROV={mesh:['Official mesh','p-mesh'],doc:['Documented spec','p-doc'],std:['Standard part','p-std'],est:['Estimated','p-est']};
const LAYER={shell:'Exterior',hw:'Hardware',internal:'Internal'};
const LAYER_BTN={shell:'Exterior',hw:'Hardware',internal:'Internals'};
const DECKS=['ur5e','panda','arx5'];
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,String(v))}catch(e){}}};
const cache={};
let arm=null, deck=null, i=0, open=false, inst=0, seq=0;
const td=()=>window.__teardown;
const N=()=>deck?deck.cards.length:0;
const where=l=>l.length<=2?l.join(' · '):l.slice(0,2).join(' · ')+' +'+(l.length-2);

async function getDeck(id){
  if(cache[id]) return cache[id];
  const r=await fetch('models/'+id+'.cards.json');
  if(!r.ok) throw new Error('HTTP '+r.status);
  return (cache[id]=await r.json());
}

/* Called whenever the page rebuilds (the plate title is rewritten on every rebuild). */
async function sync(){
  const t=td(), a0=t&&t.arms&&t.arms[0], id=a0&&a0.man&&a0.man.id;
  if(!id) return;
  if(id===arm){ if(deck){ inst=0; el.hint.textContent=''; drawThumb(); } return; }
  arm=id; deck=null; const my=++seq;
  if(DECKS.indexOf(id)<0){ box.hidden=true; el.empty.hidden=false; return; }
  box.hidden=false; el.empty.hidden=true;
  el.top.innerHTML='<span>Loading flashcards…</span>'; el.name.textContent=''; el.q.textContent=''; setOpen(false);
  try{ const d=await getDeck(id); if(my!==seq) return; deck=d; }
  catch(e){ if(my!==seq) return; el.top.innerHTML=''; el.name.textContent='Flashcards did not load';
    el.q.textContent='The card file for this arm could not be fetched ('+e.message+'). Reload the page to try again.'; return; }
  const s=parseInt(store.get('teardown.fc.'+id),10);
  i=Number.isInteger(s)&&s>=0&&s<N()?s:0;
  render();
}

function render(){
  const c=deck.cards[i], n=N(), pv=PROV[c.prov]||PROV.est;
  inst=0;
  el.top.innerHTML='<span class="badge '+pv[1]+'"><i></i>'+pv[0]+'</span><span>×'+c.count+' · '+LAYER[c.layer]+'</span>'+
    '<span class="fc-where">'+esc(where(c.links))+'</span><span class="fc-count">'+(i+1)+' / '+n+'</span>';
  el.bar.style.width=((i+1)/n*100).toFixed(2)+'%';
  el.card.setAttribute('aria-label',(i+1)+' of '+n);
  el.name.textContent=c.label; el.q.textContent=c.q; el.a.textContent=c.a;
  el.root.hidden=!c.root; el.root.textContent=c.root?'Root: '+c.root:'';
  el.terms.hidden=!c.terms; el.terms.textContent=c.terms?'Terms: '+c.terms:'';
  el.thumb.setAttribute('aria-label','Render of '+c.label);
  el.hint.textContent='';
  setOpen(false);
  drawThumb();
}
function setOpen(v){ open=v; el.back.hidden=!v; el.flip.setAttribute('aria-expanded',String(v)); el.flip.textContent=v?'Hide answer':'Reveal answer'; }
/* Flip by the user. On reveal, scroll only the rail (never the page), and only as far as needed, so the answer
   (and, where the arrows are not pinned, the arrows) are in view. */
function flip(){
  if(!deck) return; setOpen(!open);
  if(!open||!rail) return;
  const rr=rail.getBoundingClientRect(), br=el.back.getBoundingClientRect(), nv=el.nav.getBoundingClientRect();
  const pinned=getComputedStyle(el.nav).position==='sticky';
  const want=pinned?br.bottom:Math.max(br.bottom,nv.bottom), limit=rr.bottom-(pinned?nv.height:0)-8;
  const d=Math.min(want-limit, br.top-rr.top-8);
  if(d>1) rail.scrollBy({top:d,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
function to(k){
  if(!deck) return;
  i=((k%N())+N())%N(); store.set('teardown.fc.'+arm,i); render();
  el.live.textContent='Card '+(i+1)+' of '+N()+': '+deck.cards[i].label;
}
const go=d=>to(i+d);

el.prev.addEventListener('click',()=>go(-1));
el.next.addEventListener('click',()=>go(1));
el.flip.addEventListener('click',flip);
box.addEventListener('keydown',e=>{
  if(!deck||e.altKey||e.ctrlKey||e.metaKey) return;
  const k=e.key;
  if(k==='ArrowRight'){go(1);e.preventDefault();}
  else if(k==='ArrowLeft'){go(-1);e.preventDefault();}
  else if(k==='Home'){to(0);e.preventDefault();}
  else if(k==='End'){to(N()-1);e.preventDefault();}
  else if((k===' '||k==='Enter')&&e.target===box){flip();e.preventDefault();}
});
/* Tap the card to flip it; swipe it left or right to move. */
let p0=null;
el.card.addEventListener('pointerdown',e=>{ if(e.button>0) return; p0={x:e.clientX,y:e.clientY}; });
el.card.addEventListener('pointercancel',()=>{ p0=null; });
el.card.addEventListener('pointerup',e=>{
  if(!p0||!deck) return;
  const dx=e.clientX-p0.x, dy=e.clientY-p0.y; p0=null;
  if(Math.abs(dx)>40&&Math.abs(dx)>1.5*Math.abs(dy)) go(dx<0?1:-1);
  else if(Math.abs(dx)<8&&Math.abs(dy)<8) flip();
});

/* Locate in 3D: the page's own selection, stepping through every instance of this part type. */
el.locate.addEventListener('click',()=>{
  const t=td(); if(!deck||!t) return;
  const c=deck.cards[i], P=t.pickables, n=c.parts.length, key=c.parts[inst%n];
  const idx=P.findIndex(m=>m.userData.id===key||m.userData.id==='L·'+key);
  if(idx<0){ el.hint.textContent='That part is not in the current view.'; return; }
  t.select(idx);
  const m=P[idx];
  let msg=n>1?'Showing '+(inst%n+1)+' of '+n+'; press again for the next one.':'Selected in the 3D view.';
  if(!m.visible) msg+=' Its layer is switched off: turn on '+LAYER_BTN[c.layer]+' above to see it.';
  else if(c.layer==='internal'){
    const x=$('#xray'), ex=$('#explode'), tv=ex?parseFloat(ex.value)||0:0;
    if(x&&x.getAttribute('aria-pressed')!=='true'&&tv<0.3) msg+=' It sits inside its housing: turn on X-ray shells or raise the explode slider past 0.3.';
  }
  el.hint.textContent=msg; inst++;
});

/* Card render: a second, lazily created renderer draws one still frame of the part's real mesh. */
let R=null, S=null, C=null, tmp=null, failed=false, seen=false;
function ensure(){
  if(R||failed) return R;
  try{
    R=new THREE.WebGLRenderer({canvas:el.thumb,antialias:true,alpha:true});
    R.outputEncoding=THREE.sRGBEncoding; R.toneMapping=THREE.ACESFilmicToneMapping; R.toneMappingExposure=1.05;
    R.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); R.setClearColor(0x000000,0);
    S=new THREE.Scene();
    const pm=new THREE.PMREMGenerator(R); S.environment=pm.fromScene(new THREE.RoomEnvironment(),0.04).texture; pm.dispose();
    /* Key light above the camera for form; a low rim light behind the part catches its edges without lighting flat tops. */
    const k=new THREE.DirectionalLight(0xffffff,1.5); k.position.set(2,3.2,1.5); S.add(k);
    const rim=new THREE.DirectionalLight(0xffffff,.7); rim.position.set(-2,-0.4,-2.2); S.add(rim);
    S.add(new THREE.HemisphereLight(0xffffff,0x55606a,.25));
    C=new THREE.PerspectiveCamera(28,1,1e-4,10);
  }catch(e){ failed=true; R=null; el.pic.hidden=true; el.card.classList.add('fc-nothumb'); }
  return R;
}
function drawThumb(){
  if(!deck||failed||!seen) return;
  const t=td(); if(!t||!ensure()) return;
  const c=deck.cards[i];
  const m=t.pickables.find(x=>x.userData.id===c.parts[0]||x.userData.id==='L·'+c.parts[0]);
  if(tmp){ S.remove(tmp); tmp.material.dispose(); tmp=null; }
  const w=Math.max(1,Math.round(el.thumb.clientWidth||112)); R.setSize(w,w,false);
  if(!m){ R.clear(); return; }
  const src=m.material, V=THREE.Vector3;
  const mat=new THREE.MeshStandardMaterial({color:src.color.clone(),metalness:src.metalness,roughness:src.roughness,side:THREE.DoubleSide,envMapIntensity:.45+.5*src.metalness});
  tmp=new THREE.Mesh(m.geometry,mat); tmp.matrixAutoUpdate=false;
  m.updateMatrix(); const L=m.matrix.clone();
  const meta=m.userData.meta; let up;
  if(meta.explode&&meta.explode.dir){ up=new V().fromArray(meta.explode.dir).normalize(); }
  else{
    if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const s=m.geometry.boundingBox.clone().applyMatrix4(L).getSize(new V());
    up=s.x<=s.y&&s.x<=s.z?new V(1,0,0):s.y<=s.z?new V(0,1,0):new V(0,0,1);
  }
  tmp.matrix.makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up,new V(0,1,0))).multiply(L);
  tmp.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(tmp), ctr=b.getCenter(new V());
  tmp.matrix.premultiply(new THREE.Matrix4().makeTranslation(-ctr.x,-ctr.y,-ctr.z)); tmp.updateMatrixWorld(true);
  const r=Math.max(1e-4,b.getSize(new V()).length()/2), d=r/Math.sin(C.fov*Math.PI/360)*1.02;
  C.position.copy(new V(0.95,0.62,1.1).normalize().multiplyScalar(d)); C.near=d/100; C.far=d*10; C.lookAt(0,0,0); C.updateProjectionMatrix();
  S.add(tmp); R.render(S,C);
}
if('IntersectionObserver' in window){
  new IntersectionObserver(es=>{ if(!seen&&es.some(e=>e.isIntersecting)){ seen=true; drawThumb(); } }).observe(el.thumb);
} else seen=true;
/* Sticky arrows stop at the scrolling panel's padding edge; offset them by that padding so they sit flush with its bottom. */
const rail=box.closest('.rail'), sec=$('#flashcards');
function stick(){ if(rail&&sec) sec.style.setProperty('--fc-stick',(-(parseFloat(getComputedStyle(rail).paddingBottom)||0))+'px'); }
stick(); window.addEventListener('resize',stick);
/* Redraw at the new size if the render box changes (for example, a phone rotating across the 380 px breakpoint). */
if('ResizeObserver' in window){ let lw=0; new ResizeObserver(()=>{ const w=el.pic.clientWidth; if(w&&w!==lw){ lw=w; drawThumb(); } }).observe(el.pic); }

const plate=$('#plateName');
if(plate) new MutationObserver(()=>{ sync(); }).observe(plate,{childList:true,characterData:true,subtree:true});
(function boot(){ const t=td(); if(t&&t.ready) sync(); else setTimeout(boot,200); })();
})();
