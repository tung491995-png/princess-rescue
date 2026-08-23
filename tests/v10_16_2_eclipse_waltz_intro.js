const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

for (const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) {
  if (match[1].trim()) new vm.Script(match[1], { filename: `inline-${index}.js` });
}

for (const fragment of [
  'const BOSS_INTRO_FULL_MS=10500',
  "introWaltz:{state:'boss_phase_eternal',start:.55,end:7.10,speed:.90}",
  "introFinale:{state:'boss_ultimate',start:.10,end:3.24,speed:.92}",
  "playBossPresentationSegment('introWaltz'",
  "introAt(.64,()=>playBossPresentationSegment('introFinale'",
  "return t<.64?'introWaltz':'introFinale'",
  "state==='ultimate'||state==='introFinale'",
  "state==='introWaltz'",
  'if(t<.12)',
  'else if(t<.64)',
  'else if(t<.84)',
  'animation:introCardV95 10.5s',
  'THE ECLIPSE WALTZ',
  'function resolveBossHaloVirtualAnchor(rec,now)',
  'rec.model.updateMatrixWorld(true)',
  'chest.getWorldPosition(bossArmamentHaloChestWorld)',
  'head.getWorldPosition(bossArmamentHaloHeadWorld)',
  'bossArmamentHaloAnchorWorld.lerpVectors(bossArmamentHaloChestWorld,bossArmamentHaloHeadWorld,.54)',
  'bossArmamentHaloAnchorWorld.y+=.72',
  'Math.exp(-Math.max(0,dt)*11)',
  'haloJolt+bossArmamentHaloTilt'
]) if (!html.includes(fragment)) throw new Error(`V10.16.2 feature missing: ${fragment}`);

for (const fragment of [
  'const BOSS_INTRO_MS = 11000',
  'room.state.introUntil=Date.now()+BOSS_INTRO_MS',
  'if(s.introUntil&&now<s.introUntil)return'
]) if (!server.includes(fragment)) throw new Error(`Authoritative intro lock missing: ${fragment}`);

const introStart = html.indexOf('function playBossIntroV9(');
const introEnd = html.indexOf('\nfunction enterGameFromState', introStart);
const introSource = html.slice(introStart, introEnd);
if (introSource.includes('startBossV106PhaseAct(')) throw new Error('Additive acting still contaminates the authored waltz');
if (introSource.includes("showDialogue('hero'")) throw new Error('Comedy dialogue still interrupts the boss reveal');

const virtualStart = html.indexOf('function resolveBossHaloVirtualAnchor(');
const virtualEnd = html.indexOf('\nfunction updateBossArmament(', virtualStart);
const virtualSource = html.slice(virtualStart, virtualEnd);
if (!virtualSource.includes('actingBones?.chest') || !virtualSource.includes('actingBones?.head')) throw new Error('Virtual halo does not sample both upper-body anchors');
if (/\.add\(armament\.haloRoot\)|\.add\(bossArmament\.haloRoot\)/.test(html)) throw new Error('Halo was parented to the animated rig');
if (!html.includes('scene.add(armament.haloRoot,armament.orbRoot)')) throw new Error('Halo is not scene-owned');

const waltzDuration = (7.10 - .55) / .90;
const finaleDuration = (3.24 - .10) / .92;
const finaleStart = 10.5 * .64;
if (waltzDuration < 7.2 || waltzDuration > 7.4) throw new Error(`Unexpected waltz duration: ${waltzDuration}`);
if (finaleStart + finaleDuration > 10.25) throw new Error('Finale cannot finish before the camera return');

// The halo may follow torso sway but remains clamped well above the feet.
for (let sample = 0; sample < 128; sample++) {
  const bossY = .1;
  const authoredAnchorY = bossY + 3.1 + Math.sin(sample * .31) * 1.25;
  const hover = Math.sin(sample * 117 * .00115) * .055;
  const y = Math.max(bossY + 3.30, Math.min(bossY + 4.18, Math.max(bossY + 3.35, Math.min(bossY + 4.12, authoredAnchorY)) + hover));
  const bottom = y - bossY - 2.74 / 2;
  if (bottom < 1.92) throw new Error(`Virtual halo reached the feet: ${bottom}`);
}

const glb = fs.readFileSync(path.join(root, 'public', 'assets', 'characters', 'ma_vuong_mat_ngu_root_locked.glb'));
let offset = 12, json = null;
while (offset < glb.length) {
  const length = glb.readUInt32LE(offset), type = glb.readUInt32LE(offset + 4);
  if (type === 0x4e4f534a) json = JSON.parse(glb.subarray(offset + 8, offset + 8 + length).toString('utf8'));
  offset += 8 + length;
}
const nodeNames = new Set((json?.nodes || []).map(node => node.name));
if (!nodeNames.has('Spine02') || !nodeNames.has('Head')) throw new Error('Boss GLB lost the virtual halo anchor bones');
if ((json?.animations || []).length !== 19) throw new Error('Boss animation catalogue changed');

console.log(`V10.16.2 ECLIPSE WALTZ PASS · 10.5s cinematic · clip 16 dance ${waltzDuration.toFixed(2)}s · clip 17 finale ${finaleDuration.toFixed(2)}s · virtual Spine02/Head halo · authoritative 11.0s lock`);
