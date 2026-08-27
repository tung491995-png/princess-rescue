
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('redis');
const V1025 = require('./lib/v10_25_combat');

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
const V1025_HIT_STOP_MS = Object.freeze({quick:32,normal:54,heavy:88,critical:120,perfectParry:145});
// Historical regression sentinel: Princess Rescue V10.23.1 server
// runtimeReliability:'v10.23.1-tripo-cache-recovery-snapshot-watchdog-ios-animation-budget'
// broadcast(room,{type:'event',e:'dash',p:{role,x,z,aid,startAt:actionTs}})
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
      x:0,y:0,z:-4.7,hp:2200,max:2200,phase:1,skillIndex:-1,skillT:TEST_FAST_BOSS?.12:1.8,lastEl:null,lastElT:0,
      evade:null,evadeInvUntil:0,dodgeReadyAt:0,dodgeSeq:0,phaseLockUntil:0,
      patternIndex:-1,patternStep:0,patternId:'',patternName:'',lastSkill:-1,pendingPhase:0,
      exposedUntil:0,exposedCastId:0,exposedHitCount:0,
      poise:BOSS_POISE_MAX,poiseMax:BOSS_POISE_MAX,poiseRegenAt:0,
      staggerUntil:0,staggerResistUntil:0,criticalUntil:0,
      backWeakUntil:0,upperWeakUntil:0,orbWeakUntil:0,
      comboSeq:0,lastComboId:'',comboHistory:[],actionMemory:[],comboCooldowns:{},ultimateUsed:false,
      combatVersion:V1025.VERSION,currentAction:'combat_idle',sourceAnimation:'combat_idle',selectedBranch:'',
      trajectory:null,orb:{state:'FOLLOW',x:-.68,z:-4.6,y:2.62,until:0,cooldownUntil:0,phaseAt:0,phaseOffset:0},
      halo:{state:'IDLE',until:0,startAt:0,impactAt:0},supportCue:'IDLE',supportT:1.5,aiMemory:V1025.ensureMemory({})
    },
    projectiles:[],pickups:[],darkPool:null,summons:[],arenaHazards:[],
    activeCast:null,activeCombo:null,activeUltimate:null,
    nextProj:1,nextPickup:1,nextHit:1,nextTask:1,nextCast:1,nextSummon:1,nextHazard:1,
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
  room.state.nextHazard ||= 1;
  room.state.activeCast ||= null;
  room.state.activeCombo ||= null;
  room.state.activeUltimate ||= null;
  room.state.summons ||= [];
  room.state.arenaHazards ||= [];
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
  room.state.boss.combatVersion=V1025.VERSION;
  room.state.boss.currentAction ||= 'combat_idle';
  room.state.boss.sourceAnimation ||= 'combat_idle';
  room.state.boss.selectedBranch ||= '';
  room.state.boss.y = Number.isFinite(Number(room.state.boss.y))?Number(room.state.boss.y):0;
  room.state.boss.trajectory ||= null;
  room.state.boss.orb ||= {state:'FOLLOW',x:room.state.boss.x-.68,z:room.state.boss.z+.1,y:room.state.boss.y+2.62,until:0,cooldownUntil:0,phaseAt:0,phaseOffset:0};
  room.state.boss.halo ||= {state:'IDLE',until:0,startAt:0,impactAt:0};
  room.state.boss.supportCue ||= 'IDLE';
  room.state.boss.supportT ||= 1.5;
  V1025.ensureMemory(room.state.boss);
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
  if(b.trajectory){b.trajectory.startAt=shift(b.trajectory.startAt);b.trajectory.endAt=shift(b.trajectory.endAt)}
  if(b.orb){for(const key of ['until','cooldownUntil','phaseAt','recallStartAt','recallTurnAt','recallEndAt'])b.orb[key]=shift(b.orb[key])}
  if(b.halo){for(const key of ['until','startAt','impactAt'])b.halo[key]=shift(b.halo[key])}
  if(s.activeCast){
    for(const key of ['startAt','warningAt','impactAt','releaseAt','endAt','teleportAt','kickAt','feintCancelAt','movementStartAt','movementEndAt'])s.activeCast[key]=shift(s.activeCast[key]);
  }
  if(s.activeUltimate){
    for(const key of ['startedAt','endAt','stageStartAt','timeDilationEndAt','recoveryEndAt'])s.activeUltimate[key]=shift(s.activeUltimate[key]);
    for(const lane of s.activeUltimate.safeLanes||[])lane.until=shift(lane.until);
    for(const point of s.activeUltimate.orbArray||[]){point.suspendedAt=shift(point.suspendedAt);point.fallAt=shift(point.fallAt)}
    for(const sequence of [s.activeUltimate.slam,s.activeUltimate.collapse])if(sequence){for(const key of ['startAt','impactAt','endAt'])sequence[key]=shift(sequence[key])}
  }
  for(const hit of s.pendingHits||[]){hit.hitTs=shift(hit.hitTs);hit.applyAt=shift(hit.applyAt)}
  for(const task of s.tasks||[]){
    task.dueAt=shift(task.dueAt);
    if(task.data){for(const key of ['kickAt','impactAt','launchAt','endAt','startAt'])task.data[key]=shift(task.data[key])}
  }
  if(s.activeCombo){s.activeCombo.startedAt=shift(s.activeCombo.startedAt);s.activeCombo.nextAt=shift(s.activeCombo.nextAt)}
  for(const hazard of s.arenaHazards||[]){hazard.startAt=shift(hazard.startAt);hazard.activeAt=shift(hazard.activeAt);hazard.endAt=shift(hazard.endAt);hazard.fallAt=shift(hazard.fallAt)}
  for(const summon of s.summons||[]){
    summon.stateUntil=shift(summon.stateUntil);
    summon.stateStartedAt=shift(summon.stateStartedAt);summon.spawnAt=shift(summon.spawnAt);summon.staggerResistUntil=shift(summon.staggerResistUntil);
    summon.deathAt=shift(summon.deathAt);summon.despawnAt=shift(summon.despawnAt);
    if(summon.beam){for(const key of ['chargeStartAt','activeAt','endAt'])summon.beam[key]=shift(summon.beam[key])}
    if(summon.lunge){summon.lunge.startAt=shift(summon.lunge.startAt);summon.lunge.endAt=shift(summon.lunge.endAt)}
  }
  for(const pr of s.projectiles||[]){pr.bornAt=shift(pr.bornAt);pr.recallStartAt=shift(pr.recallStartAt);pr.recallTurnAt=shift(pr.recallTurnAt);pr.recallEndAt=shift(pr.recallEndAt)}
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
function bossMeleeParryWindow(cast){
  if(!cast||cast.actionCategory!=='MELEE')return null;
  const castStartAt=Number(cast.startAt),impactAt=Number(cast.impactAt),castEndAt=Number(cast.endAt);
  if(!Number.isFinite(castStartAt)||!Number.isFinite(impactAt)||!Number.isFinite(castEndAt)||impactAt<=castStartAt||castEndAt<impactAt)return null;
  const startupMs=impactAt-castStartAt,recoveryMs=castEndAt-impactAt;
  const leadMs=Math.min(180,Math.max(70,Math.round(startupMs*.28)));
  const trailMs=Math.min(120,Math.max(55,Math.round(recoveryMs*.24)));
  return{startAt:Math.max(castStartAt,impactAt-leadMs),endAt:Math.min(castEndAt,impactAt+trailMs)};
}
const BOSS_INTERRUPT_TASKS=new Set([
  'start_dark_pool','boss_radial','boss_orb_volley','boss_orb_radial','boss_spirit_orb','dream_slash',
  'teleport_kick_reposition','spin_kick_hit','summon_dreams','dream_move','three_am_edges','boss_ultimate_phase','boss_combo_step',
  'v1025_teleport','v1025_melee_hit','v1025_wave','v1025_orb_trap','v1025_orb_recall','v1025_zero_hour_stage','v1025_feint_cancel'
]);
function interruptBossCombo(room,now,reason='critical_break'){
  const s=room.state,b=s.boss,combo=s.activeCombo,cast=s.activeCast,ultimate=s.activeUltimate;
  const wasUltimate=!!ultimate||cast?.actionId==='ultimate_zero_hour'||combo?.tier==='ultimate';
  const interruptedUltimateCastId=wasUltimate?(ultimate?.id??cast?.id??null):null;
  s.tasks=(s.tasks||[]).filter(task=>!BOSS_INTERRUPT_TASKS.has(task.type));
  if(interruptedUltimateCastId!==null){
    s.arenaHazards=(s.arenaHazards||[]).filter(hazard=>hazard.castId!==interruptedUltimateCastId);
    s.projectiles=(s.projectiles||[]).filter(projectile=>projectile.castId!==interruptedUltimateCastId);
  }
  s.activeCast=null;s.activeCombo=null;s.activeUltimate=null;b.skillT=1.15;
  b.trajectory=null;b.y=0;b.currentAction='heavy_stagger';b.sourceAnimation='heavy_stagger';b.supportCue='PROTECT';
  setBossOrbState(room,'FREE_FLOAT',now+900);setBossHaloState(room,'CRITICAL_BREAK',now+900);
  if(wasUltimate)broadcast(room,{type:'event',e:'bossUltimateInterrupted',p:{
    id:interruptedUltimateCastId??0,castId:interruptedUltimateCastId??0,name:ultimate?.name||combo?.name||'ETERNAL ECLIPSE · ZERO HOUR',
    stage:ultimate?.stage||0,stageName:ultimate?.stageName||'',reason,interrupted:true,active:false,endedAt:now,ts:now
  }});
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
  const parryWindow=bossMeleeParryWindow(s.activeCast);
  const perfectParry=pr.kind==='sword'&&weakPoint.counter&&!!parryWindow&&now>=parryWindow.startAt&&now<=parryWindow.endAt;
  const parriedActionId=perfectParry?s.activeCast?.actionId||'':'';
  const poiseDamage=bossPoiseDamage(pr)*(critical?2.35:1);
  const poiseBefore=b.poise;
  let poiseAfter=Math.max(0,poiseBefore-poiseDamage);
  if(perfectParry)poiseAfter=0;
  const canBreak=(perfectParry||(critical&&poiseAfter<=0))&&now>=(b.staggerResistUntil||0);
  if(!canBreak&&poiseAfter<=0)poiseAfter=1;
  b.poise=poiseAfter;b.poiseRegenAt=now+BOSS_POISE_REGEN_DELAY_MS;
  const damageMultiplier=(exposed?BOSS_EXPOSE_DAMAGE_MULTIPLIER:1)*(critical?BOSS_CRIT_MULTIPLIER:1);
  const dmg=pr.dmg*weak*bonus*damageMultiplier;
  b.hp-=dmg;owner.score+=dmg;
  if(exposed)b.exposedHitCount=(b.exposedHitCount||0)+1;
  if(canBreak){
    b.staggerUntil=now+(perfectParry?1080:BOSS_BREAK_STAGGER_MS);
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
    perfectParry,hitStopMs:perfectParry?V1025_HIT_STOP_MS.perfectParry:canBreak?V1025_HIT_STOP_MS.critical:critical?110:pr.finisher?V1025_HIT_STOP_MS.heavy:V1025_HIT_STOP_MS.normal,
    weakPoint:weakPoint.id,weakPointLabel:weakPoint.label,critChance:weakPoint.chance,counterWindow:weakPoint.counter,
    poise:Math.round(b.poise),poiseMax:b.poiseMax,poiseDamage:Math.round(poiseDamage),staggerUntil:b.staggerUntil||0,staggerResistUntil:b.staggerResistUntil||0,
    x:b.x,z:b.z,ts:now
  }});
  if(critical)broadcast(room,{type:'event',e:canBreak?'bossCriticalBreak':'bossCriticalHit',p:{
    owner:pr.owner,aid:pr.aid||null,weakPoint:weakPoint.id,dmg:Math.round(dmg),poise:Math.round(b.poise),
    staggerUntil:canBreak?b.staggerUntil:b.criticalUntil,resistUntil:b.staggerResistUntil||0,ts:now
  }});
  if(perfectParry){
    V1025.recordPlayerAction(b,'perfectParry',{role:pr.owner,distance:owner?Math.hypot(owner.x-b.x,owner.z-b.z):0},now);
    broadcast(room,{type:'event',e:'perfectParry',p:{role:pr.owner,actionId:parriedActionId,windowStartAt:parryWindow.startAt,windowEndAt:parryWindow.endAt,staggerUntil:b.staggerUntil,hitStopMs:V1025_HIT_STOP_MS.perfectParry,ts:now}});
  }
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
      damageOneEyeMob(room,nearestSummon,damage,strike.impactAt,'sword');hit=true;targetType='summon';hitX=nearestSummon.x;hitZ=nearestSummon.z;
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
function bossRelativeDodgeDirection(room,role,x,z){
  const p=room.state.players[role],b=room.state.boss;
  const toBossX=b.x-p.x,toBossZ=b.z-p.z,length=Math.hypot(toBossX,toBossZ)||1;
  const forwardX=toBossX/length,forwardZ=toBossZ/length;
  const forward=x*forwardX+z*forwardZ,side=x*(-forwardZ)+z*forwardX;
  if(forward<-.42)return'back';
  return side<0?'left':'right';
}
function recordBossObservedAction(room,role,action,now=Date.now(),meta={}){
  const b=room.state.boss,memory=b.actionMemory||(b.actionMemory=[]);
  const p=room.state.players[role],distance=p?Math.hypot(p.x-b.x,p.z-b.z):0;
  memory.push({role,action,ts:now,direction:meta.direction||'',distance});
  while(memory.length>48||memory[0]&&now-memory[0].ts>8000)memory.shift();
  const type=action==='attack'?'melee':action==='skill'?'ranged':action;
  V1025.recordPlayerAction(b,type,{role,distance,direction:meta.direction||''},now);
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
    // Accept within one authoritative tick of expiry. Without this tolerance a
    // packet arriving between 30 Hz ticks can reject an authored 330 ms link
    // even though the prior 270 ms cooldown has elapsed in wall-clock time.
    // Historical regression sentinel: if(p.atkCd>0)return{accepted:false
    if(p.atkCd>DT*1.05)return{accepted:false,projectiles:[],reason:'COOLDOWN'};
    p.atkCd=0;
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
  const direction=bossRelativeDodgeDirection(room,role,x,z);
  recordBossObservedAction(room,role,'dash',actionTs,{direction});
  V1025.recordPlayerAction(room.state.boss,'dodge',{role,direction,distance:Math.hypot(p.x-room.state.boss.x,p.z-room.state.boss.z)},actionTs);
  broadcast(room,{type:'event',e:'dash',p:{role,x,z,direction,aid,startAt:actionTs}});
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
  recordBossObservedAction(room,role,'perfectDodge',now,{direction:room.state.boss.aiMemory?.lastDodgeDirection||''});
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
function bossOrbAnchor(room){
  const s=room.state,b=s.boss,target=livingBossTarget(s),dx=(target?.x??b.x)-(b.x||0),dz=(target?.z??b.z+1)-(b.z||0),length=Math.hypot(dx,dz)||1;
  const aimX=dx/length,aimZ=dz/length,leftX=-aimZ,leftZ=aimX;
  return{x:b.x+leftX*.68+aimX*.10,z:b.z+leftZ*.68+aimZ*.10,y:(Number(b.y)||0)+2.62};
}
function updateBossOrbController(room,now=Date.now()){
  const s=room.state,b=s.boss,orb=b.orb||(b.orb={state:'FOLLOW',until:0,cooldownUntil:0}),state=orb.state||'FOLLOW',anchor=bossOrbAnchor(room);
  if(state==='TRAP'||state==='FREE_FLOAT')return orb;
  if(state==='RECALL'&&orb.recallProjectileId){
    const projectile=s.projectiles.find(item=>item.id===orb.recallProjectileId&&item.t>0);
    if(projectile){orb.x=projectile.x;orb.z=projectile.z;orb.y=projectile.y;return orb}
  }
  if(state==='ORBIT'||state==='AUTONOMOUS'){
    const phaseAt=Number(orb.phaseAt)||now,angle=(now-phaseAt)*.00135+(Number(orb.phaseOffset)||0),radius=state==='AUTONOMOUS'?2.15:1.42;
    orb.x=b.x+Math.cos(angle)*radius;orb.z=b.z+Math.sin(angle)*radius;orb.y=(Number(b.y)||0)+(state==='AUTONOMOUS'?2.82:2.55)+Math.sin((now-phaseAt)*.0021)*.12;
  }else if(state==='ULTIMATE'){
    orb.x=b.x;orb.z=b.z;orb.y=(Number(b.y)||0)+6.1;
  }else{
    orb.x=anchor.x;orb.z=anchor.z;orb.y=anchor.y;
  }
  return orb;
}
function bossOrbVolley(room,{count=1,spread=.13,speed=7.2,dmg=11,targetRole=null,castId=null}={}){
  const s=room.state,target=livingBossTarget(s,targetRole),origin=updateBossOrbController(room);
  if(!target)return;
  const dx=target.x-origin.x,dz=target.z-origin.z,length=Math.hypot(dx,dz)||1,aimX=dx/length,aimZ=dz/length,ids=[],bornAt=Date.now();
  for(let shot=0;shot<count;shot++){
    const angle=Math.atan2(aimZ,aimX)+(shot-(count-1)*.5)*spread;
    const projectile={
      id:s.nextProj++,owner:null,enemy:true,kind:'orbclone',food:2,
      x:origin.x,z:origin.z,y:origin.y,vx:Math.cos(angle)*speed,vz:Math.sin(angle)*speed,
      dmg,t:2.45,castId,bornAt
    };
    s.projectiles.push(projectile);ids.push(projectile.id);
  }
  broadcast(room,{type:'event',e:'bossOrbVolley',p:{ids,count,targetRole:target.role,castId,radial:false,originX:origin.x,originY:origin.y,originZ:origin.z,launchAt:bornAt}});
  markDirty(room);
}
function bossOrbRadial(room,{n=10,speed=5.8,dmg=10,angleOffset=0,castId=null}={}){
  const s=room.state,origin=updateBossOrbController(room),ids=[],bornAt=Date.now();
  for(let shot=0;shot<n;shot++){
    const angle=angleOffset+shot/n*Math.PI*2;
    const projectile={
      id:s.nextProj++,owner:null,enemy:true,kind:'orbclone',food:2,
      x:origin.x,z:origin.z,y:origin.y,vx:Math.cos(angle)*speed,vz:Math.sin(angle)*speed,
      dmg,t:3,castId,bornAt
    };
    s.projectiles.push(projectile);ids.push(projectile.id);
  }
  broadcast(room,{type:'event',e:'bossOrbVolley',p:{ids,count:n,castId,radial:true,originX:origin.x,originY:origin.y,originZ:origin.z,launchAt:bornAt}});
  markDirty(room);
}
function bossSpiritOrb(room,{targetRole=null,castId=null}={}){
  const s=room.state,b=s.boss,target=livingBossTarget(s,targetRole),origin=updateBossOrbController(room);
  if(!target)return;
  const dx=target.x-origin.x,dz=target.z-origin.z,length=Math.hypot(dx,dz)||1;
  const aimX=dx/length,aimZ=dz/length;
  const speed=4.75+b.phase*.28;
  const projectile={
    id:s.nextProj++,owner:null,enemy:true,kind:'spiritOrb',food:2,
    x:origin.x,z:origin.z,y:origin.y,
    vx:aimX*speed,vz:aimZ*speed,speed,turnRate:2.55+b.phase*.24,
    targetRole:target.role,dmg:14+b.phase*2,t:3.45,castId,bornAt:Date.now()
  };
  s.projectiles.push(projectile);
  broadcast(room,{type:'event',e:'bossSpiritOrbLaunch',p:{
    id:projectile.id,targetRole:target.role,castId,launchAt:projectile.bornAt,endAt:projectile.bornAt+3450,originX:origin.x,originY:origin.y,originZ:origin.z
  }});
  markDirty(room);
}

function bossOrbRecall(room,{targetRole=null,castId=null}={}){
  const s=room.state,b=s.boss,target=livingBossTarget(s,targetRole);if(!target)return null;
  const now=Date.now(),origin=updateBossOrbController(room,now),anchor=bossOrbAnchor(room),turnAt=now+380,endAt=now+860;
  const projectile={
    id:s.nextProj++,owner:null,enemy:true,kind:'orbRecall',food:2,x:origin.x,z:origin.z,y:origin.y,vx:0,vz:0,dmg:10+b.phase,t:.94,castId,bornAt:now,
    recallStartAt:now,recallTurnAt:turnAt,recallEndAt:endAt,startX:origin.x,startZ:origin.z,startY:origin.y,turnX:target.x,turnZ:target.z,turnY:1.45,endX:anchor.x,endZ:anchor.z,endY:anchor.y,recallLeg:'out',hitLegs:{}
  };
  s.projectiles.push(projectile);
  setBossOrbState(room,'RECALL',endAt,{x:origin.x,z:origin.z,y:origin.y,recallProjectileId:projectile.id,recallStartAt:now,recallTurnAt:turnAt,recallEndAt:endAt});
  broadcast(room,{type:'event',e:'bossOrbRecall',p:{id:projectile.id,castId,targetRole:target.role,startAt:now,turnAt,endAt,fromX:origin.x,fromY:origin.y,fromZ:origin.z,turnX:target.x,turnY:1.45,turnZ:target.z,toX:anchor.x,toY:anchor.y,toZ:anchor.z}});
  markDirty(room);return projectile;
}

function updateBossRecallProjectile(room,projectile,now,dt){
  const b=room.state.boss,outbound=now<projectile.recallTurnAt,fromAt=outbound?projectile.recallStartAt:projectile.recallTurnAt,toAt=outbound?projectile.recallTurnAt:projectile.recallEndAt;
  const raw=Math.max(0,Math.min(1,(now-fromAt)/Math.max(1,toAt-fromAt))),progress=outbound?trajectoryEase('easeOutCubic',raw):trajectoryEase('easeInCubic',raw);
  const fromX=outbound?projectile.startX:projectile.turnX,fromZ=outbound?projectile.startZ:projectile.turnZ,fromY=outbound?projectile.startY:projectile.turnY,toX=outbound?projectile.turnX:projectile.endX,toZ=outbound?projectile.turnZ:projectile.endZ,toY=outbound?projectile.turnY:projectile.endY,oldX=projectile.x,oldZ=projectile.z;
  projectile.x=fromX+(toX-fromX)*progress;projectile.z=fromZ+(toZ-fromZ)*progress;projectile.y=fromY+(toY-fromY)*progress+Math.sin(raw*Math.PI)*.38;projectile.vx=(projectile.x-oldX)/Math.max(.001,dt);projectile.vz=(projectile.z-oldZ)/Math.max(.001,dt);projectile.recallLeg=outbound?'out':'return';projectile.t=Math.max(0,(projectile.recallEndAt-now)/1000);
  if(b.orb?.recallProjectileId===projectile.id){b.orb.x=projectile.x;b.orb.z=projectile.z;b.orb.y=projectile.y}
  return projectile;
}

function setBossOrbState(room,state,until=0,extra={}){
  const b=room.state.boss,previous=b.orb?.state||'FOLLOW',now=Date.now(),entered=previous!==state;
  b.orb={...(b.orb||{}),state,x:Number.isFinite(extra.x)?extra.x:b.orb?.x??b.x,z:Number.isFinite(extra.z)?extra.z:b.orb?.z??b.z,y:Number.isFinite(extra.y)?extra.y:b.orb?.y??((Number(b.y)||0)+2.62),until:until||0,...extra};
  if(entered&&(state==='ORBIT'||state==='AUTONOMOUS')){b.orb.phaseAt=now;b.orb.phaseOffset=Number(extra.phaseOffset)||((b.comboSeq||0)*.73%(Math.PI*2))}
  if(entered)broadcast(room,{type:'event',e:'bossOrbState',p:{...b.orb,state,previous,ts:now}});
}
function setBossHaloState(room,state,until=0,extra={}){
  const b=room.state.boss,previous=b.halo?.state||'IDLE',now=Date.now();b.halo={state,until,startAt:Number(extra.startAt)||now,impactAt:Number(extra.impactAt)||0,...extra};
  if(previous!==state)broadcast(room,{type:'event',e:'bossHaloState',p:{...b.halo,state,previous,ts:now}});
}
function trajectoryEase(curve,t){
  t=Math.max(0,Math.min(1,t));
  if(curve==='easeInCubic')return t*t*t;
  if(curve==='easeInOutCubic')return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  return 1-Math.pow(1-t,3);
}
function startBossTrajectory(room,action,targetRole=null,now=Date.now()){
  const profile=action.trajectory;if(!profile)return null;
  const s=room.state,b=s.boss,target=livingBossTarget(s,targetRole);if(!target)return null;
  let dx=target.x-b.x,dz=target.z-b.z,length=Math.hypot(dx,dz)||1;dx/=length;dz/=length;
  if(profile.side){const side=profile.side;[dx,dz]=[-dz*side,dx*side]}
  else if(profile.back){dx*=-1;dz*=-1}
  let distance=Number(profile.distance)||0;
  if(!profile.side&&!profile.back)distance=Math.min(distance,Math.max(0,length-1.38));
  const end=clampBossToArena(b.x+dx*distance,b.z+dz*distance);
  const fromY=Number.isFinite(Number(b.y))?Number(b.y):0,toY=Number.isFinite(Number(profile.toY))?Number(profile.toY):0;
  b.trajectory={id:`${action.id}-${now}`,actionId:action.id,fromX:b.x,fromY,fromZ:b.z,toX:end.x,toY,toZ:end.z,startAt:now,endAt:now+(profile.durationMs||420),curve:profile.curve||'easeOutCubic'};
  broadcast(room,{type:'event',e:'bossTrajectory',p:{...b.trajectory}});return b.trajectory;
}
function updateBossTrajectory(room,now){
  const b=room.state.boss,t=b.trajectory;if(!t)return false;
  const p=Math.max(0,Math.min(1,(now-t.startAt)/Math.max(1,t.endAt-t.startAt))),e=trajectoryEase(t.curve,p);
  b.x=t.fromX+(t.toX-t.fromX)*e;b.y=(Number(t.fromY)||0)+((Number(t.toY)||0)-(Number(t.fromY)||0))*e;b.z=t.fromZ+(t.toZ-t.fromZ)*e;
  if(p>=1){b.y=Number(t.toY)||0;b.trajectory=null}
  return true;
}
function v1025Teleport(room,action,targetRole=null,meta={}){
  const s=room.state,b=s.boss,target=livingBossTarget(s,targetRole);if(!target)return;
  const teleportAt=Number.isFinite(Number(meta.teleportAt))?Number(meta.teleportAt):Date.now(),fromX=b.x,fromY=Number(b.y)||0,fromZ=b.z;
  const facingX=Math.sin(target.rot||0),facingZ=Math.cos(target.rot||0),sideX=-facingZ,sideZ=facingX;
  const direction=action.teleport||'behind';let x=target.x-facingX*1.72,z=target.z-facingZ*1.72;
  if(direction==='left'){x=target.x+sideX*2.35;z=target.z+sideZ*2.35}
  else if(direction==='right'){x=target.x-sideX*2.35;z=target.z-sideZ*2.35}
  else if(direction==='above'){x=target.x-facingX*.55;z=target.z-facingZ*.55}
  const point=clampBossToArena(x,z);b.x=point.x;b.y=direction==='above'?2.6:0;b.z=point.z;b.backWeakUntil=teleportAt+620;
  b.aiMemory.lastTeleportDirection=direction;
  broadcast(room,{type:'event',e:'bossTeleport',p:{direction,role:target.role,fromX,fromY,fromZ,x:b.x,y:b.y,z:b.z,actionId:action.id,castId:meta.castId||0,teleportAt,entryAt:teleportAt+180,ts:teleportAt}});
}
function bossMeleeImpact(room,data){
  const s=room.state,b=s.boss,action=V1025.actionFor(data.actionId),radius=Number(data.radius)||action.radius||2,damage=Number(data.damage)||action.damage||12,hitRoles=[];
  for(const role of ['hero','princess']){
    const p=s.players[role];if(!p.down&&d2(p.x,p.z,b.x,b.z)<=radius*radius){queueEnemyHit(room,role,damage,Date.now());hitRoles.push(role)}
  }
  const hitStopMs=V1025_HIT_STOP_MS[action.impactClass]||V1025_HIT_STOP_MS.normal;
  broadcast(room,{type:'event',e:'bossActionImpact',p:{actionId:action.id,x:b.x,z:b.z,radius,damage,hitRoles,impactClass:action.impactClass||'normal',hitStopMs,ts:Date.now()}});
  if(!hitRoles.length&&['HEAVY','AERIAL'].includes(action.category)){
    b.upperWeakUntil=Date.now()+1050;
    broadcast(room,{type:'event',e:'bossWeakPoint',p:{point:'upper',label:'UPPER TORSO · HEAVY MISS',until:b.upperWeakUntil,chance:.11}});
  }
}
function bossCrescentWave(room,{actionId='energy_wave',count=1,castId=null}={}){
  const s=room.state,b=s.boss,target=livingBossTarget(s);if(!target)return;
  const base=Math.atan2(target.z-b.z,target.x-b.x),ids=[];
  for(let i=0;i<count;i++){
    const angle=base+(i-(count-1)/2)*.13,projectile={id:s.nextProj++,owner:null,enemy:true,kind:'crescent',food:2,x:b.x,z:b.z,y:1.45,vx:Math.cos(angle)*8.1,vz:Math.sin(angle)*8.1,dmg:12+b.phase,t:2.25,castId,bornAt:Date.now()};
    s.projectiles.push(projectile);ids.push(projectile.id);
  }
  broadcast(room,{type:'event',e:'bossCrescentWave',p:{ids,actionId,castId,ts:Date.now()}});
}
function addArenaHazard(room,type,data={}){
  const s=room.state,now=Date.now(),x=Number(data.x),z=Number(data.z),hazard={
    id:s.nextHazard++,type,x:Number.isFinite(x)?x:s.boss.x,z:Number.isFinite(z)?z:s.boss.z,radius:Number(data.radius)||1.4,
    shape:data.shape||'circle',length:Number(data.length)||0,width:Number(data.width)||0,startAt:now,activeAt:data.activeAt||now+700,endAt:data.endAt||now+1800,
    damage:Number.isFinite(Number(data.damage))?Number(data.damage):8,safe:!!data.safe,role:data.role||'',angle:Number(data.angle)||0,castId:data.castId??null,mobId:data.mobId??null,orbSlot:Number.isFinite(Number(data.orbSlot))?Number(data.orbSlot):null,fallAt:Number(data.fallAt)||0
  };
  s.arenaHazards.push(hazard);broadcast(room,{type:'event',e:'arenaHazard',p:hazard});return hazard;
}
function processArenaHazards(room,now){
  const s=room.state;
  for(const hazard of s.arenaHazards||[]){
    if(hazard.triggered||now<hazard.activeAt||now>hazard.endAt)continue;hazard.triggered=true;
    if(hazard.type==='orb_trap'||hazard.type==='starfall'||hazard.type==='collapse'||hazard.type==='slam'){
      for(const role of ['hero','princess']){const p=s.players[role];if(!p.down&&d2(p.x,p.z,hazard.x,hazard.z)<=hazard.radius*hazard.radius)queueEnemyHit(room,role,hazard.damage,now)}
      broadcast(room,{type:'event',e:'arenaHazardImpact',p:{...hazard,ts:now}});
    }else if(hazard.type==='gaze_beam'){
      const target=s.players[hazard.role],length=Number(hazard.length)||9;if(target&&!target.down&&segmentCircleHit(hazard.x,hazard.z,hazard.x+Math.cos(hazard.angle)*length,hazard.z+Math.sin(hazard.angle)*length,target.x,target.z,.55))queueEnemyHit(room,target.role,hazard.damage,now);
      broadcast(room,{type:'event',e:'oneEyeBeam',p:{...hazard,ts:now}});
    }
  }
  s.arenaHazards=(s.arenaHazards||[]).filter(hazard=>now<hazard.endAt);
}
function spawnOneEyeMob(room,count=1,cue='SUPPORT'){
  const s=room.state,b=s.boss,max=3,available=Math.max(0,max-(s.summons?.length||0)),spawned=[];count=Math.min(count,available);
  const now=Date.now();
  for(let i=0;i<count;i++){
    const angle=(s.nextSummon+i)*2.399,radius=4.5+(i%2)*.7,point=clampBossToArena(b.x+Math.cos(angle)*radius,b.z+Math.sin(angle)*radius,7.4);
    const m={id:s.nextSummon++,kind:'one_eye',x:point.x,z:point.z,y:1.75,hp:58,max:58,t:32,atkT:.9+i*.35,state:'SPAWN',spawnAt:now,stateStartedAt:now,stateUntil:now+720,targetRole:'',supportCue:cue,lastCoordinationToken:'',seed:Math.random()*1000,lunge:null,beam:null,positionTarget:null,staggerResistUntil:0,deathAt:0,despawnAt:0,remove:false};
    s.summons.push(m);spawned.push({id:m.id,x:m.x,z:m.z,y:m.y,state:m.state});
  }
  if(spawned.length)broadcast(room,{type:'event',e:'oneEyeSpawn',p:{count:spawned.length,points:spawned,cue,maxAlive:3}});
  return spawned;
}
function setOneEyeState(m,state,now,until=now){
  m.state=state;m.stateStartedAt=now;m.stateUntil=until;return m;
}
function damageOneEyeMob(room,m,damage,now=Date.now(),source='projectile'){
  if(!m||m.hp<=0||m.state==='DEATH'||m.state==='DESPAWN')return false;
  const s=room.state,amount=Math.max(0,Number(damage)||0);m.hp=Math.max(0,m.hp-amount);
  if(m.hp<=0){
    m.lunge=null;m.beam=null;m.positionTarget=null;m.deathAt=now;m.despawnAt=now+900;m.atkT=999;
    setOneEyeState(m,'DEATH',now,now+680);
    s.arenaHazards=(s.arenaHazards||[]).filter(hazard=>hazard.mobId!==m.id);
    broadcast(room,{type:'event',e:'summonHit',p:{id:m.id,dmg:Math.round(amount),hp:0,x:m.x,z:m.z,y:m.y,state:m.state,stateUntil:m.stateUntil,source}});
    broadcast(room,{type:'event',e:'summonDefeated',p:{id:m.id,x:m.x,z:m.z,y:m.y,deathAt:m.deathAt,despawnAt:m.despawnAt}});
    s.trust=Math.min(100,s.trust+4);return true;
  }
  const canStagger=now>=Number(m.staggerResistUntil||0);
  if(canStagger){
    m.lunge=null;m.beam=null;m.positionTarget=null;m.staggerResistUntil=now+720;m.atkT=Math.max(Number(m.atkT)||0,.48);
    setOneEyeState(m,'STAGGER',now,now+300);
    s.arenaHazards=(s.arenaHazards||[]).filter(hazard=>hazard.mobId!==m.id);
  }
  broadcast(room,{type:'event',e:'summonHit',p:{id:m.id,dmg:Math.round(amount),hp:m.hp,x:m.x,z:m.z,y:m.y,state:m.state,stateUntil:m.stateUntil,staggered:canStagger,source}});
  return true;
}
function coordinateOneEyeMob(room,m,target,now){
  const s=room.state,b=s.boss,cue=b.supportCue||m.supportCue||'PRESSURE',token=`${cue}:${s.activeCast?.id||0}`;
  m.supportCue=cue;
  if(cue==='ULTIMATE'&&['CHARGE','GAZE_BEAM','LUNGE','POSITION'].includes(m.state)){
    s.arenaHazards=(s.arenaHazards||[]).filter(hazard=>hazard.mobId!==m.id);m.beam=null;m.lunge=null;m.positionTarget=null;m.atkT=Math.max(Number(m.atkT)||0,.55);setOneEyeState(m,'ORBIT_BOSS',now,now);
  }
  if(token===m.lastCoordinationToken||!['VORTEX','HEAVY_CAST','MELEE','PROTECT'].includes(cue)||!['IDLE_HOVER','ORBIT_BOSS'].includes(m.state))return;
  m.lastCoordinationToken=token;const dx=target.x-b.x,dz=target.z-b.z,length=Math.hypot(dx,dz)||1,forwardX=dx/length,forwardZ=dz/length,side=m.id%2?-1:1;
  const distance=cue==='VORTEX'?3.1:2.6,offsetX=cue==='VORTEX'?forwardX*distance:-forwardZ*distance*side,offsetZ=cue==='VORTEX'?forwardZ*distance:forwardX*distance*side,point=clampBossToArena(target.x+offsetX,target.z+offsetZ,7.2);
  m.positionTarget={x:point.x,z:point.z,cue,arriveAt:now+520};m.atkT=Math.max(Number(m.atkT)||0,.38);setOneEyeState(m,'POSITION',now,now+520);
  broadcast(room,{type:'event',e:'oneEyePosition',p:{id:m.id,x:point.x,z:point.z,cue,startAt:now,endAt:m.stateUntil}});
}
function oneEyeAttack(room,m,target,now){
  const s=room.state,b=s.boss,distance=Math.hypot(target.x-m.x,target.z-m.z),cue=m.supportCue||b.supportCue||'PRESSURE';
  if(distance<2.0&&cue!=='ULTIMATE'){
    m.state='LUNGE';m.stateUntil=now+520;const dx=(target.x-m.x)/(distance||1),dz=(target.z-m.z)/(distance||1);m.lunge={fromX:m.x,fromZ:m.z,toX:m.x+dx*Math.min(2.4,distance),toZ:m.z+dz*Math.min(2.4,distance),startAt:now,endAt:now+360};m.atkT=2.4;
    m.stateStartedAt=now;
    broadcast(room,{type:'event',e:'oneEyeAttack',p:{id:m.id,attack:'ABYSS_LUNGE',role:target.role,startAt:now,endAt:m.stateUntil}});return;
  }
  if(cue!=='ULTIMATE'&&(cue==='VORTEX'||cue==='HEAVY_CAST'||(m.id+b.comboSeq)%3===0)){
    const angle=Math.atan2(target.z-m.z,target.x-m.x),activeAt=now+760,endAt=now+990;
    m.targetRole=target.role;m.atkT=3.1;m.beam={angle,role:target.role,chargeStartAt:now,activeAt,endAt};setOneEyeState(m,'CHARGE',now,activeAt);
    addArenaHazard(room,'gaze_beam',{x:m.x,z:m.z,role:target.role,angle,shape:'line',length:9,width:.28,activeAt,endAt,damage:9+b.phase,mobId:m.id,castId:s.activeCast?.id??null});
    broadcast(room,{type:'event',e:'oneEyeAttack',p:{id:m.id,attack:'GAZE_BEAM',role:target.role,angle,chargeStartAt:now,chargeUntil:activeAt,activeAt,endAt}});return;
  }
  setOneEyeState(m,'VOID_BOLT',now,now+620);m.atkT=(cue==='PROTECT'?1.45:1.8)+Math.random()*.8;const angle=Math.atan2(target.z-m.z,target.x-m.x),count=cue==='ULTIMATE'?1:cue==='PROTECT'?Math.min(3,b.phase):b.phase===3?2:1;
  for(let i=0;i<count;i++){const a=angle+(i-(count-1)/2)*.10;s.projectiles.push({id:s.nextProj++,owner:null,enemy:true,kind:'voidBolt',food:2,x:m.x,z:m.z,y:m.y,vx:Math.cos(a)*5.8,vz:Math.sin(a)*5.8,dmg:7+b.phase,t:2.6,mobId:m.id})}
  broadcast(room,{type:'event',e:'oneEyeAttack',p:{id:m.id,attack:'VOID_BOLT',role:target.role,count,startAt:now,endAt:m.stateUntil}});
}
function updateOneEyeMobs(room,dt,now){
  const s=room.state,b=s.boss;
  for(const m of s.summons||[]){
    m.t-=dt;m.atkT-=dt;
    if(m.state==='DEATH'){if(now>=Number(m.stateUntil||0))setOneEyeState(m,'DESPAWN',now,m.despawnAt||now+220);continue}
    if(m.state==='DESPAWN'){if(now>=Number(m.despawnAt||m.stateUntil||0))m.remove=true;continue}
    if(m.hp<=0){m.deathAt||=now;m.despawnAt||=now+900;setOneEyeState(m,'DEATH',now,now+680);continue}
    if(m.t<=0){m.despawnAt=now+320;setOneEyeState(m,'DESPAWN',now,m.despawnAt);continue}
    if(m.state==='CHARGE'&&m.beam&&now>=m.beam.activeAt)setOneEyeState(m,'GAZE_BEAM',now,m.beam.endAt);
    if(m.state==='GAZE_BEAM'&&m.beam&&now>=m.beam.endAt){m.beam=null;setOneEyeState(m,'ORBIT_BOSS',now,now)}
    if(m.lunge){const p=Math.max(0,Math.min(1,(now-m.lunge.startAt)/Math.max(1,m.lunge.endAt-m.lunge.startAt))),e=trajectoryEase('easeInOutCubic',p);m.x=m.lunge.fromX+(m.lunge.toX-m.lunge.fromX)*e;m.z=m.lunge.fromZ+(m.lunge.toZ-m.lunge.fromZ)*e;if(p>=1){for(const role of ['hero','princess']){const target=s.players[role];if(!target.down&&d2(target.x,target.z,m.x,m.z)<.9*.9)queueEnemyHit(room,role,9+b.phase,now)}m.lunge=null}}
    if(now>=Number(m.stateUntil||0)&&!m.lunge&&!['CHARGE','GAZE_BEAM'].includes(m.state)){m.positionTarget=null;if(m.state==='SPAWN')setOneEyeState(m,'IDLE_HOVER',now,now+420);else setOneEyeState(m,'ORBIT_BOSS',now,now)}
    const target=livingBossTarget(s,m.targetRole);if(!target)continue;
    coordinateOneEyeMob(room,m,target,now);
    if(m.state==='POSITION'&&m.positionTarget){
      const dx=m.positionTarget.x-m.x,dz=m.positionTarget.z-m.z,length=Math.hypot(dx,dz)||1;m.x+=dx/length*Math.min(length,3.5*dt);m.z+=dz/length*Math.min(length,3.5*dt);
    }
    if(m.state==='ORBIT_BOSS'||m.state==='IDLE_HOVER'){
      const angle=now*.00022+m.seed,desiredX=b.x+Math.cos(angle)*(3.6+(m.id%2)*.7),desiredZ=b.z+Math.sin(angle)*(3.6+(m.id%2)*.7),dx=desiredX-m.x,dz=desiredZ-m.z,length=Math.hypot(dx,dz)||1;
      m.x+=dx/length*Math.min(length,1.25*dt);m.z+=dz/length*Math.min(length,1.25*dt);
    }
    if(m.atkT<=0&&now>=Number(m.stateUntil||0))oneEyeAttack(room,m,target,now);
  }
  s.summons=(s.summons||[]).filter(m=>!m.remove).slice(0,3);
}
function updateBossSupportDirector(room,dt,now){
  const s=room.state,b=s.boss;b.supportT=(Number(b.supportT)||0)-dt;
  const desired=b.phase===1?0:b.phase===2?1:Math.min(3,2+(b.hp/b.max<.18?1:0));
  const activeMobs=(s.summons||[]).filter(m=>m.hp>0&&!['DEATH','DESPAWN'].includes(m.state)).length;
  if(b.supportT<=0){if(activeMobs<desired)spawnOneEyeMob(room,desired-activeMobs,b.supportCue);b.supportT=b.phase===3?4.2:6.2}
  if(b.phase>=2&&!s.activeCast&&Date.now()>Number(b.orb?.cooldownUntil||0)&&b.orb?.state==='AUTONOMOUS'){
    bossOrbVolley(room,{count:1,speed:6.4,dmg:8+b.phase});b.orb.cooldownUntil=now+(b.phase===3?2100:2900);
  }
}
function runZeroHourStage(room,stage,castId){
  const s=room.state,b=s.boss,now=Date.now(),names=['','TIME DILATION','TELEGRAPH FIELD','PHANTOM CASTERS','ORB SKY ARRAY','ECLIPSE SLAM','STARFALL','FINAL COLLAPSE','RECOVERY'];
  const previous=s.activeUltimate||{},startedAt=previous.startedAt||now,endAt=s.activeCast?.endAt||previous.endAt||startedAt+9800;
  s.activeUltimate={...previous,id:castId,name:'ETERNAL ECLIPSE · ZERO HOUR',stage,stageName:names[stage],startedAt,endAt,stageStartAt:now};
  if(stage===1){
    s.activeUltimate.timeDilationEndAt=now+520;b.supportCue='ULTIMATE';setBossOrbState(room,'ULTIMATE',endAt);setBossHaloState(room,'ULTIMATE',endAt,{startAt:now});
  }
  else if(stage===2){
    const laneUntil=startedAt+6900,base=.28+(Number(castId)||0)%7*.07;
    s.activeUltimate.safeLanes=[base,base+Math.PI*.5].map((angle,index)=>({id:index,angle,width:1.45,length:15,until:laneUntil}));
    for(const lane of s.activeUltimate.safeLanes)addArenaHazard(room,'safe_lane',{x:0,z:0,shape:'lane',length:lane.length,width:lane.width,angle:lane.angle,radius:1,activeAt:now,endAt:lane.until,damage:0,safe:true,castId});
    for(let i=0;i<6;i++){
      const angle=i/6*Math.PI*2+.26,radius=i%2?4.8:2.7;
      addArenaHazard(room,'laser_warning',{x:0,z:0,shape:'line',length:15,width:.18,angle,radius:1,activeAt:now+1180,endAt:now+1650,damage:0,castId});
      addArenaHazard(room,'telegraph',{x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,radius:1.05,activeAt:now+1250,endAt:now+1650,damage:0,castId});
    }
  }else if(stage===3){broadcast(room,{type:'event',e:'zeroHourPhantoms',p:{count:4,castId,until:now+1700}})}
  else if(stage===4){
    const safeAngles=(s.activeUltimate.safeLanes||[]).map(lane=>lane.angle),points=[];
    for(let candidate=0;points.length<12&&candidate<40;candidate++){
      const angle=candidate*2.399+.4,radius=2.0+(candidate%4)*1.45;
      const inLane=safeAngles.some(laneAngle=>Math.abs(Math.sin(angle-laneAngle))*radius<.95);if(inLane)continue;
      const slot=points.length,fallAt=startedAt+5250+680+(slot%3)*240;
      points.push({slot,x:Number((Math.cos(angle)*radius).toFixed(3)),z:Number((Math.sin(angle)*radius).toFixed(3)),y:Number((6.0+(slot%4)*.32).toFixed(3)),suspendedAt:now,fallAt});
    }
    s.activeUltimate.orbArray=points;setBossOrbState(room,'ULTIMATE',endAt,{x:b.x,z:b.z,y:(Number(b.y)||0)+6.1});
    broadcast(room,{type:'event',e:'zeroHourOrbArray',p:{count:points.length,points,castId,until:startedAt+7100}});
  }
  else if(stage===5){
    const target=livingBossTarget(s),x=target?.x??b.x,z=target?.z??b.z,point=clampBossToArena(x,z,6.6),impactAt=now+620,slamEndAt=now+920;
    b.y=3.4;b.trajectory={actionId:'zero_hour_slam',fromX:b.x,fromZ:b.z,toX:point.x,toZ:point.z,fromY:3.4,toY:0,startAt:now,endAt:impactAt,curve:'easeInCubic'};b.currentAction='zero_hour_slam';b.sourceAnimation='heavy_slam';
    s.activeUltimate.slam={actionId:'zero_hour_slam',logicalAnimation:'heavy_slam',animationVariant:'HEAVY',x:point.x,z:point.z,radius:3.1,startAt:now,impactAt,endAt:slamEndAt};
    addArenaHazard(room,'slam',{x:point.x,z:point.z,radius:3.1,activeAt:impactAt,endAt:slamEndAt,damage:19+b.phase,castId});
    broadcast(room,{type:'event',e:'zeroHourSlam',p:{...s.activeUltimate.slam,castId,fromX:b.trajectory.fromX,fromY:b.trajectory.fromY,fromZ:b.trajectory.fromZ,toY:0,ts:now}});
  }else if(stage===6){
    b.currentAction='ultimate_zero_hour';b.sourceAnimation='power_up';
    const points=s.activeUltimate.orbArray?.length?s.activeUltimate.orbArray:Array.from({length:12},(_,slot)=>{const angle=slot*2.399+.4,radius=2+(slot%4)*1.45;return{slot,x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,y:6+(slot%4)*.32,fallAt:now+680+(slot%3)*240}});
    s.activeUltimate.orbArray=points;
    for(const point of points)addArenaHazard(room,'starfall',{x:point.x,z:point.z,radius:.82,activeAt:point.fallAt,endAt:point.fallAt+420,damage:11+b.phase,castId,orbSlot:point.slot,fallAt:point.fallAt});
    broadcast(room,{type:'event',e:'zeroHourStarfall',p:{castId,points:points.map(point=>({slot:point.slot,x:point.x,z:point.z,y:point.y,fallAt:point.fallAt}))}});
  }else if(stage===7){
    const impactAt=now+620,collapseEndAt=now+1000;s.activeUltimate.collapse={startAt:now,impactAt,endAt:collapseEndAt,x:b.x,z:b.z,radius:4.1};
    addArenaHazard(room,'collapse',{x:b.x,z:b.z,radius:4.1,activeAt:impactAt,endAt:now+980,damage:20+b.phase,castId});setBossHaloState(room,'COLLAPSE',collapseEndAt,{startAt:now,impactAt});
  }
  else if(stage===8){
    b.exposedUntil=now+1350;b.upperWeakUntil=b.exposedUntil;b.supportCue='RECOVERY';s.activeUltimate.recoveryEndAt=b.exposedUntil;
    if(!bossOrbRecall(room,{castId}))setBossOrbState(room,'RECALL',now+700);setBossHaloState(room,'CRITICAL_BREAK',now+700,{startAt:now});
    broadcast(room,{type:'event',e:'bossExposed',p:{castId,skill:4,until:b.exposedUntil,multiplier:BOSS_EXPOSE_DAMAGE_MULTIPLIER,patternName:'ZERO HOUR RECOVERY'}});
  }
  broadcast(room,{type:'event',e:'zeroHourStage',p:{...s.activeUltimate,ts:now}});
  markDirty(room);
}

function scheduleTask(room,delayMs,type,data={}){
  const s=room.state;
  s.tasks.push({id:s.nextTask++,dueAt:Date.now()+delayMs,type,data});
  markDirty(room);
}
function cancelBossFeint(room,data={},now=Date.now()){
  const s=room.state,b=s.boss,cast=s.activeCast,combo=s.activeCombo,castId=Number(data.castId)||0;
  if(!castId||cast?.id!==castId||!cast.feint||now<Number(cast.feintCancelAt||0))return false;
  s.tasks=(s.tasks||[]).filter(task=>task.data?.castId!==castId);
  s.arenaHazards=(s.arenaHazards||[]).filter(hazard=>hazard.castId!==castId);
  s.projectiles=(s.projectiles||[]).filter(projectile=>projectile.castId!==castId);
  s.activeCast=null;b.trajectory=null;b.currentAction='combat_idle';b.sourceAnimation='combat_idle';b.supportCue='REPOSITION';
  if(combo?.id===data.comboId)combo.nextAt=now;
  setBossOrbState(room,'FREE_FLOAT',now+420);setBossHaloState(room,'TELEPORT',now+420);
  broadcast(room,{type:'event',e:'bossFeintCancel',p:{id:castId,castId,comboId:data.comboId||'',actionId:cast.actionId||'',nextActionId:data.nextActionId||'teleport_behind',cancelAt:Number(cast.feintCancelAt)||now,ts:now}});
  markDirty(room);return true;
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
  }else if(task.type==='v1025_teleport'){
    v1025Teleport(room,V1025.actionFor(task.data.actionId),task.data.targetRole,task.data);
  }else if(task.type==='v1025_feint_cancel'){
    cancelBossFeint(room,task.data);
  }else if(task.type==='v1025_melee_hit'){
    bossMeleeImpact(room,task.data);
  }else if(task.type==='v1025_wave'){
    bossCrescentWave(room,task.data);
  }else if(task.type==='v1025_orb_trap'){
    const now=Date.now(),target=livingBossTarget(s,task.data.targetRole),x=target?.x??b.x,z=target?.z??b.z;
    setBossOrbState(room,'TRAP',now+1500,{x,z,y:1.35});addArenaHazard(room,'orb_trap',{x,z,radius:1.45,activeAt:now+720,endAt:now+1180,damage:11+b.phase,castId:task.data.castId});
  }else if(task.type==='v1025_orb_recall'){
    bossOrbRecall(room,{targetRole:task.data.targetRole,castId:task.data.castId});
  }else if(task.type==='v1025_zero_hour_stage'){
    runZeroHourStage(room,Number(task.data.stage)||1,task.data.castId);
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
      b.y=0;
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
    const spawned=spawnOneEyeMob(room,Math.min(3,task.data.count||2),'SUMMON');
    broadcast(room,{type:'event',e:'summonSpawn',p:{count:spawned.length,points:spawned,kind:'one_eye'}});
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
  const memory=V1025.ensureMemory(b);
  return{now,distance,dashSpam:recent('dash',3200),attackSpam:recent('attack',2800),skillSpam:recent('skill',5000),counterActive:living.some(p=>now<(p.counterUntil||0)),hpRatio:b.hp/b.max,phase:b.phase,memory,orbAvailable:!['PROJECTILE','ULTIMATE'].includes(b.orb?.state),mobCount:s.summons?.length||0};
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
  const selection=V1025.selectCombo(b,ctx);
  broadcast(room,{type:'event',e:'bossAICandidates',p:{weights:selection.weights,selected:selection.combo.id,distance:ctx.distance,phase:ctx.phase,ts:now}});
  return selection.combo;
}
function comboEstimatedDuration(combo){
  if(combo.nodes)return Object.values(combo.nodes).reduce((total,node)=>{const action=V1025.actionFor(node.action);return total+action.endMs+110},0);
  return combo.steps.reduce((total,step)=>total+(step.fake?(step.durationMs||560):step.skill===4?7600:step.skill===2?2600:step.skill===1?2050:step.skill===3?1550:1500)+(step.delayMs||140),0);
}
function startBossCombo(room,combo=chooseBossCombo(room)){
  const s=room.state,b=s.boss,now=Date.now(),comboId=`${combo.id}-${++b.comboSeq}`;
  const graph=!!combo.nodes,total=graph?V1025.graphNodeCount(combo):combo.steps.length;
  s.activeCombo={id:comboId,comboId:combo.id,name:combo.name,tier:combo.tier||'normal',steps:graph?Object.values(combo.nodes).map(node=>({action:node.action})):combo.steps.map(step=>({...step})),nodes:graph?combo.nodes:null,currentNode:graph?combo.start:null,step:0,total,visited:[],selectedBranch:'',startedAt:now,nextAt:now};
  b.lastComboId=combo.id;b.comboHistory=[...(b.comboHistory||[]),combo.id].slice(-8);
  b.aiMemory.lastBossCombo=combo.id;
  b.comboCooldowns[combo.id]=now+(combo.cooldownMs||(combo.tier==='signature'?22000:7600));
  broadcast(room,{type:'event',e:'bossComboStart',p:{id:comboId,comboId:combo.id,name:combo.name,tier:combo.tier||'normal',total,startAt:now,estimatedEndAt:now+comboEstimatedDuration(combo)}});
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
  if(combo.nodes){
    if(!combo.currentNode){finishBossCombo(room,now);return true}
    const nodeId=combo.currentNode,node=combo.nodes[nodeId];if(!node){finishBossCombo(room,now);return true}
    combo.step++;combo.visited.push(nodeId);
    const branch=V1025.resolveNextNode(combo,node,bossCombatContext(room,now));combo.currentNode=branch.next;combo.selectedBranch=branch.branch;b.selectedBranch=branch.branch;
    const action=V1025.actionFor(node.action);b.currentAction=action.id;b.sourceAnimation=action.animation;b.aiMemory.selectedAction=action.id;
    broadcast(room,{type:'event',e:'bossComboStep',p:{id:combo.id,comboId:combo.comboId,name:combo.name,tier:combo.tier,step:combo.step,total:combo.total,node:nodeId,actionId:action.id,animation:action.animation,branch:branch.branch,ts:now}});
    broadcast(room,{type:'event',e:'bossComboBranch',p:{id:combo.id,node:nodeId,branch:branch.branch,next:branch.next||'',playerDistance:bossCombatContext(room,now).distance,ts:now}});
    const feintCancel=combo.comboId==='false_opening'&&nodeId==='heavy'&&branch.next==='cancel';
    bossSkill(room,{skill:action.legacySkill??0,actionId:action.id,combo,comboStep:combo.step-1,chain:true,ultimate:action.id==='ultimate_zero_hour',feintCancel,nextActionId:feintCancel?(combo.nodes?.[branch.next]?.action||'teleport_behind'):''});
    return true;
  }
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
  const logicalAction=options.actionId?V1025.actionFor(options.actionId):null;
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
  const profile=logicalAction?{
    telegraphMs:logicalAction.impactMs||Math.max(160,logicalAction.startupMs||320),
    endMs:logicalAction.endMs||1100,
    exposeMs:['HEAVY','AERIAL'].includes(logicalAction.category)?720:0,
    vfx:`v1025_${logicalAction.effect||logicalAction.category}`.toLowerCase()
  }:(options.chain?{...baseProfile,...chainProfiles[i],exposeMs:0}:baseProfile);
  if(options.delayMs){profile.telegraphMs+=options.delayMs;profile.endMs+=options.delayMs}
  const {telegraphMs,endMs}=profile;
  const targetRole=(logicalAction?.category==='MELEE'||logicalAction?.category==='MOBILITY'||logicalAction?.category==='AERIAL'||i===3)?livingBossTarget(s)?.role:null;
  const cast={
    id:s.nextCast++,i,startAt:now,telegraphMs,warningAt:now+Math.round(telegraphMs*.56),
    impactAt:now+telegraphMs,releaseAt:now+telegraphMs,endAt:now+endMs,
    phase:b.phase,targetRole,vfx:profile.vfx,exposeMs:profile.exposeMs,
    patternId:selection.pattern.id,patternName:selection.pattern.name,
    patternStep:selection.step+1,patternLength:selection.pattern.skills.length,
    chain:options.chain===true,comboId:options.combo?.id||'',comboKey:options.combo?.comboId||'',comboName:options.combo?.name||'',
    comboTier:options.combo?.tier||'normal',comboStep:(options.comboStep||0)+1,comboLength:options.combo?.total||options.combo?.steps?.length||1,chainGapMs:logicalAction?85:120,
    actionId:logicalAction?.id||'',logicalAnimation:logicalAction?.animation||'',sourceAnimation:logicalAction?.animation||'',animationVariant:logicalAction?V1025.animationVariantFor(logicalAction,b,s.nextCast-1):'BASE',actionCategory:logicalAction?.category||'',
    blendIn:logicalAction?.blendIn??null,blendOut:logicalAction?.blendOut??null,upperBody:logicalAction?.upperBody===true,lowerAnimation:logicalAction?.lowerAnimation||'',lowerLoop:logicalAction?.lowerLoop===true,aim:logicalAction?.aim===true,
    impactClass:logicalAction?.impactClass||'',hitStopMs:V1025_HIT_STOP_MS[logicalAction?.impactClass]||0,rootMotionXZRemoved:!!logicalAction,
    events:logicalAction?[{t:.12,type:'ANTICIPATION'},{t:Math.max(.18,(logicalAction.startupMs||100)/Math.max(1,logicalAction.endMs)),type:'TELEGRAPH'},{t:Math.max(.2,(logicalAction.impactMs||0)/Math.max(1,logicalAction.endMs)),type:'ACTIVE'},{t:.72,type:'ALLOW_BRANCH'},{t:.9,type:'RECOVERY'}]:[]
  };
  if(logicalAction?.effect==='TELEPORT')cast.teleportAt=now+(logicalAction.startupMs||150);
  if(options.feintCancel){cast.feint=true;cast.feintCancelAt=now+Math.round(telegraphMs*.74);cast.cancelReason='CONTROLLED_FALSE_OPENING'}
  if(i===3&&!logicalAction){cast.teleportAt=now+250;cast.kickAt=now+360;cast.radius=2.2}
  s.activeCast=cast;
  if(logicalAction){
    b.currentAction=logicalAction.id;b.sourceAnimation=logicalAction.animation;b.supportCue=logicalAction.effect==='VORTEX'?'VORTEX':logicalAction.category==='HEAVY'?'HEAVY_CAST':logicalAction.category==='MELEE'?'MELEE':'PRESSURE';
    setBossOrbState(room,logicalAction.orbState||'FOLLOW',cast.endAt);
    setBossHaloState(room,logicalAction.haloState||'IDLE',cast.endAt);
    if(logicalAction.trajectory){const trajectory=startBossTrajectory(room,logicalAction,targetRole,now);if(trajectory){cast.movementStartAt=trajectory.startAt;cast.movementEndAt=trajectory.endAt;cast.movementCurve=trajectory.curve}}
  }
  if([0,1,2,4].includes(i))b.orbWeakUntil=cast.impactAt+140;
  if(selection.isPatternStart)broadcast(room,{type:'event',e:'bossPattern',p:{
    phase:b.phase,id:selection.pattern.id,name:selection.pattern.name,total:selection.pattern.skills.length,startAt:now
  }});
  broadcast(room,{type:'event',e:'bossCast',p:cast});
  if(cast.feint){
    scheduleTask(room,cast.feintCancelAt-now,'v1025_feint_cancel',{castId:cast.id,comboId:cast.comboId,nextActionId:options.nextActionId||'teleport_behind'});
    broadcast(room,{type:'event',e:'bossFakeOpening',p:{id:cast.comboId,castId:cast.id,kind:'heavy_cancel',until:cast.feintCancelAt,step:cast.comboStep,total:cast.comboLength}});
  }
  if(!options.chain||options.comboStep===0||options.combo?.tier==='ultimate')castDialogue(room,i,b.phase);

  if(logicalAction){
    const effect=logicalAction.effect,impactDelay=telegraphMs;
    if(effect==='TELEPORT')scheduleTask(room,cast.teleportAt-now,'v1025_teleport',{actionId:logicalAction.id,targetRole,castId:cast.id,comboId:cast.comboId,teleportAt:cast.teleportAt});
    else if(effect==='MELEE')scheduleTask(room,impactDelay,'v1025_melee_hit',{actionId:logicalAction.id,radius:logicalAction.radius,damage:logicalAction.damage,castId:cast.id,comboId:cast.comboId});
    else if(effect==='ROUNDHOUSE_CRESCENT'){
      scheduleTask(room,impactDelay,'v1025_melee_hit',{actionId:logicalAction.id,radius:logicalAction.radius,damage:logicalAction.damage,castId:cast.id,comboId:cast.comboId});
      scheduleTask(room,impactDelay+150,'v1025_wave',{actionId:logicalAction.id,count:b.phase===3?2:1,castId:cast.id,comboId:cast.comboId});
    }else if(effect==='ORB_VOLLEY')scheduleTask(room,impactDelay,'boss_orb_volley',{count:logicalAction.id==='strafe_cast'?2:1,spread:.11,speed:7.2,dmg:9+b.phase,targetRole,castId:cast.id,comboId:cast.comboId});
    else if(effect==='SPIRIT_ORB')scheduleTask(room,impactDelay,'boss_spirit_orb',{targetRole,castId:cast.id,comboId:cast.comboId});
    else if(effect==='ORB_BARRAGE')scheduleTask(room,impactDelay,'boss_orb_volley',{count:3+b.phase-1,spread:.12,speed:7.0,dmg:8+b.phase,targetRole,castId:cast.id,comboId:cast.comboId});
    else if(effect==='CRESCENT_WAVE')scheduleTask(room,impactDelay,'v1025_wave',{actionId:logicalAction.id,count:b.phase===3?3:1,castId:cast.id,comboId:cast.comboId});
    else if(effect==='HEAVY_AOE'){
      scheduleTask(room,impactDelay,'boss_orb_radial',{n:10+b.phase*2,speed:5.8,dmg:10+b.phase,angleOffset:.17,castId:cast.id,comboId:cast.comboId});
      addArenaHazard(room,'telegraph',{x:b.x,z:b.z,radius:2.8,activeAt:cast.impactAt,endAt:cast.impactAt+320,damage:0,castId:cast.id});
    }else if(effect==='VORTEX'){
      scheduleTask(room,impactDelay,'start_dark_pool',{castId:cast.id,comboId:cast.comboId});
      if(b.phase>=2&&s.summons.length<3)spawnOneEyeMob(room,1,'VORTEX');
    }else if(effect==='ORB_TRAP')scheduleTask(room,impactDelay,'v1025_orb_trap',{targetRole,castId:cast.id,comboId:cast.comboId});
    else if(effect==='ORB_RECALL')scheduleTask(room,impactDelay,'v1025_orb_recall',{targetRole,castId:cast.id,comboId:cast.comboId});
    else if(effect==='GROUND_SLAM'){
      scheduleTask(room,impactDelay,'v1025_melee_hit',{actionId:logicalAction.id,radius:logicalAction.radius,damage:logicalAction.damage,castId:cast.id,comboId:cast.comboId});
      scheduleTask(room,impactDelay+35,'boss_radial',{n:10,speed:5.6,dmg:9+b.phase,kind:'shockwave',angleOffset:.12,y:.35,castId:cast.id,comboId:cast.comboId});
    }else if(effect==='CYCLONE'){
      scheduleTask(room,impactDelay,'v1025_melee_hit',{actionId:logicalAction.id,radius:logicalAction.radius,damage:logicalAction.damage,castId:cast.id,comboId:cast.comboId});
      scheduleTask(room,impactDelay+80,'boss_radial',{n:12,speed:6.2,dmg:8+b.phase,kind:'crescent',angleOffset:.18,y:1.2,castId:cast.id,comboId:cast.comboId});
    }else if(effect==='ZERO_HOUR'){
      const stages=[[0,1],[550,2],[1800,3],[2700,4],[3900,5],[5250,6],[7100,7],[8650,8]];
      for(const [delay,stage] of stages)scheduleTask(room,delay,'v1025_zero_hour_stage',{stage,castId:cast.id,comboId:cast.comboId});
    }
    if(b.phase>=2&&['MELEE','AERIAL'].includes(logicalAction.category)&&Date.now()>=Number(b.orb?.cooldownUntil||0)){
      setBossOrbState(room,'AUTONOMOUS',cast.endAt,{cooldownUntil:Date.now()+(b.phase===3?1900:2600)});
      scheduleTask(room,Math.min(impactDelay+120,logicalAction.endMs-120),'boss_orb_volley',{count:1,spread:0,speed:6.5,dmg:8+b.phase,targetRole:null,castId:cast.id,comboId:cast.comboId});
    }
  }else if(i===0){
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
  b.supportCue='PHASE';b.supportT=.65;
  setBossOrbState(room,next>=2?'AUTONOMOUS':'ORBIT',b.phaseLockUntil,{x:b.x,z:b.z,y:2.82});
  setBossHaloState(room,'PHASE_TRANSITION',b.phaseLockUntil);
  if(next===2)spawnOneEyeMob(room,1,'PHASE');
  if(next===3)spawnOneEyeMob(room,Math.max(0,2-(room.state.summons?.length||0)),'PHASE');
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
  processArenaHazards(room,now);
  const activeCastDoneAt=s.activeCast?.chain&&s.activeCast?.actionId?s.activeCast.endAt-Math.min(220,Math.max(70,(s.activeCast.endAt-s.activeCast.impactAt)*.24)):(s.activeCast?.endAt||0)+120;
  if(s.activeCast && now>activeCastDoneAt){
    const finishedCast=s.activeCast;
    s.activeCast=null;
    if(finishedCast.actionId){
      s.boss.currentAction='combat_idle';s.boss.sourceAnimation='combat_idle';s.boss.supportCue='IDLE';
      setBossOrbState(room,s.boss.phase>=2?'AUTONOMOUS':'ORBIT',0,{x:s.boss.x,z:s.boss.z,y:2.62,cooldownUntil:s.boss.orb?.cooldownUntil||0});
      setBossHaloState(room,'IDLE',0);
      if(finishedCast.actionId==='ultimate_zero_hour'&&s.activeUltimate?.id===finishedCast.id)s.activeUltimate=null;
    }
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
  if(!bossStaggered)updateBossTrajectory(room,now);
  if(!bossStaggered)updateBossEvade(room,now);
  updateBossOrbController(room,now);
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

  updateBossSupportDirector(room,dt,now);
  if(s.summons?.length)updateOneEyeMobs(room,dt,now);

  if(s.darkPool){
    s.darkPool.t-=dt;s.darkPool.r+=dt*4;
    for(const role of ['hero','princess']){
      const p=s.players[role];
      const dx=s.darkPool.x-p.x,dz=s.darkPool.z-p.z,length=Math.hypot(dx,dz)||1;
      if(!p.down&&length<s.darkPool.r*1.15){p.x+=dx/length*.48*dt;p.z+=dz/length*.48*dt}
      if(!p.down&&d2(p.x,p.z,s.darkPool.x,s.darkPool.z)<(s.darkPool.r*.5)**2&&Math.random()<dt*.55){
        queueEnemyHit(room,role,6,now);
      }
    }
    if(s.darkPool.t<=0)s.darkPool=null;
  }

  for(const pr of s.projectiles){
    const x1=pr.x,z1=pr.z;
    if(pr.enemy&&pr.kind==='orbRecall'){
      updateBossRecallProjectile(room,pr,now,dt);
    }else if(pr.enemy&&pr.kind==='spiritOrb'){
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
    if(pr.kind!=='orbRecall'){pr.x+=pr.vx*dt;pr.z+=pr.vz*dt;pr.t-=dt}

    if(pr.enemy){
      for(const role of ['hero','princess']){
        const p=s.players[role];
        const hitRadius=pr.kind==='spiritOrb'?.98:pr.kind==='orbRecall'?.86:.75;
        if(pr.t>0&&!p.down&&segmentCircleHit(x1,z1,pr.x,pr.z,p.x,p.z,hitRadius)){
          // Damage is confirmed after a short grace window so a late-arriving dash
          // can still protect a player if it actually happened before the hit.
          const recallKey=pr.kind==='orbRecall'?`${role}:${pr.recallLeg}`:'';
          if(recallKey&&pr.hitLegs?.[recallKey])continue;
          queueEnemyHit(room,role,pr.dmg,now);if(recallKey){pr.hitLegs||={};pr.hitLegs[recallKey]=true}
          if(pr.kind==='spiritOrb')broadcast(room,{type:'event',e:'bossSpiritOrbHit',p:{id:pr.id,role,x:p.x,z:p.z,dmg:pr.dmg}});
          if(pr.kind!=='orbRecall')pr.t=0;
        }
      }
    }else if(pr.t>0){
      let hitSummon=null;
      for(const m of s.summons||[]){
        if(m.hp>0&&segmentCircleHit(x1,z1,pr.x,pr.z,m.x,m.z,.62)){hitSummon=m;break}
      }
      if(hitSummon){
        damageOneEyeMob(room,hitSummon,pr.dmg||8,now,pr.kind||'projectile');
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
    boss:{...s.boss,aiMemory:{...s.boss.aiMemory,events:undefined}},
    projectiles:s.projectiles.map(p=>({
      id:p.id,a:p.aid||null,o:p.owner||null,x:p.x,y:p.y,z:p.z,e:p.enemy,k:p.kind,f:p.food,c:p.castId||null,b:p.bornAt||null,r:p.targetRole||null
    })),
    pickups:s.pickups.map(p=>({...p})),
    darkPool:s.darkPool?{...s.darkPool}:null,
    summons:(s.summons||[]).map(m=>({...m})),
    arenaHazards:(s.arenaHazards||[]).map(h=>({...h})),
    ultimate:s.activeUltimate?{...s.activeUltimate}:null,
    cast:s.activeCast?{...s.activeCast}:null,
    combo:s.activeCombo?{id:s.activeCombo.id,comboId:s.activeCombo.comboId,name:s.activeCombo.name,tier:s.activeCombo.tier,step:s.activeCombo.step,total:s.activeCombo.total||s.activeCombo.steps.length,node:s.activeCombo.visited?.at(-1)||'',branch:s.activeCombo.selectedBranch||'',startedAt:s.activeCombo.startedAt,nextAt:s.activeCombo.nextAt}:null
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
    renderOptimization:'V10.25-retargeted-battle-mage-orb-halo-one-eye-impact-stack',
    combatFeel:'v10.23-poise-weakpoint-critical-adaptive-combo-ai',
    combatOverhaul:'v10.25-eclipse-battle-mage-zero-hour',
    runtimeReliability:'v10.25-tripo-cache-recovery-snapshot-watchdog-retarget-fallback-budget',
    bossDirector:{thresholds:[70,35],exposedDamageMultiplier:BOSS_EXPOSE_DAMAGE_MULTIPLIER,comboGraphs:V1025.COMBO_GRAPHS.length,signatureFamilies:V1025.COMBO_GRAPHS.map(combo=>combo.id),ultimateCombos:1},
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
  server.listen(PORT,HOST,()=>console.log(`Princess Rescue V10.25 server on ${HOST||'*'}:${PORT} | redis=${redisReady} | ws=/ws`));
})();
