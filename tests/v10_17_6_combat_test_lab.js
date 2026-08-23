const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

for(const fragment of [
  "testMode:room.testMode||''",
  "testMode:data.testMode==='boss-only-damage'?'boss-only-damage':''",
  "function isCombatTest(room){return room?.testMode==='boss-only-damage'}",
  'function matchClientsReady(room)',
  'function matchBossAssetsReady(room)',
  'const room=await createRoom(m.testMode)',
  "broadcast(room,{type:'event',e:'testGuard'"
])if(!server.includes(fragment))throw new Error(`Server combat-test fragment missing: ${fragment}`);

for(const fragment of [
  'SOLO COMBAT TEST — BẤT TỬ',
  'PLAYER HP 100% · ONLY BOSS TAKES DAMAGE',
  "testMode:combatTestMode?'boss-only-damage':''",
  "combatTestMode=s?.testMode==='boss-only-damage'",
  "$('createCombatTest').onclick=()=>createRoom(true)",
  "testMode:state?.testMode||''"
])if(!html.includes(fragment))throw new Error(`Client combat-test fragment missing: ${fragment}`);

const start=server.indexOf('function hurt(room,role,n){');
const end=server.indexOf('\nfunction perfect(',start);
if(start<0||end<0)throw new Error('hurt() could not be isolated');
let events=0,dirty=0;
const context={
  isCombatTest:room=>room?.testMode==='boss-only-damage',
  broadcast(){events++},
  markDirty(){dirty++}
};
vm.runInNewContext(server.slice(start,end),context,{filename:'combat-test-hurt.js'});

const testRoom={testMode:'boss-only-damage',state:{players:{hero:{hp:23,down:true,revive:2.1,inv:0}}}};
context.hurt(testRoom,'hero',42);
const protectedHero=testRoom.state.players.hero;
if(protectedHero.hp!==100||protectedHero.down||protectedHero.revive!==0)throw new Error('Combat test did not restore authoritative player HP/state');
if(events!==1||dirty!==1)throw new Error('Combat test guard did not emit/mark exactly once');

const normalRoom={testMode:'',state:{players:{hero:{hp:23,down:false,revive:0,inv:0}}}};
context.hurt(normalRoom,'hero',42);
const normalHero=normalRoom.state.players.hero;
if(normalHero.hp!==0||!normalHero.down)throw new Error('Normal co-op damage was accidentally disabled');

console.log('V10.17.6 COMBAT TEST PASS · solo start gates · server HP lock · boss-only damage mode · normal co-op unchanged');
