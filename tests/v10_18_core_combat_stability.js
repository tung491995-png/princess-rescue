const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

if(pkg.version!=='10.19.3')throw new Error(`Wrong package version: ${pkg.version}`);
for(const fragment of [
  '<title>Princess Rescue V10.19.3 — Cinematic Occlusion &amp; VFX Readability</title>',
  "window.PrincessBlackBox?.init?.({version:'10.19.3'",
  'id="hostAssetGate"','id="guestAssetGate"','function setAssetLoadProgress(value,label,state=',
  "setAssetLoadProgress(32,'Đang tải boss Tripo 1K')",
  "setAssetLoadProgress(72,'Boss đã sẵn sàng · đang gắn orb/halo')",
  "setAssetLoadProgress(90,'Orb/halo xong · đang biên dịch shader')",
  "setAssetLoadProgress(100,'Sẵn sàng vào trận','ready')",
  'let attackBufferTimer=null,matchResultHandled=false',
  'function clearBufferedPlayerAction()','function queueBufferedAttack(delayMs)',
  "if(cd>.06){if(!fromBuffer&&cd<=.16)queueBufferedAttack(cd*1000+14);return}",
  "if((me&&me.stamina<22)||now<localActionGate.dashAt)return",
  "if((me&&(me.skillCd||0)>.06)||now<localActionGate.skillAt)return",
  "if(!m.accepted){predictedSwordAids.delete(aid);localActionGate.attackAt=0}",
  'id="damageLayer"','const damageNumberPool=[]','function spawnDamageNumber(dmg,owner=',
  'spawnDamageNumber(p.dmg||0,p.owner,heavy)',
  'if(matchResultHandled)return;','matchResultHandled=true;clearBufferedPlayerAction()'
])if(!html.includes(fragment))throw new Error(`V10.18 fragment missing: ${fragment}`);

const desktopStart=html.indexOf('desktopUrls:['),desktopEnd=html.indexOf('],',desktopStart);
const desktopBlock=html.slice(desktopStart,desktopEnd);
if(!desktopBlock.includes('mobile_1k.glb')||desktopBlock.includes('mobile_2k.glb'))throw new Error('Desktop critical path is no longer locked to boss 1K');

for(const fragment of [
  'if(p.atkCd>0)return{accepted:false',
  'p.atkCd=.32',
  'if(p.skillCd>0)return{accepted:false',
  'p.skillCd=2.8',
  'if(p.down||p.dash>0||p.stamina<22)return',
  "if(isCombatTest(room))",
  'p.hp=100;p.down=false'
])if(!server.includes(fragment))throw new Error(`Server-authoritative combat guard missing: ${fragment}`);

console.log('V10.18 CORE COMBAT & STABILITY PASS · phased asset gate · buffered combo · cooldown guards · pooled damage numbers · single result');
