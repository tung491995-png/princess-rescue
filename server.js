
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
const BOSS_INTRO_MS = 11000;

// Lag compensation.
const HISTORY_MS = 1000;
const MAX_REWIND_MS = 220;
const MAX_PROJECTILE_FAST_FORWARD_MS = 150;
const HIT_CONFIRM_DELAY_MS = 90;
const DASH_IFRAME_MS = 340;
const TEST_FAST_BOSS = process.env.BOSS_TEST_FAST === '1';
const TEST_BOSS_SKILL = /^\d+$/.test(process.env.BOSS_TEST_SKILL || '') ? Number(process.env.BOSS_TEST_SKILL) : null;
const TEST_BOSS_DODGE = /^(3|12)$/.test(process.env.BOSS_TEST_DODGE || '') ? process.env.BOSS_TEST_DODGE : null;

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
    score:0,perfect:0,saves:0
  };
}
function freshState(){
  return {
    started:false,paused:false,pauseRole:null,introUntil:0,
    trust:0,tick:0,
    players:{hero:player('hero'),princess:player('princess')},
    boss:{
      x:0,z:-4.7,hp:2200,max:2200,phase:1,skillIndex:-1,skillT:TEST_FAST_BOSS?.12:1.8,lastEl:null,lastElT:0,
      evade:null,evadeInvUntil:0,dodgeReadyAt:0,dodgeSeq:0,phaseLockUntil:0
    },
    projectiles:[],pickups:[],darkPool:null,summons:[],
    activeCast:null,
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
  room.state.pendingHits ||= [];
  room.state.tasks ||= [];
  room.state.nextHit ||= 1;
  room.state.nextTask ||= 1;
  room.state.nextCast ||= 1;
  room.state.nextSummon ||= 1;
  room.state.activeCast ||= null;
  room.state.summons ||= [];
  room.state.boss.evade ||= null;
  room.state.boss.evadeInvUntil ||= 0;
  room.state.boss.dodgeReadyAt ||= 0;
  room.state.boss.dodgeSeq ||= 0;
  room.state.boss.phaseLockUntil ||= 0;
  room.state.players.hero.lastDashTs ||= 0;
  room.state.players.princess.lastDashTs ||= 0;

  // A process restart drops all sockets. Freeze a running match until both sessions resume.
  if(room.state.started){
    room.state.paused=true;
    room.state.pauseRole='server_restart';
    const now=Date.now();
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
    room.state.paused=true;
    room.state.pauseRole=role;
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
  if(b.hp<=0||b.evade||s.activeCast||now<(b.phaseLockUntil||0)||now<(b.dodgeReadyAt||0))return false;
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
  return now>=(b.evadeInvUntil||0);
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
function hitBoss(room,pr){
  const s=room.state,b=s.boss,f=FOODS[pr.food],owner=s.players[pr.owner];
  let weak=f.el==='fresh'?1.25:1,bonus=1;
  if(b.lastEl&&b.lastEl!==f.el&&b.lastElT>0){
    const r=reaction(b.lastEl,f.el);
    if(r){
      bonus=r[1];s.trust=Math.min(100,s.trust+6);
      broadcast(room,{type:'event',e:'reaction',p:{name:r[0]}});
    }
  }
  b.lastEl=f.el;b.lastElT=1.15;
  const dmg=pr.dmg*weak*bonus;
  b.hp-=dmg;owner.score+=dmg;
  broadcast(room,{type:'event',e:'combatHit',p:{
    target:'boss',owner:pr.owner,aid:pr.aid||null,kind:pr.kind||'projectile',dmg:Math.round(dmg),ts:Date.now()
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
    p.atkCd=.32;
    const comboNow=Date.now();
    p.combo=comboNow<=(p.comboUntil||0)?((p.combo||0)+1)%3:0;
    p.comboUntil=comboNow+720;
    const combo=p.combo,reach=combo===2?2.85:2.62;
    const damageScale=[1.08,1.16,1.32][combo];
    let hit=false,targetType='air',hitX=shooter.x+dx*reach,hitZ=shooter.z+dz*reach;

    let nearestSummon=null,nearestSummonDistance=Infinity;
    for(const summon of s.summons||[]){
      if(summon.hp<=0)continue;
      const distance=Math.hypot(summon.x-shooter.x,summon.z-shooter.z);
      if(distance<=reach&&distance<nearestSummonDistance){
        nearestSummon=summon;nearestSummonDistance=distance;
      }
    }
    const bossDistance=Math.hypot(target.x-shooter.x,target.z-shooter.z);
    if(nearestSummon&&nearestSummonDistance<bossDistance){
      const damage=f.dmg*damageScale;
      nearestSummon.hp-=damage;hit=true;targetType='summon';hitX=nearestSummon.x;hitZ=nearestSummon.z;
      broadcast(room,{type:'event',e:'summonHit',p:{id:nearestSummon.id,dmg:Math.round(damage),hp:Math.max(0,nearestSummon.hp)}});
      if(nearestSummon.hp<=0){
        broadcast(room,{type:'event',e:'summonDefeated',p:{id:nearestSummon.id,x:nearestSummon.x,z:nearestSummon.z,y:nearestSummon.y}});
        s.trust=Math.min(100,s.trust+4);
      }
    }else if(bossDistance<=reach&&bossCanBeHit(b,actionTs)){
      hit=true;targetType='boss';hitX=target.x;hitZ=target.z;
      hitBoss(room,{owner:role,aid,food:p.food,dmg:f.dmg*damageScale,kind:'sword'});
      s.trust=Math.min(100,s.trust+(combo===2?2:1));
    }
    broadcast(room,{type:'event',e:'swordSlash',p:{
      role,aid,combo,hit,target:targetType,x:shooter.x,z:shooter.z,targetX:hitX,targetZ:hitZ,startAt:actionTs
    }});
    markDirty(room);
    return{accepted:true,projectiles:[],melee:true,hit,combo,target:targetType};
  }

  if(p.skillCd>0)return{accepted:false,projectiles:[],reason:'COOLDOWN'};
  p.skillCd=2.8;
  const base=Math.atan2(dz,dx),n=5;
  const latencyMs=Math.max(0,Date.now()-actionTs);
  const spawned=[];

  for(let i=0;i<n;i++){
    const a=base+(i-(n-1)/2)*.12;
    const pr={
      id:s.nextProj++,aid,owner:role,enemy:false,kind:'royalBolt',food:p.food,
      x:shooter.x,z:shooter.z,y:1.28,
      vx:Math.cos(a)*10.8,vz:Math.sin(a)*10.8,
      dmg:f.dmg*1.45,t:3
    };
    fastForwardPlayerProjectile(room,pr,latencyMs);
    if(pr.t>0){
      s.projectiles.push(pr);
      spawned.push({id:pr.id,x:pr.x,y:pr.y,z:pr.z,vx:pr.vx,vz:pr.vz,food:pr.food,aid});
    }
  }

  s.trust=Math.min(100,s.trust+4);
  broadcast(room,{type:'event',e:'banner',p:{msg:`✦ ${role==='hero'?'KIẾM KHÍ TINH QUANG':'HOÀNG GIA TINH VŨ'}`}});
  broadcast(room,{type:'event',e:'actionAnim',p:{role,a:'skill',aid,startAt:actionTs}});
  markDirty(room);
  return{accepted:true,projectiles:spawned};
}
function dash(room,role,actionTs=Date.now()){
  const p=room.state.players[role];
  if(p.down||p.dash>0||p.stamina<22)return;
  actionTs=clampActionTs(actionTs);
  let x=p.input.x,z=p.input.y;
  if(Math.hypot(x,z)<.1){x=Math.sin(p.rot);z=Math.cos(p.rot);}
  [x,z]=norm(x,z);
  p.stamina-=22;p.vx=x*13;p.vz=z*13;p.dash=.25;p.inv=.34;p.lastDashTs=actionTs;
  broadcast(room,{type:'event',e:'dash',p:{role,x,z}});
  markDirty(room);
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
  if(p.hp<=0){
    p.hp=0;p.down=true;p.revive=3.2;
    broadcast(room,{type:'event',e:'banner',p:{msg:`${role==='princess'?'Công chúa':'Hero'} bị hạ!`}});
  }
  markDirty(room);
}
function perfect(room,role){
  const p=room.state.players[role];
  p.perfect++;p.inv=.45;room.state.trust=Math.min(100,room.state.trust+10);
  broadcast(room,{type:'event',e:'perfect',p:{role}});
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
  if(task.type==='start_dark_pool'){
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
      broadcast(room,{type:'event',e:'bossTeleportKick',p:{role,x:b.x,z:b.z,kickAt:task.data.kickAt,impactAt:task.data.impactAt}});
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
  }else if(task.type==='spawn_pickup'){
    spawnPickup(room,task.data.food??null);
  }
  markDirty(room);
}
function processTasks(room,now){
  const s=room.state,keep=[];
  for(const task of s.tasks){
    if(task.dueAt<=now)runTask(room,task);
    else keep.push(task);
  }
  s.tasks=keep;
}
function bossSkill(room){
  const s=room.state,b=s.boss;
  const phaseAllowed=b.phase===1?[0,1,3]:b.phase===2?[0,1,2,3]:[0,1,2,3,4];
  const allowed=Number.isInteger(TEST_BOSS_SKILL)&&TEST_BOSS_SKILL>=0&&TEST_BOSS_SKILL<=4?[TEST_BOSS_SKILL]:phaseAllowed;
  const nextPos=(b.skillIndex+1)%allowed.length;
  const i=allowed[nextPos];
  b.skillIndex=nextPos;
  const now=Date.now();
  const profile={
    0:{telegraphMs:880,endMs:2550,vfx:'night_pool'},
    1:{telegraphMs:1250,endMs:3500,vfx:'moon_shatter'},
    2:{telegraphMs:1450,endMs:4650,vfx:'three_am'},
    3:{telegraphMs:1280,endMs:2350,vfx:'teleport_kick'},
    4:{telegraphMs:1800,endMs:7400,vfx:'eternal_night'}
  }[i]||{telegraphMs:880,endMs:2550,vfx:'night_pool'};
  const {telegraphMs,endMs}=profile;
  const targetRole=i===3?(b.phase%2?'hero':'princess'):null;
  const cast={
    id:s.nextCast++,i,startAt:now,telegraphMs,warningAt:now+Math.round(telegraphMs*.56),
    impactAt:now+telegraphMs,releaseAt:now+telegraphMs,endAt:now+endMs,
    phase:b.phase,targetRole,vfx:profile.vfx
  };
  if(i===3){cast.teleportAt=now+330;cast.kickAt=now+410;cast.radius=2.2}
  s.activeCast=cast;
  broadcast(room,{type:'event',e:'bossCast',p:cast});
  castDialogue(room,i,b.phase);

  if(i===0){
    // Quick Cast 13: the permanent hand orb charges, while lightweight
    // authoritative orb-clone bullets fan toward the nearest living player.
    scheduleTask(room,telegraphMs,'boss_orb_volley',{
      count:b.phase,speed:6.9+b.phase*.38,dmg:9+b.phase*2,
      spread:b.phase===1?0:.115,targetRole:null,castId:cast.id
    });
    // A larger weapon-orb follows the nearest player after the small fan. It
    // uses server steering/hit validation; the GLB hand orb is never moved.
    scheduleTask(room,telegraphMs+320,'boss_spirit_orb',{targetRole:null,castId:cast.id});
    scheduleTask(room,telegraphMs,'start_dark_pool');
  }else if(i===1){
    // AOE 14: one synchronized ring of orb VFX clones. Later phases retain a
    // delayed shard counter-wave so the player can read the two patterns.
    scheduleTask(room,telegraphMs,'boss_orb_radial',{n:10+b.phase*2,speed:5.55+b.phase*.38,dmg:9+b.phase,angleOffset:Math.random()*.3,castId:cast.id});
    if(b.phase>=2)scheduleTask(room,telegraphMs+520,'boss_radial',{n:10,speed:6.6,dmg:10+b.phase,kind:'shard',angleOffset:.26,y:2.5});
  }else if(i===2){
    scheduleTask(room,telegraphMs,'three_am_edges');
    scheduleTask(room,telegraphMs+820,'boss_radial',{n:8,speed:5.7,dmg:9+b.phase,kind:'thought',angleOffset:.2,y:1.4});
  }else if(i===3){
    // Ảo Ảnh Luân Vũ: Teleport 12 places the boss behind the target, then
    // Spin Kick 07 releases a fair, server-authoritative circular melee hit.
    scheduleTask(room,cast.teleportAt-now,'teleport_kick_reposition',{role:targetRole,distance:1.62,kickAt:cast.kickAt,impactAt:cast.impactAt});
    scheduleTask(room,cast.impactAt-now,'spin_kick_hit',{radius:cast.radius,dmg:13+b.phase*3});
  }else if(i===4){
    // Vĩnh Dạ: three broad night waves + shard pressure + dream summons.
    for(let w=0;w<3;w++){
      scheduleTask(room,telegraphMs+w*1000,'boss_radial',{n:10,speed:4.6+w*.7,dmg:11+b.phase,kind:w===1?'thought':'night',angleOffset:w*.38,y:1.55});
      scheduleTask(room,telegraphMs+w*1000+260,'boss_radial',{n:7,speed:6.3+w*.45,dmg:10+b.phase,kind:'shard',angleOffset:.2+w*.38,y:2.55});
    }
    scheduleTask(room,telegraphMs+4200,'summon_dreams',{count:2});
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
function startMatch(room){
  reset(room);room.state.started=true;room.state.paused=false;room.state.pauseRole=null;
  // V10.16.2 keeps movement, attacks, boss AI and timers locked while both
  // clients watch the complete 10.5s Eclipse Waltz cinematic.
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
    s.activeCast=null;
    if(s.boss.skillT<.65)s.boss.skillT=.65;
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
  }

  b.lastElT=Math.max(0,b.lastElT-dt);
  updateBossEvade(room,now);
  const ratio=b.hp/b.max,next=ratio>.66?1:ratio>.33?2:3;
  if(next!==b.phase){
    b.phase=next;b.phaseLockUntil=now+(next===3?2500:2200);broadcast(room,{type:'event',e:'phase',p:{phase:next,until:b.phaseLockUntil}});
    if(next===2){
      dialogue(room,'boss','Các ngươi vẫn chưa chịu mệt sao?',2200);
      scheduleTask(room,340,'dialogue',{speaker:'hero',text:'Khung giờ 3 giờ sáng tới rồi. Tập trung!',duration:1900});
    }else if(next===3){
      dialogue(room,'boss','Tình cảm mong manh ấy… ta muốn xem nó chịu được đêm dài bao lâu.',2600);
      scheduleTask(room,380,'dialogue',{speaker:'princess',text:'Boss nói nhiều ghê. Đánh thôi!',duration:1800});
    }
  }
  tryBossEvade(room,now);
  b.skillT-=dt;
  if(b.skillT<=0&&!s.activeCast&&!b.evade&&now>=(b.phaseLockUntil||0)){
    b.skillT=b.phase===1?4.0:b.phase===2?3.35:3.05;
    bossSkill(room);
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
    ts:Date.now(),tick:s.tick,trust:s.trust,started:s.started,paused:s.paused,pauseRole:s.pauseRole,introUntil:s.introUntil||0,testMode:room.testMode||'',
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
    cast:s.activeCast?{...s.activeCast}:null
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
    combatFeel:'orb-halo-state-machine-two-tier-hit-authoritative-spirit-orb',
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
        room.state.paused=false;room.state.pauseRole=null;
        markDirty(room);
        await persistRoomNow(room);
        broadcast(room,{type:'resumePlay',state:snapshot(room)});
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
      if(room.state.started&&room.state.paused&&matchClientsReady(room)&&matchBossAssetsReady(room)){
        room.state.paused=false;room.state.pauseRole=null;markDirty(room);
        await persistRoomNow(room);
        broadcast(room,{type:'resumePlay',state:snapshot(room)});
      }
      return;
    }

    if(m.type==='leave'){
      const slot=room.slots[role],oldTok=slot.token;
      slot.token=null;slot.ws=null;slot.disconnectedAt=null;
      await deleteSession(oldTok);
      if(room.state.started){
        room.state.started=false;room.state.paused=false;
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
        send(ws,{type:'actionAck',a:m.a,aid,accepted:result.accepted,projectiles:result.projectiles,melee:!!result.melee,hit:!!result.hit,combo:result.combo,target:result.target,serverTs:Date.now(),reason:result.reason||''});
      }else if(m.a==='dash'){
        dash(room,role,actionTs);
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
          room.state.started=false;room.state.paused=false;
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
  server.listen(PORT,HOST,()=>console.log(`Princess Rescue V10.16.2 server on ${HOST||'*'}:${PORT} | redis=${redisReady} | ws=/ws`));
})();
