const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

for(const fragment of [
  '<title>Princess Rescue V10.19.1 — Pause &amp; Exit Match</title>',
  "window.PrincessBlackBox?.init?.({version:'10.19.1'",
  "function scheduleLobbyPrewarm(reason='lobby')",
  "scheduleLobbyPrewarm('created')",
  "scheduleLobbyPrewarm('joined')",
  "scheduleLobbyPrewarm('resumed')",
  "'requestIdleCallback' in window",
  'EXTERNAL_EXTENSION_ERROR_IGNORED',
  'Đã nối server — đang tạo phòng…'
])if(!html.includes(fragment))throw new Error(`V10.17.8 connection-first fragment missing: ${fragment}`);

if(html.includes('setTimeout(()=>prewarmV108Client(),180)'))throw new Error('Boss preload still starts before the lobby WebSocket');

const mobileStart=html.indexOf('mobileUrls:['),mobileEnd=html.indexOf('],',mobileStart);
const mobileBlock=html.slice(mobileStart,mobileEnd);
if(mobileBlock.indexOf('mobile_1k.glb')>mobileBlock.indexOf('mobile_2k.glb'))throw new Error('Mobile no longer tries the 1K boss first');
const desktopStart=html.indexOf('desktopUrls:['),desktopEnd=html.indexOf('],',desktopStart);
const desktopBlock=html.slice(desktopStart,desktopEnd);
if(!desktopBlock.includes('mobile_1k.glb')||desktopBlock.includes('mobile_2k.glb'))throw new Error('Desktop startup is no longer locked to the 1K boss');

const filterStart=html.indexOf('function isExternalRuntimeError(');
const filterEnd=html.indexOf('\nfunction noteIgnoredExternalRuntimeError(',filterStart);
if(filterStart<0||filterEnd<0)throw new Error('External runtime error filter is missing');
const context={String,RegExp};
vm.runInNewContext(html.slice(filterStart,filterEnd),context,{filename:'external-runtime-filter.js'});
if(!context.isExternalRuntimeError(new Error('extension failed'),'chrome-extension://abc/executors/200.js'))throw new Error('Chrome extension error was not filtered');
if(!context.isExternalRuntimeError({stack:'TypeError\n at moz-extension://abc/script.js:1:2'}))throw new Error('Firefox extension error was not filtered');
if(context.isExternalRuntimeError(new Error('THREE_NOT_READY'),'/public/index.html'))throw new Error('A real game error was incorrectly filtered');

const created=html.indexOf("if(m.type==='created')");
const createdEnd=html.indexOf("if(m.type==='joined')",created);
const createdBlock=html.slice(created,createdEnd);
if(createdBlock.indexOf("$('roomCode').textContent=roomCode")>createdBlock.indexOf("scheduleLobbyPrewarm('created')"))throw new Error('3D preload starts before the room code is painted');

console.log('V10.17.8 LOBBY CONNECTION FIRST PASS · socket/room before 3D · desktop 1K startup · extension noise ignored');
