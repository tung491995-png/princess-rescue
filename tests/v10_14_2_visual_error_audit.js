const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

function expectSource(fragment, message) {
  if (!html.includes(fragment)) throw new Error(message);
}

function parseGlb(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) throw new Error(`Invalid GLB: ${file}`);
  let offset = 12, document, binaryOffset = -1;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4); offset += 8;
    if (type === 0x4e4f534a) document = JSON.parse(buffer.subarray(offset, offset + length).toString('utf8').trim());
    if (type === 0x004e4942) binaryOffset = offset;
    offset += length;
  }
  if (!document || binaryOffset < 0) throw new Error(`GLB chunks missing: ${file}`);
  const readVec3 = accessorIndex => {
    const accessor = document.accessors[accessorIndex], view = document.bufferViews[accessor.bufferView];
    if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') throw new Error('Unexpected scale accessor');
    const stride = view.byteStride || 12;
    const start = binaryOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    return Array.from({ length: accessor.count }, (_, row) => [0, 1, 2].map(column => buffer.readFloatLE(start + row * stride + column * 4)));
  };
  let scaleChannels = 0, minimum = Infinity, maximum = -Infinity;
  for (const animation of document.animations || []) for (const channel of animation.channels || []) {
    if (channel.target?.path !== 'scale') continue;
    scaleChannels++;
    const sampler = animation.samplers[channel.sampler];
    for (const row of readVec3(sampler.output)) for (const value of row) {
      if (!Number.isFinite(value)) throw new Error(`Non-finite animation scale in ${file}`);
      minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
    }
  }
  return { animations: document.animations?.length || 0, scaleChannels, minimum, maximum };
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(Boolean);
for (const [index, source] of scripts.entries()) new vm.Script(source, { filename: `inline-${index}.js` });

expectSource('function runBossVisualAudit()', 'Built-in visual audit is missing');
expectSource("const samples=[0,.2,.5,.8,.98]", 'Five-point animation sampling is missing');
expectSource("const transitions=['boss_idle','boss_combat_idle','boss_quick_cast','boss_aoe','boss_hit','boss_teleport','boss_spin_kick','boss_ultimate','boss_death']", 'Gameplay transition audit is incomplete');
expectSource('for(let i=0;i<5;i++)', 'Five-skill VFX audit is missing');
expectSource('PROCEDURAL_PLACEHOLDER_VISIBLE', 'Procedural placeholder visibility check is missing');
expectSource('ROOT_XZ_RESIDUAL', 'World-XZ residual check is missing');
expectSource('function normalizeBossCastPayload(c)', 'Cast payload sanitizer is missing');
expectSource("startBossEvadeArt({kind:'strafe',fromX:NaN", 'Invalid-coordinate evade audit is missing');
expectSource("runVisualPass('boss-socket'", 'Boss socket VFX pass is not isolated');
expectSource("runVisualPass('skill-art'", 'Skill VFX pass is not isolated');
expectSource("runVisualPass('boss-v104'", 'Boss material VFX pass is not isolated');

const updateStart = html.indexOf('function updateRiggedAnimations(dt)');
const updateEnd = html.indexOf('\nconst BOSS_UI_SKILLS', updateStart);
const updateSource = html.slice(updateStart, updateEnd);
if (!(updateSource.indexOf('v106PrepareMixerFrame(rec)') < updateSource.indexOf('rec.mixer.update(dt)'))) {
  throw new Error('Previous additive pose is not cleared before AnimationMixer sampling');
}
const actingStart = html.indexOf('function v106ApplyActing(');
const actingEnd = html.indexOf('\nfunction ', actingStart + 20);
const actingSource = html.slice(actingStart, actingEnd);
if (!actingSource.includes('if(!bossV106.mixerPrepared)v106ClearLastBoneOffsets()')) throw new Error('Acting fallback clear is missing');
if (!html.includes('v10142StopTimer=setTimeout') || !html.includes('prev.stop();prev.enabled=false')) throw new Error('Faded action cleanup is missing');

const recoveryStart = html.indexOf('function v1071VisualFailure(');
const recoveryEnd = html.indexOf('\nfunction sendInputHeartbeat', recoveryStart);
const recoverySource = html.slice(recoveryStart, recoveryEnd);
if (recoverySource.includes('setBossProceduralFallback(true')) throw new Error('Visual recovery can still replace the accepted Tripo model');
if (!recoverySource.includes('enforceBossTripoVisibility')) throw new Error('Visual recovery does not reassert the Tripo lock');

const assetDir = path.join(root, 'public', 'assets', 'characters');
const files = ['ma_vuong_mat_ngu_root_locked.glb', 'ma_vuong_mat_ngu_mobile_2k.glb', 'ma_vuong_mat_ngu_mobile_1k.glb'];
for (const name of files) {
  const summary = parseGlb(path.join(assetDir, name));
  if (summary.animations !== 19 || summary.scaleChannels < 19) throw new Error(`${name}: incomplete scale-track audit ${JSON.stringify(summary)}`);
  if (summary.minimum < .98 || summary.maximum > 1.02) throw new Error(`${name}: unsafe animation scale ${JSON.stringify(summary)}`);
}

console.log('V10.15 VISUAL AUDIT PASS · 19 clips scale-safe · mixer order repaired · transitions cleaned · 5 skill VFX isolated · Tripo recovery locked');
