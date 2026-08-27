const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

if(!['10.23.1','10.25.0'].includes(pkg.version))throw new Error(`Wrong V10.23+ package version: ${pkg.version}`);
for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

for(const fragment of [
  '<title>Princess Rescue V10.23.1 — Runtime Reliability Hotfix</title>',
  "window.PrincessBlackBox?.init?.({version:'10.23.1'",
  'id="bossPoiseFill"','id="bossPoiseState"','id="bossComboUi"',
  'function updateBossComboUi()','function freezeBossPoseForCritical(duration=190)',
  'function presentBossCriticalBreak(p={})',
  "if(e==='bossComboStart')","if(e==='bossWeakPoint')","if(e==='bossUltimatePhase')",
  'spawnDamageNumber(p.dmg||0,p.owner,heavy,critical,criticalBreak)',
  "else if(critical){hitStopUntil",
  "playRigAnimation('boss','boss_hit'"
])if(!html.includes(fragment))throw new Error(`V10.23 client feature missing: ${fragment}`);

for(const fragment of [
  'const BOSS_POISE_MAX = 100','const BOSS_CRIT_MULTIPLIER = 1.75',
  'const BOSS_BODY_CRIT_CHANCE = .015','const BOSS_COUNTER_WINDOW_MS = 900',
  'function bossWeakPointForHit(room,pr,now)','function bossPoiseDamage(pr)',
  "function interruptBossCombo(room,now,reason='critical_break')",'function hitBoss(room,pr)',
  'const BOSS_COMBO_LIBRARY=','function chooseBossCombo(room,now=Date.now())',
  'function startBossCombo(room,combo=chooseBossCombo(room))','function advanceBossCombo(room,now=Date.now())',
  "e:'bossComboStart'","e:'bossComboStep'","e:'bossComboLink'","e:'bossComboEnd'",
  "e:'bossWeakPoint'","e:'bossUltimatePhase'",
  "combatFeel:'v10.23-poise-weakpoint-critical-adaptive-combo-ai'"
])if(!server.includes(fragment))throw new Error(`V10.23 server feature missing: ${fragment}`);

const libraryStart=server.indexOf('const BOSS_COMBO_LIBRARY=');
const libraryEnd=server.indexOf('\nfunction bossCombatContext(',libraryStart);
if(libraryStart<0||libraryEnd<0)throw new Error('Boss combo library could not be isolated');
const context={};
vm.runInNewContext(`${server.slice(libraryStart,libraryEnd)}\nglobalThis.library=BOSS_COMBO_LIBRARY;`,context,{filename:'v10.23-combo-library.js'});
if(context.library.normal.length!==12)throw new Error(`Expected 12 normal combos, received ${context.library.normal.length}`);
if(context.library.signature.length!==3)throw new Error(`Expected 3 signature combos, received ${context.library.signature.length}`);
if(!context.library.ultimate||!context.library.ultimate.steps.some(step=>step.ultimate))throw new Error('Multi-phase Ultimate entry is missing');
if((server.match(/'boss_ultimate_phase'/g)||[]).length<4)throw new Error('Four Ultimate movement tasks are missing');
for(const combo of [...context.library.normal,...context.library.signature]){
  if(combo.steps.length<3||combo.steps.length>7)throw new Error(`${combo.id} has invalid ${combo.steps.length}-action length`);
}

const combatHit=html.slice(html.indexOf("if(e==='combatHit')"),html.indexOf("if(e==='bossTeleportKick')"));
if(/else\s*\{[^}]*playRigAnimation\('boss','boss_hit'/s.test(combatHit))throw new Error('Normal boss hits still play the Hit 09 reaction');
if(!combatHit.includes('presentBossCriticalBreak(p)'))throw new Error('Critical Break presentation is not wired');

console.log('V10.23 BOSS INTELLIGENCE PASS · Poise/Super Armor · weak critical · anti stun-lock · 12+3+1 combo AI · adaptive punish');
