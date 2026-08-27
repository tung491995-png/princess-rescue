'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const read=(...parts)=>fs.readFileSync(path.join(root,...parts));
const text=(...parts)=>read(...parts).toString('utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

const pkg=JSON.parse(text('package.json'));
const lock=JSON.parse(text('package-lock.json'));
const html=text('public','index.html');
const server=text('server.js');
const runtimeSource=text('public','v10_25','boss-runtime.js');
const combat=require(path.join(root,'lib','v10_25_combat.js'));
const manifest=JSON.parse(text('public','assets','boss_v10_25','animation_manifest.json'));

assert(pkg.version==='10.25.0',`Expected package 10.25.0, found ${pkg.version}`);
assert(lock.version===pkg.version&&lock.packages[''].version===pkg.version,'package-lock metadata is stale');
assert(html.includes('<title>Princess Rescue V10.25 — Eclipse Battle Mage</title>'),'V10.25 title is missing');
assert(html.includes('/v10_25/boss-runtime.js?v=10.25'),'V10.25 browser runtime is not loaded');
new vm.Script(runtimeSource,{filename:'boss-runtime.js'});
new vm.Script(server,{filename:'server.js'});
for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

assert(combat.VERSION==='10.25','Combat module version mismatch');
assert(combat.COMBO_GRAPHS.length===12,`Expected 12 Combo Graph families, found ${combat.COMBO_GRAPHS.length}`);
assert(new Set(combat.COMBO_GRAPHS.map(combo=>combo.id)).size===12,'Combo Graph ids must be unique');
assert(Object.keys(combat.ACTIONS).length>=30,'Logical action library is incomplete');
assert(combat.ULTIMATE_GRAPH.id==='eternal_eclipse_zero_hour','Zero Hour ultimate graph is missing');
for(const combo of combat.COMBO_GRAPHS){
  assert(combo.nodes?.[combo.start],`${combo.id} has an invalid graph start node`);
  for(const node of Object.values(combo.nodes))assert(combat.ACTIONS[node.action],`${combo.id} references missing action ${node.action}`);
}
const branchCombo=combat.COMBO_GRAPHS.find(combo=>combo.id==='witch_hunt');
const branchBoss={aiMemory:{lastDodgeDirection:'left',recentPerfectDodges:0,playerAggression:0,playerDefensiveness:0,recentRangedUsage:0,recentMeleeUsage:0}};
const branch=combat.resolveNextNode(branchCombo,branchCombo.nodes.read,{memory:branchBoss.aiMemory,distance:4,orbAvailable:true,mobCount:0});
assert(branch.branch==='dodge_left'&&branch.next==='left','Fresh-condition Combo Graph branching failed');
const adaptiveBoss={phase:3,hp:250,max:1000,comboHistory:[],comboCooldowns:{},aiMemory:{},ultimateUsed:false};
combat.recordPlayerAction(adaptiveBoss,'dodge',{direction:'right',distance:5.8},1000);
const selection=combat.selectCombo(adaptiveBoss,{phase:3,hpRatio:.25,distance:5.8,now:1200,orbAvailable:true,mobCount:2},()=>.4);
assert(selection.combo.id==='eternal_eclipse_zero_hour','Phase 3 low-health ultimate selection failed');

const requiredServer=[
  "const stages=[[0,1],[550,2],[1800,3],[2700,4],[3900,5],[5250,6],[7100,7],[8650,8]]",
  "max=3,available=Math.max(0,max-(s.summons?.length||0))",
  "attack:'VOID_BOLT'","attack:'GAZE_BEAM'","attack:'ABYSS_LUNGE'",
  "e:'perfectParry'","V1025_HIT_STOP_MS.perfectParry",
  "setBossOrbState(room,'ULTIMATE'","setBossHaloState(room,'ULTIMATE'",
  "runtimeReliability:'v10.25-tripo-cache-recovery-snapshot-watchdog-retarget-fallback-budget'"
];
for(const fragment of requiredServer)assert(server.includes(fragment),`Server contract missing: ${fragment}`);
const requiredClient=[
  'class BossRetargeter','restPoseCorrected:true','rootMotionXZRemoved:true',
  'class BossAnimationLibrary','class BossAssetAssembler','class OneEyeMobVisuals','class BossImpactStack',
  "upperBodyLayer:cast?.upperBody?'MAGIC':'NONE'",'V1025_RETARGET_REPRESENTATIVE_FAILED',
  "if(e==='zeroHourPhantoms')","if(e==='perfectParry')",'v1025TimeDilationUntil'
];
for(const fragment of requiredClient)assert(runtimeSource.includes(fragment)||html.includes(fragment),`Client contract missing: ${fragment}`);

function glbJson(file){
  const buffer=fs.readFileSync(file);
  assert(buffer.subarray(0,4).toString()==='glTF',`Invalid GLB header: ${path.basename(file)}`);
  assert(buffer.readUInt32LE(4)===2,`Unsupported GLB version: ${path.basename(file)}`);
  const jsonLength=buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20,20+jsonLength).toString().replace(/\0+$/,''));
}

assert(manifest.version==='10.25','Animation manifest version mismatch');
assert(manifest.rootMotionPolicy==='REMOVE_XZ_GAMEPLAY_SERVER_TRAJECTORY','Root-motion policy missing');
assert(manifest.clips.length===28,`Expected 28 curated animation clips, found ${manifest.clips.length}`);
const animationIds=new Set();
for(const clip of manifest.clips){
  assert(!animationIds.has(clip.id),`Duplicate animation id ${clip.id}`);animationIds.add(clip.id);
  assert(clip.source&&clip.fallback&&Array.isArray(clip.trim),'Animation provenance/fallback metadata missing');
  const file=path.join(root,'public',clip.url.replace(/^\//,''));
  assert(fs.existsSync(file),`Animation file missing: ${clip.url}`);
  const gltf=glbJson(file);
  assert((gltf.animations||[]).length>=1,`Animation GLB has no clips: ${clip.id}`);
}
for(const id of ['combat_idle','magic_cast','jab_cross','roundhouse','dodge_back'])assert(animationIds.has(id),`Representative clip missing: ${id}`);
for(const name of ['crown','witch_cuff','moon_choker','nocturne_core']){
  const file=path.join(root,'public','assets','boss_v10_25','accessories',`${name}.glb`);
  assert(fs.existsSync(file)&&fs.statSync(file).size>1000,`Accessory asset missing: ${name}`);glbJson(file);
}
const mobGltf=glbJson(path.join(root,'public','assets','boss_v10_25','mobs','one_eye_mob.glb'));
assert((mobGltf.meshes||[]).length>=1,'One-Eye source asset has no mesh');

// Execute the browser retargeter against a synthetic Mixamo rest pose. This
// verifies finite output, semantic mapping and the hard removal of gameplay X/Z.
const context={console,setTimeout,clearTimeout,performance:{now:()=>0}};
context.window=context;context.self=context;context.globalThis=context;
vm.createContext(context);
vm.runInContext(text('public','vendor','three-r128','three.min.js'),context,{filename:'three.min.js'});
vm.runInContext(runtimeSource,context,{filename:'boss-runtime.js'});
const THREE=context.THREE,Runtime=context.PrincessRescueV1025;
assert(THREE&&Runtime?.BossRetargeter,'Retarget runtime failed to initialize');
const target=new THREE.Group();target.name='TargetRoot';
const hip=new THREE.Bone();hip.name='Hip';hip.position.set(.2,1,-.3);target.add(hip);
const waist=new THREE.Bone();waist.name='Waist';waist.position.y=.5;hip.add(waist);
const spine=new THREE.Bone();spine.name='Spine01';spine.position.y=.4;waist.add(spine);
const chest=new THREE.Bone();chest.name='Spine02';chest.position.y=.4;spine.add(chest);
const head=new THREE.Bone();head.name='Head';head.position.y=.8;chest.add(head);
const arm=new THREE.Bone();arm.name='L_Upperarm';arm.position.set(.35,.3,0);chest.add(arm);
for(const [name,x] of [['L_Thigh',-.2],['R_Thigh',.2]]){const thigh=new THREE.Bone();thigh.name=name;thigh.position.set(x,-.45,0);hip.add(thigh);const calf=new THREE.Bone();calf.name=name.replace('Thigh','Calf');calf.position.y=-.55;thigh.add(calf);const foot=new THREE.Bone();foot.name=name.replace('Thigh','Foot');foot.position.y=-.45;calf.add(foot)}
target.updateMatrixWorld(true);
const source=new THREE.Group();source.name='MixamoRoot';
const sourceHip=new THREE.Bone();sourceHip.name='mixamorigHips';sourceHip.position.y=1;source.add(sourceHip);
const sourceSpine=new THREE.Bone();sourceSpine.name='mixamorigSpine';sourceSpine.position.y=.55;sourceHip.add(sourceSpine);
const sourceChest=new THREE.Bone();sourceChest.name='mixamorigSpine2';sourceChest.position.y=.65;sourceSpine.add(sourceChest);
const sourceHead=new THREE.Bone();sourceHead.name='mixamorigHead';sourceHead.position.y=.7;sourceChest.add(sourceHead);
const sourceArm=new THREE.Bone();sourceArm.name='mixamorigLeftArm';sourceArm.position.set(.4,.25,0);sourceChest.add(sourceArm);
for(const [name,x] of [['mixamorigLeftUpLeg',-.2],['mixamorigRightUpLeg',.2]]){const thigh=new THREE.Bone();thigh.name=name;thigh.position.set(x,-.5,0);sourceHip.add(thigh);const leg=new THREE.Bone();leg.name=name.replace('UpLeg','Leg');leg.position.y=-.55;thigh.add(leg);const foot=new THREE.Bone();foot.name=name.replace('UpLeg','Foot');foot.position.y=-.45;leg.add(foot)}
source.updateMatrixWorld(true);
const turn=new THREE.Quaternion().setFromEuler(new THREE.Euler(.35,.2,-.18));
const sourceClip=new THREE.AnimationClip('SyntheticMixamo',1,[
  new THREE.VectorKeyframeTrack('mixamorigHips.position',[0,1],[0,1,0,5,1.6,4]),
  new THREE.QuaternionKeyframeTrack('mixamorigLeftArm.quaternion',[0,1],[0,0,0,1,turn.x,turn.y,turn.z,turn.w])
]);
const retargeter=new Runtime.BossRetargeter(target,{sampleRate:30});
const retargeted=retargeter.retargetClip(source,sourceClip,{id:'synthetic',source:'synthetic.fbx',trim:[0,1],category:'TEST'});
const validation=retargeter.validate(retargeted);
assert(validation.ok,`Synthetic retarget validation failed: ${validation.errors.join(',')}`);
assert(retargeted.userData.restPoseCorrected&&retargeted.userData.rootMotionXZRemoved,'Retarget metadata is incomplete');
assert(retargeted.tracks.some(track=>track.name==='L_Upperarm.quaternion'),'Semantic arm mapping failed');
const hipTrack=retargeted.tracks.find(track=>track.name==='Hip.position');
assert(hipTrack,'Retargeted hips position track is missing');
for(let i=0;i<hipTrack.values.length;i+=3){
  assert(Math.abs(hipTrack.values[i]-.2)<1e-5,'Retargeted hips leaked source X motion');
  assert(Math.abs(hipTrack.values[i+2]+.3)<1e-5,'Retargeted hips leaked source Z motion');
}

console.log(`V10.25 ECLIPSE BATTLE MAGE PASS · ${combat.COMBO_GRAPHS.length} Combo Graphs · ${manifest.clips.length} retarget sources · 8-stage Zero Hour · One-Eye ×3 · finite rest-pose retarget · ROOT XZ locked`);
