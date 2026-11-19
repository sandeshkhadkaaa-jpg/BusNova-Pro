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
const BUS_NAME="SAPANA Air Bus";
let selectedSeats=new Set(), view='2d', currentTicket=null, wasmReady=false;
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
function hydrateSeats(){engine.reset();for(const b of activeBookings()){for(const seat of seatsOf(b)){const index=seatNames.indexOf(seat);if(index!==-1)engine.import(index,1)}}for(const i of selectedSeats)if(engine.status(i))selectedSeats.delete(i)}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3500)}
function go(page){if(!$(page))return;activePage=page;document.querySelectorAll('.page').forEach(e=>e.classList.toggle('active',e.id===page));document.querySelectorAll('.nav-link').forEach(e=>e.classList.toggle('active',e.dataset.page===page));$('page-breadcrumb').textContent=({home:'OVERVIEW',book:'BOOK YOUR SEAT',tickets:'MY TICKETS',admin:'ADMIN DEMO'})[page];if(page==='tickets')renderTickets();if(page==='admin')renderAdmin();if(page==='book'){renderSeats();if(view==='3d')ensureScene()}window.scrollTo({top:0,behavior:'smooth'})}
function renderRoutes(){
  $('stat-routes').textContent=routes.length;$('stat-bookings').textContent=bookings.length;
  $('home-routes').innerHTML=routes.slice(0,6).map((r,i)=>`<div class="route-card"><div class="route-top"><span class="tag ${i%2?'orange':''}">${esc(r.kind)}</span><span style="color:#aeb9cb">↗</span></div><h3>${esc(r.from)} <span style="color:#ff7848">→</span> ${esc(r.to)}</h3><p>◷ ${esc(r.duration)} · Daily departures</p><div class="route-bottom"><div class="price">${formatNpr(r.fare)} <small>/seat</small></div><button data-select-route="${esc(r.id)}">Book now ↗</button></div></div>`).join('');
  $('route-select').innerHTML=routes.map(r=>`<option value="${esc(r.id)}">${esc(r.from)} → ${esc(r.to)}</option>`).join('');
}
function selectSeat(i){if(engine.status(i)){toast('That seat is already booked.');return}if(selectedSeats.has(i))selectedSeats.delete(i);else selectedSeats.add(i);renderSeats()}
function seatButton(i,extra=''){const booked=engine.status(i)===1;const selected=selectedSeats.has(i);return `<button class="seat ${extra} ${booked?'booked':selected?'selected':''}" type="button" data-seat="${i}" ${booked?'disabled':''} aria-label="Seat ${seatNames[i]} ${booked?'booked':selected?'selected':'available'}">${seatNames[i]}</button>`}
function renderSeats(){
  $('seat-map').innerHTML=Array.from({length:8},(_,row)=>`<div class="seat-row">${seatButton(row*4)}${seatButton(row*4+1)}<span class="aisle-number">${row+1}</span>${seatButton(row*4+2)}${seatButton(row*4+3)}</div>`).join('');
  $('sleeper-map').innerHTML=`<div class="sleepers">${[32,33,34,35].map(i=>seatButton(i,'sleeper')).join('')}</div>`;
  const r=routeById();if(!r)return;
  $('summary-route').innerHTML=`${esc(r.from)} <span>→</span> ${esc(r.to)}`;
  $('summary-date').textContent=dateReadable($('travel-date').value);
  $('summary-time').textContent=$('departure-select').value;
  $('summary-seat').textContent=selectedSeats.size?[...selectedSeats].sort((a,b)=>a-b).map(i=>seatNames[i]).join(', '):'Not selected';
  $('summary-type').textContent=selectedSeats.size?`${selectedSeats.size} seat(s) · ${[...selectedSeats].filter(i=>i>=32).length} upper sleeper(s)`:'—';
  $('summary-fare').textContent=formatNpr([...selectedSeats].reduce((total,i)=>total+seatFare(i),0));
  if(scene)scene.updateSeatColors();
}
function tripChanged(){selectedSeats.clear();hydrateSeats();renderSeats()}
function book(event){
  event.preventDefault();
  const choices=[...selectedSeats].sort((a,b)=>a-b);
  if(!choices.length){toast('Select at least one seat before booking.');return}
  if($('travel-date').value<todayISO()){toast('Please select today or a future date.');return}
  const name=$('passenger-name').value.trim(),phone=$('passenger-phone').value.trim();
  if(name.length<2||!/^[0-9]{10}$/.test(phone)){toast('Enter a valid name and 10-digit phone number.');return}
  const reserved=[];
  for(const i of choices){if(engine.reserve(i)!==1){for(const r of reserved)engine.cancel(r);toast('Some selected seats are unavailable; please choose again.');tripChanged();return}reserved.push(i)}
  const r=routeById();const id=`SAP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  const seats=choices.map(i=>seatNames[i]);const fare=choices.reduce((sum,i)=>sum+seatFare(i),0);
  const b={id,bus:BUS_NAME,trip:currentTrip(),routeId:r.id,from:r.from,to:r.to,date:$('travel-date').value,time:$('departure-select').value,seats,seat:seats.join(', '),fare,name,phone,payment:$('payment-mode').value,created:new Date().toISOString()};
  bookings.unshift(b);
  try{persist()}catch{for(const i of reserved)engine.cancel(i);bookings.shift();toast('Could not save reservation. Browser storage is unavailable.');return}
  selectedSeats.clear();renderSeats();renderRoutes();$('booking-form').reset();showTicket(b);toast(`Demo ticket generated for ${seats.length} seat(s)!`);
}
function seatsOf(b){return Array.isArray(b.seats)&&b.seats.length?b.seats:String(b.seat||'').split(',').map(s=>s.trim()).filter(Boolean)}
function ticketHtml(b){const seats=seatsOf(b);return `<div class="ticket-heading"><div class="logo">${esc(b.bus||BUS_NAME)} ✦</div><h2>Your travel ticket</h2><p>BusNova Pro · DEMO TICKET · Not valid for actual travel</p></div><div class="ticket-paper"><div class="trip-name">${esc(b.from)} → ${esc(b.to)}</div><div class="ticket-bus">🚌 ${esc(b.bus||BUS_NAME)} · A/C Deluxe</div><div class="ticket-data"><div><span>BOOKING ID</span><strong>${esc(b.id)}</strong></div><div><span>PASSENGER</span><strong>${esc(b.name)}</strong></div><div><span>TRAVEL DATE</span><strong>${dateReadable(b.date)}</strong></div><div><span>DEPARTURE</span><strong>${esc(b.time)}</strong></div><div><span>SEAT NUMBERS (${seats.length})</span><strong>${esc(seats.join(', '))}</strong></div><div><span>TOTAL FARE</span><strong>${formatNpr(b.fare)}</strong></div><div><span>PAYMENT</span><strong>${esc(b.payment)}</strong></div><div><span>STATUS</span><strong>Demo reservation</strong></div></div></div>`}
function showTicket(b){currentTicket=b;$('ticket-preview').innerHTML=ticketHtml(b);$('ticket-dialog').showModal()}
function renderTickets(){
  $('tickets-list').innerHTML=bookings.length?bookings.map(b=>`<div class="ticket-item"><div><span class="eyebrow">${esc(b.id)}</span><strong>${esc(b.from)} → ${esc(b.to)}</strong><small>${dateReadable(b.date)} · ${esc(b.time)} · Seats ${esc(seatsOf(b).join(", "))} · ${formatNpr(b.fare)}</small></div><div class="actions"><button class="secondary" data-ticket="${esc(b.id)}">View ticket</button><button class="danger" data-cancel="${esc(b.id)}">Cancel</button></div></div>`).join(''):`<div class="empty"><span class="emoji">🎟️</span><h2>No reservations yet</h2><p>Choose a route and book your first demo seat.</p><button class="primary" data-go="book">Find a seat →</button></div>`;
}
function cancelBooking(id){const b=bookings.find(item=>item.id===id);if(!b)return;if(!window.confirm(`Cancel the demo reservation for seat(s) ${seatsOf(b).join(", ")}?`))return;bookings=bookings.filter(item=>item.id!==id);persist();hydrateSeats();renderSeats();renderRoutes();renderTickets();renderAdmin();toast('Demo reservation cancelled.')}
function renderAdmin(){
  $('admin-bookings').textContent=bookings.length;$('admin-routes').textContent=routes.length;$('admin-revenue').textContent=formatNpr(bookings.reduce((v,b)=>v+Number(b.fare),0));
  $('admin-route-list').innerHTML=routes.map(r=>`<div class="admin-route"><div><strong>${esc(r.from)} → ${esc(r.to)}</strong><br/><span>${formatNpr(r.fare)} · ${esc(r.duration)}</span></div><button aria-label="Remove route" data-remove-route="${esc(r.id)}">Remove</button></div>`).join('');
  $('admin-ticket-list').innerHTML=bookings.length?bookings.slice(0,10).map(b=>`<div class="admin-reservation"><strong>${esc(b.name)} · ${esc(seatsOf(b).join(", "))}</strong><small>${esc(b.from)} → ${esc(b.to)} · ${dateReadable(b.date)} · ${formatNpr(b.fare)}</small></div>`).join(''):'<p class="muted">No local bookings yet.</p>';
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
  const host=$('three-canvas');host.replaceChildren();
  const world=new THREE.Scene();world.background=new THREE.Color(0xc4d8eb);
  const camera=new THREE.PerspectiveCamera(73,1,.05,85);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;
  host.appendChild(renderer.domElement);
  world.add(new THREE.HemisphereLight(0xebf7ff,0x344865,2.15));
  const light=new THREE.DirectionalLight(0xffe6bb,2.05);light.position.set(-5,7,-7);world.add(light);
  const mat=(c,opts={})=>new THREE.MeshStandardMaterial({color:c,roughness:.72,...opts});
  const blue=mat(0x065bcb,{metalness:.24}),cream=mat(0xe8e0cc),navy=mat(0x102e59),glass=mat(0x8abedc,{transparent:true,opacity:.27,metalness:.3,roughness:.13,side:THREE.DoubleSide}),gold=mat(0xdbaa5b,{metalness:.55}),rug=mat(0x283e5c),trim=mat(0x1c7be9,{emissive:0x10408a,emissiveIntensity:.4}),dark=mat(0x101925),sofa=mat(0x233f70),cushion=mat(0xe7ce9c),booked=mat(0x8897ad),selected=mat(0xff8546),available=mat(0x38bf93);
  function addBox(x,y,z,w,h,d,m,parent=world){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.receiveShadow=true;o.castShadow=true;parent.add(o);return o}
  function addText(label,w=1.1,h=.28,fg='#ffffff',bg='#10345a'){
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=116;const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,384,116);ctx.strokeStyle='#d6a45b';ctx.lineWidth=7;ctx.strokeRect(4,4,376,108);ctx.fillStyle=fg;ctx.font='bold 67px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,192,61);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
  }
  // Physical coach: an enclosed roof, front glass, windows with metallic mullions and blue exterior.
  addBox(0,-.22,.15,5.92,.32,21.4,rug);addBox(0,-.042,.3,1.28,.02,19.8,mat(0x344e77));
  addBox(-2.95,.25,.2,.13,.85,21.2,blue);addBox(2.95,.25,.2,.13,.85,21.2,blue);
  addBox(-2.95,2.75,.2,.14,.85,21.2,blue);addBox(2.95,2.75,.2,.14,.85,21.2,blue);
  addBox(0,3.25,.2,5.92,.17,21.4,cream);
  addBox(0,1.57,10.77,5.92,3.1,.16,blue);
  addBox(0,2.08,-10.56,5.8,1.7,.08,glass);
  addBox(0,.68,-10.58,5.8,.65,.18,blue);
  for(const side of [-1,1]){
    addBox(side*2.94,1.63,.25,.04,1.9,20.15,glass);
    for(let k=0;k<11;k++)addBox(side*2.93,1.66,-9.75+k*1.88,.11,2.04,.095,navy);
    addBox(side*2.9,2.62,.1,.1,.13,20,trim);
    for(let k=0;k<9;k++)addBox(side*2.78,3.02,-7.8+k*1.99,.22,.09,1.45,gold);
  }
  // Exterior of the roof visible through front glass; interior lighting and storage racks.
  for(let k=0;k<10;k++){
    const z=-8.7+k*1.89;
    addBox(-1.35,3.1,z,1.55,.045,.11,mat(0xffeed0,{emissive:0xffdca2,emissiveIntensity:.8}));
    addBox(1.35,3.1,z,1.55,.045,.11,mat(0xffeed0,{emissive:0xffdca2,emissiveIntensity:.8}));
  }
  // Entrance on the front passenger side and driver cabin immediately in front of the seating aisle.
  addBox(-1.65,-.35,-10.05,1.8,.2,.9,gold);
  addBox(-2.62,.55,-9.95,.55,1.3,.28,blue);
  addBox(1.72,.64,-9.47,2.02,1.1,1.8,navy);
  addBox(1.73,1.17,-9.68,1.85,.18,.8,dark);
  for(let a=0;a<3;a++)addBox(1.15+a*.46,1.31,-9.77,.26,.2,.07,mat(0x7bbcff,{emissive:0x194e83,emissiveIntensity:.65}));
  addBox(2.2,.48,-8.65,.84,.6,.75,sofa);
  addBox(2.2,1.06,-8.38,.84,1.0,.19,sofa);
  const steering=new THREE.Mesh(new THREE.TorusGeometry(.35,.044,10,28),dark);steering.position.set(1.45,1.34,-9.62);steering.rotation.x=.3;world.add(steering);
  const stem=addBox(1.45,1.03,-9.63,.055,.56,.055,dark);stem.rotation.x=.3;
  addBox(.8,.95,-8.88,.1,1.85,.12,glass);
  const cabinTag=addText('DRIVER CABIN',1.8,.38);cabinTag.position.set(1.48,2.49,-8.85);world.add(cabinTag);
  const entryTag=addText('ENTRY',1.05,.38);entryTag.position.set(-1.57,2.53,-9.85);world.add(entryTag);
  const branding=addText('SAPANA AIR BUS',3.15,.5,'#ffffff','#0544a6');branding.position.set(0,2.64,-9.95);world.add(branding);
  const seats=[];
  const seatPos=i=>i<32?{x:[-2.32,-1.19,1.19,2.32][i%4],z:-7.45+Math.floor(i/4)*1.93}:{x:[-2.32,-1.19,1.19,2.32][i-32],z:8.25};
  for(let i=0;i<36;i++){
    const p=seatPos(i),sleeper=i>=32,group=new THREE.Group();group.position.set(p.x,0,p.z);world.add(group);
    let surface;
    if(!sleeper){
      addBox(0,.34,0,.99,.21,1.12,sofa,group);
      surface=addBox(0,.55,-.13,.96,.19,.87,cushion,group);
      addBox(0,1.05,.39,.98,1.06,.22,sofa,group);
      addBox(0,1.31,.27,.73,.35,.08,cushion,group);
      for(const x of [-.51,.51])addBox(x,.84,-.12,.12,.23,.78,gold,group);
    }else{
      // Upper rear sleeper bunks, elevated close to the roof, with a rear access ladder.
      addBox(0,1.88,0,1.05,.15,2.15,gold,group);
      surface=addBox(0,2.04,0,1.0,.20,1.95,cushion,group);
      addBox(0,2.15,.75,.85,.16,.35,sofa,group);
      for(const x of [-.52,.52])addBox(x,2.22,0,.045,.28,2.0,navy,group);
    }
    const label=addText(seatNames[i],.68,.28,'#ffffff','#173d76');label.position.set(0,sleeper?2.48:1.55,sleeper?-.55:.43);group.add(label);
    // Raycast surfaces include labels and cushions for easy tapping on mobiles.
    surface.userData.seat=i;label.userData.seat=i;
    seats.push({index:i,group,surface,label});
  }
  // Rear sleeper ladder in central aisle.
  for(let j=0;j<5;j++)addBox(0,.47+j*.42,9.32,.71,.065,.08,gold);
  for(const x of [-.37,.37])addBox(x,1.25,9.32,.065,2.35,.075,gold);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const keys=new Set();let yaw=0,raf=0,last=performance.now();
  const person=new THREE.Group();
  addBox(0,1.08,0,.36,.61,.27,mat(0xff9357),person);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.20,12,12),mat(0xe8b68f));head.position.y=1.66;person.add(head);
  for(const x of [-.12,.12])addBox(x,.40,0,.13,.68,.15,navy,person);
  // Start outside at the front entrance; walk into the front cabin and then straight down the aisle.
  person.position.set(-1.4,0,-10.15);world.add(person);
  const heldButtons=[...document.querySelectorAll('[data-drive]')];
  function down(e){if(activePage!=='book'||view!=='3d'||document.activeElement?.matches('input,select,textarea'))return;const k=e.key.toLowerCase();if(['w','a','s','d','arrowleft','arrowright'].includes(k)){keys.add(k);e.preventDefault()}}
  function up(e){keys.delete(e.key.toLowerCase())}
  function blur(){keys.clear();heldButtons.forEach(b=>b.classList.remove('pressed'))}
  function pointerDown(e){e.preventDefault();const k=e.currentTarget.dataset.drive;keys.add(k);e.currentTarget.classList.add('pressed');try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}}
  function pointerUp(e){const k=e.currentTarget.dataset.drive;keys.delete(k);e.currentTarget.classList.remove('pressed')}
  for(const b of heldButtons){b.addEventListener('pointerdown',pointerDown);for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,pointerUp)}
  function tapSeat(e){const bounds=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-bounds.left)/bounds.width*2-1,-(e.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(seats.flatMap(s=>[s.surface,s.label]),false);if(hits.length){const i=hits[0].object.userData.seat;if(i!==undefined)selectSeat(i)}}
  renderer.domElement.addEventListener('click',tapSeat);
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
  function updateSeatColors(){for(const s of seats){s.surface.material=engine.status(s.index)===1?booked:selectedSeats.has(s.index)?selected:available;s.label.material.color.setHex(engine.status(s.index)===1?0x999999:selectedSeats.has(s.index)?0xffad77:0xffffff)}}
  updateSeatColors();
  function resize(){const w=Math.max(host.clientWidth,250),h=host.clientHeight||420;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
  resize();const observer=new ResizeObserver(resize);observer.observe(host);
  function tick(now){raf=requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.045);last=now;
    if(activePage==='book'&&view==='3d'){
      if(keys.has('arrowleft'))yaw-=dt*1.5;if(keys.has('arrowright'))yaw+=dt*1.5;
      const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
      const movement=new THREE.Vector3();if(keys.has('w'))movement.add(forward);if(keys.has('s'))movement.sub(forward);if(keys.has('d'))movement.add(right);if(keys.has('a'))movement.sub(right);
      if(movement.lengthSq()>0){movement.normalize().multiplyScalar(dt*2.35);const nextZ=Math.max(-10.25,Math.min(9.1,person.position.z+movement.z));let nextX=person.position.x+movement.x; // free movement at entrance, central aisle after cabin
        if(nextZ>-7.75)nextX=Math.max(-.61,Math.min(.61,nextX));else nextX=Math.max(-2.25,Math.min(.65,nextX));person.position.set(nextX,0,nextZ)}
      person.rotation.y=yaw;
      // Eye-level interior camera; keeps the roof, cabin and upper berths visible.
      const eye=new THREE.Vector3(person.position.x,1.72,person.position.z-.18);camera.position.lerp(eye,.24);
      camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.sin(yaw)*4,-.035,Math.cos(yaw)*4)));
    }
    renderer.render(world,camera)
  }
  // First rendered frame starts looking into the bus, from the entrance.
  camera.position.set(-1.4,1.72,-10.25);camera.lookAt(0,1.4,-4.6);raf=requestAnimationFrame(tick);
  return {updateSeatColors,resize,reset(){person.position.set(-1.4,0,-10.15);yaw=0;blur()},dispose(){cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);renderer.domElement.removeEventListener('click',tapSeat);for(const b of heldButtons){b.removeEventListener('pointerdown',pointerDown);for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.removeEventListener(ev,pointerUp)}renderer.dispose()}};
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
