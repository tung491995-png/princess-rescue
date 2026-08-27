'use strict';

const VERSION = '10.25';

const ACTIONS = Object.freeze({
  combat_idle:{id:'combat_idle',category:'CORE',roles:['RECOVERY'],animation:'combat_idle',fallback:'boss_combat_idle',startupMs:100,impactMs:0,endMs:420,blendIn:.14,blendOut:.18,orbState:'ORBIT',haloState:'IDLE'},
  strafe_cast:{id:'strafe_cast',category:'MAGIC',roles:['OPENER','PRESSURE'],animation:'quick_cast_a',lowerAnimation:'dodge_left',fallback:'boss_quick_cast',legacySkill:0,startupMs:180,impactMs:520,endMs:1050,blendIn:.075,blendOut:.09,upperBody:true,aim:true,effect:'ORB_VOLLEY',trajectory:{distance:2.35,durationMs:900,curve:'easeInOutCubic',side:-1},orbState:'AUTONOMOUS',haloState:'QUICK_CAST',impactClass:'quick'},
  quick_cast:{id:'quick_cast',category:'MAGIC',roles:['OPENER','PUNISH'],animation:'magic_cast',fallback:'boss_quick_cast',legacySkill:0,startupMs:150,impactMs:470,endMs:980,blendIn:.07,blendOut:.09,aim:true,effect:'ORB_VOLLEY',orbState:'CHARGE',haloState:'QUICK_CAST',impactClass:'quick'},
  orb_projectile:{id:'orb_projectile',category:'MAGIC',roles:['PRESSURE','BRIDGE'],animation:'quick_cast_b',fallback:'boss_quick_cast',legacySkill:0,startupMs:120,impactMs:390,endMs:820,blendIn:.065,blendOut:.08,upperBody:true,aim:true,effect:'SPIRIT_ORB',orbState:'PROJECTILE',haloState:'QUICK_CAST',impactClass:'quick'},
  orb_barrage:{id:'orb_barrage',category:'MAGIC',roles:['PRESSURE','CONTROL'],animation:'medium_cast',fallback:'boss_quick_cast',legacySkill:0,startupMs:220,impactMs:620,endMs:1180,blendIn:.08,blendOut:.10,aim:true,effect:'ORB_BARRAGE',orbState:'AUTONOMOUS',haloState:'QUICK_CAST',impactClass:'normal'},
  energy_wave:{id:'energy_wave',category:'MAGIC',roles:['BRIDGE','FINISHER'],animation:'quick_cast_b',fallback:'boss_aoe',legacySkill:0,startupMs:170,impactMs:500,endMs:980,blendIn:.07,blendOut:.11,aim:true,effect:'CRESCENT_WAVE',orbState:'RECALL',haloState:'HEAVY_CAST',impactClass:'normal'},
  heavy_cast:{id:'heavy_cast',category:'HEAVY',roles:['FINISHER','PUNISH'],animation:'heavy_cast',fallback:'boss_aoe',legacySkill:1,startupMs:620,impactMs:1040,endMs:1840,blendIn:.14,blendOut:.17,aim:true,effect:'HEAVY_AOE',orbState:'CHARGE',haloState:'HEAVY_CAST',impactClass:'heavy'},
  delayed_heavy:{id:'delayed_heavy',category:'HEAVY',roles:['FINISHER','PUNISH'],animation:'area_cast_a',fallback:'boss_aoe',legacySkill:1,startupMs:780,impactMs:1260,endMs:2080,blendIn:.15,blendOut:.18,aim:true,effect:'HEAVY_AOE',orbState:'TRAP',haloState:'HEAVY_CAST',impactClass:'heavy'},
  vortex:{id:'vortex',category:'MAGIC',roles:['CONTROL'],animation:'area_cast_b',fallback:'boss_aoe',legacySkill:2,startupMs:520,impactMs:930,endMs:1720,blendIn:.13,blendOut:.15,effect:'VORTEX',orbState:'FREE_FLOAT',haloState:'VORTEX',impactClass:'heavy'},
  orb_trap:{id:'orb_trap',category:'MAGIC',roles:['CONTROL','BRIDGE'],animation:'channel_cast',fallback:'boss_aoe',legacySkill:2,startupMs:350,impactMs:720,endMs:1320,blendIn:.11,blendOut:.13,effect:'ORB_TRAP',orbState:'TRAP',haloState:'VORTEX',impactClass:'normal'},
  orb_recall:{id:'orb_recall',category:'MAGIC',roles:['FINISHER','BRIDGE'],animation:'quick_cast_a',fallback:'boss_quick_cast',legacySkill:0,startupMs:180,impactMs:560,endMs:1020,blendIn:.07,blendOut:.10,effect:'ORB_RECALL',orbState:'RECALL',haloState:'QUICK_CAST',impactClass:'normal'},
  jab_cross:{id:'jab_cross',category:'MELEE',roles:['OPENER','PRESSURE'],animation:'jab_cross',fallback:'boss_spin_kick',legacySkill:3,startupMs:130,impactMs:390,endMs:760,blendIn:.055,blendOut:.075,effect:'MELEE',radius:1.95,damage:10,trajectory:{distance:1.15,durationMs:320,curve:'easeOutCubic'},orbState:'AUTONOMOUS',haloState:'QUICK_CAST',impactClass:'normal'},
  knee_jab:{id:'knee_jab',category:'MELEE',roles:['PRESSURE','BRIDGE'],animation:'knee_jab',fallback:'boss_spin_kick',legacySkill:3,startupMs:150,impactMs:430,endMs:800,blendIn:.055,blendOut:.08,effect:'MELEE',radius:1.78,damage:12,trajectory:{distance:.72,durationMs:300,curve:'easeOutCubic'},orbState:'AUTONOMOUS',haloState:'QUICK_CAST',impactClass:'normal'},
  uppercut:{id:'uppercut',category:'MELEE',roles:['PRESSURE','FINISHER'],animation:'uppercut',fallback:'boss_spin_kick',legacySkill:3,startupMs:190,impactMs:490,endMs:930,blendIn:.065,blendOut:.10,effect:'MELEE',radius:1.92,damage:14,trajectory:{distance:.65,durationMs:340,curve:'easeInOutCubic'},orbState:'ORBIT',haloState:'HEAVY_CAST',impactClass:'heavy'},
  leg_sweep:{id:'leg_sweep',category:'MELEE',roles:['CONTROL','BRIDGE'],animation:'leg_sweep',fallback:'boss_spin_kick',legacySkill:3,startupMs:210,impactMs:520,endMs:940,blendIn:.07,blendOut:.10,effect:'MELEE',radius:2.32,damage:11,orbState:'AUTONOMOUS',haloState:'QUICK_CAST',impactClass:'normal'},
  roundhouse_crescent:{id:'roundhouse_crescent',category:'MELEE',roles:['BRIDGE','FINISHER'],animation:'roundhouse',fallback:'boss_spin_kick',legacySkill:3,startupMs:190,impactMs:520,endMs:1060,blendIn:.065,blendOut:.11,effect:'ROUNDHOUSE_CRESCENT',radius:2.45,damage:14,trajectory:{distance:.48,durationMs:380,curve:'easeInOutCubic'},orbState:'AUTONOMOUS',haloState:'HEAVY_CAST',impactClass:'heavy'},
  flip_kick:{id:'flip_kick',category:'AERIAL',roles:['PUNISH','FINISHER'],animation:'flip_kick',fallback:'boss_spin_kick',legacySkill:3,startupMs:260,impactMs:610,endMs:1180,blendIn:.075,blendOut:.12,effect:'MELEE',radius:2.25,damage:16,trajectory:{distance:2.6,durationMs:520,curve:'easeInOutCubic'},orbState:'AUTONOMOUS',haloState:'HEAVY_CAST',impactClass:'heavy'},
  eclipse_hammer:{id:'eclipse_hammer',category:'HEAVY',roles:['FINISHER'],animation:'heavy_slam',fallback:'boss_aoe',legacySkill:1,startupMs:560,impactMs:1050,endMs:1840,blendIn:.14,blendOut:.18,effect:'GROUND_SLAM',radius:3.05,damage:19,trajectory:{distance:1.35,durationMs:620,curve:'easeInCubic'},orbState:'CHARGE',haloState:'HEAVY_CAST',impactClass:'heavy'},
  arcane_cyclone:{id:'arcane_cyclone',category:'HEAVY',roles:['CONTROL','ESCAPE'],animation:'arcane_cyclone',fallback:'boss_spin_kick',legacySkill:1,startupMs:390,impactMs:800,endMs:1420,blendIn:.11,blendOut:.14,effect:'CYCLONE',radius:2.85,damage:15,orbState:'ORBIT',haloState:'VORTEX',impactClass:'heavy'},
  dodge_left:{id:'dodge_left',category:'MOBILITY',roles:['ESCAPE','REPOSITION'],animation:'dodge_left',fallback:'boss_dodge',legacySkill:3,startupMs:70,impactMs:0,endMs:470,blendIn:.045,blendOut:.08,effect:'DODGE',trajectory:{distance:2.2,durationMs:390,curve:'easeOutCubic',side:-1},orbState:'FOLLOW',haloState:'TELEPORT'},
  dodge_right:{id:'dodge_right',category:'MOBILITY',roles:['ESCAPE','REPOSITION'],animation:'dodge_right',fallback:'boss_dodge',legacySkill:3,startupMs:70,impactMs:0,endMs:470,blendIn:.045,blendOut:.08,effect:'DODGE',trajectory:{distance:2.2,durationMs:390,curve:'easeOutCubic',side:1},orbState:'FOLLOW',haloState:'TELEPORT'},
  dodge_back:{id:'dodge_back',category:'MOBILITY',roles:['ESCAPE','BRIDGE'],animation:'dodge_back',fallback:'boss_dodge',legacySkill:3,startupMs:80,impactMs:0,endMs:510,blendIn:.045,blendOut:.08,effect:'DODGE',trajectory:{distance:2.45,durationMs:410,curve:'easeOutCubic',back:true},orbState:'FOLLOW',haloState:'TELEPORT'},
  dash_chase:{id:'dash_chase',category:'MOBILITY',roles:['REPOSITION','PRESSURE'],animation:'dash',fallback:'boss_teleport',legacySkill:3,startupMs:100,impactMs:0,endMs:590,blendIn:.045,blendOut:.08,effect:'DASH',trajectory:{distance:3.8,durationMs:440,curve:'easeOutCubic'},orbState:'ORBIT',haloState:'TELEPORT'},
  teleport_left:{id:'teleport_left',category:'MOBILITY',roles:['REPOSITION','BRIDGE'],animation:'dodge_left',fallback:'boss_teleport',legacySkill:3,startupMs:150,impactMs:0,endMs:520,blendIn:.035,blendOut:.065,effect:'TELEPORT',teleport:'left',orbState:'FREE_FLOAT',haloState:'TELEPORT'},
  teleport_right:{id:'teleport_right',category:'MOBILITY',roles:['REPOSITION','BRIDGE'],animation:'dodge_right',fallback:'boss_teleport',legacySkill:3,startupMs:150,impactMs:0,endMs:520,blendIn:.035,blendOut:.065,effect:'TELEPORT',teleport:'right',orbState:'FREE_FLOAT',haloState:'TELEPORT'},
  teleport_behind:{id:'teleport_behind',category:'MOBILITY',roles:['REPOSITION','PUNISH'],animation:'dash',fallback:'boss_teleport',legacySkill:3,startupMs:170,impactMs:0,endMs:550,blendIn:.035,blendOut:.065,effect:'TELEPORT',teleport:'behind',orbState:'FREE_FLOAT',haloState:'TELEPORT'},
  teleport_above:{id:'teleport_above',category:'AERIAL',roles:['REPOSITION','BRIDGE'],animation:'leap',fallback:'boss_teleport',legacySkill:3,startupMs:210,impactMs:0,endMs:670,blendIn:.05,blendOut:.08,effect:'TELEPORT',teleport:'above',orbState:'FREE_FLOAT',haloState:'TELEPORT'},
  aerial_slam:{id:'aerial_slam',category:'AERIAL',roles:['FINISHER'],animation:'heavy_slam',fallback:'boss_aoe',legacySkill:1,startupMs:420,impactMs:880,endMs:1560,blendIn:.10,blendOut:.16,effect:'GROUND_SLAM',radius:3.25,damage:21,trajectory:{distance:1.1,durationMs:880,curve:'easeInCubic',toY:0},orbState:'ULTIMATE',haloState:'HEAVY_CAST',impactClass:'critical'},
  floating_cast:{id:'floating_cast',category:'MAGIC',roles:['OPENER','CONTROL'],animation:'heavy_cast',lowerAnimation:'floating',lowerLoop:true,fallback:'boss_aoe',legacySkill:2,startupMs:420,impactMs:870,endMs:1540,blendIn:.13,blendOut:.15,upperBody:true,aim:true,effect:'ORB_BARRAGE',orbState:'AUTONOMOUS',haloState:'VORTEX',impactClass:'heavy'},
  taunt:{id:'taunt',category:'PRESENTATION',roles:['PRESENTATION'],animation:'taunt',fallback:'boss_phase',startupMs:160,impactMs:0,endMs:1320,blendIn:.12,blendOut:.16,effect:'TAUNT',orbState:'ORBIT',haloState:'HEAVY_CAST'},
  ultimate_zero_hour:{id:'ultimate_zero_hour',category:'PRESENTATION',roles:['FINISHER'],animation:'power_up',fallback:'boss_ultimate',legacySkill:4,startupMs:1100,impactMs:1800,endMs:9800,blendIn:.18,blendOut:.22,effect:'ZERO_HOUR',orbState:'ULTIMATE',haloState:'ULTIMATE',impactClass:'critical'}
});

const ACTION_VARIANTS = Object.freeze({
  strafe_cast:'FAST',quick_cast:'FAST',orb_projectile:'FAST',
  energy_wave:'MAGIC_FINISHER',orb_trap:'MAGIC_FINISHER',orb_recall:'MAGIC_FINISHER',
  heavy_cast:'HEAVY',delayed_heavy:'HEAVY',vortex:'HEAVY',eclipse_hammer:'HEAVY',arcane_cyclone:'HEAVY',aerial_slam:'HEAVY',
  teleport_left:'TELEPORT_ENTRY',teleport_right:'TELEPORT_ENTRY',teleport_behind:'TELEPORT_ENTRY',teleport_above:'TELEPORT_ENTRY',
  taunt:'PHASE2',ultimate_zero_hour:'PHASE3'
});

const COMBO_GRAPHS = Object.freeze([
  {id:'lunar_fang',name:'LUNAR FANG',phase:1,range:'mid',start:'cast',nodes:{cast:{action:'quick_cast',next:'orb'},orb:{action:'orb_projectile',next:'blink'},blink:{action:'teleport_behind',next:'jab'},jab:{action:'jab_cross',next:'kick'},kick:{action:'roundhouse_crescent',next:'wave'},wave:{action:'energy_wave'}}},
  {id:'witch_hunt',name:'WITCH HUNT',phase:1,range:'far',punish:'dodge',start:'barrage',nodes:{barrage:{action:'orb_barrage',next:'read'},read:{action:'teleport_behind',branches:[{when:'dodge_left',next:'left'},{when:'dodge_right',next:'right'}],next:'sweep'},left:{action:'teleport_left',next:'sweep'},right:{action:'teleport_right',next:'sweep'},sweep:{action:'leg_sweep',next:'vortex'},vortex:{action:'vortex',next:'trap'},trap:{action:'orb_trap'}}},
  {id:'eclipse_breaker',name:'ECLIPSE BREAKER',phase:2,range:'close',punish:'aggression',start:'jab',nodes:{jab:{action:'jab_cross',next:'knee'},knee:{action:'knee_jab',next:'upper'},upper:{action:'uppercut',next:'hammer'},hammer:{action:'eclipse_hammer'}}},
  {id:'phantom_waltz',name:'PHANTOM WALTZ',phase:2,range:'mid',punish:'dodge',start:'left',nodes:{left:{action:'teleport_left',next:'kick1'},kick1:{action:'roundhouse_crescent',next:'right'},right:{action:'teleport_right',next:'kick2'},kick2:{action:'flip_kick',next:'behind'},behind:{action:'teleport_behind',next:'finish'},finish:{action:'heavy_cast'}}},
  {id:'crescent_reversal',name:'CRESCENT REVERSAL',phase:1,range:'close',punish:'aggression',start:'back',nodes:{back:{action:'dodge_back',next:'wave'},wave:{action:'energy_wave',branches:[{when:'dodge_back',next:'chase'},{when:'perfect_dodge',next:'chase'}]},chase:{action:'dash_chase',next:'flip'},flip:{action:'flip_kick'}}},
  {id:'gravity_execution',name:'GRAVITY EXECUTION',phase:2,range:'close',start:'vortex',nodes:{vortex:{action:'vortex',next:'knee'},knee:{action:'knee_jab',next:'upper'},upper:{action:'uppercut',next:'above'},above:{action:'teleport_above',next:'slam'},slam:{action:'aerial_slam'}}},
  {id:'moonstep_barrage',name:'MOONSTEP BARRAGE',phase:1,range:'mid',start:'strafe',nodes:{strafe:{action:'strafe_cast',next:'shot1'},shot1:{action:'orb_projectile',next:'shot2'},shot2:{action:'orb_projectile',next:'shot3'},shot3:{action:'orb_projectile',next:'blink'},blink:{action:'teleport_behind',next:'spin'},spin:{action:'arcane_cyclone'}}},
  {id:'false_opening',name:'FALSE OPENING',phase:2,range:'mid',tier:'signature',cooldownMs:22000,start:'heavy',nodes:{heavy:{action:'delayed_heavy',branches:[{when:'aggressive',next:'cancel'},{when:'perfect_dodge',next:'cancel'}],next:'release'},cancel:{action:'teleport_behind',next:'punish'},punish:{action:'knee_jab'},release:{action:'eclipse_hammer'}}},
  {id:'broken_rhythm',name:'BROKEN RHYTHM',phase:2,range:'far',start:'quick1',nodes:{quick1:{action:'quick_cast',next:'quick2'},quick2:{action:'orb_projectile',next:'delay'},delay:{action:'delayed_heavy'}}},
  {id:'eclipse_chase',name:'ECLIPSE CHASE',phase:2,range:'far',punish:'distance',start:'blink1',nodes:{blink1:{action:'teleport_left',next:'wave'},wave:{action:'energy_wave',next:'blink2'},blink2:{action:'teleport_behind',next:'sweep'},sweep:{action:'leg_sweep',next:'barrage'},barrage:{action:'orb_barrage'}}},
  {id:'moon_guillotine',name:'MOON GUILLOTINE',phase:3,range:'close',tier:'signature',cooldownMs:26000,start:'upper',nodes:{upper:{action:'uppercut',next:'above'},above:{action:'teleport_above',next:'slam'},slam:{action:'aerial_slam',next:'collapse'},collapse:{action:'heavy_cast'}}},
  {id:'black_hole_ballet',name:'BLACK HOLE BALLET',phase:3,range:'mid',tier:'signature',cooldownMs:30000,start:'vortex',nodes:{vortex:{action:'vortex',next:'dodge'},dodge:{action:'dodge_right',branches:[{when:'dodge_right',next:'left'}],next:'kick'},left:{action:'dodge_left',next:'kick'},kick:{action:'roundhouse_crescent',next:'cast'},cast:{action:'floating_cast',next:'blink'},blink:{action:'teleport_behind',next:'orb'},orb:{action:'orb_recall'}}}
]);

const ULTIMATE_GRAPH = Object.freeze({id:'eternal_eclipse_zero_hour',name:'ETERNAL ECLIPSE · ZERO HOUR',phase:3,range:'any',tier:'ultimate',cooldownMs:999999,start:'zero',nodes:{zero:{action:'ultimate_zero_hour'}}});

function ensureMemory(boss) {
  const existing = boss.aiMemory || {};
  boss.aiMemory = {
    events:Array.isArray(existing.events)?existing.events:[],
    recentDodges:Number(existing.recentDodges)||0,
    recentPerfectDodges:Number(existing.recentPerfectDodges)||0,
    lastDodgeDirection:existing.lastDodgeDirection||'none',
    preferredPlayerDistance:Number(existing.preferredPlayerDistance)||4,
    playerAggression:Number(existing.playerAggression)||0,
    playerDefensiveness:Number(existing.playerDefensiveness)||0,
    recentMeleeUsage:Number(existing.recentMeleeUsage)||0,
    recentRangedUsage:Number(existing.recentRangedUsage)||0,
    lastParry:Number(existing.lastParry)||0,
    lastBossCombo:existing.lastBossCombo||'',
    lastBossFinisher:existing.lastBossFinisher||'',
    lastTeleportDirection:existing.lastTeleportDirection||'none',
    selectedAction:existing.selectedAction||'',
    candidateWeights:Array.isArray(existing.candidateWeights)?existing.candidateWeights:[]
  };
  return boss.aiMemory;
}

function pruneMemory(memory, now) {
  memory.events = memory.events.filter(event => now - event.ts <= 8000).slice(-48);
  const count = (type, ms=8000) => memory.events.filter(event => event.type === type && now-event.ts <= ms).length;
  const latest = type => [...memory.events].reverse().find(event => event.type === type);
  memory.recentDodges=count('dodge');
  memory.recentPerfectDodges=count('perfectDodge');
  memory.recentMeleeUsage=count('melee');
  memory.recentRangedUsage=count('ranged');
  memory.playerAggression=Math.min(1,(count('melee',5000)+count('attack',5000)) / 8);
  memory.playerDefensiveness=Math.min(1,(count('dodge',5000)+count('perfectDodge',5000)*1.5) / 7);
  const dodge=latest('dodge');if(dodge?.direction)memory.lastDodgeDirection=dodge.direction;
  const distances=memory.events.map(event=>Number(event.distance)).filter(Number.isFinite);
  if(distances.length)memory.preferredPlayerDistance=distances.reduce((a,b)=>a+b,0)/distances.length;
}

function recordPlayerAction(boss, type, meta={}, now=Date.now()) {
  const memory=ensureMemory(boss);
  memory.events.push({type,ts:now,role:meta.role||'',direction:meta.direction||'',distance:Number(meta.distance)});
  if(type==='perfectParry')memory.lastParry=now;
  pruneMemory(memory,now);
  return memory;
}

function contextFlags(context) {
  const m=context.memory||{};
  return new Set([
    m.lastDodgeDirection==='left'?'dodge_left':'',m.lastDodgeDirection==='right'?'dodge_right':'',m.lastDodgeDirection==='back'?'dodge_back':'',
    m.recentPerfectDodges>0?'perfect_dodge':'',m.playerAggression>.55?'aggressive':'',m.playerDefensiveness>.55?'defensive':'',
    context.distance<2.5?'close':'',context.distance>5.5?'far':'',context.orbAvailable?'orb_available':'',context.mobCount>0?'mobs_active':'',
    m.recentRangedUsage>m.recentMeleeUsage?'ranged_pressure':''
  ].filter(Boolean));
}

function comboWeight(combo, context, boss) {
  if(combo.phase>context.phase)return 0;
  const m=context.memory||{},distance=context.distance;
  const ideal=combo.range==='close'?1.9:combo.range==='far'?6.2:combo.range==='mid'?4.0:distance;
  let weight=Math.max(.05,4.8-Math.abs(distance-ideal)*1.15)+(combo.phase===context.phase?1.35:.35);
  if(combo.punish==='dodge')weight+=m.recentDodges*.85+m.recentPerfectDodges*1.2;
  if(combo.punish==='aggression')weight+=m.playerAggression*5.5;
  if(combo.punish==='distance')weight+=distance>5.2?4.2:0;
  if(combo.tier==='signature')weight+=context.phase>=2?1.6:0;
  if(combo.id===boss.lastComboId)weight*=.05;
  if((boss.comboHistory||[]).slice(-3).includes(combo.id))weight*=.25;
  if((boss.comboCooldowns?.[combo.id]||0)>context.now)return 0;
  return Math.max(0,weight);
}

function selectCombo(boss, context, random=Math.random) {
  const memory=ensureMemory(boss);pruneMemory(memory,context.now);
  if(context.phase===3&&context.hpRatio<=.28&&!boss.ultimateUsed){boss.ultimateUsed=true;return {combo:ULTIMATE_GRAPH,weights:[{id:ULTIMATE_GRAPH.id,weight:999,selected:true}]}}
  const candidates=COMBO_GRAPHS.map(combo=>({combo,weight:comboWeight(combo,{...context,memory},boss)})).filter(item=>item.weight>0);
  const total=candidates.reduce((sum,item)=>sum+item.weight,0);
  let cursor=random()*Math.max(.001,total),selected=candidates[0];
  for(const item of candidates){cursor-=item.weight;if(cursor<=0){selected=item;break}}
  if(!selected)selected={combo:COMBO_GRAPHS[0],weight:1};
  memory.candidateWeights=candidates.map(item=>({id:item.combo.id,name:item.combo.name,weight:Number(item.weight.toFixed(3)),selected:item===selected}));
  memory.lastBossCombo=selected.combo.id;
  return {combo:selected.combo,weights:memory.candidateWeights};
}

function resolveNextNode(combo,node,context) {
  const flags=contextFlags(context);
  for(const branch of node.branches||[])if(flags.has(branch.when))return {next:branch.next||null,branch:branch.when};
  return {next:node.next||null,branch:'default'};
}

function graphNodeCount(combo) { return Math.max(1,Object.keys(combo.nodes||{}).length); }

function actionFor(id) { return ACTIONS[id]||ACTIONS.quick_cast; }

function animationVariantFor(action,boss={},castId=0) {
  const resolved=typeof action==='string'?actionFor(action):action||ACTIONS.quick_cast;
  if(ACTION_VARIANTS[resolved.id])return ACTION_VARIANTS[resolved.id];
  if(['knee_jab','leg_sweep','roundhouse_crescent'].includes(resolved.id)&&Number(castId)%2===0)return'MIRROR';
  if(Number(boss.phase)>=3)return'PHASE3';
  if(Number(boss.phase)>=2)return'PHASE2';
  return'BASE';
}

module.exports={VERSION,ACTIONS,ACTION_VARIANTS,COMBO_GRAPHS,ULTIMATE_GRAPH,ensureMemory,recordPlayerAction,selectCombo,resolveNextNode,graphNodeCount,actionFor,animationVariantFor,contextFlags};
