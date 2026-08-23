(function installPrincessBlackBox(global){
  'use strict';

  const DB_NAME='princess-rescue-runtime-qa';
  const DB_VERSION=2;
  const DB_STORE='reports';
  const DB_SCREENSHOTS='screenshotFiles';
  const DB_KEY='latest';
  const PRIVATE_KEY=/token|session|room(code)?|invite|password|secret|authorization/i;
  const VISUAL_CAPTURE_CODES=new Set([
    'BOSS_MODEL_CHANGED','TRIPO_NOT_READY_DURING_MATCH','TRIPO_MODEL_HIDDEN','PROCEDURAL_FALLBACK_VISIBLE','ROOT_XZ_DRIFT',
    'NONFINITE_RIG_TRANSFORM','BONE_SCALE_OUT_OF_RANGE','INVALID_BOSS_MATERIAL','EMPTY_TRIPO_MODEL',
    'ARMAMENT_NOT_READY','ARMAMENT_FALLBACK_ACTIVE','ORB_OR_HALO_HIDDEN','HALO_FOLLOW_DRIFT','HALO_HEIGHT_INVALID','ORB_HAND_DISTANCE_INVALID',
    'BOSS_OUT_OF_CAMERA','CAMERA_POSITION_JUMP','INTRO_FRAMEBUFFER_CHANGED','INTRO_ANIMATION_MISSING','CONTROLS_HIDDEN_AFTER_INTRO',
    'HUD_ELEMENT_OFFSCREEN','FRAME_STALL','SUSTAINED_LOW_FPS','EMPTY_WEBGL_FRAME','BOSS_ANIMATION_STUCK','BOSS_TELEGRAPH_VFX_MISSING'
  ]);
  const runId=`run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

  const recorder={
    version:'unknown',enabled:true,startedAt:Date.now(),startedPerf:performance.now(),
    events:[],samples:[],screenshots:[],checks:{},milestones:{},pendingCapture:null,
    issues:0,warnings:0,lastCaptureAt:0,lastPersistAt:0,persistTimer:0,
    maxEvents:800,maxSamples:480,maxScreenshots:20,minCaptureGap:3800,
    latestPersisted:null,captureBusy:false,captureLimitNotified:false,ui:{},device:null,
    runId,screenshotBlobs:new Map()
  };

  function finite(value,fallback=null){return Number.isFinite(Number(value))?Number(value):fallback}
  function redact(value,depth=0){
    if(depth>5)return '[depth-limit]';
    if(value==null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number')return Number.isFinite(value)?value:String(value);
    if(value instanceof Error)return {name:value.name,message:value.message,stack:String(value.stack||'').slice(0,4000)};
    if(Array.isArray(value))return value.slice(0,80).map(item=>redact(item,depth+1));
    if(typeof value==='object'){
      const out={};
      for(const [key,item] of Object.entries(value))out[key]=PRIVATE_KEY.test(key)?'[redacted]':redact(item,depth+1);
      return out;
    }
    return String(value);
  }
  function deviceInfo(){
    const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    return {
      userAgent:navigator.userAgent,platform:navigator.platform||'',language:navigator.language||'',
      hardwareConcurrency:finite(navigator.hardwareConcurrency),deviceMemory:finite(navigator.deviceMemory),
      viewport:{width:innerWidth,height:innerHeight,dpr:finite(devicePixelRatio,1)},
      screen:{width:screen?.width||0,height:screen?.height||0,orientation:screen?.orientation?.type||''},
      connection:connection?{effectiveType:connection.effectiveType||'',downlink:finite(connection.downlink),rtt:finite(connection.rtt),saveData:!!connection.saveData}:null
    };
  }
  function elapsed(){return Math.max(0,Math.round(performance.now()-recorder.startedPerf))}
  function trim(list,max){if(list.length>max)list.splice(0,list.length-max)}
  function currentSummary(){
    return {issues:recorder.issues,warnings:recorder.warnings,events:recorder.events.length,samples:recorder.samples.length,screenshots:recorder.screenshots.length};
  }
  function updateUi(){
    const badge=recorder.ui.badge||document.getElementById('qaRecorderBadge');
    const state=recorder.ui.state||document.getElementById('qaRecorderState');
    const download=recorder.ui.download||document.getElementById('qaRecorderDownload');
    if(!badge||!state||!download)return;
    recorder.ui={badge,state,download,capture:document.getElementById('qaRecorderCapture')};
    const hasIssue=recorder.issues>0,hasWarning=recorder.warnings>0;
    badge.classList.toggle('issue',hasIssue);badge.classList.toggle('warning',!hasIssue&&hasWarning);
    state.textContent=hasIssue?`⚠ ${recorder.issues} LỖI ĐÃ LƯU`:hasWarning?`QA · ${recorder.warnings} CẢNH BÁO`:'QA ● ĐANG GHI';
    const hasData=recorder.samples.length||recorder.events.length||recorder.screenshots.length||recorder.latestPersisted;
    download.disabled=!hasData;download.classList.toggle('ready',!!hasData);
  }
  function scheduleCapture(label,options={}){
    if(!recorder.enabled)return;
    const next={label:String(label||'RUNTIME'),requestedAt:Date.now(),force:!!options.force,meta:redact(options.meta||{})};
    if(!recorder.pendingCapture||next.force||!recorder.pendingCapture.force)recorder.pendingCapture=next;
  }
  function record(level,code,detail={},options={}){
    if(!recorder.enabled)return null;
    const now=performance.now(),key=`${level}:${code}`,previous=recorder.events[recorder.events.length-1];
    if(previous?.key===key&&now-(previous.perf||0)<900){previous.repeat=(previous.repeat||1)+1;previous.at=Date.now();previous.detail=redact(detail);return previous}
    const event={id:`e${Date.now().toString(36)}${recorder.events.length.toString(36)}`,key,at:Date.now(),t:elapsed(),perf:now,level:String(level),code:String(code),detail:redact(detail),repeat:1};
    recorder.events.push(event);trim(recorder.events,recorder.maxEvents);
    if(level==='error')recorder.issues++;else if(level==='warning')recorder.warnings++;
    if(options.capture===true||(level==='error'&&options.capture!==false))scheduleCapture(code,{meta:{eventId:event.id,level:event.level,code:event.code,detail:event.detail}});
    if(level==='error'||level==='warning')persistSoon();
    updateUi();return event;
  }
  function sample(payload){
    if(!recorder.enabled)return;
    recorder.samples.push({at:Date.now(),t:elapsed(),...redact(payload)});trim(recorder.samples,recorder.maxSamples);updateUi();
  }
  function check(code,condition,options={}){
    const state=recorder.checks[code]||(recorder.checks[code]={count:0,lastTrigger:0});
    if(!condition){state.count=0;return false}
    state.count++;
    const threshold=Math.max(1,options.threshold||1),cooldown=Math.max(250,options.cooldown||6000),now=performance.now();
    if(state.count<threshold||(state.lastTrigger>0&&now-state.lastTrigger<cooldown))return false;
    state.count=0;state.lastTrigger=now;
    const capture=options.capture===true||(options.capture!==false&&VISUAL_CAPTURE_CODES.has(code));
    record(options.level||'error',code,typeof options.detail==='function'?options.detail():options.detail||{}, {capture});
    return true;
  }
  function milestone(code,meta={},options={}){
    if(recorder.milestones[code])return false;
    recorder.milestones[code]=Date.now();record('info',`MILESTONE_${code}`,meta,{capture:false});return true;
  }
  function screenshotData(canvas,label,telemetry){
    const maxWidth=1280,scale=Math.min(1,maxWidth/Math.max(1,canvas.width||innerWidth));
    const width=Math.max(2,Math.round((canvas.width||innerWidth)*scale)),height=Math.max(2,Math.round((canvas.height||innerHeight)*scale));
    const out=document.createElement('canvas');out.width=width;out.height=height;
    const ctx=out.getContext('2d',{alpha:false});if(!ctx)throw new Error('QA_2D_CONTEXT_FAILED');
    ctx.fillStyle='#03040b';ctx.fillRect(0,0,width,height);ctx.drawImage(canvas,0,0,width,height);
    const barHeight=Math.max(24,Math.round(height*.052));ctx.fillStyle='rgba(4,5,16,.82)';ctx.fillRect(0,0,width,barHeight);
    ctx.fillStyle='#f1e9ff';ctx.font=`${Math.max(11,Math.round(barHeight*.42))}px ui-monospace,monospace`;ctx.textBaseline='middle';
    const stamp=new Date().toISOString().replace('T',' ').replace('Z',' UTC');ctx.fillText(`V${recorder.version} · ${label} · ${stamp}`,10,barHeight/2);
    if(telemetry?.frame||telemetry?.boss){
      const footer=Math.max(24,Math.round(height*.052)),parts=[];
      if(telemetry.frame)parts.push(`FRAME ${telemetry.frame.emaMs??'-'}ms`,`${telemetry.frame.renderScale??'-'}x`,`${telemetry.frame.calls??'-'} calls`);
      if(telemetry.boss)parts.push(`BOSS ${telemetry.boss.activeState||telemetry.boss.status||'-'}`,`XZ ${telemetry.boss.rootResidual??'-'}`);
      if(telemetry.armament)parts.push(`ORB ${telemetry.armament.orbHandDistance??'-'}`,`HALO ${telemetry.armament.haloTargetResidual??'-'}`);
      ctx.fillStyle='rgba(4,5,16,.82)';ctx.fillRect(0,height-footer,width,footer);ctx.fillStyle='#cfc5ed';ctx.font=`${Math.max(10,Math.round(footer*.38))}px ui-monospace,monospace`;ctx.fillText(parts.join(' · '),10,height-footer/2);
    }
    return {out,width,height,telemetry:redact(telemetry||{})};
  }
  function safeFilePart(value){return String(value||'capture').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,72)||'capture'}
  async function storeScreenshotFile(filePath,blob){
    recorder.screenshotBlobs.set(filePath,blob);
    try{
      const db=await openDb();
      await new Promise((resolve,reject)=>{const tx=db.transaction(DB_SCREENSHOTS,'readwrite');tx.objectStore(DB_SCREENSHOTS).put(blob,filePath);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
      db.close();
    }catch(error){record('info','SCREENSHOT_FILE_PERSIST_FAILED',{filePath,message:error?.message||String(error)},{capture:false})}
  }
  async function readScreenshotFile(filePath){
    if(recorder.screenshotBlobs.has(filePath))return recorder.screenshotBlobs.get(filePath);
    try{
      const db=await openDb();
      const blob=await new Promise((resolve,reject)=>{const tx=db.transaction(DB_SCREENSHOTS,'readonly'),request=tx.objectStore(DB_SCREENSHOTS).get(filePath);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)});
      db.close();return blob;
    }catch(_){return null}
  }
  async function storeScreenshot(label,blob,width,height,telemetry,trigger={}){
    if(recorder.screenshots.length>=recorder.maxScreenshots){recorder.captureBusy=false;return false}
    const at=Date.now(),stamp=new Date(at).toISOString().replace(/[:.]/g,'-'),filename=`${stamp}_${safeFilePart(label)}.jpg`,filePath=`screenshots/${recorder.runId}/${filename}`;
    const entry={
      id:`s${at.toString(36)}`,label,filename,path:filePath,timestamp:new Date(at).toISOString(),at,t:elapsed(),width,height,mimeType:'image/jpeg',
      gameState:redact(telemetry?.game||null),camera:redact(telemetry?.camera||null),entityTransforms:redact(telemetry?.entities||null),event:redact(trigger||null)
    };
    await storeScreenshotFile(filePath,blob);recorder.screenshots.push(entry);
    recorder.lastCaptureAt=performance.now();recorder.captureBusy=false;
    record('info','SCREENSHOT_FILE_SAVED',{label,filename,path:filePath,width,height,total:recorder.screenshots.length},{capture:false});persistSoon();updateUi();return true;
  }
  function afterRender(canvas,telemetry={}){
    const pending=recorder.pendingCapture;if(!pending||recorder.captureBusy||!canvas)return;
    if(recorder.screenshots.length>=recorder.maxScreenshots){
      recorder.pendingCapture=null;
      if(!recorder.captureLimitNotified){recorder.captureLimitNotified=true;record('warning','SCREENSHOT_SESSION_LIMIT_REACHED',{limit:recorder.maxScreenshots},{capture:false})}
      return;
    }
    if(!pending.force&&recorder.lastCaptureAt>0&&performance.now()-recorder.lastCaptureAt<recorder.minCaptureGap)return;
    recorder.pendingCapture=null;recorder.captureBusy=true;
    try{
      const shot=screenshotData(canvas,pending.label,telemetry);
      if(shot.out.toBlob){
        shot.out.toBlob(async blob=>{
          if(!blob){recorder.captureBusy=false;record('warning','SCREENSHOT_BLOB_EMPTY',{label:pending.label},{capture:false});return}
          try{await storeScreenshot(pending.label,blob,shot.width,shot.height,shot.telemetry,pending.meta)}catch(error){recorder.captureBusy=false;record('warning','SCREENSHOT_FILE_SAVE_FAILED',error,{capture:false})}
        },'image/jpeg',.75);
      }else{recorder.captureBusy=false;record('warning','CANVAS_TO_BLOB_UNAVAILABLE',{label:pending.label},{capture:false})}
    }catch(error){recorder.captureBusy=false;record('warning','SCREENSHOT_FAILED',error,{capture:false})}
  }
  function buildReport(){
    return {
      schema:'princess-rescue-black-box/v2',gameVersion:recorder.version,createdAt:new Date().toISOString(),
      startedAt:new Date(recorder.startedAt).toISOString(),durationMs:elapsed(),device:recorder.device||deviceInfo(),
      summary:currentSummary(),privacy:{sessionToken:'not-recorded',roomCode:'not-recorded',chatText:'not-recorded'},
      attachments:{format:'separate-files',directory:'screenshots/',count:recorder.screenshots.length,maxPerRun:recorder.maxScreenshots},
      events:recorder.events.map(({perf,key,...event})=>event),samples:recorder.samples,screenshots:recorder.screenshots.map(item=>({...item})),
      visualAudit:redact(global.__bossVisualAudit?{done:global.__bossVisualAudit.done,passed:global.__bossVisualAudit.passed,checks:global.__bossVisualAudit.checks,issues:global.__bossVisualAudit.issues,clipResults:global.__bossVisualAudit.clipResults,transitionResults:global.__bossVisualAudit.transitionResults,vfxResults:global.__bossVisualAudit.vfxResults}:null)
    };
  }
  function openDb(){
    return new Promise((resolve,reject)=>{
      if(!global.indexedDB){reject(new Error('INDEXED_DB_UNAVAILABLE'));return}
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE);if(!db.objectStoreNames.contains(DB_SCREENSHOTS))db.createObjectStore(DB_SCREENSHOTS)};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('INDEXED_DB_OPEN_FAILED'));
    });
  }
  async function persist(){
    clearTimeout(recorder.persistTimer);recorder.persistTimer=0;
    try{
      const report=buildReport(),db=await openDb();
      await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(report,DB_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
      db.close();recorder.latestPersisted=report;recorder.lastPersistAt=Date.now();
    }catch(error){record('info','REPORT_PERSIST_FAILED',error,{capture:false})}
  }
  function persistSoon(){
    if(recorder.persistTimer)return;
    recorder.persistTimer=setTimeout(persist,650);
  }
  async function loadLatest(){
    try{
      const db=await openDb();
      const report=await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly'),request=tx.objectStore(DB_STORE).get(DB_KEY);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)});
      db.close();recorder.latestPersisted=report?.schema==='princess-rescue-black-box/v2'?report:null;updateUi();return recorder.latestPersisted;
    }catch(_){return null}
  }
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
  function zipTime(date){const year=Math.max(1980,date.getFullYear());return {time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()}}
  function joinBytes(parts){const size=parts.reduce((sum,part)=>sum+part.length,0),out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length}return out}
  async function zipBytes(value){if(typeof value==='string')return new TextEncoder().encode(value);if(value instanceof Uint8Array)return value;if(value instanceof Blob)return new Uint8Array(await value.arrayBuffer());return new Uint8Array(value)}
  async function createZip(entries){
    const encoder=new TextEncoder(),locals=[],centrals=[];let localOffset=0;
    for(const entry of entries){
      const name=String(entry.name).replace(/^\/+|\.\.(?:\/|\\)/g,''),nameBytes=encoder.encode(name),data=await zipBytes(entry.data),crc=crc32(data),stamp=zipTime(entry.date||new Date());
      const local=new Uint8Array(30+nameBytes.length+data.length),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint16(10,stamp.time,true);lv.setUint16(12,stamp.date,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,nameBytes.length,true);lv.setUint16(28,0,true);local.set(nameBytes,30);local.set(data,30+nameBytes.length);locals.push(local);
      const central=new Uint8Array(46+nameBytes.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,stamp.time,true);cv.setUint16(14,stamp.date,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,nameBytes.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);cv.setUint32(42,localOffset,true);central.set(nameBytes,46);centrals.push(central);localOffset+=local.length;
    }
    const centralSize=centrals.reduce((sum,item)=>sum+item.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,localOffset,true);ev.setUint16(20,0,true);return new Blob([joinBytes([...locals,...centrals,end])],{type:'application/zip'});
  }
  async function download(){
    record('info','DEBUG_BUNDLE_EXPORT_REQUESTED',{files:recorder.screenshots.length},{capture:false});
    const current=buildReport();
    const currentUseful=current.summary.issues>0||current.summary.warnings>0||current.screenshots.length>0;
    const persistedUseful=(recorder.latestPersisted?.summary?.issues||0)>0||(recorder.latestPersisted?.summary?.warnings||0)>0||(recorder.latestPersisted?.screenshots?.length||0)>0;
    const report=currentUseful||!persistedUseful?current:recorder.latestPersisted;
    if(!report)return false;
    const exported=JSON.parse(JSON.stringify(report)),entries=[],missing=[];
    for(const shot of exported.screenshots||[]){const blob=await readScreenshotFile(shot.path);if(blob)entries.push({name:shot.path,data:blob,date:new Date(shot.at||Date.now())});else missing.push(shot.path)}
    exported.attachments.missing=missing;exported.attachments.included=entries.length;
    const logName=`princess_rescue_v${recorder.version}_debug_log.json`;entries.unshift({name:logName,data:JSON.stringify(exported,null,2),date:new Date()});
    try{
      const blob=await createZip(entries),url=URL.createObjectURL(blob),link=document.createElement('a'),stamp=new Date().toISOString().replace(/[:.]/g,'-');link.href=url;link.download=`princess_rescue_v${recorder.version}_debug_bundle_${stamp}.zip`;
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);record('info','DEBUG_BUNDLE_EXPORTED',{images:entries.length-1,missing:missing.length},{capture:false});return true;
    }catch(error){record('warning','DEBUG_BUNDLE_EXPORT_FAILED',{message:error?.message||String(error)},{capture:false});return false}
  }
  function init(options={}){
    recorder.version=String(options.version||recorder.version);recorder.device=deviceInfo();recorder.enabled=options.enabled!==false;
    if(!global.__princessQaConsoleWrapped){
      global.__princessQaConsoleWrapped=true;
      const originalError=console.error.bind(console),originalWarn=console.warn.bind(console);
      console.error=(...args)=>{originalError(...args);record('error','CONSOLE_ERROR',{arguments:args.map(arg=>redact(arg))},{capture:true})};
      console.warn=(...args)=>{originalWarn(...args);record('warning','CONSOLE_WARNING',{arguments:args.map(arg=>redact(arg))},{capture:false})};
    }
    updateUi();loadLatest();record('info','RECORDER_STARTED',{version:recorder.version,device:recorder.device},{capture:false});
    const downloadButton=document.getElementById('qaRecorderDownload'),captureButton=document.getElementById('qaRecorderCapture');
    if(downloadButton)downloadButton.onclick=download;
    if(captureButton)captureButton.onclick=()=>{record('info','MANUAL_CAPTURE_REQUESTED',{}, {capture:false});scheduleCapture('MANUAL_GRAPHICS_CHECK',{force:true,meta:{trigger:'manual'}})};
    return recorder;
  }

  Object.assign(recorder,{init,record,sample,check,milestone,scheduleCapture,afterRender,buildReport,persist,persistSoon,loadLatest,download,createZip,redact,updateUi});
  global.PrincessBlackBox=recorder;
})(window);
