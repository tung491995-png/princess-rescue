'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const text=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const server=text('server.js');
const html=text('public','index.html');
const runtimeSource=text('public','v10_25','boss-runtime.js');
const combat=require(path.join(root,'lib','v10_25_combat.js'));

new vm.Script(server,{filename:'server.js'});
new vm.Script(runtimeSource,{filename:'boss-runtime.js'});
for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

assert(combat.animationVariantFor(combat.ACTIONS.quick_cast,{phase:1},1)==='FAST','Quick Cast does not select FAST');
assert(combat.animationVariantFor(combat.ACTIONS.heavy_cast,{phase:1},1)==='HEAVY','Heavy Cast does not select HEAVY');
assert(combat.animationVariantFor(combat.ACTIONS.teleport_behind,{phase:2},1)==='TELEPORT_ENTRY','Teleport does not select TELEPORT_ENTRY');
assert(combat.animationVariantFor(combat.ACTIONS.orb_recall,{phase:3},1)==='MAGIC_FINISHER','Orb Recall does not select MAGIC_FINISHER');
assert(combat.animationVariantFor(combat.ACTIONS.roundhouse_crescent,{phase:2},2)==='MIRROR','Alternating melee does not select MIRROR');
assert(combat.animationVariantFor(combat.ACTIONS.jab_cross,{phase:3},3)==='PHASE3','Phase 3 default variant is missing');

const serverStart=server.indexOf('function addArenaHazard(');
const serverEnd=server.indexOf('function runZeroHourStage(',serverStart);
assert(serverStart>=0&&serverEnd>serverStart,'Could not isolate One-Eye server runtime');
const clock={now:1000},events=[],enemyHits=[];
const serverContext={
  console,Math,Date:{now:()=>clock.now},
  clampBossToArena:(x,z)=>({x,z}),
  broadcast:(_room,event)=>events.push(event),
  segmentCircleHit:(x1,z1,x2,z2,cx,cz,r)=>{
    const dx=x2-x1,dz=z2-z1,length=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((cx-x1)*dx+(cz-z1)*dz)/length)),px=x1+dx*t,pz=z1+dz*t;
    return (px-cx)*(px-cx)+(pz-cz)*(pz-cz)<=r*r;
  },
  queueEnemyHit:(_room,role,damage,now)=>enemyHits.push({role,damage,now}),
  d2:(x1,z1,x2,z2)=>(x1-x2)**2+(z1-z2)**2,
  trajectoryEase:(_curve,p)=>p,
  livingBossTarget:(state,preferred)=>{
    const role=preferred&&state.players[preferred]&&!state.players[preferred].down?preferred:state.players.hero.down?'princess':'hero';
    return {...state.players[role],role};
  },
  bossOrbVolley:()=>{}
};
vm.createContext(serverContext);
vm.runInContext(`${server.slice(serverStart,serverEnd)}\nglobalThis.m4={addArenaHazard,processArenaHazards,spawnOneEyeMob,setOneEyeState,damageOneEyeMob,coordinateOneEyeMob,oneEyeAttack,updateOneEyeMobs,updateBossSupportDirector};`,serverContext,{filename:'m4-one-eye-server.js'});
const room={state:{
  boss:{x:0,z:0,phase:2,hp:800,max:1000,comboSeq:0,supportCue:'PRESSURE',supportT:5,orb:{state:'FOLLOW',cooldownUntil:999999}},
  players:{hero:{role:'hero',x:5,z:0,down:false},princess:{role:'princess',x:-5,z:0,down:false}},
  summons:[],arenaHazards:[],projectiles:[],activeCast:{id:77},nextSummon:1,nextHazard:1,nextProj:1,trust:0
}};
assert(serverContext.m4.spawnOneEyeMob(room,3,'SUPPORT').length===3,'One-Eye spawner did not fill the bounded pool');
assert(serverContext.m4.spawnOneEyeMob(room,1,'SUPPORT').length===0&&room.state.summons.length===3,'One-Eye hard cap exceeded three');

const gazer=room.state.summons[0];gazer.x=0;gazer.z=0;gazer.state='ORBIT_BOSS';gazer.stateUntil=0;gazer.supportCue='VORTEX';clock.now=2000;
serverContext.m4.oneEyeAttack(room,gazer,{...room.state.players.hero,role:'hero'},clock.now);
assert(gazer.state==='CHARGE'&&gazer.beam?.activeAt===2760,'Gaze Beam does not expose its authoritative CHARGE state');
const beam=room.state.arenaHazards.at(-1);
assert(beam.type==='gaze_beam'&&beam.shape==='line'&&beam.length===9&&beam.width===.28,'Gaze Beam telegraph is not a bounded line');
assert(beam.mobId===gazer.id&&beam.castId===77,'Gaze Beam lacks mob/cast ownership');
serverContext.m4.processArenaHazards(room,beam.activeAt);
assert(gazer.state==='CHARGE'&&enemyHits.some(hit=>hit.role==='hero'),'Gaze Beam did not damage along the authoritative line');

clock.now=2100;
assert(serverContext.m4.damageOneEyeMob(room,gazer,8,clock.now,'test')&&gazer.state==='STAGGER','Nonlethal summon damage did not enter STAGGER');
assert(!room.state.arenaHazards.some(hazard=>hazard.mobId===gazer.id),'Stagger did not cancel the mob-owned Gaze hazard');
const staggerEvent=events.findLast(event=>event.e==='summonHit'&&event.p.id===gazer.id);
assert(staggerEvent?.p.staggered===true&&Number.isFinite(staggerEvent.p.x),'Stagger event lacks authoritative presentation data');

const doomed=room.state.summons[1];clock.now=3000;
serverContext.m4.damageOneEyeMob(room,doomed,999,clock.now,'test');
assert(doomed.state==='DEATH'&&doomed.hp===0&&doomed.despawnAt===3900,'Lethal damage did not retain the DEATH interval');
serverContext.m4.updateOneEyeMobs(room,.016,3681);
assert(room.state.summons.includes(doomed)&&doomed.state==='DESPAWN','DEATH did not transition to retained DESPAWN');
serverContext.m4.updateOneEyeMobs(room,.016,3901);
assert(!room.state.summons.includes(doomed),'DESPAWN did not remove the expired mob');

const coordinator=room.state.summons.find(m=>m!==gazer);coordinator.state='ORBIT_BOSS';coordinator.stateUntil=0;coordinator.atkT=4;room.state.boss.supportCue='HEAVY_CAST';room.state.activeCast={id:88};
serverContext.m4.updateOneEyeMobs(room,.016,4000);
assert(coordinator.state==='POSITION'&&coordinator.positionTarget?.cue==='HEAVY_CAST','Boss support cue did not drive POSITION');

coordinator.state='ORBIT_BOSS';coordinator.supportCue='ULTIMATE';coordinator.x=0;coordinator.z=0;room.state.projectiles=[];clock.now=5000;
serverContext.m4.oneEyeAttack(room,coordinator,{...room.state.players.hero,role:'hero'},clock.now);
assert(coordinator.state==='VOID_BOLT'&&room.state.projectiles.length===1,'Ultimate support did not reduce the mob to one readable Void Bolt');
assert(server.includes("damageOneEyeMob(room,nearestSummon,damage,strike.impactAt,'sword')"),'Sword damage bypasses the shared One-Eye lifecycle');
assert(server.includes("damageOneEyeMob(room,hitSummon,pr.dmg||8,now,pr.kind||'projectile')"),'Projectile damage bypasses the shared One-Eye lifecycle');
for(const clockName of ['stateStartedAt','spawnAt','staggerResistUntil','deathAt','despawnAt'])assert(server.includes(`summon.${clockName}=shift(summon.${clockName})`),`Pause does not shift ${clockName}`);

const browserContext={console,setTimeout,clearTimeout,performance:{now:()=>0}};
browserContext.window=browserContext;browserContext.self=browserContext;browserContext.globalThis=browserContext;
vm.createContext(browserContext);
vm.runInContext(text('public','vendor','three-r128','three.min.js'),browserContext,{filename:'three.min.js'});
vm.runInContext(runtimeSource,browserContext,{filename:'boss-runtime.js'});
const THREE=browserContext.THREE,Runtime=browserContext.PrincessRescueV1025;
assert(Runtime?.BossAnimationVariantGenerator&&Object.keys(Runtime.ANIMATION_VARIANT_PROFILES).length===8,'Eight animation variant profiles are not exported');
const disposalScene=new THREE.Scene(),disposalStack=new Runtime.BossImpactStack(disposalScene);
disposalStack.dispose();
assert(disposalScene.children.length===0,'Impact stack disposal is incompatible with the shipped Three.js runtime');

const target=new THREE.Group(),hip=new THREE.Bone(),spine=new THREE.Bone(),chest=new THREE.Bone(),neck=new THREE.Bone(),head=new THREE.Bone(),leftArm=new THREE.Bone(),rightArm=new THREE.Bone(),leftForearm=new THREE.Bone(),rightForearm=new THREE.Bone();
target.name='VariantTarget';hip.name='Hip';spine.name='Waist';chest.name='Spine02';neck.name='NeckTwist01';head.name='Head';leftArm.name='L_Upperarm';rightArm.name='R_Upperarm';leftForearm.name='L_Forearm';rightForearm.name='R_Forearm';
target.add(hip);hip.add(spine);spine.add(chest);chest.add(neck);neck.add(head);chest.add(leftArm,rightArm);leftArm.add(leftForearm);rightArm.add(rightForearm);leftArm.position.x=-.4;rightArm.position.x=.4;target.updateMatrixWorld(true);
const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.24,.31,-.17)),clip=new THREE.AnimationClip('V1025_variant_test',1,[
  new THREE.QuaternionKeyframeTrack('L_Upperarm.quaternion',[0,.22,.72,1],[0,0,0,1,q.x,q.y,q.z,q.w,q.x,q.y,q.z,q.w,0,0,0,1]),
  new THREE.VectorKeyframeTrack('Hip.position',[0,.22,.72,1],[0,0,0,.1,.1,.2,.2,.3,.4,0,0,0])
]);clip.userData={logicalId:'variant_test',rootMotionXZRemoved:true};
const retargeter=new Runtime.BossRetargeter(target),generator=new Runtime.BossAnimationVariantGenerator(retargeter),fast=generator.generate(clip,'FAST'),heavy=generator.generate(clip,'HEAVY'),mirror=generator.generate(clip,'MIRROR');
assert(Math.abs(fast.duration-.78)<1e-6&&fast.userData.speedCurve==='FAST_RELEASE','FAST variant timing is wrong');
assert(Math.abs(heavy.duration-1.08)<1e-6&&heavy.userData.speedCurve.includes('SLOW_ANTICIPATION'),'HEAVY variant curve is missing');
const heavyTimes=Array.from(heavy.tracks[0].times);
assert(Math.abs(heavyTimes[1]-.378)<.002&&Math.abs(heavyTimes[2]-.6264)<.002,'HEAVY piecewise speed curve was not applied');
const mirroredArm=mirror.tracks.find(track=>track.name==='R_Upperarm.quaternion');
assert(mirroredArm&&Array.from(mirroredArm.values).every(Number.isFinite)&&mirror.userData.mirrored,'MIRROR did not swap and reflect the arm track');

const rec={root:new THREE.Group(),model:target,mixer:new THREE.AnimationMixer(target),actions:{},logicalAnimations:{}},library=new Runtime.BossAnimationLibrary(rec,{load:()=>{}});
rec.logicalAnimations.variant_test={clip,definition:{id:'variant_test'},variants:{}};rec.actions.v1025_variant_test=rec.mixer.clipAction(clip);rec.actions.v1025_upper_variant_test=rec.mixer.clipAction(new THREE.AnimationClip('variant_test_upper',1,[clip.tracks[0].clone()]));library.definitions.set('variant_test',{id:'variant_test',fallback:'boss_combat_idle'});
const generatedState=library.stateFor('variant_test','HEAVY');
assert(generatedState==='v1025_heavy_variant_test'&&rec.actions[generatedState],'Animation library did not lazily register the requested variant');
assert(library.stateFor('variant_test','MIRROR','upper').includes('upper_mirror'),'Layered MIRROR variant was not generated');

const scene=new THREE.Scene(),loadedUrls=[],fakeLoader={load:(url,onLoad)=>{loadedUrls.push(url);const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,.5,.3),new THREE.MeshStandardMaterial({color:0xffffff}));group.add(mesh);onLoad({scene:group})}};
const assembler=new Runtime.BossAssetAssembler(scene,fakeLoader,rec);
(async()=>{
  const assembly=await assembler.initialize();
  assert(loadedUrls.some(url=>url.includes('crown.glb')),'Verified Crown GLB was not loaded');
  assert(assembly.baked.some(item=>item.logicalGroups.includes('MANTLE'))&&!assembly.baked.some(item=>item.logicalGroups.includes('CROWN'))&&assembly.baked.some(item=>item.logicalGroups.includes('NOCTURNE_CORE')),'Baked mantle/core dispositions or external Crown policy are wrong');
  const crown=assembly.attached.find(item=>item.name==='CrownSocket');
  assert(crown&&crown.logicalGroups.includes('CROWN'),'CrownSocket is missing from the controlled assembly');
  const head=target.getObjectByName('Head'),crownSocket=head?.getObjectByName('CrownSocket'),axis=crownSocket?.getObjectByName('CrownAxisCorrection');
  assert(crownSocket?.parent===head&&axis?.parent===crownSocket&&axis.children[0]?.name==='crown.glb','Crown hierarchy is not Head -> CrownSocket -> CrownAxisCorrection -> crown.glb');
  assert(Math.abs(axis.rotation.x+Math.PI*.5)<1e-8&&Math.abs(crownSocket.rotation.y)<1e-8,'Crown export-axis correction is not the inverse -90deg X transform');
  const collar=assembly.attached.find(item=>item.name==='HIGH_COLLAR_CORE_CONTROLLED');
  assert(collar&&collar.logicalGroups.includes('HIGH_COLLAR')&&!collar.logicalGroups.includes('NOCTURNE_CORE'),'Actual nocturne_core.glb geometry was not mapped exclusively to its verified High Collar silhouette');
  assert(loadedUrls.filter(url=>url.includes('nocturne_core.glb')).length===1,'High Collar geometry was duplicated');
  assert(runtimeSource.includes("size:.115,anchor:['L_Forearm','L_Hand']")&&runtimeSource.includes("size:.115,anchor:['R_Forearm','R_Hand']"),'Witch Cuffs do not use the 0.20 forearm-length reference scale');

  for(const fragment of [
    "shape:'line',length:9,width:.28","state==='CHARGE'","state==='STAGGER'","state==='DEATH'","state==='DESPAWN'",
    'root.userData.v1025Materials','root.userData.trail','v1025ImpactStack?.spawn?.(new THREE.Vector3(x,y,z)',
    'v1025MobVisuals?.update?.(m,d,nowVisual,target,serverVisualNow)',"v1025AnimationLibrary.stateFor(logical,variant)"
  ])assert(server.includes(fragment)||runtimeSource.includes(fragment)||html.includes(fragment),`M4 client/server contract missing: ${fragment}`);

  console.log('V10.25 M4 One-Eye/assembly/variant regression passed');
})().catch(error=>{console.error(error);process.exitCode=1});
