
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('redis');

const cliValue = name => { const index=process.argv.indexOf(name); return index>=0?process.argv[index+1]:''; };
const PORT = Number(cliValue('--port') || process.env.PORT || 3000);
const HOST = cliValue('--host') || process.env.HOST || undefined;
const REDIS_URL = process.env.REDIS_URL || '';
const KEY_PREFIX = process.env.REDIS_PREFIX || 'princess-rescue:v3:';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path:'/ws' });

const PUBLIC_DIR = path.join(__dirname, 'public');
const STATIC_ASSET_OPTIONS = { maxAge:'30d', immutable:true, etag:true };
// Versioned GLB/vendor URLs are immutable. Returning them directly from the
// browser cache makes every room after the first load nearly instant, while
// HTML remains revalidated so new game versions still appear immediately.
app.use('/assets',express.static(path.join(PUBLIC_DIR,'assets'),STATIC_ASSET_OPTIONS));
app.use('/vendor',express.static(path.join(PUBLIC_DIR,'vendor'),STATIC_ASSET_OPTIONS));
app.use(express.static(PUBLIC_DIR,{maxAge:0,etag:true}));

const rooms = new Map();
let redis = null;
let redisReady = false;

const TICK_HZ = 30;
const SNAPSHOT_HZ = 15;
const DT = 1 / TICK_HZ;

const SLOT_TTL_MS = 120000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const ROOM_TTL_SEC = Math.ceil(ROOM_TTL_MS / 1000);
const PERSIST_INTERVAL_MS = 250;
const BOSS_INTRO_MS = 9000;

// Lag compensation.
const HISTORY_MS = 1000;
const MAX_REWIND_MS = 220;
const MAX_PROJECTILE_FAST_FORWARD_MS = 150;
const HIT_CONFIRM_DELAY_MS = 90;
const DASH_IFRAME_MS = 340;
const INPUT_STALE_MS = 500;
const PLAYER_BOSS_MIN_GAP = 1.02;
const BOSS_PHASE_THRESHOLDS = [1,.70,.35];
const BOSS_EXPOSE_DAMAGE_MULTIPLIER = 1.30;
const BOSS_POISE_MAX = 100;
const BOSS_CRIT_MULTIPLIER = 1.75;
const BOSS_BODY_CRIT_CHANCE = .015;
const BOSS_CRITICAL_STAGGER_MS = 190;
const BOSS_BREAK_STAGGER_MS = 950;
const BOSS_BREAK_RESIST_MS = 5200;
const BOSS_POISE_REGEN_DELAY_MS = 2350;
const BOSS_COUNTER_WINDOW_MS = 900;
const TEST_FAST_BOSS = process.env.BOSS_TEST_FAST === '1';
const TEST_BOSS_SKILL = /^\d+$/.test(process.env.BOSS_TEST_SKILL || '') ? Number(process.env.BOSS_TEST_SKILL) : null;
const TEST_BOSS_DODGE = /^(3|12)$/.test(process.env.BOSS_TEST_DODGE || '') ? process.env.BOSS_TEST_DODGE : null;
const TEST_BOSS_CRIT = process.env.BOSS_TEST_CRIT === '1';

const FOODS = [
  {name:'Nem chua rán',el:'crispy',dmg:16},
  {name:'Xiên bẩn',el:'spicy',dmg:18},
  {name:'Trà sữa matcha',el:'fresh',dmg:15},
  {name:'Gà rán Jollibee',el:'crispy',dmg:22},
  {name:'Tteokbokki',el:'spicy',dmg:18},
  {name:'Khoai lắc phô mai',el:'crispy',dmg:14},
  {name:'Bánh tráng trộn',el:'spicy',dmg:16},
  {name:'Crepe dâu',el:'sweet',dmg:15},
  {name:'Kem dâu',el:'ice',dmg:21},
  {name:'Lẩu cay',el:'spicy',dmg:27}
];
const FAVORITES = {hero:[1,3,9],princess:[0,2,3,7]};

function roomKey(code){ return `${KEY_PREFIX}room:${code}`; }
function sessionKey(tok){ return `${KEY_PREFIX}session:${tok}`; }

function code6(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s='';
  for(let i=0;i<6;i++) s+=chars[(Math.random()*chars.length)|0];
  return s;
}
function token(){
  return crypto.randomBytes(24).toString('hex');
}
function send(ws,obj){
  if(ws && ws.readyState===WebSocket.OPEN){
    try{ws.send(JSON.stringify(obj));}catch{}
  }
}
function broadcast(room,obj){
  for(const role of ['hero','princess']) send(room.slots[role]?.ws,obj);
}
function player(role){
  return {
    role,
    x:role==='hero'?-3:3,z:3,rot:0,
    hp:100,stamina:100,food:role==='hero'?2:7,
    down:false,revive:0,inv:0,dash:0,vx:0,vz:0,
    atkCd:0,skillCd:0,combo:0,comboUntil:0,
    input:{x:0,y:0},ack:0,
    lastDashTs:0,
    lastInputAt:0,
    score:0,perfect:0,saves:0,counterUntil:0
  };
}
function freshState(){
  return {
    started:false,paused:false,pauseRole:null,manualPause:false,manualPauseRole:null,pauseStartedAt:0,introUntil:0,
    trust:0,tick:0,
    players:{hero:player('hero'),princess:player('princess')},
    boss:{
      x:0,z:-4.7,hp:2200,max:2200,phase:1,skillIndex:-1,skillT:TEST_FAST_BOSS?.12:1.8,lastEl:null,lastElT:0,
      evade:null,evadeInvUntil:0,dodgeReadyAt:0,dodgeSeq:0,phaseLockUntil:0,
      patternIndex:-1,patternStep:0,patternId:'',patternName:'',lastSkill:-1,pendingPhase:0,
      exposedUntil:0,exposedCastId:0,exposedHitCount:0,
      poise:BOSS_POISE_MAX,poiseMax:BOSS_POISE_MAX,poiseRegenAt:0,
      staggerUntil:0,staggerResistUntil:0,criticalUntil:0,
      backWeakUntil:0,upperWeakUntil:0,orbWeakUntil:0,
      comboSeq:0,lastComboId:'',comboHistory:[],actionMemory:[],comboCooldowns:{},ultimateUsed:false
    },
    projectiles:[],pickups:[],darkPool:null,summons:[],
    activeCast:null,activeCombo:null,
    nextProj:1,nextPickup:1,nextHit:1,nextTask:1,nextCast:1,nextSummon:1,
    pendingHits:[],
    tasks:[]
  };
}
function ephemeralRoomFields(room){
  room.dirty = false;
  room.persisting = false;
  room.history = {hero:[],princess:[],boss:[]};
  // Runtime-only render readiness. A match may start only after both browsers
  // have parsed, normalized and precompiled the real Tripo boss.
  room.bossAssetsReady = {hero:false,princess:room.testMode==='boss-only-damage'};
  // Runtime-only sequence. It intentionally resets after a process restart;
  // clients reset their loss window when a session resumes.
  room.snapshotSeq = 0;
  return room;
}
function serializeRoom(room){
  return {
    version:4,
    code:room.code,
    created:room.created,
    testMode:room.testMode||'',
    slots:{
      hero:{token:room.slots.hero.token,disconnectedAt:room.slots.hero.disconnectedAt},
      princess:{token:room.slots.princess.token,disconnectedAt:room.slots.princess.disconnectedAt}
    },
    state:room.state
  };
}
function deserializeRoom(raw){
  const data=typeof raw==='string'?JSON.parse(raw):raw;
  if(!data || !data.code || !data.state) return null;
  const room={
    code:data.code,
    created:data.created||Date.now(),
    testMode:data.testMode==='boss-only-damage'?'boss-only-damage':'',
    slots:{
      hero:{token:data.slots?.hero?.token||null,ws:null,disconnectedAt:data.slots?.hero?.disconnectedAt||null},
      princess:{token:data.slots?.princess?.token||null,ws:null,disconnectedAt:data.slots?.princess?.disconnectedAt||null}
    },
    state:data.state
  };
  // Runtime-only arrays introduced by newer schemas.
  room.state.manualPause = room.state.manualPause===true;
  room.state.manualPauseRole ||= null;
  room.state.pauseStartedAt ||= 0;
  room.state.pendingHits ||= [];
  room.state.tasks ||= [];
  room.state.nextHit ||= 1;
  room.state.nextTask ||= 1;
  room.state.nextCast ||= 1;
  room.state.nextSummon ||= 1;
  room.state.activeCast ||= null;
  room.state.activeCombo ||= null;
  room.state.summons ||= [];
  room.state.boss.evade ||= null;
  room.state.boss.evadeInvUntil ||= 0;
  room.state.boss.dodgeReadyAt ||= 0;
  room.state.boss.dodgeSeq ||= 0;
  room.state.boss.phaseLockUntil ||= 0;
  room.state.boss.patternIndex ??= -1;
  room.state.boss.patternStep ||= 0;
  room.state.boss.patternId ||= '';
  room.state.boss.patternName ||= '';
  room.state.boss.lastSkill ??= -1;
  room.state.boss.pendingPhase ||= 0;
  room.state.boss.exposedUntil ||= 0;
  room.state.boss.exposedCastId ||= 0;
  room.state.boss.exposedHitCount ||= 0;
  room.state.boss.poise ??= BOSS_POISE_MAX;
  room.state.boss.poiseMax ||= BOSS_POISE_MAX;
  room.state.boss.poiseRegenAt ||= 0;
  room.state.boss.staggerUntil ||= 0;
  room.state.boss.staggerResistUntil ||= 0;
  room.state.boss.criticalUntil ||= 0;
  room.state.boss.backWeakUntil ||= 0;
  room.state.boss.upperWeakUntil ||= 0;
  room.state.boss.orbWeakUntil ||= 0;
  room.state.boss.comboSeq ||= 0;
  room.state.boss.lastComboId ||= '';
  room.state.boss.comboHistory ||= [];
  room.state.boss.actionMemory ||= [];
  room.state.boss.comboCooldowns ||= {};
  room.state.boss.ultimateUsed = room.state.boss.ultimateUsed===true;
  room.state.players.hero.lastDashTs ||= 0;
  room.state.players.princess.lastDashTs ||= 0;
  room.state.players.hero.lastInputAt ||= 0;
  room.state.players.princess.lastInputAt ||= 0;
  room.state.players.hero.counterUntil ||= 0;
  room.state.players.princess.counterUntil ||= 0;

  // A process restart drops all sockets. Freeze a running match until both sessions resume.
  if(room.state.started){
    const now=Date.now();
    room.state.paused=true;
    room.state.pauseRole='server_restart';
    room.state.pauseStartedAt ||= now;
    for(const role of ['hero','princess']){
      if(room.slots[role].token && !room.slots[role].disconnectedAt) room.slots[role].disconnectedAt=now;
    }
  }
  return ephemeralRoomFields(room);
}
function markDirty(room){ room.dirty=true; }
function dialogue(room,speaker,text,duration=2200){
  if(!text)return;
  broadcast(room,{type:'event',e:'dialogue',p:{speaker,text,duration,ts:Date.now()}});
}
function castDialogue(room,i,phase){
  const bossLines={
    0:['Bóng tối luôn tìm được kẻ đang mệt nhất.'],
    1:['Giấc mơ đẹp nhất… thường là thứ dễ vỡ nhất.'],
    2:['02:59… 03:00. Giờ đẹp để nghĩ linh tinh.'],
    3:['Khoảng cách chỉ là một ảo ảnh.'],
    4:['Đủ rồi. Đêm nay… sẽ không kết thúc.']
  };
  const playerLines={
    0:['Ra khỏi vòng đi, lát muốn đứng gần anh thì tính sau.','Né đi! Đừng để đêm ôm trọn mình.'],
    1:['Trên đầu! Em né trước đi.','Mảnh vỡ trên cao!'],
    2:['Khung giờ mất ngủ quốc dân tới rồi.','03:00 rồi… tập trung nào.'],
    3:['Boss dịch chuyển! Ra khỏi vòng đá!','Né khỏi vòng tím, boss sắp xoay đá!'],
    4:['Qua đợt này rồi dồn damage!','Đứng gần anh, qua ulti này đã.']
  };
  dialogue(room,'boss',bossLines[i]?.[0]||'Ngủ đi… trong đêm của ta.',2400);
  const role=phase%2?'hero':'princess';
  const line=playerLines[i]?.[phase%2]||playerLines[i]?.[0];
  scheduleTask(room,260,'dialogue',{speaker:role,text:line,duration:1900});
}

async function initRedis(){
  if(!REDIS_URL){
    console.warn('[redis] REDIS_URL missing: running with RAM-only fallback. Restart persistence is disabled.');
    return;
  }
  redis=createClient({
    url:REDIS_URL,
    socket:{
      reconnectStrategy:(retries)=>Math.min(250 * (2 ** Math.min(retries,5)),5000)
    }
  });
  redis.on('error',err=>{
    redisReady=false;
    console.error('[redis]',err?.message||err);
  });
  redis.on('ready',()=>{ redisReady=true; console.log('[redis] ready'); });
  redis.on('reconnecting',()=>{ redisReady=false; });
  await redis.connect();
  redisReady=true;
}
async function persistRoomNow(room){
  if(!redisReady || !redis || room.persisting) return;
  room.persisting=true;
  try{
    const data=JSON.stringify(serializeRoom(room));
    const multi=redis.multi();
    multi.set(roomKey(room.code),data,{EX:ROOM_TTL_SEC});
    for(const role of ['hero','princess']){
      const tok=room.slots[role].token;
      if(tok) multi.set(sessionKey(tok),JSON.stringify({code:room.code,role}),{EX:ROOM_TTL_SEC});
    }
    await multi.exec();
    room.dirty=false;
  }catch(err){
    console.error('[persist]',room.code,err?.message||err);
  }finally{
    room.persisting=false;
  }
}
async function deletePersistedRoom(room){
  if(!redisReady||!redis)return;
  const keys=[roomKey(room.code)];
  for(const role of ['hero','princess']){
    const tok=room.slots[role].token;
    if(tok)keys.push(sessionKey(tok));
  }
  if(keys.length)await redis.del(keys);
}
async function deleteSession(tok){
  if(redisReady&&redis&&tok) await redis.del(sessionKey(tok));
}
async function loadRoom(code){
  code=String(code||'').toUpperCase();
  if(rooms.has(code)) return rooms.get(code);
  if(!redisReady||!redis)return null;
  const raw=await redis.get(roomKey(code));
  if(!raw)return null;
  try{
    const room=deserializeRoom(raw);
    if(!room)return null;
    rooms.set(room.code,room);
    return room;
  }catch(err){
    console.error('[load room]',code,err?.message||err);
    return null;
  }
}
async function findByToken(tok){
  if(!tok)return null;
  for(const room of rooms.values()){
    for(const role of ['hero','princess']){
      if(room.slots[role].token===tok)return{room,role};
    }
  }
  if(!redisReady||!redis)return null;
  const raw=await redis.get(sessionKey(tok));
  if(!raw)return null;
  try{
    const meta=JSON.parse(raw);
    const room=await loadRoom(meta.code);
    if(!room || room.slots[meta.role]?.token!==tok)return null;
    return{room,role:meta.role};
  }catch{return null}
}
async function roomExists(code){
  if(rooms.has(code))return true;
  if(!redisReady||!redis)return false;
  return !!(await redis.exists(roomKey(code)));
}
async function createRoom(testMode=''){
  let code;
  do{code=code6()}while(await roomExists(code));
  const room=ephemeralRoomFields({
    code,created:Date.now(),testMode:testMode==='boss-only-damage'?'boss-only-damage':'',
    slots:{
      hero:{token:token(),ws:null,disconnectedAt:null},
      princess:{token:null,ws:null,disconnectedAt:null}
    },
    state:freshState()
  });
  for(let i=0;i<5;i++)spawnPickup(room);
  rooms.set(code,room);
  markDirty(room);
  return room;
}

function connected(room,role){
  const ws=room.slots[role]?.ws;
  return !!ws&&ws.readyState===WebSocket.OPEN;
}
function bothConnected(room){return connected(room,'hero')&&connected(room,'princess');}
function isCombatTest(room){return room?.testMode==='boss-only-damage'}
function matchClientsReady(room){return connected(room,'hero')&&(isCombatTest(room)||connected(room,'princess'))}
function matchBossAssetsReady(room){return room.bossAssetsReady.hero&&(isCombatTest(room)||room.bossAssetsReady.princess)}
function attach(room,role,ws){
  const slot=room.slots[role];
  if(slot.ws && slot.ws!==ws && slot.ws.readyState===WebSocket.OPEN){
    try{slot.ws.close(4001,'Replaced by resumed session');}catch{}
  }
  slot.ws=ws;slot.disconnectedAt=null;
  room.bossAssetsReady[role]=false;
  ws.room=room;ws.role=role;ws.sessionToken=slot.token;ws.isAlive=true;
  markDirty(room);
}
function shiftPauseClock(room,delta){
  if(!(delta>0))return;
  const s=room.state,shift=v=>Number.isFinite(v)&&v>0?v+delta:v;
  s.introUntil=shift(s.introUntil);
  for(const role of ['hero','princess']){
    const p=s.players?.[role];if(!p)continue;
    p.comboUntil=shift(p.comboUntil);
    p.lastDashTs=shift(p.lastDashTs);
    p.counterUntil=shift(p.counterUntil);
  }
  const b=s.boss||{};
  b.evadeInvUntil=shift(b.evadeInvUntil);b.dodgeReadyAt=shift(b.dodgeReadyAt);b.phaseLockUntil=shift(b.phaseLockUntil);b.exposedUntil=shift(b.exposedUntil);
  b.poiseRegenAt=shift(b.poiseRegenAt);b.staggerUntil=shift(b.staggerUntil);b.staggerResistUntil=shift(b.staggerResistUntil);b.criticalUntil=shift(b.criticalUntil);
  b.backWeakUntil=shift(b.backWeakUntil);b.upperWeakUntil=shift(b.upperWeakUntil);b.orbWeakUntil=shift(b.orbWeakUntil);
  if(b.evade){b.evade.startAt=shift(b.evade.startAt);b.evade.endAt=shift(b.evade.endAt)}
  if(s.activeCast){
    for(const key of ['startAt','warningAt','impactAt','releaseAt','endAt','teleportAt','kickAt'])s.activeCast[key]=shift(s.activeCast[key]);
  }
  for(const hit of s.pendingHits||[]){hit.hitTs=shift(hit.hitTs);hit.applyAt=shift(hit.applyAt)}
  for(const task of s.tasks||[]){
    task.dueAt=shift(task.dueAt);
    if(task.data){for(const key of ['kickAt','impactAt','launchAt','endAt','startAt'])task.data[key]=shift(task.data[key])}
  }
  if(s.activeCombo){s.activeCombo.startedAt=shift(s.activeCombo.startedAt);s.activeCombo.nextAt=shift(s.activeCombo.nextAt)}
  for(const pr of s.projectiles||[])pr.bornAt=shift(pr.bornAt);
  for(const list of Object.values(room.history||{}))for(const sample of list||[])sample.ts=shift(sample.ts);
}
function beginRoomPause(room,role,{manual=false}={}){
  const s=room.state,now=Date.now();
  if(!s.paused)s.pauseStartedAt=now;
  s.paused=true;s.pauseRole=role;
  if(manual){s.manualPause=true;s.manualPauseRole=role}
  // Never resume with a direction that was held before Pause/disconnect.
  for(const player of Object.values(s.players||{})){
    if(!player?.input)continue;
    player.input.x=0;player.input.y=0;player.lastInputAt=now;
  }
  markDirty(room);
}
function resumeRoomPause(room){
  const s=room.state,now=Date.now();
  const delta=s.pauseStartedAt?Math.max(0,now-s.pauseStartedAt):0;
  shiftPauseClock(room,delta);
  s.paused=false;s.pauseRole=null;s.manualPause=false;s.manualPauseRole=null;s.pauseStartedAt=0;
  markDirty(room);
}
function detach(ws){
  const room=ws.room,role=ws.role;
  if(!room||!role)return;
  const slot=room.slots[role];
  if(slot.ws===ws){
    slot.ws=null;slot.disconnectedAt=Date.now();
    room.bossAssetsReady[role]=false;
    broadcast(room,{type:'bossAssetReady',ready:{...room.bossAssetsReady}});
  }
  if(room.state.started&&!(isCombatTest(room)&&role==='princess')){
    beginRoomPause(room,role);
    broadcast(room,{type:'pause',role,graceMs:SLOT_TTL_MS});
  }
  markDirty(room);
  persistRoomNow(room).catch(()=>{});
}

function norm(x,z){
  const l=Math.hypot(x,z)||1;
  return[x/l,z/l];
}
function d2(ax,az,bx,bz){
  const dx=ax-bx,dz=az-bz;
  return dx*dx+dz*dz;
}
function resolvePlayerBossOverlap(player,boss,minGap=PLAYER_BOSS_MIN_GAP){
  let dx=player.x-boss.x,dz=player.z-boss.z;
  let distance=Math.hypot(dx,dz);
  if(distance>=minGap)return false;
  if(distance<.0001){
    // If teleport/dash placed both centers on the same point, recover in the
    // direction opposite the player's current facing instead of choosing a
    // random axis that can change between snapshots.
    dx=-Math.sin(player.rot||0);dz=-Math.cos(player.rot||0);distance=1;
  }
  const nx=dx/distance,nz=dz/distance;
  player.x=boss.x+nx*minGap;player.z=boss.z+nz*minGap;
  if(player.dash>0){
    // Remove only the component travelling into the boss. The tangential
    // component remains, so a dash slides around the boss instead of sticking.
    const outwardVelocity=player.vx*nx+player.vz*nz;
    if(outwardVelocity<0){player.vx-=outwardVelocity*nx;player.vz-=outwardVelocity*nz}
  }
  return true;
}
function clampActionTs(ts){
  const now=Date.now();
  const n=Number(ts);
  if(!Number.isFinite(n))return now;
  return Math.max(now-MAX_REWIND_MS,Math.min(now+30,n));
}
function recordHistory(room,now){
  const s=room.state;
  const samples=[
    ['hero',s.players.hero.x,s.players.hero.z],
    ['princess',s.players.princess.x,s.players.princess.z],
    ['boss',s.boss.x,s.boss.z]
  ];
  for(const [key,x,z] of samples){
    const arr=room.history[key];
    arr.push({ts:now,x,z});
    while(arr.length&&now-arr[0].ts>HISTORY_MS)arr.shift();
  }
}
function sampleHistory(room,key,ts){
  const arr=room.history[key];
  if(!arr?.length){
    const obj=key==='boss'?room.state.boss:room.state.players[key];
    return{x:obj.x,z:obj.z};
  }
  if(ts<=arr[0].ts)return{x:arr[0].x,z:arr[0].z};
  if(ts>=arr[arr.length-1].ts)return{x:arr[arr.length-1].x,z:arr[arr.length-1].z};
  for(let i=0;i<arr.length-1;i++){
    const a=arr[i],b=arr[i+1];
    if(a.ts<=ts&&b.ts>=ts){
      const t=(ts-a.ts)/Math.max(1,b.ts-a.ts);
      return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
    }
  }
  return{x:arr[arr.length-1].x,z:arr[arr.length-1].z};
}
function segmentCircleHit(x1,z1,x2,z2,cx,cz,r){
  const vx=x2-x1,vz=z2-z1,wx=cx-x1,wz=cz-z1;
  const vv=vx*vx+vz*vz;
  const t=vv?Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv)):0;
  const px=x1+vx*t,pz=z1+vz*t;
  return d2(px,pz,cx,cz)<=r*r;
}

function clampBossToArena(x,z,radius=7.05){
  const r=Math.hypot(x,z);
  if(r<=radius)return{x,z};
  return{x:x*radius/r,z:z*radius/r};
}
function updateBossEvade(room,now){
  const b=room.state.boss,e=b.evade;
  if(!e)return false;
  if(e.kind==='teleport'){
    b.x=e.toX;b.z=e.toZ;
  }else{
    const t=Math.max(0,Math.min(1,(now-e.startAt)/Math.max(1,e.endAt-e.startAt)));
    const smooth=t*t*(3-2*t);
    b.x=e.fromX+(e.toX-e.fromX)*smooth;
    b.z=e.fromZ+(e.toZ-e.fromZ)*smooth;
  }
  if(now>=e.endAt){
    b.x=e.toX;b.z=e.toZ;b.evade=null;
    markDirty(room);
    return false;
  }
  return true;
}
function incomingBossThreats(room,horizon=.72){
  const b=room.state.boss,threats=[];
  for(const pr of room.state.projectiles){
    if(pr.enemy||pr.t<=0)continue;
    const vv=pr.vx*pr.vx+pr.vz*pr.vz;
    if(vv<.01)continue;
    const rx=b.x-pr.x,rz=b.z-pr.z;
    const closestT=Math.max(0,Math.min(horizon,(rx*pr.vx+rz*pr.vz)/vv));
    const cx=pr.x+pr.vx*closestT,cz=pr.z+pr.vz*closestT;
    const miss=Math.hypot(cx-b.x,cz-b.z);
    if(closestT>.035&&miss<1.92)threats.push({pr,closestT,miss});
  }
  threats.sort((a,b)=>a.closestT-b.closestT||a.miss-b.miss);
  return threats;
}
function bossEvadeDestination(room,threat,distance){
  const b=room.state.boss,pr=threat.pr,l=Math.hypot(pr.vx,pr.vz)||1;
  const px=-pr.vz/l,pz=pr.vx/l;
  const candidates=[
    clampBossToArena(b.x+px*distance,b.z+pz*distance),
    clampBossToArena(b.x-px*distance,b.z-pz*distance)
  ];
  const score=point=>{
    const edge=7.25-Math.hypot(point.x,point.z);
    const playerGap=Math.min(...['hero','princess'].map(role=>{
      const p=room.state.players[role];return Math.hypot(point.x-p.x,point.z-p.z);
    }));
    return edge*1.8+Math.min(4,playerGap)*.32;
  };
  return score(candidates[0])>=score(candidates[1])?candidates[0]:candidates[1];
}
function tryBossEvade(room,now){
  const s=room.state,b=s.boss;
  if(b.hp<=0||b.evade||s.activeCast||s.activeCombo||b.pendingPhase||now<(b.staggerUntil||0)||now<(b.phaseLockUntil||0)||now<(b.dodgeReadyAt||0))return false;
  const threats=incomingBossThreats(room);
  if(!threats.length)return false;
  const chance=b.phase===1?.24:b.phase===2?.38:.54;
  if(!TEST_BOSS_DODGE&&Math.random()>chance)return false;

  b.dodgeSeq=(b.dodgeSeq||0)+1;
  const crowded=threats.filter(t=>t.closestT<.42).length>=2;
  const useTeleport=TEST_BOSS_DODGE==='12'||(!TEST_BOSS_DODGE&&b.phase>=2&&(crowded||b.dodgeSeq%(b.phase===3?3:4)===0));
  const kind=useTeleport?'teleport':'strafe';
  const duration=useTeleport?260:390;
  const destination=bossEvadeDestination(room,threats[0],useTeleport?3.15:2.25);
  const evade={
    id:b.dodgeSeq,kind,clip:useTeleport?12:3,startAt:now,endAt:now+duration,
    fromX:b.x,fromZ:b.z,toX:destination.x,toZ:destination.z
  };
  b.evade=evade;
  b.evadeInvUntil=now+(useTeleport?300:260);
  b.dodgeReadyAt=now+(b.phase===1?2550:b.phase===2?2050:1650);
  b.skillT=Math.max(b.skillT,useTeleport?.62:.42);
  if(useTeleport){b.x=destination.x;b.z=destination.z}
  broadcast(room,{type:'event',e:'bossEvade',p:{...evade,threats:threats.length}});
  markDirty(room);
  return true;
}
function bossCanBeHit(b,now=Date.now()){
  return now>=(b.evadeInvUntil||0)&&now>=(b.phaseLockUntil||0);
}

function spawnPickup(room,food=null){
  const s=room.state,id=s.nextPickup++,a=Math.random()*Math.PI*2,r=2.2+Math.random()*5.0;
  s.pickups.push({id,food:food??Math.floor(Math.random()*FOODS.length),x:Math.cos(a)*r,z:Math.sin(a)*r});
  markDirty(room);
}
function reaction(a,b){
  const pair=[a,b].sort().join('+');
  if(pair==='fresh+sweet')return['NỞ HOA',1.55];
  if(pair==='crispy+spicy')return['BÙNG GIÒN',1.60];
  if(pair==='ice+spicy')return['SỐC NHIỆT',1.80];
  if(pair==='fresh+ice')return['ĐÔNG SƯƠNG',1.45];
  return null;
}
function bossWeakPointForHit(room,pr,now){
  const s=room.state,b=s.boss,owner=s.players[pr.owner];
  let id='body',chance=BOSS_BODY_CRIT_CHANCE,label='BODY';
  if(now<(b.orbWeakUntil||0)&&s.activeCast&&[0,1,2,4].includes(s.activeCast.i)){
    id='orb';chance=.10;label='CASTING ORB';
  }
  if(now<(b.backWeakUntil||0)){
    id='back';chance=.09;label='BACK AFTER TELEPORT';
  }
  if(now<(b.upperWeakUntil||0)){
    id='upper';chance=.11;label='UPPER TORSO RECOVERY';
  }
  const counter=!!(owner&&now<(owner.counterUntil||0));
  if(counter)chance=Math.min(.17,chance+(id==='body'?.025:.05));
  if(pr.weakPointOverride){id=pr.weakPointOverride;label=String(pr.weakPointOverride).toUpperCase();chance=Math.max(chance,Number(pr.critChanceOverride)||chance)}
  return{id,label,chance,counter};
}
function bossPoiseDamage(pr){
  if(pr.kind==='sword')return pr.finisher?15:6+(Number(pr.combo)||0)*3;
  if(pr.kind==='starWave'||pr.kind==='roseWave')return 9;
  if(pr.kind==='royal')return 30;
  return 5;
}
const BOSS_INTERRUPT_TASKS=new Set([
  'start_dark_pool','boss_radial','boss_orb_volley','boss_orb_radial','boss_spirit_orb','dream_slash',
  'teleport_kick_reposition','spin_kick_hit','summon_dreams','dream_move','three_am_edges','boss_ultimate_phase','boss_combo_step'
]);
function interruptBossCombo(room,now,reason='critical_break'){
  const s=room.state,b=s.boss,combo=s.activeCombo,cast=s.activeCast;
  s.tasks=(s.tasks||[]).filter(task=>!BOSS_INTERRUPT_TASKS.has(task.type));
  s.activeCast=null;s.activeCombo=null;b.skillT=1.15;
  broadcast(room,{type:'event',e:'bossComboInterrupted',p:{reason,comboId:combo?.comboId||'',comboName:combo?.name||'',castId:cast?.id||0,ts:now}});
}
function hitBoss(room,pr){
  const s=room.state,b=s.boss,f=FOODS[pr.food],owner=s.players[pr.owner];
  const now=Number.isFinite(pr.hitTs)?pr.hitTs:Date.now(),exposed=now<(b.exposedUntil||0);
  let weak=f.el==='fresh'?1.25:1,bonus=1;
  if(b.lastEl&&b.lastEl!==f.el&&b.lastElT>0){
    const r=reaction(b.lastEl,f.el);
    if(r){
      bonus=r[1];s.trust=Math.min(100,s.trust+6);
      broadcast(room,{type:'event',e:'reaction',p:{name:r[0]}});
    }
  }
  b.lastEl=f.el;b.lastElT=1.15;
  const weakPoint=bossWeakPointForHit(room,pr,now);
  const critical=TEST_BOSS_CRIT||Math.random()<weakPoint.chance;
  const poiseDamage=bossPoiseDamage(pr)*(critical?2.35:1);
  const poiseBefore=b.poise;
  let poiseAfter=Math.max(0,poiseBefore-poiseDamage);
  const canBreak=critical&&poiseAfter<=0&&now>=(b.staggerResistUntil||0);
  if(!canBreak&&poiseAfter<=0)poiseAfter=1;
  b.poise=poiseAfter;b.poiseRegenAt=now+BOSS_POISE_REGEN_DELAY_MS;
  const damageMultiplier=(exposed?BOSS_EXPOSE_DAMAGE_MULTIPLIER:1)*(critical?BOSS_CRIT_MULTIPLIER:1);
  const dmg=pr.dmg*weak*bonus*damageMultiplier;
  b.hp-=dmg;owner.score+=dmg;
  if(exposed)b.exposedHitCount=(b.exposedHitCount||0)+1;
  if(canBreak){
    b.staggerUntil=now+BOSS_BREAK_STAGGER_MS;
    b.staggerResistUntil=b.staggerUntil+BOSS_BREAK_RESIST_MS;
    b.criticalUntil=b.staggerUntil;
    interruptBossCombo(room,now,'critical_break');
  }else if(critical){
    b.criticalUntil=Math.max(b.criticalUntil||0,now+BOSS_CRITICAL_STAGGER_MS);
  }
  broadcast(room,{type:'event',e:'combatHit',p:{
    target:'boss',owner:pr.owner,aid:pr.aid||null,kind:pr.kind||'projectile',dmg:Math.round(dmg),
    combo:Number(pr.combo)||0,finisher:pr.finisher===true,exposed,damageMultiplier,
    critical,criticalBreak:canBreak,criticalMultiplier:critical?BOSS_CRIT_MULTIPLIER:1,
    weakPoint:weakPoint.id,weakPointLabel:weakPoint.label,critChance:weakPoint.chance,counterWindow:weakPoint.counter,
    poise:Math.round(b.poise),poiseMax:b.poiseMax,poiseDamage:Math.round(poiseDamage),staggerUntil:b.staggerUntil||0,staggerResistUntil:b.staggerResistUntil||0,
    x:b.x,z:b.z,ts:now
  }});
  if(critical)broadcast(room,{type:'event',e:canBreak?'bossCriticalBreak':'bossCriticalHit',p:{
    owner:pr.owner,aid:pr.aid||null,weakPoint:weakPoint.id,dmg:Math.round(dmg),poise:Math.round(b.poise),
    staggerUntil:canBreak?b.staggerUntil:b.criticalUntil,resistUntil:b.staggerResistUntil||0,ts:now
  }});
  markDirty(room);
}
function fastForwardPlayerProjectile(room,pr,ms){
  const dt=Math.max(0,Math.min(MAX_PROJECTILE_FAST_FORWARD_MS,ms))/1000;
  if(dt<=0)return;
  const x1=pr.x,z1=pr.z,x2=x1+pr.vx*dt,z2=z1+pr.vz*dt;
  const b=room.state.boss;
  if(bossCanBeHit(b)&&segmentCircleHit(x1,z1,x2,z2,b.x,b.z,1.55)){
    hitBoss(room,pr);
    pr.t=0;
  }else{
    pr.x=x2;pr.z=z2;pr.t-=dt;
  }
}
function resolvePlayerSwordImpact(room,strike){
  const s=room.state,p=s.players[strike.role],b=s.boss;
  let hit=false,targetType='air',hitX=strike.x+strike.dx*strike.reach,hitZ=strike.z+strike.dz*strike.reach;
  const endX=hitX,endZ=hitZ;
  if(p&&!p.down){
    let nearestSummon=null,nearestSummonDistance=Infinity;
    for(const summon of s.summons||[]){
      if(summon.hp<=0||!segmentCircleHit(strike.x,strike.z,endX,endZ,summon.x,summon.z,.66))continue;
      const distance=Math.hypot(summon.x-strike.x,summon.z-strike.z);
      if(distance<nearestSummonDistance){nearestSummon=summon;nearestSummonDistance=distance}
    }
    const bossDistance=Math.hypot(b.x-strike.x,b.z-strike.z);
    const bossHit=b.hp>0&&bossCanBeHit(b,strike.impactAt)&&segmentCircleHit(strike.x,strike.z,endX,endZ,b.x,b.z,1.55);
    if(nearestSummon&&(!bossHit||nearestSummonDistance<bossDistance)){
      const damage=strike.damage;
      nearestSummon.hp-=damage;hit=true;targetType='summon';hitX=nearestSummon.x;hitZ=nearestSummon.z;
      broadcast(room,{type:'event',e:'summonHit',p:{id:nearestSummon.id,dmg:Math.round(damage),hp:Math.max(0,nearestSummon.hp)}});
      if(nearestSummon.hp<=0){
        broadcast(room,{type:'event',e:'summonDefeated',p:{id:nearestSummon.id,x:nearestSummon.x,z:nearestSummon.z,y:nearestSummon.y}});
        s.trust=Math.min(100,s.trust+4);
      }
    }else if(bossHit){
      hit=true;targetType='boss';hitX=b.x;hitZ=b.z;
      hitBoss(room,{owner:strike.role,aid:strike.aid,food:strike.food,dmg:strike.damage,kind:'sword',combo:strike.combo,finisher:strike.finisher,hitTs:strike.impactAt});
      s.trust=Math.min(100,s.trust+(strike.finisher?3:1));
    }
  }
  broadcast(room,{type:'event',e:'swordImpact',p:{
    role:strike.role,aid:strike.aid,combo:strike.combo,finisher:strike.finisher,hit,target:targetType,
    x:strike.x,z:strike.z,targetX:hitX,targetZ:hitZ,startAt:strike.startAt,impactAt:strike.impactAt
  }});
  markDirty(room);
}
function recordBossObservedAction(room,role,action,now=Date.now()){
  const memory=room.state.boss.actionMemory||(room.state.boss.actionMemory=[]);
  memory.push({role,action,ts:now});
  while(memory.length>48||memory[0]&&now-memory[0].ts>8000)memory.shift();
}
function spawnShot(room,role,skill=false,actionTs=Date.now(),aid=null){
  const s=room.state,p=s.players[role],b=s.boss,f=FOODS[p.food];
  if(p.down)return{accepted:false,projectiles:[],reason:'DOWN'};
  actionTs=clampActionTs(actionTs);
  const shooter=sampleHistory(room,role,actionTs);
  const target=sampleHistory(room,'boss',actionTs);
  const [dx,dz]=norm(target.x-shooter.x,target.z-shooter.z);
  p.rot=Math.atan2(dx,dz);

  // V10.17: the basic action is a true server-authoritative sword strike.
  // Only the Skill action creates ranged projectiles.
  if(!skill){
    if(p.atkCd>0)return{accepted:false,projectiles:[],reason:'COOLDOWN'};
    const comboNow=Date.now();
    p.combo=comboNow<=(p.comboUntil||0)?((p.combo||0)+1)%3:0;
    p.comboUntil=comboNow+880;
    const combo=p.combo,finisher=combo===2;
    p.atkCd=[.27,.30,.40][combo];
    const reach=[2.70,2.78,3.02][combo];
    const damageScale=[1.06,1.18,1.48][combo];
    const impactDelayMs=[118,138,205][combo],impactAt=actionTs+impactDelayMs;
    scheduleTask(room,Math.max(0,impactAt-Date.now()),'player_sword_impact',{
      role,aid,food:p.food,combo,finisher,reach,damage:f.dmg*damageScale,
      x:shooter.x,z:shooter.z,dx,dz,startAt:actionTs,impactAt
    });
    broadcast(room,{type:'event',e:'swordSlash',p:{
      role,aid,combo,finisher,pending:true,x:shooter.x,z:shooter.z,
      targetX:shooter.x+dx*reach,targetZ:shooter.z+dz*reach,startAt:actionTs,impactAt
    }});
    recordBossObservedAction(room,role,'attack',actionTs);
    markDirty(room);
    return{accepted:true,projectiles:[],melee:true,scheduled:true,combo,finisher,impactAt};
  }

  if(p.skillCd>0)return{accepted:false,projectiles:[],reason:'COOLDOWN'};
  p.skillCd=2.8;
  recordBossObservedAction(room,role,'skill',actionTs);
  const skillProfile=role==='hero'
    ?{kind:'starWave',style:'STELLAR_CRESCENT',count:3,spread:.065,speed:12.4,damage:1.72}
    :{kind:'roseWave',style:'ROSE_FAN',count:5,spread:.115,speed:11.2,damage:1.46};
  const base=Math.atan2(dz,dx),n=skillProfile.count;
  const latencyMs=Math.max(0,Date.now()-actionTs);
  const spawned=[];

  for(let i=0;i<n;i++){
    const a=base+(i-(n-1)/2)*skillProfile.spread;
    const pr={
      id:s.nextProj++,aid,owner:role,enemy:false,kind:skillProfile.kind,food:p.food,
      x:shooter.x,z:shooter.z,y:1.28,
      vx:Math.cos(a)*skillProfile.speed,vz:Math.sin(a)*skillProfile.speed,
      dmg:f.dmg*skillProfile.damage,t:3
    };
    fastForwardPlayerProjectile(room,pr,latencyMs);
    if(pr.t>0){
      s.projectiles.push(pr);
      spawned.push({id:pr.id,x:pr.x,y:pr.y,z:pr.z,vx:pr.vx,vz:pr.vz,food:pr.food,aid,kind:pr.kind});
    }
  }

  s.trust=Math.min(100,s.trust+4);
  broadcast(room,{type:'event',e:'banner',p:{msg:`✦ ${role==='hero'?'TINH NGUYỆT TRẢM':'HOÀNG GIA HOA VŨ'}`}});
  broadcast(room,{type:'event',e:'actionAnim',p:{role,a:'skill',aid,style:skillProfile.style,startAt:actionTs}});
  markDirty(room);
  return{accepted:true,projectiles:spawned,style:skillProfile.style};
}
function dash(room,role,actionTs=Date.now(),aid=null){
  const p=room.state.players[role];
  if(p.down)return{accepted:false,reason:'DOWN'};
  if(p.dash>0)return{accepted:false,reason:'DASH_ACTIVE'};
  if(p.stamina<22)return{accepted:false,reason:'STAMINA'};
  actionTs=clampActionTs(actionTs);
  let x=p.input.x,z=p.input.y;
  if(Math.hypot(x,z)<.1){x=Math.sin(p.rot);z=Math.cos(p.rot);}
  [x,z]=norm(x,z);
  p.stamina-=22;p.vx=x*13;p.vz=z*13;p.dash=.25;p.inv=.34;p.lastDashTs=actionTs;
  recordBossObservedAction(room,role,'dash',actionTs);
  broadcast(room,{type:'event',e:'dash',p:{role,x,z,aid,startAt:actionTs}});
  markDirty(room);
  return{accepted:true,reason:''};
}
function hurt(room,role,n){
  const p=room.state.players[role];
  if(isCombatTest(room)){
    // Server-authoritative invulnerability for the isolated combat lab. The
    // production co-op path below remains untouched and still applies damage.
    p.hp=100;p.down=false;p.revive=0;p.inv=Math.max(p.inv||0,.18);
    broadcast(room,{type:'event',e:'testGuard',p:{role,dmg:n,mode:room.testMode}});
    markDirty(room);
    return;
  }
  if(p.inv>0||p.down)return;
  p.hp-=n;p.inv=.35;
  broadcast(room,{type:'event',e:'playerHit',p:{role,dmg:n,hp:Math.max(0,p.hp),ts:Date.now()}});
  if(p.hp<=0){
    p.hp=0;p.down=true;p.revive=3.2;
    broadcast(room,{type:'event',e:'banner',p:{msg:`${role==='princess'?'Công chúa':'Hero'} bị hạ!`}});
  }
  markDirty(room);
}
function perfect(room,role){
  const p=room.state.players[role];
  const now=Date.now();
  p.perfect++;p.inv=.45;p.counterUntil=now+BOSS_COUNTER_WINDOW_MS;room.state.trust=Math.min(100,room.state.trust+10);
  broadcast(room,{type:'event',e:'perfect',p:{role,counterUntil:p.counterUntil,weakPointCritBonus:.05}});
  markDirty(room);
}
function queueEnemyHit(room,role,dmg,hitTs=Date.now()){
  const s=room.state;
  s.pendingHits.push({
    id:s.nextHit++,role,dmg,hitTs,
    applyAt:hitTs+HIT_CONFIRM_DELAY_MS
  });
  markDirty(room);
}
function processPendingHits(room,now){
  const s=room.state,keep=[];
  for(const hit of s.pendingHits){
    if(now<hit.applyAt){keep.push(hit);continue}
    const p=s.players[hit.role];
    const dashWasValid=
      p.lastDashTs>0 &&
      p.lastDashTs<=hit.hitTs &&
      hit.hitTs-p.lastDashTs<=DASH_IFRAME_MS;
    if(dashWasValid||p.dash>0||p.inv>0)perfect(room,hit.role);
    else hurt(room,hit.role,hit.dmg);
  }
  s.pendingHits=keep;
}
function healFavorite(room,from,food){
  const mate=from==='hero'?'princess':'hero',p=room.state.players[mate];
  p.hp=Math.min(100,p.hp+20);room.state.trust=Math.min(100,room.state.trust+15);
  broadcast(room,{type:'event',e:'favorite',p:{msg:`💚 ${FOODS[food].name.toUpperCase()} LÀ MÓN ${mate==='princess'?'CÔNG CHÚA':'HERO'} THÍCH → +20% HP`}});
  markDirty(room);
}

function radial(room,n,speed,dmg,kind,angleOffset=0,y=2.65){
  const s=room.state,b=s.boss;
  for(let i=0;i<n;i++){
    const a=angleOffset+i/n*Math.PI*2;
    s.projectiles.push({
      id:s.nextProj++,owner:null,enemy:true,kind,food:2,
      x:b.x,z:b.z,y,vx:Math.cos(a)*speed,vz:Math.sin(a)*speed,dmg,t:3
    });
  }
  markDirty(room);
}
function livingBossTarget(s,preferredRole=null){
  const preferred=preferredRole&&s.players[preferredRole];
  if(preferred&&!preferred.down)return preferred;
  const alive=['hero','princess'].map(role=>s.players[role]).filter(player=>player&&!player.down);
  if(!alive.length)return null;
  const b=s.boss;
  return alive.sort((a,c)=>d2(a.x,a.z,b.x,b.z)-d2(c.x,c.z,b.x,b.z))[0];
}
function bossOrbVolley(room,{count=1,spread=.13,speed=7.2,dmg=11,targetRole=null,castId=null}={}){
  const s=room.state,b=s.boss,target=livingBossTarget(s,targetRole);
  if(!target)return;
  const dx=target.x-b.x,dz=target.z-b.z,length=Math.hypot(dx,dz)||1;
  const aimX=dx/length,aimZ=dz/length,leftX=-aimZ,leftZ=aimX;
  const originX=b.x+leftX*.68+aimX*.10,originZ=b.z+leftZ*.68+aimZ*.10;
  const ids=[];
  for(let shot=0;shot<count;shot++){
    const angle=Math.atan2(aimZ,aimX)+(shot-(count-1)*.5)*spread;
    const projectile={
      id:s.nextProj++,owner:null,enemy:true,kind:'orbclone',food:2,
      x:originX,z:originZ,y:2.62,vx:Math.cos(angle)*speed,vz:Math.sin(angle)*speed,
      dmg,t:2.45,castId,bornAt:Date.now()
    };
    s.projectiles.push(projectile);ids.push(projectile.id);
  }
  broadcast(room,{type:'event',e:'bossOrbVolley',p:{ids,count,targetRole:target.role,castId,radial:false}});
  markDirty(room);
}
function bossOrbRadial(room,{n=10,speed=5.8,dmg=10,angleOffset=0,castId=null}={}){
  const s=room.state,b=s.boss,ids=[];
  for(let shot=0;shot<n;shot++){
    const angle=angleOffset+shot/n*Math.PI*2;
    const projectile={
      id:s.nextProj++,owner:null,enemy:true,kind:'orbclone',food:2,
      x:b.x,z:b.z,y:2.62,vx:Math.cos(angle)*speed,vz:Math.sin(angle)*speed,
      dmg,t:3,castId,bornAt:Date.now()
    };
    s.projectiles.push(projectile);ids.push(projectile.id);
  }
  broadcast(room,{type:'event',e:'bossOrbVolley',p:{ids,count:n,castId,radial:true}});
  markDirty(room);
}
function bossSpiritOrb(room,{targetRole=null,castId=null}={}){
  const s=room.state,b=s.boss,target=livingBossTarget(s,targetRole);
  if(!target)return;
  const dx=target.x-b.x,dz=target.z-b.z,length=Math.hypot(dx,dz)||1;
  const aimX=dx/length,aimZ=dz/length,leftX=-aimZ,leftZ=aimX;
  const speed=4.75+b.phase*.28;
  const projectile={
    id:s.nextProj++,owner:null,enemy:true,kind:'spiritOrb',food:2,
    x:b.x+leftX*.68+aimX*.12,z:b.z+leftZ*.68+aimZ*.12,y:2.62,
    vx:aimX*speed,vz:aimZ*speed,speed,turnRate:2.55+b.phase*.24,
    targetRole:target.role,dmg:14+b.phase*2,t:3.45,castId,bornAt:Date.now()
  };
  s.projectiles.push(projectile);
  broadcast(room,{type:'event',e:'bossSpiritOrbLaunch',p:{
    id:projectile.id,targetRole:target.role,castId,launchAt:projectile.bornAt,endAt:projectile.bornAt+3450
  }});
  markDirty(room);
}
function scheduleTask(room,delayMs,type,data={}){
  const s=room.state;
  s.tasks.push({id:s.nextTask++,dueAt:Date.now()+delayMs,type,data});
  markDirty(room);
}
function runTask(room,task){
  const s=room.state,b=s.boss;
  if(!s.started||s.paused)return;
  if(task.type==='player_sword_impact'){
    resolvePlayerSwordImpact(room,task.data);
  }else if(task.type==='start_dark_pool'){
    const b=s.boss;
    s.darkPool={x:b.x,z:b.z,r:.5,t:1.6};
  }else if(task.type==='boss_radial'){
    radial(room,task.data.n,task.data.speed,task.data.dmg,task.data.kind,task.data.angleOffset||0,task.data.y||2.65);
  }else if(task.type==='boss_orb_volley'){
    bossOrbVolley(room,task.data);
  }else if(task.type==='boss_orb_radial'){
    bossOrbRadial(room,task.data);
  }else if(task.type==='boss_spirit_orb'){
    bossSpiritOrb(room,task.data);
  }else if(task.type==='dream_slash'){
    const p=s.players[task.data.role||'hero'];
    if(p&&!p.down){
      const dx=p.x-s.boss.x,dz=p.z-s.boss.z,l=Math.hypot(dx,dz)||1;
      const base=Math.atan2(dz,dx);
      for(let j=-2;j<=2;j++){
        const a=base+j*.12;
        s.projectiles.push({id:s.nextProj++,owner:null,enemy:true,kind:'slash',food:2,x:s.boss.x,z:s.boss.z,y:1.25,vx:Math.cos(a)*8.4,vz:Math.sin(a)*8.4,dmg:12+s.boss.phase,t:1.45});
      }
    }
  }else if(task.type==='teleport_kick_reposition'){
    let role=task.data.role||'hero',p=s.players[role];
    if(!p||p.down){role=role==='hero'?'princess':'hero';p=s.players[role]}
    if(p){
      // Arrive behind the target. The server owns the new position so both phones
      // see the same teleport and the visual boss never separates from its hitbox.
      const distance=task.data.distance||1.62;
      b.x=p.x-Math.sin(p.rot||0)*distance;
      b.z=p.z-Math.cos(p.rot||0)*distance;
      const arenaR=Math.hypot(b.x,b.z);
      if(arenaR>7.35){b.x*=7.35/arenaR;b.z*=7.35/arenaR}
      b.backWeakUntil=Date.now()+780;
      broadcast(room,{type:'event',e:'bossTeleportKick',p:{role,x:b.x,z:b.z,kickAt:task.data.kickAt,impactAt:task.data.impactAt}});
      broadcast(room,{type:'event',e:'bossWeakPoint',p:{point:'back',label:'LƯNG · SAU TELEPORT',until:b.backWeakUntil,chance:.09}});
    }
  }else if(task.type==='spin_kick_hit'){
    const radius=task.data.radius||2.2,dmg=task.data.dmg||16,hitRoles=[];
    for(const role of ['hero','princess']){
      const p=s.players[role];
      if(!p.down&&d2(p.x,p.z,b.x,b.z)<=radius*radius){
        queueEnemyHit(room,role,dmg,Date.now());hitRoles.push(role);
      }
    }
    broadcast(room,{type:'event',e:'spinKickImpact',p:{x:b.x,z:b.z,radius,dmg,hitRoles}});
    if(!hitRoles.length){
      b.upperWeakUntil=Date.now()+980;
      broadcast(room,{type:'event',e:'bossWeakPoint',p:{point:'upper',label:'THÂN TRÊN · HEAVY MISS',until:b.upperWeakUntil,chance:.11}});
    }
  }else if(task.type==='summon_dreams'){
    const count=Math.min(3,task.data.count||2),spawned=[];
    for(let i=0;i<count;i++){
      const a=(i/count)*Math.PI*2+Math.random()*.5;
      const r=5.7+Math.random()*1.6;
      const m={id:s.nextSummon++,x:s.boss.x+Math.cos(a)*r,z:s.boss.z+Math.sin(a)*r,y:1.15,hp:45,max:45,t:24,atkT:.8};
      s.summons.push(m);spawned.push({id:m.id,x:m.x,z:m.z,y:m.y});
    }
    broadcast(room,{type:'event',e:'summonSpawn',p:{count,points:spawned}});
    dialogue(room,'boss','Ra đây… những giấc mộng lạc lối.',2100);
  }else if(task.type==='dream_move'){
    for(const m of s.summons){
      const p=s.players[task.data.role||'hero'];
      const dx=p.x-m.x,dz=p.z-m.z,l=Math.hypot(dx,dz)||1;
      m.x+=dx/l*.7;m.z+=dz/l*.7;
    }
  }else if(task.type==='dialogue'){
    dialogue(room,task.data.speaker,task.data.text,task.data.duration||1900);
  }else if(task.type==='three_am_edges'){
    for(let side=0;side<4;side++)for(let j=0;j<4;j++){
      let x,z,vx,vz;
      if(side===0){x=-8;z=-7+Math.random()*14;vx=7.2;vz=0;}
      else if(side===1){x=8;z=-7+Math.random()*14;vx=-7.2;vz=0;}
      else if(side===2){x=-7+Math.random()*14;z=-8;vx=0;vz=7.2;}
      else{x=-7+Math.random()*14;z=8;vx=0;vz=-7.2;}
      s.projectiles.push({id:s.nextProj++,owner:null,enemy:true,kind:'thought',food:2,x,z,y:1,vx,vz,dmg:10+b.phase,t:3});
    }
  }else if(task.type==='boss_ultimate_phase'){
    const phase=Number(task.data.phase)||1,castId=task.data.castId;
    broadcast(room,{type:'event',e:'bossUltimatePhase',p:{phase,name:task.data.name||'',castId,ts:Date.now()}});
    if(phase===2){
      bossOrbRadial(room,{n:14,speed:5.2,dmg:12+b.phase,angleOffset:.16,castId});
      radial(room,9,6.0,11+b.phase,'shard',.34,2.55);
    }else if(phase===3){
      radial(room,12,5.2,14+b.phase,'night',.08,1.55);
      radial(room,8,7.0,13+b.phase,'thought',.31,1.25);
    }else if(phase===4){
      radial(room,16,6.4,12+b.phase,'shard',.17,2.45);
      runTask(room,{type:'summon_dreams',data:{count:2,castId}});
    }
  }else if(task.type==='spawn_pickup'){
    spawnPickup(room,task.data.food??null);
  }
  markDirty(room);
}
function processTasks(room,now){
  const s=room.state,keep=[];
  for(const task of s.tasks){
    const castId=task.data?.castId;
    if(castId&&BOSS_INTERRUPT_TASKS.has(task.type)&&s.activeCast?.id!==castId)continue;
    if(task.dueAt<=now)runTask(room,task);
    else keep.push(task);
  }
  s.tasks=keep;
}
const BOSS_COMBAT_DIRECTOR={
  1:{name:'MOON LESSON',cooldown:4.05,patterns:[
    {id:'crescent_lesson',name:'CRESCENT LESSON',skills:[0,3]},
    {id:'royal_circle',name:'ROYAL CIRCLE',skills:[1,3]}
  ]},
  2:{name:'SLEEPLESS WALTZ',cooldown:3.45,patterns:[
    {id:'blink_barrage',name:'BLINK BARRAGE',skills:[3,0,1]},
    {id:'sleepless_clock',name:'SLEEPLESS CLOCK',skills:[2,3,1]}
  ]},
  3:{name:'ETERNAL ECLIPSE',cooldown:3.15,patterns:[
    {id:'eclipse_hunt',name:'ECLIPSE HUNT',skills:[3,0,4]},
    {id:'final_waltz',name:'FINAL WALTZ',skills:[1,2,3,4]}
  ]}
};
const BOSS_COMBO_LIBRARY={
  normal:[
    {id:'lunar_probe',name:'LUNAR PROBE',phase:1,range:'mid',steps:[{skill:0},{skill:0,delayMs:180},{skill:1}]},
    {id:'crescent_cross',name:'CRESCENT CROSS',phase:1,range:'close',steps:[{skill:0},{skill:3},{skill:0}]},
    {id:'royal_orbit',name:'ROYAL ORBIT',phase:1,range:'mid',steps:[{skill:1},{skill:0},{skill:1}]},
    {id:'blink_reaver',name:'BLINK REAVER',phase:1,range:'far',punish:'dash',steps:[{skill:3},{skill:0},{skill:3}]},
    {id:'night_pincer',name:'NIGHT PINCER',phase:1,range:'mid',steps:[{skill:0},{skill:3},{skill:1}]},
    {id:'false_mercy',name:'FALSE MERCY',phase:2,range:'close',punish:'attack',steps:[{fake:'opening',durationMs:620},{skill:0,delayMs:360},{skill:3}]},
    {id:'gravity_waltz',name:'GRAVITY WALTZ',phase:2,range:'close',steps:[{skill:1},{skill:3},{skill:1},{skill:0}]},
    {id:'three_am_lock',name:'03:00 LOCK',phase:2,range:'far',punish:'dash',steps:[{skill:2},{skill:0},{skill:3}]},
    {id:'orb_guillotine',name:'ORB GUILLOTINE',phase:2,range:'mid',punish:'attack',steps:[{skill:0},{skill:0,delayMs:260},{skill:1},{skill:3}]},
    {id:'sleepwalker_mixup',name:'SLEEPWALKER MIX-UP',phase:2,range:'close',steps:[{fake:'orb',durationMs:540},{skill:3},{skill:1},{skill:0}]},
    {id:'eclipse_hunt',name:'ECLIPSE HUNT',phase:3,range:'far',punish:'dash',steps:[{skill:3},{skill:0},{skill:2},{skill:1},{skill:3}]},
    {id:'nocturne_chain',name:'NOCTURNE CHAIN',phase:3,range:'mid',punish:'attack',steps:[{skill:1},{skill:0},{skill:3},{skill:0},{skill:1},{skill:3}]}
  ],
  signature:[
    {id:'queen_checkmate',name:"QUEEN'S CHECKMATE",phase:2,range:'close',tier:'signature',cooldownMs:22000,steps:[{skill:3},{skill:0},{skill:1},{skill:3},{skill:0}]},
    {id:'sleepless_dominion',name:'SLEEPLESS DOMINION',phase:2,range:'far',tier:'signature',punish:'skill',cooldownMs:26000,steps:[{skill:2},{skill:1},{skill:0},{skill:3},{skill:1},{skill:0}]},
    {id:'black_moon_requiem',name:'BLACK MOON REQUIEM',phase:3,range:'mid',tier:'signature',cooldownMs:30000,steps:[{skill:3},{skill:1},{skill:0},{skill:2},{skill:3},{skill:1},{skill:0}]}
  ],
  ultimate:{id:'eternal_eclipse',name:'ETERNAL ECLIPSE · FOUR MOVEMENTS',phase:3,range:'any',tier:'ultimate',cooldownMs:999999,steps:[{skill:4,ultimate:true}]}
};
function bossCombatContext(room,now=Date.now()){
  const s=room.state,b=s.boss,living=['hero','princess'].map(role=>s.players[role]).filter(p=>!p.down);
  const distance=living.length?Math.min(...living.map(p=>Math.hypot(p.x-b.x,p.z-b.z))):5;
  b.actionMemory=(b.actionMemory||[]).filter(item=>now-item.ts<=8000);
  const recent=(action,windowMs)=>b.actionMemory.filter(item=>item.action===action&&now-item.ts<=windowMs).length;
  return{distance,dashSpam:recent('dash',3200),attackSpam:recent('attack',2800),skillSpam:recent('skill',5000),counterActive:living.some(p=>now<(p.counterUntil||0)),hpRatio:b.hp/b.max,phase:b.phase};
}
function bossComboRangeScore(range,distance){
  if(range==='any')return 2;
  const ideal=range==='close'?1.9:range==='far'?6.3:4.0;
  return Math.max(-3,4-Math.abs(distance-ideal)*1.25);
}
function chooseBossCombo(room,now=Date.now()){
  const b=room.state.boss,ctx=bossCombatContext(room,now);
  if(Number.isInteger(TEST_BOSS_SKILL)&&TEST_BOSS_SKILL>=0&&TEST_BOSS_SKILL<=4){
    return{id:`test_combo_${TEST_BOSS_SKILL}`,name:'TEST COMBO',phase:1,range:'any',steps:[{skill:TEST_BOSS_SKILL},{skill:TEST_BOSS_SKILL},{skill:TEST_BOSS_SKILL}]};
  }
  if(ctx.phase===3&&ctx.hpRatio<=.28&&!b.ultimateUsed){b.ultimateUsed=true;return BOSS_COMBO_LIBRARY.ultimate}
  const candidates=[...BOSS_COMBO_LIBRARY.normal,...BOSS_COMBO_LIBRARY.signature].filter(combo=>{
    if(combo.phase>ctx.phase)return false;
    if((b.comboCooldowns?.[combo.id]||0)>now)return false;
    return true;
  });
  const recent=new Set((b.comboHistory||[]).slice(-3));
  let best=null,bestScore=-Infinity;
  for(let index=0;index<candidates.length;index++){
    const combo=candidates[index];
    let score=bossComboRangeScore(combo.range,ctx.distance)+(combo.phase===ctx.phase?1.2:0);
    if(combo.punish==='dash')score+=ctx.dashSpam>=3?8:ctx.dashSpam*1.1;
    if(combo.punish==='attack')score+=ctx.attackSpam>=5?8:ctx.attackSpam*.7;
    if(combo.punish==='skill')score+=ctx.skillSpam>=2?5.5:ctx.skillSpam*1.2;
    if(ctx.counterActive&&combo.range==='far')score+=1.4;
    if(combo.tier==='signature')score+=(ctx.phase>=2?1.1:-8)+(ctx.attackSpam+ctx.dashSpam>=6?1.8:0);
    if(recent.has(combo.id))score-=12;
    if(combo.id===b.lastComboId)score-=20;
    score+=((b.comboSeq+index*3)%7)*.035;
    if(score>bestScore){bestScore=score;best=combo}
  }
  return best||BOSS_COMBO_LIBRARY.normal[0];
}
function comboEstimatedDuration(combo){
  return combo.steps.reduce((total,step)=>total+(step.fake?(step.durationMs||560):step.skill===4?7600:step.skill===2?2600:step.skill===1?2050:step.skill===3?1550:1500)+(step.delayMs||140),0);
}
function startBossCombo(room,combo=chooseBossCombo(room)){
  const s=room.state,b=s.boss,now=Date.now(),comboId=`${combo.id}-${++b.comboSeq}`;
  s.activeCombo={id:comboId,comboId:combo.id,name:combo.name,tier:combo.tier||'normal',steps:combo.steps.map(step=>({...step})),step:0,startedAt:now,nextAt:now};
  b.lastComboId=combo.id;b.comboHistory=[...(b.comboHistory||[]),combo.id].slice(-8);
  b.comboCooldowns[combo.id]=now+(combo.cooldownMs||(combo.tier==='signature'?22000:7600));
  broadcast(room,{type:'event',e:'bossComboStart',p:{id:comboId,comboId:combo.id,name:combo.name,tier:combo.tier||'normal',total:combo.steps.length,startAt:now,estimatedEndAt:now+comboEstimatedDuration(combo)}});
  advanceBossCombo(room,now);
  markDirty(room);
}
function finishBossCombo(room,now){
  const s=room.state,b=s.boss,combo=s.activeCombo;if(!combo)return;
  const recovery=combo.tier==='ultimate'?1500:combo.tier==='signature'?900:650;
  b.exposedUntil=now+recovery;b.exposedCastId=0;b.exposedHitCount=0;
  broadcast(room,{type:'event',e:'bossComboEnd',p:{id:combo.id,comboId:combo.comboId,name:combo.name,tier:combo.tier,until:b.exposedUntil,multiplier:BOSS_EXPOSE_DAMAGE_MULTIPLIER}});
  broadcast(room,{type:'event',e:'bossExposed',p:{castId:0,skill:-1,until:b.exposedUntil,multiplier:BOSS_EXPOSE_DAMAGE_MULTIPLIER,patternName:combo.name}});
  s.activeCombo=null;b.skillT=(BOSS_COMBAT_DIRECTOR[b.phase]?.cooldown||4)*.72;
  markDirty(room);
}
function advanceBossCombo(room,now=Date.now()){
  const s=room.state,b=s.boss,combo=s.activeCombo;
  if(!combo||s.activeCast||b.evade||now<(combo.nextAt||0)||now<(b.staggerUntil||0))return false;
  if(combo.step>=combo.steps.length){finishBossCombo(room,now);return true}
  const stepIndex=combo.step++,step=combo.steps[stepIndex];
  broadcast(room,{type:'event',e:'bossComboStep',p:{id:combo.id,comboId:combo.comboId,name:combo.name,tier:combo.tier,step:stepIndex+1,total:combo.steps.length,skill:Number.isInteger(step.skill)?step.skill:null,fake:step.fake||'',ts:now}});
  if(step.fake){
    const duration=step.durationMs||560;
    combo.nextAt=now+duration;
    broadcast(room,{type:'event',e:'bossFakeOpening',p:{id:combo.id,kind:step.fake,until:combo.nextAt,step:stepIndex+1,total:combo.steps.length}});
    markDirty(room);return true;
  }
  bossSkill(room,{skill:step.skill,combo,comboStep:stepIndex,chain:true,delayMs:step.delayMs||0,ultimate:step.ultimate===true});
  return true;
}
function chooseBossDirectorSkill(room){
  const b=room.state.boss;
  if(Number.isInteger(TEST_BOSS_SKILL)&&TEST_BOSS_SKILL>=0&&TEST_BOSS_SKILL<=4){
    return{skill:TEST_BOSS_SKILL,pattern:{id:'test_skill',name:'TEST SKILL',skills:[TEST_BOSS_SKILL]},step:0,isPatternStart:true};
  }
  const director=BOSS_COMBAT_DIRECTOR[b.phase]||BOSS_COMBAT_DIRECTOR[1];
  let isPatternStart=false;
  if(b.patternIndex<0||b.patternStep>=(director.patterns[b.patternIndex]?.skills.length||0)){
    b.patternIndex=(b.patternIndex+1)%director.patterns.length;b.patternStep=0;isPatternStart=true;
  }
  const pattern=director.patterns[b.patternIndex];
  let skill=pattern.skills[b.patternStep];
  // Never repeat the same move on both sides of a phase/pattern boundary.
  if(skill===b.lastSkill&&pattern.skills.length>1){
    b.patternStep=(b.patternStep+1)%pattern.skills.length;skill=pattern.skills[b.patternStep];
  }
  const step=b.patternStep;b.patternStep++;
  b.patternId=pattern.id;b.patternName=pattern.name;b.lastSkill=skill;b.skillIndex=skill;
  return{skill,pattern,step,isPatternStart};
}
function bossSkill(room,options={}){
  const s=room.state,b=s.boss;
  const selection=Number.isInteger(options.skill)
    ?{skill:options.skill,pattern:{id:options.combo?.comboId||'combo',name:options.combo?.name||'CHAIN',skills:options.combo?.steps||[]},step:options.comboStep||0,isPatternStart:false}
    :chooseBossDirectorSkill(room),i=selection.skill;
  const now=Date.now();
  const baseProfile={
    0:{telegraphMs:880,endMs:2550,exposeMs:680,vfx:'night_pool'},
    1:{telegraphMs:1250,endMs:3500,exposeMs:900,vfx:'moon_shatter'},
    2:{telegraphMs:1450,endMs:4650,exposeMs:1000,vfx:'three_am'},
    3:{telegraphMs:1280,endMs:2350,exposeMs:720,vfx:'teleport_kick'},
    4:{telegraphMs:1800,endMs:7400,exposeMs:1200,vfx:'eternal_night'}
  }[i]||{telegraphMs:880,endMs:2550,exposeMs:680,vfx:'night_pool'};
  const chainProfiles={
    0:{telegraphMs:680,endMs:1420},1:{telegraphMs:940,endMs:1900},2:{telegraphMs:1120,endMs:2500},3:{telegraphMs:860,endMs:1510},4:{telegraphMs:1800,endMs:7400}
  };
  const profile=options.chain?{...baseProfile,...chainProfiles[i],exposeMs:0}:baseProfile;
  if(options.delayMs){profile.telegraphMs+=options.delayMs;profile.endMs+=options.delayMs}
  const {telegraphMs,endMs}=profile;
  const targetRole=i===3?(b.phase%2?'hero':'princess'):null;
  const cast={
    id:s.nextCast++,i,startAt:now,telegraphMs,warningAt:now+Math.round(telegraphMs*.56),
    impactAt:now+telegraphMs,releaseAt:now+telegraphMs,endAt:now+endMs,
    phase:b.phase,targetRole,vfx:profile.vfx,exposeMs:profile.exposeMs,
    patternId:selection.pattern.id,patternName:selection.pattern.name,
    patternStep:selection.step+1,patternLength:selection.pattern.skills.length,
    chain:options.chain===true,comboId:options.combo?.id||'',comboKey:options.combo?.comboId||'',comboName:options.combo?.name||'',
    comboTier:options.combo?.tier||'normal',comboStep:(options.comboStep||0)+1,comboLength:options.combo?.steps?.length||1,chainGapMs:120
  };
  if(i===3){cast.teleportAt=now+250;cast.kickAt=now+360;cast.radius=2.2}
  s.activeCast=cast;
  if([0,1,2,4].includes(i))b.orbWeakUntil=cast.impactAt+140;
  if(selection.isPatternStart)broadcast(room,{type:'event',e:'bossPattern',p:{
    phase:b.phase,id:selection.pattern.id,name:selection.pattern.name,total:selection.pattern.skills.length,startAt:now
  }});
  broadcast(room,{type:'event',e:'bossCast',p:cast});
  if(!options.chain||options.comboStep===0||options.combo?.tier==='ultimate')castDialogue(room,i,b.phase);

  if(i===0){
    // Quick Cast 13: the permanent hand orb charges, while lightweight
    // authoritative orb-clone bullets fan toward the nearest living player.
    scheduleTask(room,telegraphMs,'boss_orb_volley',{
      count:b.phase,speed:6.9+b.phase*.38,dmg:9+b.phase*2,
      spread:b.phase===1?0:.115,targetRole:null,castId:cast.id,comboId:cast.comboId
    });
    // A larger weapon-orb follows the nearest player after the small fan. It
    // uses server steering/hit validation; the GLB hand orb is never moved.
    scheduleTask(room,telegraphMs+320,'boss_spirit_orb',{targetRole:null,castId:cast.id,comboId:cast.comboId});
    scheduleTask(room,telegraphMs,'start_dark_pool',{castId:cast.id,comboId:cast.comboId});
  }else if(i===1){
    // AOE 14: one synchronized ring of orb VFX clones. Later phases retain a
    // delayed shard counter-wave so the player can read the two patterns.
    scheduleTask(room,telegraphMs,'boss_orb_radial',{n:10+b.phase*2,speed:5.55+b.phase*.38,dmg:9+b.phase,angleOffset:Math.random()*.3,castId:cast.id,comboId:cast.comboId});
    if(b.phase>=2)scheduleTask(room,telegraphMs+520,'boss_radial',{n:10,speed:6.6,dmg:10+b.phase,kind:'shard',angleOffset:.26,y:2.5,castId:cast.id,comboId:cast.comboId});
  }else if(i===2){
    scheduleTask(room,telegraphMs,'three_am_edges',{castId:cast.id,comboId:cast.comboId});
    scheduleTask(room,telegraphMs+820,'boss_radial',{n:8,speed:5.7,dmg:9+b.phase,kind:'thought',angleOffset:.2,y:1.4,castId:cast.id,comboId:cast.comboId});
  }else if(i===3){
    // Ảo Ảnh Luân Vũ: Teleport 12 places the boss behind the target, then
    // Spin Kick 07 releases a fair, server-authoritative circular melee hit.
    scheduleTask(room,cast.teleportAt-now,'teleport_kick_reposition',{role:targetRole,distance:1.62,kickAt:cast.kickAt,impactAt:cast.impactAt,castId:cast.id,comboId:cast.comboId});
    scheduleTask(room,cast.impactAt-now,'spin_kick_hit',{radius:cast.radius,dmg:13+b.phase*3,castId:cast.id,comboId:cast.comboId});
  }else if(i===4){
    // Ultimate: four readable movements instead of one undifferentiated burst.
    scheduleTask(room,0,'boss_ultimate_phase',{phase:1,name:'ECLIPSE ASCENT',castId:cast.id,comboId:cast.comboId});
    scheduleTask(room,telegraphMs,'boss_ultimate_phase',{phase:2,name:'ORBITAL JUDGMENT',castId:cast.id,comboId:cast.comboId});
    scheduleTask(room,telegraphMs+2200,'boss_ultimate_phase',{phase:3,name:'BLACK MOON COLLAPSE',castId:cast.id,comboId:cast.comboId});
    scheduleTask(room,telegraphMs+4650,'boss_ultimate_phase',{phase:4,name:'ETERNAL AFTERSHOCK',castId:cast.id,comboId:cast.comboId});
  }
  markDirty(room);
}

function royal(room){
  const s=room.state;
  if(s.trust<100)return;
  s.trust=0;s.boss.hp-=160;s.players.hero.score+=80;s.players.princess.score+=80;
  broadcast(room,{type:'event',e:'royal',p:{ts:Date.now(),name:'ROYAL FEAST — BÌNH MINH ĐẠI TIỆC'}});
  markDirty(room);
}
function reset(room){
  room.state=freshState();
  room.history={hero:[],princess:[],boss:[]};
  for(let i=0;i<5;i++)spawnPickup(room);
  markDirty(room);
}
function enterBossPhase(room,next,now){
  const b=room.state.boss;
  b.phase=next;b.pendingPhase=0;b.patternIndex=-1;b.patternStep=0;b.patternId='';b.patternName='';
  b.phaseLockUntil=now+(next===3?1900:1600);b.exposedUntil=0;b.exposedCastId=0;b.exposedHitCount=0;
  b.poise=b.poiseMax;b.poiseRegenAt=0;b.staggerUntil=0;b.criticalUntil=0;
  b.skillT=next===3?1.55:1.75;
  broadcast(room,{type:'event',e:'phase',p:{
    phase:next,until:b.phaseLockUntil,director:BOSS_COMBAT_DIRECTOR[next]?.name||''
  }});
  if(next===2){
    dialogue(room,'boss','Các ngươi vẫn chưa chịu mệt sao?',2200);
    scheduleTask(room,340,'dialogue',{speaker:'hero',text:'Khung giờ 3 giờ sáng tới rồi. Tập trung!',duration:1900});
  }else if(next===3){
    dialogue(room,'boss','Tình cảm mong manh ấy… ta muốn xem nó chịu được đêm dài bao lâu.',2600);
    scheduleTask(room,380,'dialogue',{speaker:'princess',text:'Boss nói nhiều ghê. Đánh thôi!',duration:1800});
  }
  markDirty(room);
}
function startMatch(room){
  reset(room);room.state.started=true;room.state.paused=false;room.state.pauseRole=null;room.state.manualPause=false;room.state.manualPauseRole=null;room.state.pauseStartedAt=0;
  // V10.19 keeps movement, attacks, boss AI and timers locked for the complete
  // 8.6s synchronized camera/pose timeline plus a 400ms network safety margin.
  room.state.introUntil=Date.now()+BOSS_INTRO_MS;
  markDirty(room);

  // Start gameplay immediately. Persistence must never block the match transition.
  const state=snapshot(room);
  broadcast(room,{type:'start',state});

  persistRoomNow(room)
    .then(()=>console.log(`[redis] started room ${room.code} persisted`))
    .catch(err=>console.error('[persist start]',err?.message||err));
}

function tick(room,dt){
  const s=room.state;
  if(!s.started||s.paused)return;
  const now=Date.now();
  s.tick++;
  recordHistory(room,now);

  // V9.5 cinematic grace: both clients see the reveal while the authoritative
  // server holds movement, attacks, boss AI and timers.
  if(s.introUntil&&now<s.introUntil)return;

  processTasks(room,now);
  processPendingHits(room,now);
  if(s.activeCast && now>s.activeCast.endAt+120){
    const finishedCast=s.activeCast;
    s.activeCast=null;
    if(s.activeCombo&&finishedCast.chain){
      s.activeCombo.nextAt=now+(finishedCast.chainGapMs||120);
      broadcast(room,{type:'event',e:'bossComboLink',p:{id:s.activeCombo.id,nextStep:s.activeCombo.step+1,total:s.activeCombo.steps.length,at:s.activeCombo.nextAt}});
    }else{
      const exposeMs=Math.max(0,Number(finishedCast.exposeMs)||0);
      if(exposeMs){
        s.boss.exposedUntil=now+exposeMs;s.boss.exposedCastId=finishedCast.id;s.boss.exposedHitCount=0;
        broadcast(room,{type:'event',e:'bossExposed',p:{
          castId:finishedCast.id,skill:finishedCast.i,until:s.boss.exposedUntil,
          multiplier:BOSS_EXPOSE_DAMAGE_MULTIPLIER,patternName:finishedCast.patternName||''
        }});
      }
      if(s.boss.skillT<exposeMs/1000+.45)s.boss.skillT=exposeMs/1000+.45;
    }
    markDirty(room);
  }

  const H=s.players.hero,P=s.players.princess,b=s.boss;

  for(const p of [H,P]){
    p.atkCd=Math.max(0,p.atkCd-dt);
    p.skillCd=Math.max(0,p.skillCd-dt);
    p.inv=Math.max(0,p.inv-dt);
    p.stamina=Math.min(100,p.stamina+18*dt);

    if(p.down){
      const o=p.role==='hero'?P:H;
      if(!o.down&&d2(p.x,p.z,o.x,o.z)<1.6*1.6)p.revive-=dt*2.5;
      else p.revive-=dt*.25;
      if(p.revive<=0){
        p.down=false;p.hp=42;p.inv=1;o.saves++;s.trust=Math.min(100,s.trust+18);
        broadcast(room,{type:'event',e:'banner',p:{msg:`${o.role==='princess'?'Công chúa':'Hero'} cứu đồng đội ❤️`}});
      }
      continue;
    }

    if(p.lastInputAt&&now-p.lastInputAt>INPUT_STALE_MS){
      p.input.x=0;p.input.y=0;
    }
    if(p.dash>0){
      p.dash-=dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.vx*=.91;p.vz*=.91;
    }else{
      let x=p.input.x,z=p.input.y;
      if(Math.hypot(x,z)>.08){
        [x,z]=norm(x,z);p.x+=x*3.6*dt;p.z+=z*3.6*dt;p.rot=Math.atan2(x,z);
      }
    }
    const r=Math.hypot(p.x,p.z);
    if(r>8.1){p.x*=8.1/r;p.z*=8.1/r;}
    resolvePlayerBossOverlap(p,b);
  }

  b.lastElT=Math.max(0,b.lastElT-dt);
  const bossStaggered=now<(b.staggerUntil||0);
  if(!bossStaggered&&now>=(b.poiseRegenAt||0)&&b.poise<b.poiseMax)b.poise=Math.min(b.poiseMax,b.poise+18*dt);
  if(!bossStaggered)updateBossEvade(room,now);
  // Boss dodge/teleport can move after the player loop. Resolve once more so
  // the authoritative hitbox can never land on top of either player.
  resolvePlayerBossOverlap(H,b);resolvePlayerBossOverlap(P,b);
  if(b.hp>0){
    const ratio=b.hp/b.max,targetPhase=ratio>BOSS_PHASE_THRESHOLDS[1]?1:ratio>BOSS_PHASE_THRESHOLDS[2]?2:3;
    if(targetPhase>b.phase&&!b.pendingPhase)b.pendingPhase=b.phase+1;
    if(!bossStaggered){
      if(b.pendingPhase&&!s.activeCast&&!s.activeCombo&&!b.evade&&now>=(b.phaseLockUntil||0))enterBossPhase(room,b.pendingPhase,now);
      if(!s.activeCombo)tryBossEvade(room,now);
      b.skillT-=dt;
      if(s.activeCombo)advanceBossCombo(room,now);
      else if(b.skillT<=0&&!s.activeCast&&!b.evade&&!b.pendingPhase&&now>=(b.phaseLockUntil||0)){
        startBossCombo(room);
      }
    }
  }

  if(s.summons?.length){
    for(const m of s.summons){
      m.t-=dt;m.atkT-=dt;
      const target=H.down?P:P.down?H:(d2(m.x,m.z,H.x,H.z)<d2(m.x,m.z,P.x,P.z)?H:P);
      const dx=target.x-m.x,dz=target.z-m.z,l=Math.hypot(dx,dz)||1;
      if(l>1.65){m.x+=dx/l*.85*dt;m.z+=dz/l*.85*dt}
      if(m.atkT<=0&&!target.down&&l<6){
        const a=Math.atan2(dz,dx);
        s.projectiles.push({id:s.nextProj++,owner:null,enemy:true,kind:'thought',food:2,x:m.x,z:m.z,y:m.y,vx:Math.cos(a)*5.4,vz:Math.sin(a)*5.4,dmg:7+s.boss.phase,t:2.4});
        m.atkT=2.2;
      }
    }
    s.summons=s.summons.filter(m=>m.t>0&&m.hp>0);
  }

  if(s.darkPool){
    s.darkPool.t-=dt;s.darkPool.r+=dt*4;
    for(const role of ['hero','princess']){
      const p=s.players[role];
      if(!p.down&&d2(p.x,p.z,s.darkPool.x,s.darkPool.z)<(s.darkPool.r*.5)**2&&Math.random()<dt*.55){
        queueEnemyHit(room,role,6,now);
      }
    }
    if(s.darkPool.t<=0)s.darkPool=null;
  }

  for(const pr of s.projectiles){
    const x1=pr.x,z1=pr.z;
    if(pr.enemy&&pr.kind==='spiritOrb'){
      const target=livingBossTarget(s,pr.targetRole);
      if(target){
        pr.targetRole=target.role;
        const dx=target.x-pr.x,dz=target.z-pr.z,length=Math.hypot(dx,dz)||1;
        const desiredX=dx/length,desiredZ=dz/length,currentSpeed=Math.hypot(pr.vx,pr.vz)||pr.speed||5;
        const currentX=pr.vx/currentSpeed,currentZ=pr.vz/currentSpeed;
        const steer=1-Math.exp(-(pr.turnRate||2.8)*dt);
        let nextX=currentX+(desiredX-currentX)*steer,nextZ=currentZ+(desiredZ-currentZ)*steer;
        const nextLength=Math.hypot(nextX,nextZ)||1;nextX/=nextLength;nextZ/=nextLength;
        pr.vx=nextX*(pr.speed||currentSpeed);pr.vz=nextZ*(pr.speed||currentSpeed);
      }
    }
    pr.x+=pr.vx*dt;pr.z+=pr.vz*dt;pr.t-=dt;

    if(pr.enemy){
      for(const role of ['hero','princess']){
        const p=s.players[role];
        const hitRadius=pr.kind==='spiritOrb'?.98:.75;
        if(pr.t>0&&!p.down&&segmentCircleHit(x1,z1,pr.x,pr.z,p.x,p.z,hitRadius)){
          // Damage is confirmed after a short grace window so a late-arriving dash
          // can still protect a player if it actually happened before the hit.
          queueEnemyHit(room,role,pr.dmg,now);
          if(pr.kind==='spiritOrb')broadcast(room,{type:'event',e:'bossSpiritOrbHit',p:{id:pr.id,role,x:p.x,z:p.z,dmg:pr.dmg}});
          pr.t=0;
        }
      }
    }else if(pr.t>0){
      let hitSummon=null;
      for(const m of s.summons||[]){
        if(m.hp>0&&segmentCircleHit(x1,z1,pr.x,pr.z,m.x,m.z,.62)){hitSummon=m;break}
      }
      if(hitSummon){
        hitSummon.hp-=pr.dmg||8;
        broadcast(room,{type:'event',e:'summonHit',p:{id:hitSummon.id,dmg:Math.round(pr.dmg||8),hp:Math.max(0,hitSummon.hp)}});
        if(hitSummon.hp<=0){
          broadcast(room,{type:'event',e:'summonDefeated',p:{id:hitSummon.id,x:hitSummon.x,z:hitSummon.z,y:hitSummon.y}});
          s.trust=Math.min(100,s.trust+4);
        }
        pr.t=0;
      }else if(bossCanBeHit(b,now)&&segmentCircleHit(x1,z1,pr.x,pr.z,b.x,b.z,1.55)){
        hitBoss(room,pr);pr.t=0;
      }
    }
  }
  s.projectiles=s.projectiles.filter(p=>p.t>0&&Math.abs(p.x)<12&&Math.abs(p.z)<12);

  for(const pu of s.pickups){
    for(const role of ['hero','princess']){
      const p=s.players[role];
      if(!pu.dead&&!p.down&&d2(p.x,p.z,pu.x,pu.z)<.7*.7){
        pu.dead=true;p.food=pu.food;
        const mate=role==='hero'?'princess':'hero';
        if(FAVORITES[mate].includes(pu.food))healFavorite(room,role,pu.food);
        broadcast(room,{type:'event',e:'pickup',p:{role,food:pu.food}});
        scheduleTask(room,700,'spawn_pickup');
      }
    }
  }
  s.pickups=s.pickups.filter(p=>!p.dead);

  if(b.hp<=0){
    s.started=false;
    broadcast(room,{type:'end',win:true,stats:{hero:Math.round(H.score),princess:Math.round(P.score),perfect:H.perfect+P.perfect,saves:H.saves+P.saves}});
    persistRoomNow(room).catch(()=>{});
  }else if(H.down&&P.down){
    s.started=false;
    broadcast(room,{type:'end',win:false,stats:{hero:Math.round(H.score),princess:Math.round(P.score),perfect:H.perfect+P.perfect,saves:H.saves+P.saves}});
    persistRoomNow(room).catch(()=>{});
  }

  markDirty(room);
}

function snapshot(room){
  const s=room.state;
  return {
    ts:Date.now(),tick:s.tick,trust:s.trust,started:s.started,paused:s.paused,pauseRole:s.pauseRole,manualPause:!!s.manualPause,manualPauseRole:s.manualPauseRole||null,introUntil:s.introUntil||0,testMode:room.testMode||'',
    bossAssetsReady:{...room.bossAssetsReady},
    connectedRoles:{hero:connected(room,'hero'),princess:connected(room,'princess')},
    players:{
      hero:{...s.players.hero,input:undefined},
      princess:{...s.players.princess,input:undefined}
    },
    boss:{...s.boss},
    projectiles:s.projectiles.map(p=>({
      id:p.id,a:p.aid||null,o:p.owner||null,x:p.x,y:p.y,z:p.z,e:p.enemy,k:p.kind,f:p.food,c:p.castId||null,b:p.bornAt||null,r:p.targetRole||null
    })),
    pickups:s.pickups.map(p=>({...p})),
    darkPool:s.darkPool?{...s.darkPool}:null,
    summons:(s.summons||[]).map(m=>({...m})),
    cast:s.activeCast?{...s.activeCast}:null,
    combo:s.activeCombo?{id:s.activeCombo.id,comboId:s.activeCombo.comboId,name:s.activeCombo.name,tier:s.activeCombo.tier,step:s.activeCombo.step,total:s.activeCombo.steps.length,startedAt:s.activeCombo.startedAt,nextAt:s.activeCombo.nextAt}:null
  };
}

app.get('/healthz',(_req,res)=>res.json({
  ok:true,
  rooms:rooms.size,
  redis:redisReady,
  persistence:redisReady?'redis':'ram-fallback',
  network:{
    tickHz:TICK_HZ,
    snapshotHz:SNAPSHOT_HZ,
    renderOptimization:'V10.16.2-eclipse-waltz-plus-virtual-upper-body-halo',
    combatFeel:'v10.23-poise-weakpoint-critical-adaptive-combo-ai',
    bossDirector:{thresholds:[70,35],exposedDamageMultiplier:BOSS_EXPOSE_DAMAGE_MULTIPLIER,normalCombos:BOSS_COMBO_LIBRARY.normal.length,signatureCombos:BOSS_COMBO_LIBRARY.signature.length,ultimateCombos:1},
    bossCritical:{poise:BOSS_POISE_MAX,bodyCritChance:BOSS_BODY_CRIT_CHANCE,weakCritChance:[.08,.12],criticalMultiplier:BOSS_CRIT_MULTIPLIER,breakStaggerMs:BOSS_BREAK_STAGGER_MS,breakResistanceMs:BOSS_BREAK_RESIST_MS},
    rewindMs:MAX_REWIND_MS,
    hitConfirmMs:HIT_CONFIRM_DELAY_MS,
    adaptiveInterpolationMs:[80,100,140]
  },
  uptime:process.uptime()
}));

app.get('/diag',(_req,res)=>res.json({
  ok:true,
  redis:redisReady,
  rooms:rooms.size,
  websocketClients:wss.clients.size,
  websocketPath:'/ws',
  uptime:process.uptime(),
  now:Date.now()
}));

wss.on('connection',(ws,req)=>{
  console.log(`[ws] connected ${req.socket.remoteAddress||'unknown'}`);
  ws.isAlive=true;
  ws.on('pong',()=>ws.isAlive=true);

  ws.on('message',async raw=>{
    let m;try{m=JSON.parse(raw.toString())}catch{return}

    if(m.type==='ping'){
      send(ws,{type:'pong',clientTs:m.clientTs,serverTs:Date.now()});
      return;
    }

    if(m.type==='create'){
      const room=await createRoom(m.testMode);
      attach(room,'hero',ws);
      console.log(`[ws] create room ${room.code}`);
      send(ws,{type:'created',code:room.code,role:'hero',token:room.slots.hero.token,state:snapshot(room)});
      persistRoomNow(room)
        .then(()=>console.log(`[redis] room ${room.code} persisted`))
        .catch(err=>console.error('[persist create]',err?.message||err));
      return;
    }

    if(m.type==='join'){
      const code=String(m.code||'').toUpperCase();
      const room=await loadRoom(code);
      if(!room){send(ws,{type:'error',code:'ROOM_NOT_FOUND'});return}
      const slot=room.slots.princess;
      if(slot.token){send(ws,{type:'error',code:'ROOM_FULL'});return}
      slot.token=token();
      attach(room,'princess',ws);
      console.log(`[ws] princess joined ${code}`);
      send(ws,{type:'joined',code,role:'princess',token:slot.token,state:snapshot(room)});
      send(room.slots.hero.ws,{type:'peerJoined',role:'princess'});
      persistRoomNow(room).catch(err=>console.error('[persist join]',err?.message||err));
      return;
    }

    if(m.type==='resume'){
      const hit=await findByToken(m.token);
      if(!hit){send(ws,{type:'error',code:'SESSION_EXPIRED'});return}
      attach(hit.room,hit.role,ws);
      const room=hit.room;
      if(room.state.started&&matchClientsReady(room)&&matchBossAssetsReady(room)){
        if(room.state.manualPause){
          room.state.paused=true;room.state.pauseRole=room.state.manualPauseRole;markDirty(room);
          await persistRoomNow(room);
          broadcast(room,{type:'manualPause',role:room.state.manualPauseRole,state:snapshot(room)});
        }else{
          resumeRoomPause(room);
          await persistRoomNow(room);
          broadcast(room,{type:'resumePlay',state:snapshot(room)});
        }
      }
      send(ws,{type:'resumed',code:room.code,role:hit.role,token:room.slots[hit.role].token,state:snapshot(room)});
      if(hit.role==='princess')send(room.slots.hero.ws,{type:'peerJoined',role:'princess'});
      return;
    }

    const room=ws.room,role=ws.role;
    if(!room||!role)return;

    if(m.type==='bossAssetReady'){
      room.bossAssetsReady[role]=m.ready===true;
      broadcast(room,{type:'bossAssetReady',ready:{...room.bossAssetsReady}});
      if(room.state.started&&room.state.paused&&!room.state.manualPause&&matchClientsReady(room)&&matchBossAssetsReady(room)){
        resumeRoomPause(room);
        await persistRoomNow(room);
        broadcast(room,{type:'resumePlay',state:snapshot(room)});
      }
      return;
    }

    if(m.type==='pauseRequest'){
      const s=room.state;
      if(!s.started){send(ws,{type:'pauseAck',ok:false,reason:'NOT_STARTED'});return}
      if(s.introUntil&&Date.now()<s.introUntil){send(ws,{type:'pauseAck',ok:false,reason:'INTRO'});return}
      if(s.paused){send(ws,{type:'pauseAck',ok:false,reason:'ALREADY_PAUSED'});return}
      beginRoomPause(room,role,{manual:true});
      await persistRoomNow(room);
      broadcast(room,{type:'manualPause',role,state:snapshot(room)});
      send(ws,{type:'pauseAck',ok:true});
      return;
    }

    if(m.type==='resumeRequest'){
      const s=room.state;
      if(!s.started||!s.paused||!s.manualPause){send(ws,{type:'resumeAck',ok:false,reason:'NOT_MANUAL_PAUSE'});return}
      if(s.manualPauseRole!==role){send(ws,{type:'resumeAck',ok:false,reason:'NOT_OWNER'});return}
      if(!matchClientsReady(room)||!matchBossAssetsReady(room)){send(ws,{type:'resumeAck',ok:false,reason:'PEER_NOT_READY'});return}
      resumeRoomPause(room);
      await persistRoomNow(room);
      broadcast(room,{type:'manualResume',role,state:snapshot(room)});
      send(ws,{type:'resumeAck',ok:true});
      return;
    }

    if(m.type==='leave'){
      const slot=room.slots[role],oldTok=slot.token;
      slot.token=null;slot.ws=null;slot.disconnectedAt=null;
      await deleteSession(oldTok);
      if(room.state.started){
        room.state.started=false;room.state.paused=false;room.state.pauseRole=null;room.state.manualPause=false;room.state.manualPauseRole=null;room.state.pauseStartedAt=0;
        broadcast(room,{type:'peerLeft',role});
      }
      if(role==='hero'){
        send(room.slots.princess.ws,{type:'roomClosed'});
        rooms.delete(room.code);
        await deletePersistedRoom(room);
      }else{
        markDirty(room);
        await persistRoomNow(room);
      }
      try{ws.close(1000,'Left room');}catch{}
      return;
    }

    if(m.type==='start'&&role==='hero'){
      const princessOnline=isCombatTest(room)||connected(room,'princess');
      console.log(`[ws] start requested ${room.code} princess=${princessOnline}`);
      if(!princessOnline){
        send(ws,{type:'startAck',ok:false,reason:'PRINCESS_OFFLINE'});
        return;
      }
      if(!matchBossAssetsReady(room)){
        send(ws,{type:'startAck',ok:false,reason:'BOSS_ASSET_NOT_READY',ready:{...room.bossAssetsReady}});
        return;
      }
      send(ws,{type:'startAck',ok:true});
      startMatch(room);
      return;
    }

    if(m.type==='input'&&room.state.started&&!room.state.paused){
      const p=room.state.players[role];
      p.lastInputAt=Date.now();
      if(room.state.introUntil&&Date.now()<room.state.introUntil){
        p.input.x=0;p.input.y=0;p.ack=Math.max(p.ack,Number(m.seq)||0);
        return;
      }
      p.input.x=Math.max(-1,Math.min(1,Number(m.x)||0));
      p.input.y=Math.max(-1,Math.min(1,Number(m.y)||0));
      p.ack=Math.max(p.ack,Number(m.seq)||0);
      markDirty(room);
      return;
    }

    if(m.type==='action'&&room.state.started&&!room.state.paused){
      const actionTs=clampActionTs(m.st),aid=m.aid||null;
      if(room.state.introUntil&&Date.now()<room.state.introUntil){
        if(m.a==='attack'||m.a==='skill')send(ws,{type:'actionAck',a:m.a,aid,accepted:false,projectiles:[],serverTs:Date.now(),reason:'INTRO'});
        return;
      }
      if(m.a==='attack'||m.a==='skill'){
        const result=spawnShot(room,role,m.a==='skill',actionTs,aid);
        send(ws,{type:'actionAck',a:m.a,aid,accepted:result.accepted,projectiles:result.projectiles,melee:!!result.melee,scheduled:!!result.scheduled,hit:!!result.hit,combo:result.combo,finisher:!!result.finisher,target:result.target,impactAt:result.impactAt||0,style:result.style||'',serverTs:Date.now(),reason:result.reason||''});
      }else if(m.a==='dash'){
        const result=dash(room,role,actionTs,aid);
        send(ws,{type:'actionAck',a:'dash',aid,accepted:result.accepted,projectiles:[],serverTs:Date.now(),reason:result.reason||''});
      }else if(m.a==='duo'){
        royal(room);
      }
      return;
    }
  });

  ws.on('close',()=>detach(ws));
});

setInterval(()=>{
  for(const ws of wss.clients){
    if(ws.isAlive===false){try{ws.terminate()}catch{};continue}
    ws.isAlive=false;try{ws.ping()}catch{}
  }
},30000);

setInterval(()=>{
  for(const room of rooms.values())tick(room,DT);
},1000/TICK_HZ);

setInterval(()=>{
  for(const room of rooms.values()){
    if(room.state.started){
      room.snapshotSeq++;
      broadcast(room,{type:'state',seq:room.snapshotSeq,state:snapshot(room)});
    }
  }
},1000/SNAPSHOT_HZ);

setInterval(()=>{
  const dirty=[...rooms.values()].filter(r=>r.dirty&&!r.persisting);
  Promise.allSettled(dirty.map(persistRoomNow)).catch(()=>{});
},PERSIST_INTERVAL_MS);

setInterval(async()=>{
  const now=Date.now();
  for(const room of [...rooms.values()]){
    for(const role of ['hero','princess']){
      const slot=room.slots[role];
      if(slot.token&&!slot.ws&&slot.disconnectedAt&&now-slot.disconnectedAt>SLOT_TTL_MS){
        const oldTok=slot.token;
        slot.token=null;slot.disconnectedAt=null;
        await deleteSession(oldTok);
        if(room.state.started){
          room.state.started=false;room.state.paused=false;room.state.pauseRole=null;room.state.manualPause=false;room.state.manualPauseRole=null;room.state.pauseStartedAt=0;
          broadcast(room,{type:'peerLeft',role});
        }
        markDirty(room);
      }
    }
    const noTokens=!room.slots.hero.token&&!room.slots.princess.token;
    if(noTokens||now-room.created>ROOM_TTL_MS){
      rooms.delete(room.code);
      await deletePersistedRoom(room);
    }
  }
},5000);

async function shutdown(signal){
  console.log(`[shutdown] ${signal}`);
  try{
    await Promise.allSettled([...rooms.values()].map(persistRoomNow));
    if(redis?.isOpen)await redis.quit();
  }catch{}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),4000).unref();
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));

(async()=>{
  try{await initRedis()}catch(err){console.error('[redis init]',err?.message||err)}
  server.listen(PORT,HOST,()=>console.log(`Princess Rescue V10.23 server on ${HOST||'*'}:${PORT} | redis=${redisReady} | ws=/ws`));
})();
