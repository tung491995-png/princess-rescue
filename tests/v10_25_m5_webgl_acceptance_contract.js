'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const html=read('public','index.html');
const runtime=read('public','v10_25','boss-runtime.js');

new vm.Script(runtime,{filename:'boss-runtime.js'});
for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

assert(runtime.includes("detach(object){if(!object)return;if(typeof object.removeFromParent==='function')"),'Impact disposal lacks shipped-Three.js compatibility');
assert(runtime.includes("object.parent?.remove?.(object)"),'Impact disposal lacks parent.remove fallback');
assert(!runtime.includes('entry.group.removeFromParent()'),'Impact pool still calls unsupported removeFromParent directly');
assert(html.includes("console.error('[V10.25 lobby prewarm failed]'"),'Lobby prewarm failures remain silent');
assert(html.includes("'LOBBY_3D_PREWARM_FAILED'"),'Lobby prewarm failure telemetry is missing');
assert(html.includes("new THREE.TorusGeometry(.38,.035,7,24),std(0xc9b9ff,0x8b66ff,.0,.2,true,.82),[0,0,0],undefined,false).mesh"),'One-Eye ring is not stored as the material-owning mesh');
assert(runtime.includes("root.userData.ring.material||root.userData.ring.children?.find?.(child=>child.material)?.material"),'One-Eye ring update lacks compatibility with an older wrapper root');
assert(html.includes("const BOSS_HALO_VISUAL_HEIGHT=2.225"),'Reference Halo diameter 0.50H is missing');
assert(html.includes("const BOSS_HALO_BACK_DISTANCE=.22"),'Reference Halo back depth is missing');
assert(html.includes("const BOSS_HALO_CENTER_Y=3.649"),'Reference Halo U=0.82H center is missing');
assert(html.includes("const visual=new THREE.Group()")&&html.includes("return visual"),'Orb/Halo model lacks a centered animation pivot');
assert(html.includes("addScaledVector(bossArmamentOutward,.35);bossArmamentOrbTarget.y+=.08"),'Reference Orb FOLLOW offset is missing');
assert(html.includes("'CLOSE_FRONT','CLOSE_BACK','CLOSE_RIGHT','CLOSE_LEFT','TOP'")&&html.includes('if(!close&&!top)frameBossFullBody'),'Close/TOP accessory acceptance cameras are missing');
assert(html.includes('visualAudit.assemblyDetails=[]')&&html.includes("anchorWorld:anchor.toArray()"),'Accessory bounds telemetry is missing from visual acceptance');
assert(html.includes('visualAudit.isolatedAccessory=name')&&html.includes("visualAudit.isolatedAccessory){arm.orbRoot.visible=false;arm.haloRoot.visible=false}"),'Isolated accessory acceptance does not suppress Orb/Halo occluders');
assert(html.includes("for(const group of ['HIGH_COLLAR','CROWN','WITCH_CUFFS','MOON_CHOKER'])")&&html.includes("for(const group of ['MANTLE','NOCTURNE_CORE'])"),'Visual acceptance does not distinguish attached accessories from verified baked geometry');
assert(html.includes("crown?.holder?.parent?.name!=='Head'")&&html.includes('V1025_CROWN_AXIS_INVALID'),'Live Crown hierarchy/axis audit is missing');
assert(html.includes('if(rec.secondary)updateBossV106Secondary(rec,dt,performance.now()*.001);\n   v1025AssetAssembler?.update?.();'),'Animation Lab does not keep controlled accessories on their live anchors');

for(const fragment of [
  'function auditV1025Variants(rec)',"['BASE','combat_idle']","['FAST','quick_cast_a']","['HEAVY','heavy_cast']","['MIRROR','roundhouse']",
  "['TELEPORT_ENTRY','dash']","['MAGIC_FINISHER','magic_cast']","['PHASE2','taunt']","['PHASE3','arcane_cyclone']",
  'function auditV1025Assembly()','function auditV1025OneEye()','function auditV1025ZeroHour()',
  'function installV1025VisualAcceptanceController()',"window.__v1025VisualAcceptance={","samplePose(logical,normalized=.5,variant='BASE')","diagnosePose(logical,normalized=.5,variant='BASE')","diagnoseSourcePose(logical,normalized=.5)","sampleOneEyeFormation()","sampleZeroHour()",
  "const states=['SPAWN','CHARGE','GAZE_BEAM','LUNGE','STAGGER','DEATH','DESPAWN']",
  'Array.from({length:12}',"type:'zero_hour_lane',shape:'lane',safe:true","type:'gaze_beam',shape:'line',safe:false",
  "halo:{state:'COLLAPSE'",'function updateV1025ArenaHazards(','updateV1025ArenaHazards(sb.arenaHazards||[],serverVisualNow,nowVisual)',
  'v1025Summary?.ready!==28','V10.25 M5 AUDIT · PASS'
])assert(html.includes(fragment),`M5 WebGL acceptance contract missing: ${fragment}`);
assert(html.includes('v106ClearLastBoneOffsets();if(bossV106)bossV106.mixerPrepared=false;rec.mixer.stopAllAction()'),'Logical pose QA does not clear inherited V10.6 additive offsets before sampling');
assert(html.includes("[-.58*H,.73*H,-.60],[.58*H,.73*H,-.60],[-.62*H,.46*H,-.72]"),'Three-actor One-Eye acceptance formation does not use the reference slots');
assert(html.includes('safeLanes:2,blackMoon:moon?{visible:moon.visible,size:plainVector(size),center:plainVector(center),depth:BLACK_MOON_BACK_DISTANCE}'),'Complete Zero Hour acceptance telemetry is missing');

assert(html.includes('auditV1025Assembly();auditV1025Variants(rec);auditV1025OneEye();auditV1025ZeroHour()'),'M5 audit is not wired into the real WebGL audit');
assert(html.includes('8 V10.25 variants · One-Eye · Zero Hour'),'M5 audit report does not expose its V10.25 coverage');

console.log('V10.25 M5 WebGL acceptance contract passed');
