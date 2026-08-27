'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const V1025=require('../lib/v10_25_combat');

const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

function extractFunction(source,name){
  const marker=`function ${name}(`,start=source.indexOf(marker);assert(start>=0,`Missing function ${name}`);
  const paramsStart=start+marker.length-1;let parenDepth=0,paramEnd=-1,paramQuote='',paramEscaped=false;
  for(let i=paramsStart;i<source.length;i++){
    const char=source[i];
    if(paramQuote){if(paramEscaped){paramEscaped=false;continue}if(char==='\\'){paramEscaped=true;continue}if(char===paramQuote)paramQuote='';continue}
    if(char==='\''||char==='"'||char==='`'){paramQuote=char;continue}
    if(char==='(')parenDepth++;else if(char===')'&&--parenDepth===0){paramEnd=i;break}
  }
  assert(paramEnd>=0,`Unterminated parameters for ${name}`);
  const bodyStart=source.indexOf('{',paramEnd+1);let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let i=bodyStart;i<source.length;i++){
    const char=source[i],next=source[i+1];
    if(lineComment){if(char==='\n')lineComment=false;continue}
    if(blockComment){if(char==='*'&&next==='/'){blockComment=false;i++}continue}
    if(quote){if(escaped){escaped=false;continue}if(char==='\\'){escaped=true;continue}if(char===quote)quote='';continue}
    if(char==='/'&&next==='/'){lineComment=true;i++;continue}
    if(char==='/'&&next==='*'){blockComment=true;i++;continue}
    if(char==='\''||char==='"'||char==='`'){quote=char;continue}
    if(char==='{')depth++;else if(char==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`Unterminated function ${name}`);
}

for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});

const witchHunt=V1025.COMBO_GRAPHS.find(combo=>combo.id==='witch_hunt');
assert(witchHunt?.nodes?.vortex?.next==='trap'&&witchHunt.nodes.trap?.action==='orb_trap','Orb Trap is still unreachable from the Combo Graph director');
assert(Object.values(V1025.ACTIONS).some(action=>action.orbState==='TRAP'),'Orb Trap state has no logical action');
assert(Object.values(V1025.ACTIONS).some(action=>action.orbState==='RECALL'),'Orb Recall state has no logical action');

const orbEvents=[];
const orbContext={
  Math,Number,Date,d2:(ax,az,bx,bz)=>(ax-bx)**2+(az-bz)**2,
  broadcast:(_room,event)=>orbEvents.push(event),markDirty:()=>{}
};
vm.createContext(orbContext);
for(const name of ['livingBossTarget','bossOrbAnchor','updateBossOrbController','trajectoryEase','setBossOrbState','bossOrbVolley','bossOrbRecall','updateBossRecallProjectile'])vm.runInContext(extractFunction(server,name),orbContext);
const orbRoom={state:{
  nextProj:1,projectiles:[],players:{hero:{role:'hero',x:4,z:2,down:false},princess:{role:'princess',x:-5,z:1,down:false}},
  boss:{x:0,y:0,z:0,phase:2,comboSeq:3,orb:{state:'AUTONOMOUS',x:99,y:99,z:99,phaseAt:1000,phaseOffset:.25,cooldownUntil:0}}
}};
orbContext.bossOrbVolley(orbRoom,{count:2,castId:31});
const volley=orbRoom.state.projectiles.slice();
assert.strictEqual(volley.length,2,'Authoritative Orb volley did not spawn');
assert(volley.every(projectile=>projectile.x===orbRoom.state.boss.orb.x&&projectile.y===orbRoom.state.boss.orb.y&&projectile.z===orbRoom.state.boss.orb.z),'Orb projectiles did not launch from the replicated Orb controller');
const volleyEvent=orbEvents.find(event=>event.e==='bossOrbVolley');
assert(volleyEvent&&volleyEvent.p.originX===volley[0].x&&volleyEvent.p.originY===volley[0].y&&volleyEvent.p.originZ===volley[0].z,'Orb launch event lost its authoritative world-space origin');

const recall=orbContext.bossOrbRecall(orbRoom,{targetRole:'hero',castId:32});
assert(recall?.kind==='orbRecall'&&recall.recallStartAt<recall.recallTurnAt&&recall.recallTurnAt<recall.recallEndAt,'Orb Recall is not an outgoing/returning path');
assert(recall.turnX===orbRoom.state.players.hero.x&&recall.endX!==undefined&&recall.hitLegs,'Orb Recall path lacks its target, hand return, or per-leg hit authority');
assert(orbRoom.state.boss.orb.state==='RECALL'&&orbRoom.state.boss.orb.recallProjectileId===recall.id,'Orb controller does not follow its Recall projectile');
assert(orbEvents.some(event=>event.e==='bossOrbRecall'&&event.p.startAt<event.p.turnAt&&event.p.turnAt<event.p.endAt),'Orb Recall client contract is missing');
orbContext.updateBossRecallProjectile(orbRoom,recall,recall.recallStartAt+190,.016);
assert(recall.recallLeg==='out'&&recall.x>recall.startX&&recall.x<recall.turnX,'Orb Recall did not traverse its outgoing leg');
orbContext.updateBossRecallProjectile(orbRoom,recall,recall.recallTurnAt+240,.016);
assert(recall.recallLeg==='return'&&recall.x<recall.turnX&&orbRoom.state.boss.orb.x===recall.x,'Orb Recall did not return the authoritative controller toward the hand');
assert(server.includes("const recallKey=pr.kind==='orbRecall'?`${role}:${pr.recallLeg}`:'';"),'Recall cannot damage independently on its outgoing and returning legs');

const taskEvents=[],taskHazards=[];
const taskContext={
  Date,Math,Number,
  livingBossTarget:state=>state.players.hero,
  setBossOrbState:(room,state,until,extra={})=>{room.state.boss.orb={...(room.state.boss.orb||{}),state,until,...extra}},
  addArenaHazard:(_room,type,data)=>{taskHazards.push({type,...data})},bossOrbRecall:()=>{},broadcast:(_room,event)=>taskEvents.push(event),markDirty:()=>{}
};
vm.createContext(taskContext);vm.runInContext(`${extractFunction(server,'runTask')}\nglobalThis.runTask=runTask;`,taskContext);
const taskRoom={state:{started:true,paused:false,players:{hero:{role:'hero',x:2,z:3,down:false}},boss:{x:0,z:0,phase:2,orb:{}},nextHazard:1}};
taskContext.runTask(taskRoom,{type:'v1025_orb_trap',data:{targetRole:'hero',castId:44}});
assert(taskHazards.length===1&&taskHazards[0].type==='orb_trap'&&taskHazards[0].castId===44,'Orb Trap hazard is not cast-scoped');
assert(taskRoom.state.boss.orb.state==='TRAP'&&taskRoom.state.boss.orb.x===2&&taskRoom.state.boss.orb.y===1.35,'Orb Trap controller did not detach to its authoritative hover point');

const zeroEvents=[],haloStates=[];
const zeroContext={
  Date,Math,Number,BOSS_EXPOSE_DAMAGE_MULTIPLIER:1.3,
  livingBossTarget:state=>state.players.hero,clampBossToArena:(x,z)=>({x,z}),
  setBossOrbState:(room,state,until,extra={})=>{room.state.boss.orb={...(room.state.boss.orb||{}),state,until,...extra}},
  setBossHaloState:(room,state,until,extra={})=>{room.state.boss.halo={state,until,...extra};haloStates.push(room.state.boss.halo)},
  bossOrbRecall:()=>null,broadcast:(_room,event)=>zeroEvents.push(event),markDirty:()=>{}
};
vm.createContext(zeroContext);
for(const name of ['addArenaHazard','runZeroHourStage'])vm.runInContext(extractFunction(server,name),zeroContext);
const zeroRoom={state:{
  nextHazard:1,arenaHazards:[],activeUltimate:null,activeCast:{endAt:Date.now()+9800},players:{hero:{role:'hero',x:3.2,z:1.8,down:false}},
  boss:{x:0,y:0,z:-1,phase:3,supportCue:'IDLE',orb:{state:'FOLLOW'},halo:{state:'IDLE'}}
}};
for(const stage of [1,2,3,4,5,6,7])zeroContext.runZeroHourStage(zeroRoom,stage,73);
const lanes=zeroRoom.state.arenaHazards.filter(hazard=>hazard.type==='safe_lane'),lasers=zeroRoom.state.arenaHazards.filter(hazard=>hazard.type==='laser_warning'),starfalls=zeroRoom.state.arenaHazards.filter(hazard=>hazard.type==='starfall');
assert(lanes.length===2&&lanes.every(lane=>lane.safe&&lane.shape==='lane'&&lane.damage===0),'Zero Hour did not author two readable non-damaging safe lanes');
assert(lasers.length===6&&lasers.every(laser=>laser.shape==='line'&&laser.castId===73),'Zero Hour laser warning field is incomplete');
assert(zeroRoom.state.activeUltimate.orbArray.length===12&&zeroEvents.some(event=>event.e==='zeroHourOrbArray'&&event.p.points.length===12),'Zero Hour Orb Sky Array is not snapshot/event recoverable');
assert(zeroRoom.state.activeUltimate.slam?.logicalAnimation==='heavy_slam'&&zeroRoom.state.boss.trajectory?.actionId==='zero_hour_slam','Zero Hour Eclipse Slam lacks authoritative boss choreography');
assert(starfalls.length===12&&starfalls.every(hazard=>hazard.orbSlot!==null&&hazard.fallAt===zeroRoom.state.activeUltimate.orbArray[hazard.orbSlot].fallAt),'Starfall is not linked to the suspended Orb array');
for(const point of zeroRoom.state.activeUltimate.orbArray){
  const radius=Math.hypot(point.x,point.z),angle=Math.atan2(point.z,point.x);
  assert(lanes.every(lane=>Math.abs(Math.sin(angle-lane.angle))*radius>=.95),'A linked Starfall point invaded an authoritative safe lane');
}
const collapse=haloStates.at(-1);
assert(collapse.state==='COLLAPSE'&&collapse.startAt<collapse.impactAt&&collapse.impactAt<collapse.until,'Halo Collapse lacks an authoritative inward-collapse interval');
assert(zeroRoom.state.arenaHazards.every(hazard=>hazard.castId===73),'A Zero Hour hazard lost cast-scoped interruption cleanup');

const pauseContext={Number};vm.createContext(pauseContext);vm.runInContext(`${extractFunction(server,'shiftPauseClock')}\nglobalThis.shiftPauseClock=shiftPauseClock;`,pauseContext);
const pauseRoom={history:{hero:[],princess:[],boss:[]},state:{
  introUntil:0,players:{hero:{},princess:{}},pendingHits:[],tasks:[],activeCombo:null,summons:[],
  boss:{orb:{until:2000,cooldownUntil:2400,phaseAt:1000,recallStartAt:1200,recallTurnAt:1500,recallEndAt:1900},halo:{until:2200,startAt:1300,impactAt:1800}},
  activeCast:null,activeUltimate:{startedAt:1000,endAt:10800,stageStartAt:3700,safeLanes:[{until:7900}],orbArray:[{suspendedAt:3700,fallAt:6400}],slam:{startAt:4900,impactAt:5520,endAt:5820},collapse:{startAt:8100,impactAt:8720,endAt:9100}},
  arenaHazards:[{startAt:3700,activeAt:6400,endAt:6820,fallAt:6400}],projectiles:[{bornAt:5000,recallStartAt:5000,recallTurnAt:5380,recallEndAt:5860}]
}};
pauseContext.shiftPauseClock(pauseRoom,500);
assert.deepStrictEqual([pauseRoom.state.boss.orb.recallStartAt,pauseRoom.state.boss.halo.impactAt,pauseRoom.state.activeUltimate.orbArray[0].fallAt,pauseRoom.state.activeUltimate.slam.impactAt,pauseRoom.state.arenaHazards[0].fallAt,pauseRoom.state.projectiles[0].recallEndAt],[1700,2300,6900,6020,6900,6360],'Pause did not freeze the new Orb/Halo/Zero Hour clocks');

assert(html.includes("controllerDetached=['ORBIT','AUTONOMOUS','FREE_FLOAT','TRAP','RECALL','ULTIMATE'].includes(orbState)"),'Client Orb controller does not consume authoritative detached world coordinates');
assert(html.includes('bossArmamentOrbTarget.set(Number(authoritativeOrb.x),Number(authoritativeOrb.y),Number(authoritativeOrb.z))'),'Client Orb Y is still relative to boss height instead of world-authoritative');
assert(html.includes("if(e==='zeroHourOrbArray')")&&html.includes('function updateZeroHourOrbArray('),'Zero Hour Orb Sky Array has no pooled client handler');
assert(html.includes('function recoverZeroHourSlamPlayback(')&&html.includes("logicalAnimation:'heavy_slam'"),'Zero Hour slam cannot recover its impact-timed animation from a snapshot');
assert(html.includes("if(haloLanguage==='COLLAPSE')")&&html.includes("lerp(1,.08,bossArmamentEase(collapseProgress))"),'Halo Collapse still expands instead of condensing inward');
assert(html.includes("if(k==='orbRecall')return 10")&&html.includes("pb.k==='orbRecall'?1.16"),'Orb Recall lacks its strong return-trail presentation');
assert(html.includes("const bornAt=Number(pb.b),serverAge=Number.isFinite(bornAt)?Math.max(0,serverNow()-bornAt):0"),'Late snapshots can still replay a stale Orb muzzle transition');
assert(html.includes('function clearZeroHourFxTimers()')&&html.includes('v1025ZeroHourArrayState=null;clearZeroHourFxTimers();'),'Interrupted Zero Hour can leak delayed slam/collapse presentation');

console.log('V10.25 M3 ORB/HALO/ZERO HOUR PASS · controller-aligned launches · damaging Recall · reachable Trap · safe lanes · linked sky array/slam/starfall/collapse');
