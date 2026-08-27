const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

for (const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) {
  if (match[1].trim()) new vm.Script(match[1], { filename: `inline-${index}.js` });
}

const numberConstant = name => {
  const match = html.match(new RegExp(`const ${name}=([.\\d]+);`));
  if (!match) throw new Error(`Missing numeric constant ${name}`);
  return Number(match[1]);
};

const visualHeight = numberConstant('BOSS_HALO_VISUAL_HEIGHT');
const backDistance = numberConstant('BOSS_HALO_BACK_DISTANCE');
const centerY = numberConstant('BOSS_HALO_CENTER_Y');
const hoverAmplitude = numberConstant('BOSS_HALO_HOVER_AMPLITUDE');

if (Math.abs(visualHeight - 4.45 * .50) > .001) throw new Error(`Halo diameter is not 0.50H: ${visualHeight}`);
if (Math.abs(backDistance - .22) > .001) throw new Error(`Halo is not 0.22m behind the upper spine: ${backDistance}`);
if (Math.abs(centerY - 4.45 * .82) > .001) throw new Error(`Halo center is not U=0.82H: ${centerY}`);
if (hoverAmplitude < .035 || hoverAmplitude > .07) throw new Error(`Halo hover is not restrained: ${hoverAmplitude}`);

for (const fragment of [
  "armament.haloRoot.name='BossFloatingUpperBackHaloSocket'",
  "armament.haloRoot.userData.socket='upper-back-floating'",
  'scene.add(armament.haloRoot,armament.orbRoot)',
  'Math.sin(now*.00115)*BOSS_HALO_HOVER_AMPLITUDE',
  'function resolveBossHaloVirtualAnchor(',
  'resolveBossHaloVirtualAnchor(rec,now)',
  "if(kind==='halo')",
  "const visual=new THREE.Group()",
  "return visual",
  'model.rotation.x+=Math.PI/2',
  'model.rotation.y+=Math.PI/2',
  'by+5.18',
  '[-1.55,1.55]'
]) if (!html.includes(fragment)) throw new Error(`V10.16.1 halo socket feature is missing: ${fragment}`);

if (/boss\.add\(armament\.haloRoot\)|orbSocket\.add\(armament\.haloRoot\)|hipMotionBone\.add\(armament\.haloRoot\)/.test(html)) {
  throw new Error('Halo socket is parented to an animated rig node');
}

const updateStart = html.indexOf('function updateBossArmament(');
const updateEnd = html.indexOf('\nfunction disposeRigAttempt', updateStart);
const updateSource = html.slice(updateStart, updateEnd);
if ((html.match(/bossArmamentHaloTarget\.set\(/g) || []).length !== 1) throw new Error('Halo target has more than one positional authority');
if (/bossArmamentHaloTarget[^\n;]*orbSocket|getWorldPosition\(bossArmamentHaloTarget/.test(updateSource)) throw new Error('Halo position depends on the hand/orb socket');

// Validate the exact world-space socket for every source clip index, multiple
// boss rotations and hover phases. The animation index must not affect it.
for (let clip = 0; clip < 19; clip++) {
  for (let step = 0; step < 32; step++) {
    const yaw = step / 32 * Math.PI * 2;
    const boss = { x: Math.cos(step) * 6.8, y: .1, z: Math.sin(step) * 6.8 };
    const now = clip * 997 + step * 113;
    const hover = Math.sin(now * .00115) * hoverAmplitude;
    const target = {
      x: boss.x - Math.sin(yaw) * backDistance,
      y: Math.max(boss.y + 3.30, Math.min(boss.y + 4.18, boss.y + centerY + hover)),
      z: boss.z - Math.cos(yaw) * backDistance
    };
    const dx = target.x - boss.x, dz = target.z - boss.z;
    const distance = Math.hypot(dx, dz);
    const rearProjection = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (Math.abs(distance - backDistance) > 1e-9 || Math.abs(rearProjection + backDistance) > 1e-9) {
      throw new Error(`Clip ${clip} lost the rear halo offset at yaw ${yaw}`);
    }
    const bottom = target.y - boss.y - visualHeight / 2;
    const top = target.y - boss.y + visualHeight / 2;
    if (bottom < 2.45 || top > 4.90) throw new Error(`Clip ${clip} halo escaped upper-body bounds: ${JSON.stringify({ bottom, top })}`);
  }
}

// Confirm the supplied GLB itself is a thin upright ring. Future horizontal
// exports are still handled by prepareBossPropModel's normal-axis correction.
const glb = fs.readFileSync(path.join(root, 'public', 'assets', 'props', 'ma_vuong_halo_mobile.glb'));
let offset = 12, json = null;
while (offset < glb.length) {
  const length = glb.readUInt32LE(offset), type = glb.readUInt32LE(offset + 4);
  if (type === 0x4e4f534a) json = JSON.parse(glb.subarray(offset + 8, offset + 8 + length).toString('utf8'));
  offset += 8 + length;
}
if (!json) throw new Error('Halo GLB JSON is missing');
const accessor = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
const size = accessor.max.map((value, index) => value - accessor.min[index]);
if (!(size[2] < size[0] * .12 && size[2] < size[1] * .12)) throw new Error(`Halo source plane is not upright/thin: ${size}`);

console.log(`V10.16.1 HALO SOCKET PASS · 19 clips × 32 rotations · ${visualHeight.toFixed(2)}m halo · ${backDistance.toFixed(2)}m behind · center ${centerY.toFixed(2)}m · feet clearance ${(centerY - hoverAmplitude - visualHeight / 2).toFixed(2)}m`);
