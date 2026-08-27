'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const blockStart=server.indexOf('function bossWeakPointForHit(');
const blockEnd=server.indexOf('\nfunction fastForwardPlayerProjectile(',blockStart);
assert(blockStart>=0&&blockEnd>blockStart,'Could not isolate server hit/interrupt invariants');

const events=[];
const recorded=[];
const context={
  Math:Object.assign(Object.create(Math),{random:()=>1}),
  FOODS:[{el:'crispy'}],
  BOSS_BODY_CRIT_CHANCE:.015,
  BOSS_EXPOSE_DAMAGE_MULTIPLIER:1.30,
  BOSS_CRIT_MULTIPLIER:1.75,
  BOSS_POISE_REGEN_DELAY_MS:2350,
  BOSS_BREAK_STAGGER_MS:950,
  BOSS_BREAK_RESIST_MS:5200,
  BOSS_CRITICAL_STAGGER_MS:190,
  TEST_BOSS_CRIT:false,
  V1025_HIT_STOP_MS:{quick:32,normal:54,heavy:88,critical:120,perfectParry:145},
  V1025:{
    recordPlayerAction:(_boss,type,meta,now)=>recorded.push({type,meta,now})
  },
  reaction:()=>null,
  broadcast:(_room,event)=>events.push(event),
  setBossOrbState:(room,state,until)=>{room.state.boss.orb={state,until}},
  setBossHaloState:(room,state,until)=>{room.state.boss.halo={state,until}},
  markDirty:()=>{}
};
vm.runInNewContext(`${server.slice(blockStart,blockEnd)}\nglobalThis.m1={bossMeleeParryWindow,interruptBossCombo,hitBoss};`,context,{filename:'v10.25-m1-server-invariants.js'});
const {bossMeleeParryWindow,interruptBossCombo,hitBoss}=context.m1;

const pauseStart=server.indexOf('function shiftPauseClock(');
const pauseEnd=server.indexOf('\nfunction beginRoomPause(',pauseStart);
assert(pauseStart>=0&&pauseEnd>pauseStart,'Could not isolate authoritative pause-clock shifting');
const pauseContext={Number};
vm.runInNewContext(`${server.slice(pauseStart,pauseEnd)}\nglobalThis.shiftPauseClock=shiftPauseClock;`,pauseContext,{filename:'v10.25-m1-pause-clock.js'});
const pauseRoom={
  history:{hero:[{ts:900}],princess:[],boss:[]},
  state:{
    introUntil:1200,
    players:{hero:{comboUntil:1100,lastDashTs:800,counterUntil:1300},princess:{}},
    boss:{
      evadeInvUntil:0,dodgeReadyAt:0,phaseLockUntil:0,exposedUntil:0,poiseRegenAt:0,staggerUntil:0,staggerResistUntil:0,criticalUntil:0,
      backWeakUntil:0,upperWeakUntil:0,orbWeakUntil:0,
      trajectory:{startAt:1000,endAt:1400},orb:{until:3000,cooldownUntil:3400},halo:{until:3000}
    },
    activeCast:{startAt:1000,warningAt:1200,impactAt:1500,releaseAt:1500,endAt:2200},
    activeCombo:{startedAt:1000,nextAt:2200},activeUltimate:{startedAt:1000,endAt:10800},
    pendingHits:[{hitTs:1400,applyAt:1450}],tasks:[{dueAt:1800,data:{startAt:1000,impactAt:1500,endAt:2200}}],
    arenaHazards:[{startAt:1600,activeAt:1900,endAt:2400}],
    summons:[{stateUntil:2100,lunge:{startAt:1500,endAt:1850}}],projectiles:[{bornAt:1550}]
  }
};
pauseContext.shiftPauseClock(pauseRoom,500);
assert.strictEqual(pauseRoom.state.activeCast.impactAt,2000,'Active cast impact did not remain frozen across pause');
assert.strictEqual(pauseRoom.state.activeUltimate.endAt,11300,'Ultimate snapshot end time did not remain frozen across pause');
assert.deepStrictEqual(
  [pauseRoom.state.arenaHazards[0].startAt,pauseRoom.state.arenaHazards[0].activeAt,pauseRoom.state.arenaHazards[0].endAt],
  [2100,2400,2900],
  'Arena hazard clocks did not remain frozen across pause'
);
assert.deepStrictEqual(
  [pauseRoom.state.boss.trajectory.startAt,pauseRoom.state.boss.trajectory.endAt,pauseRoom.state.boss.orb.until,pauseRoom.state.boss.orb.cooldownUntil,pauseRoom.state.boss.halo.until],
  [1500,1900,3500,3900,3500],
  'Boss trajectory/Orb/Halo clocks did not remain frozen across pause'
);
assert.deepStrictEqual(
  [pauseRoom.state.summons[0].stateUntil,pauseRoom.state.summons[0].lunge.startAt,pauseRoom.state.summons[0].lunge.endAt],
  [2600,2000,2350],
  'One-Eye action clocks did not remain frozen across pause'
);

const ultimateRoom={state:{
  tasks:[{type:'v1025_zero_hour_stage'},{type:'boss_orb_volley'},{type:'spawn_pickup'}],
  arenaHazards:[{id:1,type:'starfall',castId:77},{id:2,type:'slam',castId:88},{id:3,type:'telegraph',castId:null}],
  projectiles:[{id:10,kind:'orbclone',castId:77},{id:11,kind:'crescent',castId:88},{id:12,kind:'thought'}],
  activeCast:{id:77,actionId:'ultimate_zero_hour'},
  activeCombo:{id:'zero-1',comboId:'eternal_eclipse_zero_hour',name:'ETERNAL ECLIPSE · ZERO HOUR',tier:'ultimate'},
  activeUltimate:{id:77,name:'ETERNAL ECLIPSE · ZERO HOUR',stage:4,stageName:'ORB SKY ARRAY'},
  boss:{skillT:0,trajectory:{kind:'dash'},currentAction:'ultimate_zero_hour',sourceAnimation:'power_up',supportCue:'ULTIMATE'}
}};
events.length=0;
interruptBossCombo(ultimateRoom,5000,'perfect_parry');
assert.strictEqual(ultimateRoom.state.activeCast,null,'Interrupted cast remained active');
assert.strictEqual(ultimateRoom.state.activeCombo,null,'Interrupted combo remained active');
assert.strictEqual(ultimateRoom.state.activeUltimate,null,'Interrupted ultimate remained snapshot-visible');
assert.deepStrictEqual(ultimateRoom.state.tasks.map(task=>task.type),['spawn_pickup'],'Boss interrupt task cleanup regressed');
assert.deepStrictEqual(ultimateRoom.state.arenaHazards.map(hazard=>hazard.id),[2,3],'Ultimate interrupt did not isolate hazard cleanup by cast id');
assert.deepStrictEqual(ultimateRoom.state.projectiles.map(projectile=>projectile.id),[11,12],'Ultimate interrupt did not isolate projectile cleanup by cast id');
assert.strictEqual(ultimateRoom.state.boss.trajectory,null,'Boss trajectory cleanup regressed');
const ultimateInterrupted=events.find(event=>event.e==='bossUltimateInterrupted');
assert(ultimateInterrupted,'Ultimate interruption was not broadcast');
assert.strictEqual(ultimateInterrupted.p.castId,77,'Ultimate interruption lost its cast id');
assert.strictEqual(ultimateInterrupted.p.stage,4,'Ultimate interruption lost its active stage');
assert.strictEqual(ultimateInterrupted.p.interrupted,true,'Ultimate interruption state was not explicit');
assert.strictEqual(ultimateInterrupted.p.active,false,'Ultimate interruption did not explicitly clear active state');
assert(events.some(event=>event.e==='bossComboInterrupted'),'Existing combo interruption broadcast regressed');

const hazardStart=server.indexOf('function addArenaHazard(');
const hazardEnd=server.indexOf('\nfunction processArenaHazards(',hazardStart);
const zeroHourStart=server.indexOf('function runZeroHourStage(');
const zeroHourEnd=server.indexOf('\nfunction scheduleTask(',zeroHourStart);
assert(hazardStart>=0&&hazardEnd>hazardStart&&zeroHourStart>=0&&zeroHourEnd>zeroHourStart,'Could not isolate Zero Hour hazard tagging');
context.livingBossTarget=()=>null;
context.clampBossToArena=(x,z)=>({x,z});
vm.runInNewContext(`${server.slice(hazardStart,hazardEnd)}\n${server.slice(zeroHourStart,zeroHourEnd)}\nglobalThis.m1.addArenaHazard=addArenaHazard;globalThis.m1.runZeroHourStage=runZeroHourStage;`,context,{filename:'v10.25-m1-zero-hour-hazards.js'});
const zeroHourRoom={state:{nextHazard:1,arenaHazards:[],activeUltimate:null,activeCast:{endAt:20000},boss:{x:0,y:0,z:0,phase:3,supportCue:'IDLE',orb:{},halo:{}}}};
for(const stage of [2,5,6,7])context.m1.runZeroHourStage(zeroHourRoom,stage,91);
assert.strictEqual(zeroHourRoom.state.arenaHazards.length,28,'Zero Hour hazard fixture did not exercise safe lanes, lasers, linked starfall, slam, and collapse');
assert(zeroHourRoom.state.arenaHazards.every(hazard=>hazard.castId===91),'A Zero Hour hazard was not tagged with its authoritative cast id');

const cast={startAt:1000,impactAt:1400,endAt:1800,actionCategory:'MELEE',actionId:'jab_cross'};
const window=bossMeleeParryWindow(cast);
assert(window&&window.startAt>cast.startAt&&window.startAt<cast.impactAt,'Melee parry lower bound is not near impact');
assert(window.endAt>cast.impactAt&&window.endAt<=cast.endAt,'Melee parry upper bound is not bounded by cast recovery');
assert.strictEqual(bossMeleeParryWindow({...cast,actionCategory:'MAGIC'}),null,'Non-melee cast exposed a parry window');

function makeHitRoom(){
  return{state:{
    trust:0,tasks:[],activeCast:{...cast},activeCombo:null,activeUltimate:null,
    players:{hero:{x:0,z:0,score:0,counterUntil:9999}},
    boss:{x:1,z:0,hp:1000,poise:100,poiseMax:100,staggerResistUntil:0,staggerUntil:0,criticalUntil:0,lastEl:null,lastElT:0,exposedUntil:0,exposedHitCount:0,trajectory:null}
  }};
}
function swordHit(room,hitTs){
  events.length=0;recorded.length=0;
  hitBoss(room,{food:0,owner:'hero',dmg:10,kind:'sword',hitTs});
  return events.slice();
}

let room=makeHitRoom();
let hitEvents=swordHit(room,window.startAt-1);
assert.strictEqual(hitEvents.some(event=>event.e==='perfectParry'),false,'Perfect Parry accepted an early-startup hit');
assert(room.state.activeCast,'Early hit incorrectly interrupted the melee cast');

room=makeHitRoom();
hitEvents=swordHit(room,cast.impactAt);
const parryEvent=hitEvents.find(event=>event.e==='perfectParry');
assert(parryEvent,'Perfect Parry rejected the melee impact window');
assert.strictEqual(parryEvent.p.actionId,'jab_cross','Perfect Parry action id was lost when the cast was interrupted');
assert.strictEqual(parryEvent.p.windowStartAt,window.startAt,'Perfect Parry event lower bound drifted');
assert.strictEqual(parryEvent.p.windowEndAt,window.endAt,'Perfect Parry event upper bound drifted');
assert.strictEqual(room.state.activeCast,null,'Perfect Parry did not interrupt the active melee cast');
assert.strictEqual(recorded[0]?.type,'perfectParry','Adaptive combat memory did not record Perfect Parry');

room=makeHitRoom();
hitEvents=swordHit(room,window.startAt);
assert(hitEvents.some(event=>event.e==='perfectParry'),'Perfect Parry rejected its inclusive lower boundary');

room=makeHitRoom();
hitEvents=swordHit(room,window.endAt);
assert(hitEvents.some(event=>event.e==='perfectParry'),'Perfect Parry rejected its inclusive upper boundary');

room=makeHitRoom();
hitEvents=swordHit(room,window.endAt+1);
assert.strictEqual(hitEvents.some(event=>event.e==='perfectParry'),false,'Perfect Parry accepted a post-active-window hit');
assert(room.state.activeCast,'Late hit incorrectly interrupted the melee cast');

assert(server.includes("s.activeCast=null;s.activeCombo=null;s.activeUltimate=null"),'Static ultimate cleanup sentinel missing');
assert(server.includes("e:'bossUltimateInterrupted'"),'Static ultimate interruption event sentinel missing');

console.log('V10.25 M1 server invariants passed');
