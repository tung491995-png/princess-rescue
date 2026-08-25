const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

for(const fragment of [
  '<title>Princess Rescue V10.19.1 — Pause &amp; Exit Match</title>',
  "window.PrincessBlackBox?.init?.({version:'10.19.1'",
  "const BOSS_DESKTOP_2K_CACHE_URL='/assets/characters/ma_vuong_mat_ngu_mobile_2k.glb?v=10.17.2'",
  'function scheduleDesktopBoss2KCache()',
  "fetch(BOSS_DESKTOP_2K_CACHE_URL,{cache:'force-cache'",
  'return response.blob()',
  "'BOSS_2K_CACHE_READY'",
  'swapped:false',
  'desktopBoss2KPrefetchTimer=setTimeout(begin,20000)',
  'scheduleDesktopBoss2KCache()'
])if(!html.includes(fragment))throw new Error(`Desktop 1K fragment missing: ${fragment}`);

const desktopStart=html.indexOf('desktopUrls:['),desktopEnd=html.indexOf('],',desktopStart);
const desktopBlock=html.slice(desktopStart,desktopEnd);
if(!desktopBlock.includes('mobile_1k.glb'))throw new Error('Desktop does not start with the 1K boss');
if(desktopBlock.includes('mobile_2k.glb'))throw new Error('Desktop can still download the 2K boss in the critical startup chain');

const cacheStart=html.indexOf('function scheduleDesktopBoss2KCache()');
const cacheEnd=html.indexOf('\nfunction disposeBossArmament()',cacheStart);
const cacheBlock=html.slice(cacheStart,cacheEnd);
for(const fragment of ['!running','!bossIntroActive()','!gameplayIntroLocked()','frameEma<=24','response.blob()']){
  if(!cacheBlock.includes(fragment))throw new Error(`2K cache guard missing: ${fragment}`);
}
for(const forbidden of ['parseGlbBuffer(','loadGlbCandidate(','renderer.compile','root.add(']){
  if(cacheBlock.includes(forbidden))throw new Error(`2K background cache can mutate the active boss: ${forbidden}`);
}

const enterStart=html.indexOf('function enterGameFromState('),enterEnd=html.indexOf('\nfunction gameplayIntroLocked()',enterStart);
const enterBlock=html.slice(enterStart,enterEnd);
if(enterBlock.indexOf('running=true')>enterBlock.indexOf('scheduleDesktopBoss2KCache()'))throw new Error('2K cache scheduling begins before gameplay starts');

console.log('DESKTOP 1K STARTUP PASS · 1K critical path · delayed low-priority 2K cache · no runtime model swap');
