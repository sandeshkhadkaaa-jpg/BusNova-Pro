/* BusNova Pro: static GitHub Pages frontend + C WebAssembly reservation engine.
   Browser storage is only a single-browser college demo, never a shared booking system. */
const $ = (id) => document.getElementById(id);
const BASE_ROUTES = [
  {id:'ktm-pkr',from:'Kathmandu',to:'Pokhara',fare:1200,duration:'6h 30m',kind:'Scenic Express'},
  {id:'ktm-ctw',from:'Kathmandu',to:'Chitwan',fare:850,duration:'5h 00m',kind:'City Connector'},
  {id:'ith-ktm',from:'Itahari',to:'Kathmandu',fare:1700,duration:'10h 30m',kind:'Night Luxury'},
  {id:'pkr-btw',from:'Pokhara',to:'Butwal',fare:1000,duration:'5h 30m',kind:'Scenic Express'}
];
const KEY_ROUTES='busnova.routes.v1',KEY_BOOKINGS='busnova.bookings.v1';
function loadArray(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return Array.isArray(v)?v:fallback}catch{return fallback}}
let routes=loadArray(KEY_ROUTES,BASE_ROUTES), bookings=loadArray(KEY_BOOKINGS,[]), activePage='home';
let currentSeat=-1, view='2d', currentTicket=null, wasmReady=false;
let scene=null, engine;
const seatNames=Array.from({length:36},(_,i)=>i<32?`${Math.floor(i/4)+1}${'ABCD'[i%4]}`:`S${i-31}`);
const formatNpr=(n)=>'रू '+Number(n).toLocaleString('en-IN');
const esc=(s)=>String(s??'').replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dateReadable=(v)=>v?new Date(`${v}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
const routeById=()=>routes.find(r=>r.id===$('route-select').value)||routes[0];
const currentTrip=()=>`${$('route-select').value}|${$('travel-date').value}|${$('departure-select').value}`;
const activeBookings=()=>bookings.filter(b=>b.trip===currentTrip());
const seatFare=(i)=>i>=32?Math.round(routeById().fare*1.5):routeById().fare;
const persist=()=>{localStorage.setItem(KEY_BOOKINGS,JSON.stringify(bookings));localStorage.setItem(KEY_ROUTES,JSON.stringify(routes))};
const jsState=new Uint8Array(36);
function makeFallback(){return {reset:()=>{jsState.fill(0);return 1},status:i=>i>=0&&i<36?jsState[i]:-1,import:(i,v)=>{if(i<0||i>=36)return 0;jsState[i]=v;return 1},reserve:i=>{if(i<0||i>=36||jsState[i])return 0;jsState[i]=1;return 1},cancel:i=>{if(i<0||i>=36||!jsState[i])return 0;jsState[i]=0;return 1},available:()=>36-jsState.reduce((a,b)=>a+b,0)}}
engine=makeFallback();
async function loadCore(){
  try{
    const response=await fetch('./booking.wasm',{cache:'no-cache'});
    if(!response.ok)throw new Error('C build not present');
    const bytes=await response.arrayBuffer();
    const result=await WebAssembly.instantiate(bytes,{env:{}});
    const e=result.instance.exports;
    const f=(n)=>e[`bn_${n}`]||e[`_bn_${n}`];
    if(['reset','status','import','reserve','cancel','available'].some(n=>typeof f(n)!=='function'))throw new Error('Unexpected WASM exports');
    engine={reset:f('reset'),status:f('status'),import:f('import'),reserve:f('reserve'),cancel:f('cancel'),available:f('available')};
    wasmReady=true;
    $('engine-label').textContent='C / WebAssembly active';
  }catch(err){console.info('JavaScript preview fallback:',err.message);$('engine-label').textContent='Preview mode · JS fallback'}
  hydrateSeats();renderSeats();
}
function hydrateSeats(){engine.reset();for(const b of activeBookings()){const index=seatNames.indexOf(b.seat);if(index!==-1)engine.import(index,1)}if(currentSeat>=0&&engine.status(currentSeat))currentSeat=-1}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3500)}
function go(page){if(!$(page))return;activePage=page;document.querySelectorAll('.page').forEach(e=>e.classList.toggle('active',e.id===page));document.querySelectorAll('.nav-link').forEach(e=>e.classList.toggle('active',e.dataset.page===page));$('page-breadcrumb').textContent=({home:'OVERVIEW',book:'BOOK YOUR SEAT',tickets:'MY TICKETS',admin:'ADMIN DEMO'})[page];if(page==='tickets')renderTickets();if(page==='admin')renderAdmin();if(page==='book'){renderSeats();if(view==='3d')ensureScene()}window.scrollTo({top:0,behavior:'smooth'})}
function renderRoutes(){
  $('stat-routes').textContent=routes.length;$('stat-bookings').textContent=bookings.length;
  $('home-routes').innerHTML=routes.slice(0,6).map((r,i)=>`<div class="route-card"><div class="route-top"><span class="tag ${i%2?'orange':''}">${esc(r.kind)}</span><span style="color:#aeb9cb">↗</span></div><h3>${esc(r.from)} <span style="color:#ff7848">→</span> ${esc(r.to)}</h3><p>◷ ${esc(r.duration)} · Daily departures</p><div class="route-bottom"><div class="price">${formatNpr(r.fare)} <small>/seat</small></div><button data-select-route="${esc(r.id)}">Book now ↗</button></div></div>`).join('');
  $('route-select').innerHTML=routes.map(r=>`<option value="${esc(r.id)}">${esc(r.from)} → ${esc(r.to)}</option>`).join('');
}
function selectSeat(i){if(engine.status(i)){toast('That seat is already booked.');return}currentSeat=currentSeat===i?-1:i;renderSeats()}
function seatButton(i,extra=''){const booked=engine.status(i)===1;const selected=currentSeat===i;return `<button class="seat ${extra} ${booked?'booked':selected?'selected':''}" type="button" data-seat="${i}" ${booked?'disabled':''} aria-label="Seat ${seatNames[i]} ${booked?'booked':selected?'selected':'available'}">${seatNames[i]}</button>`}
function renderSeats(){
  $('seat-map').innerHTML=Array.from({length:8},(_,row)=>`<div class="seat-row">${seatButton(row*4)}${seatButton(row*4+1)}<span class="aisle-number">${row+1}</span>${seatButton(row*4+2)}${seatButton(row*4+3)}</div>`).join('');
  $('sleeper-map').innerHTML=`<div class="sleepers">${[32,33,34,35].map(i=>seatButton(i,'sleeper')).join('')}</div>`;
  const r=routeById();if(!r)return;
  $('summary-route').innerHTML=`${esc(r.from)} <span>→</span> ${esc(r.to)}`;
  $('summary-date').textContent=dateReadable($('travel-date').value);
  $('summary-time').textContent=$('departure-select').value;
  $('summary-seat').textContent=currentSeat<0?'Not selected':seatNames[currentSeat];
  $('summary-type').textContent=currentSeat<0?'—':currentSeat>=32?'Sleeper berth':'Standard seat';
  $('summary-fare').textContent=formatNpr(currentSeat<0?0:seatFare(currentSeat));
  if(scene)scene.updateSeatColors();
}
function tripChanged(){currentSeat=-1;hydrateSeats();renderSeats()}
function book(event){
  event.preventDefault();
  if(currentSeat<0){toast('Please choose a seat first.');return}
  if($('travel-date').value<todayISO()){toast('Please select today or a future date.');return}
  const name=$('passenger-name').value.trim();const phone=$('passenger-phone').value.trim();
  if(name.length<2||!/^[0-9]{10}$/.test(phone)){toast('Enter a valid name and a 10-digit phone number.');return}
  const selected=currentSeat;
  if(engine.reserve(selected)!==1){toast('This seat has just become unavailable.');tripChanged();return}
  const r=routeById();const id=`BN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  const b={id,trip:currentTrip(),routeId:r.id,from:r.from,to:r.to,date:$('travel-date').value,time:$('departure-select').value,seat:seatNames[selected],fare:seatFare(selected),name,phone,payment:$('payment-mode').value,created:new Date().toISOString()};
  bookings.unshift(b);try{persist()}catch{engine.cancel(selected);bookings.shift();toast('Could not save reservation: browser storage is unavailable.');return}
  currentSeat=-1;renderSeats();renderRoutes();$('booking-form').reset();showTicket(b);toast('Your demo reservation was created!');
}
function ticketHtml(b){return `<div class="ticket-heading"><div class="logo">BusNova Pro ✦</div><h2>Your journey is confirmed!</h2><p>Demo ticket · Not valid for travel</p></div><div class="ticket-paper"><div class="trip-name">${esc(b.from)} → ${esc(b.to)}</div><div class="ticket-data"><div><span>BOOKING ID</span><strong>${esc(b.id)}</strong></div><div><span>PASSENGER</span><strong>${esc(b.name)}</strong></div><div><span>TRAVEL DATE</span><strong>${dateReadable(b.date)}</strong></div><div><span>DEPARTURE</span><strong>${esc(b.time)}</strong></div><div><span>SEAT</span><strong>${esc(b.seat)}</strong></div><div><span>FARE</span><strong>${formatNpr(b.fare)}</strong></div><div><span>PAYMENT</span><strong>${esc(b.payment)}</strong></div><div><span>STATUS</span><strong>Demo reservation</strong></div></div></div>`}
function showTicket(b){currentTicket=b;$('ticket-preview').innerHTML=ticketHtml(b);$('ticket-dialog').showModal()}
function renderTickets(){
  $('tickets-list').innerHTML=bookings.length?bookings.map(b=>`<div class="ticket-item"><div><span class="eyebrow">${esc(b.id)}</span><strong>${esc(b.from)} → ${esc(b.to)}</strong><small>${dateReadable(b.date)} · ${esc(b.time)} · Seat ${esc(b.seat)} · ${formatNpr(b.fare)}</small></div><div class="actions"><button class="secondary" data-ticket="${esc(b.id)}">View ticket</button><button class="danger" data-cancel="${esc(b.id)}">Cancel</button></div></div>`).join(''):`<div class="empty"><span class="emoji">🎟️</span><h2>No reservations yet</h2><p>Choose a route and book your first demo seat.</p><button class="primary" data-go="book">Find a seat →</button></div>`;
}
function cancelBooking(id){const b=bookings.find(item=>item.id===id);if(!b)return;if(!window.confirm(`Cancel the demo reservation for seat ${b.seat}?`))return;bookings=bookings.filter(item=>item.id!==id);persist();hydrateSeats();renderSeats();renderRoutes();renderTickets();renderAdmin();toast('Demo reservation cancelled.')}
function renderAdmin(){
  $('admin-bookings').textContent=bookings.length;$('admin-routes').textContent=routes.length;$('admin-revenue').textContent=formatNpr(bookings.reduce((v,b)=>v+Number(b.fare),0));
  $('admin-route-list').innerHTML=routes.map(r=>`<div class="admin-route"><div><strong>${esc(r.from)} → ${esc(r.to)}</strong><br/><span>${formatNpr(r.fare)} · ${esc(r.duration)}</span></div><button aria-label="Remove route" data-remove-route="${esc(r.id)}">Remove</button></div>`).join('');
  $('admin-ticket-list').innerHTML=bookings.length?bookings.slice(0,10).map(b=>`<div class="admin-reservation"><strong>${esc(b.name)} · ${esc(b.seat)}</strong><small>${esc(b.from)} → ${esc(b.to)} · ${dateReadable(b.date)} · ${formatNpr(b.fare)}</small></div>`).join(''):'<p class="muted">No local bookings yet.</p>';
}
function addRoute(event){event.preventDefault();const from=$('new-from').value.trim(),to=$('new-to').value.trim(),fare=Number($('new-fare').value),duration=$('new-duration').value.trim();if(!from||!to||from.toLowerCase()===to.toLowerCase()||fare<100||fare>20000||!duration){toast('Enter valid route details.');return}routes.push({id:`custom-${Date.now()}`,from,to,fare,duration,kind:'Custom Route'});persist();renderRoutes();tripChanged();renderAdmin();$('add-route-form').reset();toast('Demo route added.')}
function removeRoute(id){if(routes.length<=1){toast('At least one route must remain.');return}if(bookings.some(b=>b.routeId===id)){toast('Cancel existing reservations on this route first.');return}routes=routes.filter(r=>r.id!==id);persist();renderRoutes();tripChanged();renderAdmin();toast('Demo route removed.')}

/* Lightweight Three.js scene loads only when 3D view is requested. */
let THREE, THREE_LOADING;
async function ensureScene(){
  if(scene){scene.resize();return}
  if(THREE_LOADING)return THREE_LOADING;
  THREE_LOADING=(async()=>{
    try{
      const module=await import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js');THREE=module;
      if(activePage==='book'&&view==='3d')scene=makeScene();
    }catch(err){console.error(err);$('scene-fallback').textContent='3D library could not load. Please connect to the internet and try again.'}
    finally{THREE_LOADING=null}
  })();return THREE_LOADING;
}
function makeScene(){
  const host=$('three-canvas');host.innerHTML='';
  const world=new THREE.Scene();world.background=new THREE.Color(0xc9dcee);world.fog=new THREE.Fog(0xc9dcee,25,55);
  const camera=new THREE.PerspectiveCamera(65,1,.1,100);const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
  world.add(new THREE.HemisphereLight(0xffffff,0x54617a,2.4));const light=new THREE.DirectionalLight(0xffeddf,2.4);light.position.set(-5,13,-7);light.castShadow=true;light.shadow.mapSize.set(1024,1024);world.add(light);
  const mat=(color,other={})=>new THREE.MeshStandardMaterial({color,roughness:.75,...other});
  const shellMat=mat(0xe8eef7,{side:THREE.DoubleSide,transparent:true,opacity:.7});const floorMat=mat(0x283d58);const aisleMat=mat(0x3b5371);const seatBase=mat(0x28b17c);const seatBooked=mat(0x8895aa);const seatSelected=mat(0xff7848);
  function box(x,y,z,w,h,d,m,casts=false){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=casts;mesh.receiveShadow=true;world.add(mesh);return mesh}
  box(0,-.16,0,5.9,.3,18.8,floorMat);
  box(0,-.005,0,1.4,.012,17.9,aisleMat);
  box(-2.9,1.15,0,.11,2.45,18.8,shellMat);box(2.9,1.15,0,.11,2.45,18.8,shellMat);
  box(0,2.65,0,5.9,.1,18.8,mat(0x647d9d,{transparent:true,opacity:.17}));
  box(0,1.3,9.35,5.9,2.4,.12,mat(0x90a8c4));
  box(-1.85,.18,-9.1,1.7,.4,.7,mat(0xf4a75d)); // front entrance step
  box(1.6,.62,-8.25,2.05,1.2,1.65,mat(0x3e5673)); // driver cabin
  const steering=new THREE.Mesh(new THREE.TorusGeometry(.33,.04,8,24),mat(0x212d41));steering.position.set(1.6,1.38,-8.0);steering.rotation.x=Math.PI/4;world.add(steering);
  for(let i=0;i<10;i++){const z=-8+i*1.7;box(-2.96,1.4,z,.04,.12,1.05,mat(0x81c8ed));box(2.96,1.4,z,.04,.12,1.05,mat(0x81c8ed))}
  const seats=[];
  const seatPos=(i)=>{if(i<32){const row=Math.floor(i/4), col=i%4;return {x:[-2.24,-1.18,1.18,2.24][col],z:-6.6+row*1.65}}return {x:[-2.1,-1.03,1.03,2.1][i-32],z:7.2}};
  for(let i=0;i<36;i++){
    const p=seatPos(i), isSleeper=i>=32, group=new THREE.Group();group.position.set(p.x,0,p.z);
    const cushion=new THREE.Mesh(new THREE.BoxGeometry(isSleeper?.89:.88,isSleeper?.24:.35,isSleeper?2:1.03),seatBase);cushion.position.y=isSleeper?.32:.54;group.add(cushion);
    if(!isSleeper){const back=new THREE.Mesh(new THREE.BoxGeometry(.88,1.06,.22),mat(0x223956));back.position.set(0,1.04,.42);group.add(back);const pillow=new THREE.Mesh(new THREE.BoxGeometry(.68,.35,.11),seatBase);pillow.position.set(0,1.23,.29);group.add(pillow)}
    for(const part of group.children){part.castShadow=true;part.userData.seat=i}
    world.add(group);seats.push({i,group,cushion});
  }
  const passenger=new THREE.Group(), coat=mat(0xff854e),skin=mat(0xefb78f),pants=mat(0x20314a);
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.23,.58,4,8),coat);torso.position.y=1.07;passenger.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.22,12,12),skin);head.position.y=1.74;passenger.add(head);
  for(const x of [-.14,.14]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.14,.55,.17),pants);leg.position.set(x,.36,0);passenger.add(leg)}
  passenger.position.set(0,0,-8);world.add(passenger);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),keys=new Set();let yaw=0,raf=0,last=performance.now();
  function onKeyDown(e){if(activePage!=='book'||view!=='3d'||document.activeElement?.matches('input,select,textarea'))return;const k=e.key.toLowerCase();if('wasdarrowleftarrowright'.includes(k)){keys.add(k);if(k.startsWith('arrow'))e.preventDefault()}}
  function onKeyUp(e){keys.delete(e.key.toLowerCase())}
  function onClick(e){const rect=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(seats.flatMap(s=>s.group.children));if(hits.length){const i=hits[0].object.userData.seat;if(i!==undefined)selectSeat(i)}}
  renderer.domElement.addEventListener('click',onClick);window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);
  function updateSeatColors(){for(const s of seats){const material=engine.status(s.i)===1?seatBooked:currentSeat===s.i?seatSelected:seatBase;s.cushion.material=material;for(const child of s.group.children){if(child!==s.cushion&&child.geometry.type==='BoxGeometry'&&child.position.y>1.15)child.material=material}}}
  updateSeatColors();
  function resize(){const w=host.clientWidth,h=host.clientHeight||540;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}resize();const observer=new ResizeObserver(resize);observer.observe(host);
  function tick(now){raf=requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.05);last=now;
    if(activePage==='book'&&view==='3d'){
      if(keys.has('arrowleft'))yaw-=dt*1.8;if(keys.has('arrowright'))yaw+=dt*1.8;
      const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));const side=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
      let dx=0,dz=0;const speed=3.15*dt;
      if(keys.has('w')){dx+=dir.x*speed;dz+=dir.z*speed}if(keys.has('s')){dx-=dir.x*speed;dz-=dir.z*speed}if(keys.has('a')){dx-=side.x*speed;dz-=side.z*speed}if(keys.has('d')){dx+=side.x*speed;dz+=side.z*speed}
      passenger.position.x=Math.max(-.6,Math.min(.6,passenger.position.x+dx));passenger.position.z=Math.max(-8.6,Math.min(6.7,passenger.position.z+dz));passenger.rotation.y=yaw;
      const target=new THREE.Vector3(passenger.position.x,1.05,passenger.position.z);const camPos=target.clone().add(new THREE.Vector3(-Math.sin(yaw)*3.8,3.5,-Math.cos(yaw)*3.8));camera.position.lerp(camPos,.16);camera.lookAt(target.clone().add(new THREE.Vector3(Math.sin(yaw)*2,.25,Math.cos(yaw)*2)));
    }
    renderer.render(world,camera)
  }raf=requestAnimationFrame(tick);
  return {updateSeatColors,resize,reset(){passenger.position.set(0,0,-8);yaw=0;keys.clear()},dispose(){cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);renderer.dispose()}};
}
function setView(next){view=next;$('btn-2d').classList.toggle('selected',view==='2d');$('btn-3d').classList.toggle('selected',view==='3d');$('seat-map-view').classList.toggle('hidden',view==='3d');$('scene-view').classList.toggle('hidden',view==='2d');if(view==='3d')ensureScene()}
function init(){
  $('travel-date').min=todayISO();$('travel-date').value=todayISO();
  renderRoutes();hydrateSeats();renderSeats();
  document.querySelectorAll('.nav-link').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.go)go(b.dataset.go);
    if(b.dataset.seat!==undefined)selectSeat(Number(b.dataset.seat));
    if(b.dataset.selectRoute){$('route-select').value=b.dataset.selectRoute;tripChanged();go('book')}
    if(b.dataset.ticket){const ticket=bookings.find(t=>t.id===b.dataset.ticket);if(ticket)showTicket(ticket)}
    if(b.dataset.cancel)cancelBooking(b.dataset.cancel);
    if(b.dataset.removeRoute)removeRoute(b.dataset.removeRoute);
  });
  $('route-select').addEventListener('change',tripChanged);$('travel-date').addEventListener('change',tripChanged);$('departure-select').addEventListener('change',tripChanged);
  $('find-seats').addEventListener('click',()=>{tripChanged();toast(`${engine.available()} seats available for this demo trip.`)});
  $('booking-form').addEventListener('submit',book);$('add-route-form').addEventListener('submit',addRoute);
  $('btn-2d').addEventListener('click',()=>setView('2d'));$('btn-3d').addEventListener('click',()=>setView('3d'));
  $('sidebar-explore').addEventListener('click',()=>{go('book');setView('3d')});$('hero-explore').addEventListener('click',()=>{go('book');setView('3d')});
  $('reset-camera').addEventListener('click',()=>scene?.reset());
  $('close-dialog').addEventListener('click',()=>$('ticket-dialog').close());$('dismiss-ticket').addEventListener('click',()=>$('ticket-dialog').close());$('print-ticket').addEventListener('click',()=>window.print());
  loadCore();
}
init();
