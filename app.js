const CFG = window.CFG;
(g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({key:CFG.MAPS_KEY,v:"weekly",language:"ko",region:"JP"});

const CATS = {
  shop:{label:'쇼핑',c:'#E0457B',t:'#FCE8EF',em:'🛍️'},
  food:{label:'맛집',c:'#EE7A1F',t:'#FDEFE3',em:'🍜'},
  cafe:{label:'카페',c:'#8B5E3C',t:'#F3EBE4',em:'☕'},
  bar:{label:'술집',c:'#7B4FD6',t:'#EFE8FB',em:'🍺'},
  play:{label:'놀거리',c:'#2F6FE0',t:'#E7EEFC',em:'🎡'},
  stay:{label:'숙소',c:'#1F9D6B',t:'#E6F5EE',em:'🏨'}
};
const OSAKA = {south:34.640,west:135.425,north:34.715,east:135.535};
const AREAS = ['숙소','우메다','오사카성','난바','신세카이','베이','교토','나라','고베','아리마'];
const AREA_PTS = [['우메다',34.703,135.500],['오사카성',34.687,135.526],['난바',34.667,135.502],['신세카이',34.650,135.508],['베이',34.660,135.432],['교토',35.000,135.760],['나라',34.685,135.835],['고베',34.690,135.190],['아리마',34.797,135.247]];
const DAYS = [{n:1,d:'1/4'},{n:2,d:'1/5'},{n:3,d:'1/6'},{n:4,d:'1/7'},{n:5,d:'1/8'}];
const POI_OFF = [{featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},{featureType:'poi.business',stylers:[{visibility:'off'}]}];
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;

let map, layer, Place, PlaceAutocompleteElement;
let places = [];
const markers = new Map();
const catOn = new Set(Object.keys(CATS));
let selId = null, mode = 0, navDay = 0;
let listDay = 'all', listCat = 'all';
const placeCache = new Map();

const $ = s=>document.querySelector(s);
const byId = id=>places.find(x=>x.id===id);
const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ms = n=>`<span class="ms">${n}</span>`;
const icon = k=>{const c=CATS[k]||CATS.play;return `<span class="ic" style="--c:${c.c}">${c.em}</span>`};
const toMin = t=>{const m=/^(\d{1,2}):(\d{2})$/.exec(t||''); return m?(+m[1])*60+(+m[2]):null};
const toHM = n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const goOf = p=>{const a=toMin(p.time); return a!=null&&p.mins?toHM(a-p.mins):''};
function toast(m){const t=$('#toast');t.style.top=($('#top').offsetHeight+12)+'px';t.textContent=m;t.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.display='none',2400)}
function store(k,v){try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v) }catch(e){ return null }}
function pad(){return {top:$('#top').offsetHeight+48,bottom:80,left:32,right:32}}

// ---------- 서버 ----------
let token = store('token')||'';
async function run(fn,...args){
  const res = await fetch(CFG.API_URL,{method:'POST',body:JSON.stringify({token,fn,args})});
  const j = await res.json();
  if(!j.ok){ if(j.error==='auth') showGate('코드가 맞지 않아'); throw new Error(j.error||'error') }
  return j.data;
}
function showGate(err){ $('#gate').hidden=false; $('#gateErr').textContent=err||''; setTimeout(()=>$('#gateCode').focus(),100) }
$('#gateGo').onclick=async()=>{
  token=$('#gateCode').value.trim().toUpperCase(); $('#gateErr').textContent='확인 중...';
  try{ places=await run('listPlaces'); store('token',token); $('#gate').hidden=true; refresh(); fitMode() }
  catch(e){ $('#gateErr').textContent='코드가 맞지 않아' }
};

// ---------- 글자 크기, 구글 장소 ----------
let lfs = Number(store('lfs'))||14;
let poiOn = store('poi')!=='0';
function applyFont(){ document.body.style.setProperty('--lfs',lfs+'px') }
applyFont();
function renderPoi(){ const b=$('#poiBtn'); b.classList.toggle('off',!poiOn); b.innerHTML=ms(poiOn?'layers':'layers_clear') }
renderPoi();
$('#poiBtn').onclick=()=>{
  poiOn=!poiOn; store('poi',poiOn?'1':'0'); renderPoi();
  if(map) map.setOptions({styles:poiOn?[]:POI_OFF});
  toast(poiOn?'구글 장소 보이기':'구글 장소 숨김');
};

// ---------- 알림 ----------
let swReg=null, pushState='unknown';
function b64u(s){ const p='='.repeat((4-s.length%4)%4); const b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(b,c=>c.charCodeAt(0)) }
async function initPush(){
  if(!('serviceWorker' in navigator)){ pushState='unsupported'; return renderPushUI() }
  try{ swReg=await navigator.serviceWorker.register('sw.js') }catch(e){ pushState='unsupported'; return renderPushUI() }
  if(!('PushManager' in window) || !('Notification' in window)){ pushState = isIOS&&!isStandalone ? 'install' : 'unsupported'; return renderPushUI() }
  const sub=await swReg.pushManager.getSubscription();
  pushState = sub ? 'on' : (Notification.permission==='denied' ? 'denied' : 'off');
  if(sub && token) run('subscribe',sub.toJSON(),deviceName()).catch(()=>{});
  renderPushUI();
}
function deviceName(){ return (isIOS?'iPhone':'') + ' ' + (navigator.userAgent.match(/\(([^)]+)\)/)||['',''])[1].slice(0,40) }
async function enablePush(){
  try{
    const perm=await Notification.requestPermission();
    if(perm!=='granted'){ pushState='denied'; renderPushUI(); return }
    const sub=await swReg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(CFG.VAPID_PUB)});
    await run('subscribe',sub.toJSON(),deviceName());
    pushState='on'; renderPushUI(); toast('알림 켰어');
  }catch(e){ toast('알림을 켜지 못했어'); }
}
async function testPush(){
  const sub=swReg&&await swReg.pushManager.getSubscription(); if(!sub) return;
  try{ await run('testPush',sub.endpoint); toast('테스트 알림 보냈어') }catch(e){ toast('보내지 못했어') }
}
function pushCard(){
  if(pushState==='off') return `<div class="pushcard">출발 5분 전에 알림을 받으려면 이 폰에서 알림을 켜줘.<button class="btn dark" data-push="on">${ms('notifications')}알림 켜기</button></div>`;
  if(pushState==='install') return `<div class="pushcard">아이폰은 사파리 공유 버튼에서 '홈 화면에 추가'를 누르고, 홈 화면 아이콘으로 열어야 알림을 켤 수 있어.</div>`;
  if(pushState==='denied') return `<div class="pushcard">알림이 꺼져 있어. 아이폰 설정 → 알림 → 오사카 여행에서 허용해줘.</div>`;
  return '';
}
function renderPushUI(){
  if($('#nav').classList.contains('open')) $('#navPush').innerHTML=pushCard();
  if($('#set').classList.contains('open')) renderSet();
}
document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('[data-push]'); if(!b) return;
  if(b.dataset.push==='on') enablePush(); else testPush();
});

// ---------- 일정 ----------
function dayItems(d){ return places.filter(p=>p.day===d).sort((a,b)=>(a.ord-b.ord)||(a.t-b.t)) }
function numOf(p){ return dayItems(p.day).indexOf(p)+1 }
function onMap(p){
  if(p.cat==='stay') return true;
  if(!catOn.has(p.cat)) return false;
  if(!mode) return true;
  return p.day===mode && !p.done;
}
function patchLocal(p,patch){ Object.assign(p,patch) }
let pending=0, lastLocal=0;
async function save(list){
  pending++; lastLocal=Date.now();
  try{ const r=await run('updateMany',list); return r||true }catch(e){ toast('저장하지 못했어. 다시 해봐'); return false }
  finally{ pending--; lastLocal=Date.now() }
}
let syncT=0;
function scheduleSync(){
  clearTimeout(syncT);
  syncT=setTimeout(async()=>{ try{ const r=await run('syncLegs'); if(r&&r.minsChanged) load() }catch(e){} },2000);
}
function setDay(p,d){
  const patch = p.day===d ? {day:0,ord:0,done:0} : {day:d,ord:Math.max(0,...dayItems(d).map(x=>x.ord))+1,done:0};
  patchLocal(p,patch); save([[p.id,patch]]).then(scheduleSync);
  refresh();
  if(patch.day) toast(`${d}일차에 넣었어`);
}
function toggleDone(p){
  const patch={done:p.done?0:1}; patchLocal(p,patch); save([[p.id,patch]]);
  refresh();
}
function refresh(){
  renderTop(); renderMarkers();
  if($('#list').classList.contains('open')) renderList();
  if($('#nav').classList.contains('open')) renderNav();
  if(selId && $('#detail').classList.contains('open')) openDetail(selId,true,true);
}

// ---------- 위쪽 칩 ----------
function renderTop(){
  $('#days').innerHTML = `<button class="chip ${mode?'':'on'}" data-day="0">모든 장소</button>`+
    DAYS.map(x=>`<button class="chip day ${mode===x.n?'on':''}" data-day="${x.n}">${x.n}일차<span class="sd">${x.d}</span></button>`).join('');
  const pool = mode ? dayItems(mode) : places;
  const cnt={}; pool.forEach(p=>cnt[p.cat]=(cnt[p.cat]||0)+1);
  $('#cats').innerHTML = Object.entries(CATS).filter(([k])=>k!=='stay').map(([k,v])=>`<button class="chip cat ${catOn.has(k)?'on':'off'}" data-c="${k}" style="--c:${v.c};--t:${v.t}">${icon(k)}${v.label}<span class="n">${cnt[k]||0}</span></button>`).join('');
  $('#count').textContent = pool.length?`${pool.length}곳`:'';
}
$('#top').addEventListener('click',e=>{
  const dy=e.target.closest('[data-day]'), c=e.target.closest('[data-c]');
  if(dy){ mode=Number(dy.dataset.day); if(mode) navDay=mode; closeSheets(); refresh(); fitMode(); return }
  if(c){
    const k=c.dataset.c, all=Object.keys(CATS).filter(x=>x!=='stay');
    if(all.every(x=>catOn.has(x))){ all.forEach(x=>catOn.delete(x)); catOn.add(k) }
    else if(catOn.has(k)){ catOn.delete(k); if(!all.some(x=>catOn.has(x))) all.forEach(x=>catOn.add(x)) }
    else catOn.add(k);
    refresh();
  }
});
function fitMode(){
  if(!map) return;
  if(!mode){ map.fitBounds(OSAKA,pad()); return }
  const items=dayItems(mode);
  if(!items.length){ toast('아직 넣은 장소가 없어'); return }
  if(items.length===1){ map.setCenter({lat:items[0].lat,lng:items[0].lng}); map.setZoom(15); return }
  const b=new google.maps.LatLngBounds(); items.forEach(p=>b.extend({lat:p.lat,lng:p.lng}));
  map.fitBounds(b,pad());
  google.maps.event.addListenerOnce(map,'idle',()=>{ if(map.getZoom()>16) map.setZoom(16) });
}

// ---------- 핀 ----------
function makeLayer(OverlayView){
  const L=new OverlayView();
  L.onAdd=()=>{ L.root=document.createElement('div'); L.root.className='mklayer'; L.getPanes().overlayMouseTarget.appendChild(L.root); renderMarkers() };
  L.draw=()=>{
    const pr=L.getProjection(); if(!pr||!L.root) return;
    for(const el of markers.values()){
      const pt=pr.fromLatLngToDivPixel(new google.maps.LatLng(el._p.lat,el._p.lng));
      el.style.transform=`translate(${Math.round(pt.x)}px,${Math.round(pt.y)}px)`;
    }
    schedDeclutter();
  };
  L.onRemove=()=>{ if(L.root) L.root.remove() };
  return L;
}
function markerEl(p){
  const c=CATS[p.cat]||CATS.play;
  const el=document.createElement('div');
  el.className='mk'+(p.cat==='stay'?' stay':'')+(p.id===selId?' sel':'');
  el.style.setProperty('--c',c.c); el.style.setProperty('--t',c.t);
  const no = mode && p.day===mode ? `<span class="no">${numOf(p)}</span>` : '';
  el.innerHTML=`<span class="pin"><span class="em">${c.em}</span></span><span class="lbl">${esc(p.name)}${no}</span>`;
  el.addEventListener('click',e=>{ e.stopPropagation(); openDetail(p.id) });
  google.maps.OverlayView.preventMapHitsAndGesturesFrom(el);
  el._p=p;
  el.style.zIndex = p.id===selId?1000:(p.cat==='stay'?500:(mode&&p.day===mode?100:1));
  return el;
}
function renderMarkers(){
  if(!layer||!layer.root) return;
  const keep=new Set();
  places.forEach(p=>{
    if(!onMap(p)) return;
    keep.add(p.id);
    const el=markerEl(p), old=markers.get(p.id);
    if(old) old.replaceWith(el); else layer.root.appendChild(el);
    markers.set(p.id,el);
  });
  for(const [id,el] of markers){ if(!keep.has(id)){ el.remove(); markers.delete(id) } }
  layer.draw();
}
let dq=0;
function schedDeclutter(){ if(dq) return; dq=requestAnimationFrame(()=>{ dq=0; declutter() }) }
function declutter(){
  if(!map) return;
  const small = !mode && map.getZoom()<14;
  document.body.classList.toggle('nolbl', small);
  if(small) return;
  const rank=el=>{const p=el._p; return (p.id===selId?4:0)+(mode&&p.day===mode?2:0)+(p.cat==='stay'?1:0)};
  const items=[...markers.values()].sort((a,b)=>rank(b)-rank(a));
  const placed=items.map(el=>{ const r=el.querySelector('.pin').getBoundingClientRect(); return {el,left:r.left+6,right:r.right-6,top:r.top+4,bottom:r.bottom-4} });
  items.forEach(el=>{
    el.classList.remove('hide');
    const lb=el.querySelector('.lbl'); if(!lb) return;
    const r=lb.getBoundingClientRect();
    if(placed.some(q=>q.el!==el&&!(r.right<q.left||r.left>q.right||r.bottom<q.top||r.top>q.bottom))) el.classList.add('hide'); else placed.push(r);
  });
}

// ---------- 시트 ----------
function closeSheets(except){
  document.querySelectorAll('.sheet,.side').forEach(s=>{ if(s.id!==except) s.classList.remove('open') });
  if(except!=='detail' && selId){ selId=null; renderMarkers() }
}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeSheets()));

function dirUrl(p){ return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}${p.placeId?'&destination_place_id='+encodeURIComponent(p.placeId):''}&travelmode=transit` }
function goUrl(p){ return isIOS ? `comgooglemaps://?daddr=${p.lat},${p.lng}&directionsmode=transit` : dirUrl(p) }
function gmUrl(p,g){ return (g&&g.googleMapsURI) || 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.ja||p.name)+(p.placeId?'&query_place_id='+encodeURIComponent(p.placeId):'') }
function goAttrs(p){ return isIOS ? `href="${goUrl(p)}"` : `href="${dirUrl(p)}" target="_blank" rel="noopener"` }

async function openDetail(id,skipPan,keepScroll){
  const p=byId(id); if(!p) return;
  const body=$('#detailBody'); const st=keepScroll?body.scrollTop:0;
  if(!keepScroll){ selId=id; renderMarkers(); closeSheets('detail') }
  const c=CATS[p.cat]||CATS.play;
  const draw=(g,loading)=>{
    const ph = g&&g.photos&&g.photos.length ? `<div class="photos">${g.photos.slice(0,6).map(ph=>{
        const a=(ph.authorAttributions||[])[0];
        return `<figure><img loading="lazy" src="${esc(ph.getURI({maxHeight:400}))}" alt="">${a?`<figcaption><a href="${esc(a.uri)}" target="_blank" rel="noopener">${esc(a.displayName)}</a></figcaption>`:''}</figure>`}).join('')}</div>`
      : (loading?'<div class="phph"></div>':'');
    const today = g&&g.regularOpeningHours&&g.regularOpeningHours.weekdayDescriptions ? g.regularOpeningHours.weekdayDescriptions[(new Date().getDay()+6)%7] : '';
    body.innerHTML = `${ph}
      <div class="meta"><span class="tag" style="--c:${c.c};--t:${c.t}">${c.em} ${c.label}</span>${p.day?`${p.day}일차 ${numOf(p)}번${p.time?` · ${esc(p.time)}`:''}`:''}</div>
      <div class="pname">${esc(p.name)}</div>
      ${g&&g.rating?`<div class="gline"><span class="star">★ ${g.rating.toFixed(1)}</span> (${(g.userRatingCount||0).toLocaleString()})</div>`:''}
      ${g&&g.formattedAddress?`<div class="gline">${esc(g.formattedAddress)}</div>`:''}
      ${today?`<div class="gline">${esc(today)}</div>`:''}
      ${p.desc?`<div class="pdesc">${esc(p.desc)}</div>`:''}
      ${p.note?`<div class="pnote">${esc(p.note)}</div>`:''}
      <div class="grp">일정</div>
      <div class="dayrow">${DAYS.map(x=>`<button class="chip ${p.day===x.n?'on':''}" data-sd="${x.n}">${x.n}일차</button>`).join('')}</div>
      <div class="actions">
        <a class="btn dark" ${goAttrs(p)}>경로</a>
        <a class="btn line" href="${esc(gmUrl(p,g))}" target="_blank" rel="noopener">구글지도에서 보기</a>
      </div>
      <div class="subacts"><button class="tbtn" id="del">삭제</button></div>`;
    body.querySelectorAll('[data-sd]').forEach(b=>b.onclick=()=>setDay(p,Number(b.dataset.sd)));
    const del=$('#del');
    del.onclick=()=>{
      if(!del.classList.contains('warn')){del.classList.add('warn');del.textContent='한 번 더 누르면 삭제';setTimeout(()=>{if(del.isConnected){del.classList.remove('warn');del.textContent='삭제'}},3000);return}
      removePlace(id);
    };
    if(keepScroll) body.scrollTop=st;
  };
  draw(placeCache.get(id),!placeCache.has(id));
  if(keepScroll) return;
  $('#detail').classList.add('open');
  const proj=()=>{ const pt=pointOf(p); if(!pt) return; const h=map.getDiv().clientHeight; if(pt.y>h*0.3||pt.y<$('#top').offsetHeight) map.panBy(0, pt.y-h*0.25) };
  if(!skipPan) proj();
  if(placeCache.has(id)) return;
  try{
    const g=await placeDetails(p);
    placeCache.set(id,g);
    if(selId===id) draw(g,false);
  }catch(e){ if(selId===id) draw(null,false) }
}
function pointOf(p){
  const pr=layer&&layer.getProjection(); if(!pr) return null;
  return pr.fromLatLngToContainerPixel(new google.maps.LatLng(p.lat,p.lng));
}
function focusPlace(p){
  map.setZoom(Math.max(map.getZoom(),16)); map.setCenter({lat:p.lat,lng:p.lng});
  map.panBy(0, Math.round(map.getDiv().clientHeight*0.25));
  openDetail(p.id,true);
}

// ---------- 구글 장소 정보 ----------
async function resolvePlaceId(p){
  if(p.placeId) return p.placeId;
  const {places:found}=await Place.searchByText({textQuery:p.ja||p.name,fields:['id','location'],locationBias:{center:{lat:p.lat,lng:p.lng},radius:1500},maxResultCount:1,language:'ko'});
  if(!found||!found.length) return '';
  const f=found[0]; const loc=f.location;
  p.placeId=f.id;
  const patch={placeId:f.id};
  if(loc){ const la=loc.lat(), ln=loc.lng(); if(Math.abs(la-p.lat)<0.02&&Math.abs(ln-p.lng)<0.02){ patch.lat=+la.toFixed(6); patch.lng=+ln.toFixed(6); p.lat=patch.lat; p.lng=patch.lng } }
  run('updatePlace',p.id,patch).catch(()=>{});
  return f.id;
}
async function placeDetails(p){
  const pid=await resolvePlaceId(p);
  if(!pid) return null;
  const pl=new Place({id:pid,requestedLanguage:'ko'});
  await pl.fetchFields({fields:['photos','rating','userRatingCount','formattedAddress','regularOpeningHours','googleMapsURI']});
  return pl;
}
async function fixLocations(){
  const todo=places.filter(p=>!p.placeId);
  for(const p of todo){
    try{ await resolvePlaceId(p) }catch(e){}
    await new Promise(r=>setTimeout(r,350));
  }
  if(todo.length){ renderMarkers(); scheduleSync() }
}

// ---------- 목록 ----------
function rowHtml(p){
  return `<div class="row" data-id="${esc(p.id)}">${icon(p.cat)}<div class="rt"><div class="t">${p.time?`<span class="rtime">${esc(p.time)}</span>`:''}${esc(p.name)}</div>${p.desc?`<div class="d">${esc(p.desc)}</div>`:''}</div></div>`;
}
function renderList(){
  const inDay=places.filter(p=>listDay==='all'||p.day===listDay);
  const vis=inDay.filter(p=>listCat==='all'||p.cat===listCat);
  const ccnt={}; inDay.forEach(p=>ccnt[p.cat]=(ccnt[p.cat]||0)+1);
  const chips1 = `<button class="chip ${listDay==='all'?'on':''}" data-ld="all">전체</button>`+
    DAYS.map(x=>`<button class="chip ${listDay===x.n?'on':''}" data-ld="${x.n}">${x.n}일차</button>`).join('')+
    `<button class="chip ${listDay===0?'on':''}" data-ld="0">미정</button>`;
  const chips2 = `<button class="chip ${listCat==='all'?'on':''}" data-lc="all">전체<span class="n">${inDay.length}</span></button>`+
    Object.entries(CATS).map(([k,v])=>`<button class="chip lcat ${listCat===k?'on':''}" data-lc="${k}" style="--c:${v.c};--t:${v.t}">${icon(k)}${v.label}<span class="n">${ccnt[k]||0}</span></button>`).join('');
  const groups=[];
  DAYS.forEach(x=>{ const g=vis.filter(p=>p.day===x.n).sort((a,b)=>(a.ord-b.ord)||(a.t-b.t)); if(g.length) groups.push([`${x.n}일차 ${x.d}`,g]) });
  const rest=vis.filter(p=>!p.day).sort((a,b)=>(AREAS.indexOf(a.area)-AREAS.indexOf(b.area))||a.name.localeCompare(b.name));
  if(rest.length) groups.push(['미정',rest]);
  $('#listBody').innerHTML = `<div class="chips lchips">${chips1}</div><div class="chips lchips">${chips2}</div>`+
    (groups.map(([t,g])=>`<div class="grp">${esc(t)} ${g.length}</div>${g.map(rowHtml).join('')}`).join('') || '<div class="status">표시할 장소가 없어</div>');
}
$('#openList').onclick=()=>{ if(mode&&listDay==='all') listDay=mode; closeSheets('list'); renderList(); $('#list').classList.add('open') };
$('#listBody').addEventListener('click',e=>{
  const ld=e.target.closest('[data-ld]'), lc=e.target.closest('[data-lc]');
  if(ld){ listDay=ld.dataset.ld==='all'?'all':Number(ld.dataset.ld); renderList(); return }
  if(lc){ listCat=lc.dataset.lc; renderList(); return }
  const r=e.target.closest('[data-id]'); if(!r) return;
  const p=byId(r.dataset.id); if(p) focusPlace(p);
});

// ---------- 네비 ----------
function tripDay(){ const d=Math.floor((Date.now()-new Date('2027-01-04T00:00:00+09:00'))/864e5)+1; return d>=1&&d<=5?d:0 }
function setNavDay(d){ navDay=d; mode=d; refresh(); fitMode() }
function openNav(d){
  d = d || mode || navDay || tripDay() || 1;
  closeSheets('nav'); $('#nav').classList.add('open');
  if(mode!==d) setNavDay(d); else { navDay=d; renderNav() }
}
$('#openNav').onclick=()=>openNav();
function renderNav(){
  const items=dayItems(navDay), next=items.find(p=>!p.done);
  $('#navPush').innerHTML = pushCard();
  $('#navDays').innerHTML = DAYS.map(x=>`<button class="chip ${navDay===x.n?'on':''}" data-nd="${x.n}">${x.n}일차<span class="sd">${x.d}</span></button>`).join('');
  $('#navNext').innerHTML = !items.length ? `<div class="status">장소를 누르고 일정에서 ${navDay}일차를 골라줘</div>`
    : next ? `<div class="nextcard"><div class="nl">다음 장소${next.time?` · ${esc(next.time)} 도착`:''}</div><div class="nn"><span class="ordno">${items.indexOf(next)+1}</span><span class="nm">${esc(next.name)}</span></div>${goOf(next)?`<div class="ngo">${goOf(next)} 출발 · 이동 ${next.mins}분</div>`:''}<a class="btn dark go" data-go="${esc(next.id)}" ${goAttrs(next)}>${ms('directions')}구글맵 길찾기</a></div>`
    : `<div class="nextcard"><div class="nn">${navDay}일차 일정 끝</div></div>`;
  $('#navList').innerHTML = items.map((p,i)=>`<div class="nrow ${p.done?'done':''}" data-id="${esc(p.id)}">
      <span class="hdl">${ms('drag_indicator')}</span>
      <span class="ordno">${i+1}</span>
      <div class="rt"><div class="t">${esc(p.name)}</div><div class="nmeta"><input type="time" class="tm" data-tm="${esc(p.id)}" value="${esc(p.time||'')}">${goOf(p)?`<span class="go">${goOf(p)} 출발 · ${p.mins}분</span>`:''}</div></div>
      <button class="cbx ${p.done?'on':''}" data-nck="${esc(p.id)}">${ms('check')}</button>
      <a class="gobtn" data-go="${esc(p.id)}" ${goAttrs(p)}>이동</a>
    </div>`).join('');
}
function goTo(p){
  const items=dayItems(p.day), k=items.indexOf(p), list=[];
  items.slice(0,k).forEach(x=>{ if(!x.done){ x.done=1; list.push([x.id,{done:1}]) } });
  if(list.length){ save(list); setTimeout(refresh,50) }
}
$('#nav').addEventListener('click',e=>{
  const nd=e.target.closest('[data-nd]'), ck=e.target.closest('[data-nck]'), t=e.target.closest('.nrow .t');
  if(nd){ setNavDay(Number(nd.dataset.nd)); return }
  if(ck){ const p=byId(ck.dataset.nck); if(p) toggleDone(p); return }
  if(t){ const p=byId(t.closest('.nrow').dataset.id); if(p){ closeSheets(); focusPlace(p) } }
});
document.addEventListener('click',e=>{ const go=e.target.closest&&e.target.closest('[data-go]'); if(!go) return; const p=byId(go.dataset.go); if(p) goTo(p) },true);
const tmTimers={};
$('#nav').addEventListener('focusout',e=>{ if(e.target.closest('[data-tm]')) setTimeout(()=>{ if(!document.activeElement||!document.activeElement.closest('[data-tm]')) renderNav() },300) });
$('#nav').addEventListener('change',e=>{
  const tm=e.target.closest('[data-tm]'); if(!tm) return;
  const p=byId(tm.dataset.tm); if(!p) return;
  const v=tm.value||''; patchLocal(p,{time:v}); lastLocal=Date.now();
  clearTimeout(tmTimers[p.id]); tmTimers[p.id]=setTimeout(()=>saveTime(p,v),900);
});
async function saveTime(p,v){
  const r=await save([[p.id,{time:v}]]); if(!r) return;
  scheduleSync();
  toast(v?`${p.day}일차 ${v} 도착으로 바꿨어`:'시간 지웠어');
}
let drag=null;
$('#navList').addEventListener('pointerdown',e=>{
  const h=e.target.closest('.hdl'); if(!h) return;
  e.preventDefault();
  const row=h.closest('.nrow'); h.setPointerCapture(e.pointerId);
  drag={row,y:e.clientY}; row.classList.add('lift');
});
$('#navList').addEventListener('pointermove',e=>{
  if(!drag) return;
  const row=drag.row;
  let pv=row.previousElementSibling, nx=row.nextElementSibling;
  while(pv && e.clientY-drag.y < -pv.offsetHeight/2){ row.parentNode.insertBefore(pv,row.nextSibling); drag.y-=pv.offsetHeight; pv=row.previousElementSibling }
  while(nx && e.clientY-drag.y > nx.offsetHeight/2){ row.parentNode.insertBefore(nx,row); drag.y+=nx.offsetHeight; nx=row.nextElementSibling }
  row.style.transform=`translateY(${e.clientY-drag.y}px)`;
});
function endDrag(){
  if(!drag) return;
  const row=drag.row; row.style.transform=''; row.classList.remove('lift'); drag=null;
  const list=[];
  [...$('#navList').querySelectorAll('.nrow')].forEach((r,k)=>{ const p=byId(r.dataset.id); if(p&&p.ord!==k+1){ p.ord=k+1; list.push([p.id,{ord:k+1}]) } });
  if(list.length) save(list).then(scheduleSync);
  refresh();
}
$('#navList').addEventListener('pointerup',endDrag);
$('#navList').addEventListener('pointercancel',endDrag);

// ---------- 설정 ----------
function renderSet(){
  const pushLine = pushState==='on'
    ? `<div class="setnote">이 폰은 출발 5분 전 알림을 받고 있어.</div><button class="btn line" data-push="test" style="margin-top:8px;width:100%">테스트 알림 보내기</button>`
    : pushCard();
  $('#setBody').innerHTML=`<div class="grp">이름 글자 크기 <b id="fsv">${lfs}</b></div>
    <input type="range" id="fs" min="12" max="24" step="1" value="${lfs}">
    <div class="fsprev" id="fsprev" style="font-size:${lfs}px">${Object.keys(CATS).map(k=>`<span style="color:${CATS[k].c}">${CATS[k].label}</span>`).join('')}</div>
    <div class="grp">알림</div>${pushLine}`;
  $('#fs').oninput=e=>{ lfs=Number(e.target.value); $('#fsv').textContent=lfs; $('#fsprev').style.fontSize=lfs+'px'; applyFont(); schedDeclutter() };
  $('#fs').onchange=()=>store('lfs',String(lfs));
}
$('#openSet').onclick=()=>{ closeSheets('set'); $('#set').classList.add('open'); renderSet() };

// ---------- 추가 ----------
let draft=null, ac=null;
function setStatus(t,cls){const s=$('#addStatus');s.textContent=t;s.className='status'+(cls?' '+cls:'')}
function guessCat(types){
  const t=new Set(types||[]);
  if(t.has('lodging')) return 'stay';
  if(t.has('bar')||t.has('pub')||t.has('wine_bar')||t.has('izakaya_restaurant')) return 'bar';
  if(t.has('cafe')||t.has('coffee_shop')||t.has('bakery')||t.has('dessert_shop')||t.has('tea_house')) return 'cafe';
  if(t.has('restaurant')||t.has('food')||t.has('meal_takeaway')||t.has('ramen_restaurant')) return 'food';
  if(t.has('store')||t.has('shopping_mall')||t.has('department_store')||t.has('clothing_store')||t.has('market')) return 'shop';
  return 'play';
}
function guessArea(lat,lng,cat){
  if(cat==='stay') return '숙소';
  let best=null,bd=1e9;
  AREA_PTS.forEach(([n,a,b])=>{const d=(a-lat)**2+(b-lng)**2; if(d<bd){bd=d;best=n}});
  return Math.sqrt(bd)<0.12?best:'기타';
}
$('#openAdd').onclick=()=>{
  closeSheets('add'); $('#add').classList.add('open'); $('#addPreview').innerHTML=''; setStatus('');
  if(!PlaceAutocompleteElement){ setStatus('지도를 불러오는 중이야','err'); return }
  if(!ac){
    ac=new PlaceAutocompleteElement({includedRegionCodes:['jp'],locationBias:{center:{lat:34.75,lng:135.5},radius:50000}});
    ac.placeholder='장소 검색';
    $('#acWrap').appendChild(ac);
    const onPick=async(place)=>{
      try{
        await place.fetchFields({fields:['displayName','location','types','formattedAddress','id']});
        const lat=place.location.lat(), lng=place.location.lng(), cat=guessCat(place.types);
        draft={name:place.displayName||'',ja:'',cat,area:guessArea(lat,lng,cat),lat:+lat.toFixed(6),lng:+lng.toFixed(6),desc:'',note:'',placeId:place.id};
        setStatus(''); renderDraft(place.formattedAddress);
        map.setCenter({lat,lng}); map.setZoom(Math.max(map.getZoom(),16));
      }catch(e){ setStatus('장소 정보를 못 가져왔어. 다시 골라줘','err') }
    };
    ac.addEventListener('gmp-select',async e=>{ if(e.placePrediction) onPick(e.placePrediction.toPlace()) });
    ac.addEventListener('gmp-placeselect',e=>{ if(e.place) onPick(e.place) });
  }
};
function renderDraft(addr){
  const d=draft;
  $('#addPreview').innerHTML=`
    <div class="pname" style="font-size:16px;line-height:24px;margin-top:16px">${esc(d.name)}</div>
    ${addr?`<div class="gline">${esc(addr)}</div>`:''}
    <div class="catpick">${Object.keys(CATS).map(k=>`<button class="chip cat ${k===d.cat?'on':'off'}" data-pc="${k}" style="--c:${CATS[k].c};--t:${CATS[k].t}">${icon(k)}${CATS[k].label}</button>`).join('')}</div>
    <input class="field" id="draftDesc" placeholder="한 줄 메모" maxlength="60" value="${esc(d.desc)}">
    <div class="actions"><button class="btn dark" id="saveDraft">${mode?mode+'일차에 저장':'저장'}</button></div>`;
  $('#addPreview').querySelectorAll('[data-pc]').forEach(b=>b.onclick=()=>{draft.desc=$('#draftDesc').value;draft.cat=b.dataset.pc;draft.area=guessArea(draft.lat,draft.lng,draft.cat);renderDraft(addr)});
  $('#saveDraft').onclick=async()=>{
    draft.desc=$('#draftDesc').value.trim();
    $('#saveDraft').disabled=true; setStatus('저장 중...');
    try{
      const saved=await run('addPlace',draft);
      places.push(saved); draft=null; $('#addPreview').innerHTML=''; setStatus('');
      if(ac) ac.value='';
      if(mode){ const patch={day:mode,ord:Math.max(0,...dayItems(mode).map(x=>x.ord))+1,done:0}; patchLocal(saved,patch); save([[saved.id,patch]]).then(scheduleSync) }
      renderTop(); renderMarkers();
      map.setCenter({lat:saved.lat,lng:saved.lng}); map.panBy(0, Math.round(map.getDiv().clientHeight*0.25));
      openDetail(saved.id,true); toast('추가했어');
    }catch(e){ setStatus('저장하지 못했어. 다시 해봐','err'); $('#saveDraft').disabled=false }
  };
}
async function removePlace(id){
  try{ await run('deletePlace',id); places=places.filter(p=>p.id!==id); selId=null; closeSheets(); refresh(); scheduleSync(); toast('삭제했어') }
  catch(e){ toast('삭제하지 못했어') }
}

// ---------- 시작 ----------
const sig=()=>JSON.stringify(places.map(p=>[p.id,p.lat,p.lng,p.cat,p.name,p.desc,p.day,p.ord,p.done,p.time,p.mins]));
async function load(){
  if(!token) return;
  try{
    const t0=Date.now();
    const list=await run('listPlaces');
    if(drag||pending||lastLocal>t0) return;
    const before=sig();
    places=list;
    if(sig()!==before) refresh();
  }catch(e){ if(token) toast('장소를 불러오지 못했어') }
}
function handleGo(){
  const id=new URLSearchParams(location.search).get('go'); if(!id) return;
  history.replaceState(null,'',location.pathname);
  const p=byId(id); if(!p) return;
  openNav(p.day||undefined);
  setTimeout(()=>{ location.href=goUrl(p) },400);
}
async function init(){
  renderTop();
  initPush();
  if(!token) showGate();
  const [{Map,OverlayView},pl]=await Promise.all([google.maps.importLibrary('maps'),google.maps.importLibrary('places')]);
  Place=pl.Place; PlaceAutocompleteElement=pl.PlaceAutocompleteElement;
  map=new Map($('#map'),{center:{lat:34.680,lng:135.495},zoom:13,disableDefaultUI:true,gestureHandling:'greedy',clickableIcons:false,styles:poiOn?[]:POI_OFF});
  layer=makeLayer(OverlayView); layer.setMap(map);
  map.fitBounds(OSAKA,pad());
  map.addListener('idle',schedDeclutter);
  map.addListener('click',()=>closeSheets());
  await load();
  renderMarkers();
  const td=tripDay();
  if(new URLSearchParams(location.search).get('go')) handleGo();
  else if(td && dayItems(td).length) openNav(td);
  fixLocations();
  setInterval(()=>{ if(document.visibilityState==='visible') load() },60000);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') load() });
}
init().catch(e=>{ toast('지도를 불러오지 못했어'); console.error(e) });
