const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

for (const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) {
  if (match[1].trim()) new vm.Script(match[1], { filename: `inline-${index}.js` });
}

for (const state of ['idle','combat','quick','aoe','teleport','spinKick','ultimate','death','hitLight','hitHeavy']) {
  if (!html.includes(`'${state}'`)) throw new Error(`Armament state is missing: ${state}`);
}
for (const fragment of [
  'function resolveBossArmamentState(',
  'function updateBossArmamentStateFx(',
  "return ({18:'idle',8:'combat',13:'quick',14:'aoe',12:'teleport',7:'spinKick',17:'ultimate',15:'death',9:'hitHeavy'})",
  'addScaledVector(bossArmamentOutward,.46)',
  'bossArmamentOrbTarget.y+=.26',
  "shield.name='OrbHitShieldRipple'",
  "haloRunes.name='HaloStateRunes'",
  "marker.name='SpinKickOrbLandingMarker'",
  "blackMoon.name='UltimateBlackMoon'",
  'segmentStart:.62,segmentEnd:1.48',
  "triggerBossArmamentHit(heavy?'heavy':'light'",
  'clamp(58+(p.dmg||0)*.65,60,80)',
  "if(k==='spiritOrb')return 6",
  'SPIRIT WEAPON: a larger, denser moon-orb',
  "if(e==='bossSpiritOrbLaunch')",
  "if(e==='bossSpiritOrbHit')"
]) if (!html.includes(fragment)) throw new Error(`V10.16 client feature is missing: ${fragment}`);

const baseSeparation = Math.hypot(.46, .26);
if (baseSeparation < .52 || baseSeparation > .54) throw new Error(`Orb/palm air gap is not visually clear: ${baseSeparation}`);

for (const fragment of [
  'function bossSpiritOrb(',
  "kind:'spiritOrb'",
  "scheduleTask(room,telegraphMs+320,'boss_spirit_orb'",
  "if(pr.enemy&&pr.kind==='spiritOrb')",
  "const hitRadius=pr.kind==='spiritOrb'?.98:.75",
  "e:'bossSpiritOrbLaunch'",
  "e:'bossSpiritOrbHit'",
  'r:p.targetRole||null'
]) if (!serverSource.includes(fragment)) throw new Error(`V10.16 server feature is missing: ${fragment}`);

const spiritStart = serverSource.indexOf('function bossSpiritOrb(');
const spiritEnd = serverSource.indexOf('\nfunction scheduleTask(', spiritStart);
if (/\.clone\s*\(|removeFromParent|orbRoot/.test(serverSource.slice(spiritStart, spiritEnd))) {
  throw new Error('Spirit weapon path touches or clones the GLB hand orb');
}

const port = 3216;
const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), REDIS_URL: '', BOSS_TEST_FAST: '1', BOSS_TEST_SKILL: '0', BOSS_TEST_DODGE: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let finished = false, started = false;
const stop = code => { if (finished) return; finished = true; server.kill('SIGTERM'); setTimeout(() => process.exit(code), 80); };
const fail = error => { console.error(error?.stack || error); stop(1); };
const timeout = setTimeout(() => fail(new Error('V10.16 orb state/spirit weapon test timed out')), 18000);

async function run() {
  const hero = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const princess = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let code = '', requestedStart = false, launch = null, hit = null;
  const observed = { hero: new Set(), princess: new Set() };
  const close = () => { try { hero.close(); princess.close(); } catch {} };
  const finish = () => {
    if (!launch || !hit || !observed.hero.has(launch.id) || !observed.princess.has(launch.id)) return;
    if (hit.id !== launch.id || hit.role !== launch.targetRole || hit.dmg < 16 || hit.dmg > 20) throw new Error(`Spirit Orb hit mismatch: ${JSON.stringify({launch,hit})}`);
    console.log(`V10.16 ORB STATE PASS · base palm gap ${baseSeparation.toFixed(3)}m · 8 animation states + two-tier Hit 09 · Spirit Orb ${launch.id} homed into ${hit.role} · both clients synchronized`);
    clearTimeout(timeout); close(); stop(0);
  };
  const inspectState = (who, state) => {
    for (const projectile of state?.projectiles || []) {
      if (projectile.k !== 'spiritOrb') continue;
      if (!projectile.r || projectile.y !== 2.62 || !projectile.c || !projectile.b) throw new Error(`Invalid Spirit Orb snapshot: ${JSON.stringify(projectile)}`);
      observed[who].add(projectile.id);
    }
    finish();
  };
  hero.on('error', fail); princess.on('error', fail);
  hero.on('open', () => hero.send(JSON.stringify({type:'create'})));
  hero.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'created') {
      code = message.code; hero.send(JSON.stringify({type:'bossAssetReady',ready:true}));
      if (princess.readyState === WebSocket.OPEN) princess.send(JSON.stringify({type:'join',code}));
    }
    if (message.type === 'bossAssetReady' && message.ready?.hero && message.ready?.princess && !requestedStart) {
      requestedStart = true; hero.send(JSON.stringify({type:'start'}));
    }
    if (message.type === 'event' && message.e === 'bossSpiritOrbLaunch') { launch = message.p; finish(); }
    if (message.type === 'event' && message.e === 'bossSpiritOrbHit') { hit = message.p; finish(); }
    if (message.type === 'state') inspectState('hero', message.state);
  });
  princess.on('open', () => { if (code) princess.send(JSON.stringify({type:'join',code})); });
  princess.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'joined') princess.send(JSON.stringify({type:'bossAssetReady',ready:true}));
    if (message.type === 'state') inspectState('princess', message.state);
  });
}

let output = '';
server.stdout.on('data', chunk => {
  output += chunk.toString();
  if (output.includes('server on') && !started && !finished) { started = true; run().catch(fail); }
});
server.stderr.on('data', chunk => process.stderr.write(chunk));
server.on('exit', code => { if (!finished && code) fail(new Error(`Server exited with ${code}`)); });
