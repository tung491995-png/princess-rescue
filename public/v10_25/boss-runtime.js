(function(global){
  'use strict';
  const THREE=global.THREE;
  if(!THREE){global.PrincessRescueV1025={version:'10.25',error:'THREE_UNAVAILABLE'};return}

  const VERSION='10.25';
  const norm=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
  const finiteQuaternion=q=>[q.x,q.y,q.z,q.w].every(Number.isFinite)&&q.lengthSq()>.000001;
  const ROLE_ALIASES=Object.freeze({
    hips:{source:['mixamorigHips','Hips'],target:['Hip','Hips']},
    spine:{source:['mixamorigSpine','Spine'],target:['Waist','Spine']},
    spine1:{source:['mixamorigSpine1','Spine1'],target:['Spine01']},
    chest:{source:['mixamorigSpine2','Spine2','Chest'],target:['Spine02','Chest']},
    neck:{source:['mixamorigNeck','Neck'],target:['NeckTwist01','Neck']},
    head:{source:['mixamorigHead','Head'],target:['Head']},
    leftShoulder:{source:['mixamorigLeftShoulder','LeftShoulder'],target:['L_Clavicle','LeftShoulder']},
    leftArm:{source:['mixamorigLeftArm','LeftArm'],target:['L_Upperarm','LeftUpperArm']},
    leftForeArm:{source:['mixamorigLeftForeArm','LeftForeArm'],target:['L_Forearm','LeftForeArm']},
    leftHand:{source:['mixamorigLeftHand','LeftHand'],target:['L_Hand','LeftHand']},
    rightShoulder:{source:['mixamorigRightShoulder','RightShoulder'],target:['R_Clavicle','RightShoulder']},
    rightArm:{source:['mixamorigRightArm','RightArm'],target:['R_Upperarm','RightUpperArm']},
    rightForeArm:{source:['mixamorigRightForeArm','RightForeArm'],target:['R_Forearm','RightForeArm']},
    rightHand:{source:['mixamorigRightHand','RightHand'],target:['R_Hand','RightHand']},
    leftUpLeg:{source:['mixamorigLeftUpLeg','LeftUpLeg'],target:['L_Thigh','LeftThigh']},
    leftLeg:{source:['mixamorigLeftLeg','LeftLeg'],target:['L_Calf','LeftLeg']},
    leftFoot:{source:['mixamorigLeftFoot','LeftFoot'],target:['L_Foot','LeftFoot']},
    rightUpLeg:{source:['mixamorigRightUpLeg','RightUpLeg'],target:['R_Thigh','RightThigh']},
    rightLeg:{source:['mixamorigRightLeg','RightLeg'],target:['R_Calf','RightLeg']},
    rightFoot:{source:['mixamorigRightFoot','RightFoot'],target:['R_Foot','RightFoot']}
  });
  const ROLE_ORDER=['hips','spine','spine1','chest','neck','head','leftShoulder','leftArm','leftForeArm','leftHand','rightShoulder','rightArm','rightForeArm','rightHand','leftUpLeg','leftLeg','leftFoot','rightUpLeg','rightLeg','rightFoot'];

  function findSemantic(root,aliases){
    const wants=aliases.map(norm);let best=null,score=-1;
    root?.traverse?.(object=>{
      const name=norm(object.name);if(!name)return;
      let value=0;for(const wanted of wants)value=Math.max(value,name===wanted?100:name.endsWith(wanted)?86:name.includes(wanted)?64:0);
      if(value>score){score=value;best=object}
    });
    return score>0?best:null;
  }
  function captureNodeRest(node){
    const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
    node.matrixWorld.decompose(position,quaternion,scale);
    return {node,localPosition:node.position.clone(),localQuaternion:node.quaternion.clone(),worldPosition:position,worldQuaternion:quaternion,worldScale:scale};
  }

  class BossRetargeter{
    constructor(targetRoot,options={}){
      this.targetRoot=targetRoot;this.sampleRate=options.sampleRate||30;this.roles=ROLE_ALIASES;this.target={};this.validation=[];
      targetRoot.updateMatrixWorld(true);
      for(const role of ROLE_ORDER){const node=findSemantic(targetRoot,this.roles[role].target);if(node)this.target[role]=captureNodeRest(node)}
      this.targetHeight=this.measureHeight(this.target);
      this.targetRoleByUuid=new Map(Object.entries(this.target).map(([role,rest])=>[rest.node.uuid,role]));
      for(const [role,rest] of Object.entries(this.target)){
        let parent=rest.node.parent,ancestorRole='';while(parent&&!ancestorRole){ancestorRole=this.targetRoleByUuid.get(parent.uuid)||'';parent=parent.parent}
        rest.parentNode=rest.node.parent;rest.ancestorRole=ancestorRole;
        const parentRest=rest.parentNode?captureNodeRest(rest.parentNode):null;rest.parentWorldQuaternion=parentRest?.worldQuaternion||new THREE.Quaternion();
        if(ancestorRole){rest.parentRelative=this.target[ancestorRole].worldQuaternion.clone().invert().multiply(rest.parentWorldQuaternion)}
      }
    }
    measureHeight(index){
      const head=index.head?.worldPosition?.y,feet=[index.leftFoot?.worldPosition?.y,index.rightFoot?.worldPosition?.y].filter(Number.isFinite);
      return Number.isFinite(head)&&feet.length?Math.max(.01,head-Math.min(...feet)):1;
    }
    mapping(sourceRoot){
      sourceRoot.updateMatrixWorld(true);const source={},missing=[];
      for(const role of ROLE_ORDER){
        const node=findSemantic(sourceRoot,this.roles[role].source);if(node&&this.target[role])source[role]=captureNodeRest(node);else if(this.target[role])missing.push(role);
      }
      return {source,missing,sourceHeight:this.measureHeight(source)};
    }
    retargetClip(sourceRoot,sourceClip,definition={}){
      const map=this.mapping(sourceRoot),trim=definition.trim||[0,1],start=Math.max(0,sourceClip.duration*Math.max(0,trim[0]||0)),end=Math.min(sourceClip.duration,sourceClip.duration*Math.min(1,trim[1]??1));
      if(!(end>start+.02))throw new Error(`RETARGET_EMPTY_TRIM:${definition.id||sourceClip.name}`);
      const mixer=new THREE.AnimationMixer(sourceRoot),action=mixer.clipAction(sourceClip);action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
      const rate=Math.max(20,Number(definition.sampleRate)||this.sampleRate),frameCount=Math.max(2,Math.ceil((end-start)*rate)+1),times=new Float32Array(frameCount),values={};
      for(const role of Object.keys(map.source))values[role]=new Float32Array(frameCount*4);
      const hipValues=map.source.hips&&this.target.hips?new Float32Array(frameCount*3):null;
      // Mixamo/FBX-derived GLBs often store a neutral node transform that does
      // not share the basis used by their absolute quaternion tracks. Treating
      // that static export offset as motion can inject ~180-degree limb flips.
      // Normalize each clip against its authored pose at the trim boundary and
      // transfer only the animated delta onto the target rest pose.
      mixer.setTime(start);sourceRoot.updateMatrixWorld(true);
      const sourceReference={};
      for(const [role,rest] of Object.entries(map.source)){const worldQuaternion=new THREE.Quaternion(),worldPosition=new THREE.Vector3();rest.node.getWorldQuaternion(worldQuaternion);rest.node.getWorldPosition(worldPosition);sourceReference[role]={worldQuaternion,worldPosition}}
      const worldAnimated={},previous={},scale=this.targetHeight/Math.max(.001,map.sourceHeight),sourcePosition=new THREE.Vector3(),sourceWorldQ=new THREE.Quaternion();
      const desiredWorld=new THREE.Quaternion(),parentWorld=new THREE.Quaternion(),localQ=new THREE.Quaternion();
      for(let frame=0;frame<frameCount;frame++){
        const alpha=frame/(frameCount-1),time=start+(end-start)*alpha;times[frame]=time-start;mixer.setTime(time);sourceRoot.updateMatrixWorld(true);
        for(const role of ROLE_ORDER){
          const sourceRest=map.source[role],targetRest=this.target[role],out=values[role];if(!sourceRest||!targetRest||!out)continue;
          sourceRest.node.getWorldQuaternion(sourceWorldQ);
          // Align the animated source frame through the constant clip-start ->
          // target-rest mapping. This preserves motion while removing static
          // source export/bind-axis offsets.
          desiredWorld.copy(sourceWorldQ).multiply(sourceReference[role].worldQuaternion.clone().invert()).multiply(targetRest.worldQuaternion).normalize();
          if(targetRest.ancestorRole&&worldAnimated[targetRest.ancestorRole])parentWorld.copy(worldAnimated[targetRest.ancestorRole]).multiply(targetRest.parentRelative);
          else parentWorld.copy(targetRest.parentWorldQuaternion);
          localQ.copy(parentWorld).invert().multiply(desiredWorld).normalize();
          if(!finiteQuaternion(localQ))localQ.copy(targetRest.localQuaternion);
          if(previous[role]&&previous[role].dot(localQ)<0)localQ.set(-localQ.x,-localQ.y,-localQ.z,-localQ.w);
          previous[role]=localQ.clone();worldAnimated[role]=parentWorld.clone().multiply(localQ);
          const offset=frame*4;out[offset]=localQ.x;out[offset+1]=localQ.y;out[offset+2]=localQ.z;out[offset+3]=localQ.w;
        }
        if(hipValues){
          map.source.hips.node.getWorldPosition(sourcePosition);const vertical=Math.max(-.42,Math.min(.78,(sourcePosition.y-sourceReference.hips.worldPosition.y)*scale));
          const offset=frame*3,bind=this.target.hips.localPosition;hipValues[offset]=bind.x;hipValues[offset+1]=bind.y+vertical;hipValues[offset+2]=bind.z;
        }
      }
      action.stop();mixer.stopAllAction();mixer.uncacheRoot(sourceRoot);
      const tracks=[];
      for(const role of ROLE_ORDER){const target=this.target[role],out=values[role];if(target&&out)tracks.push(new THREE.QuaternionKeyframeTrack(`${target.node.name}.quaternion`,times,out))}
      if(hipValues)tracks.push(new THREE.VectorKeyframeTrack(`${this.target.hips.node.name}.position`,times,hipValues));
      const clip=new THREE.AnimationClip(`V1025_${definition.id||sourceClip.name}`,end-start,tracks);clip.userData={logicalId:definition.id||sourceClip.name,sourceClip:definition.source||sourceClip.name,category:definition.category||'CORE',trim:[start,end],rootMotionXZRemoved:true,restPoseCorrected:true,clipStartNormalized:true,sampleRate:rate,missingRoles:map.missing};
      const validation=this.validate(clip);this.validation.push(validation);if(!validation.ok)throw new Error(`RETARGET_VALIDATION_FAILED:${validation.errors.join(',')}`);
      return clip;
    }
    validate(clip){
      const errors=[];if(!clip?.tracks?.length)errors.push('NO_TRACKS');if(!(clip.duration>0))errors.push('BAD_DURATION');
      for(const track of clip.tracks||[]){if(!Array.from(track.values).every(Number.isFinite))errors.push(`NONFINITE:${track.name}`);if(/\.(?:scale)$/i.test(track.name))errors.push(`SCALE_TRACK:${track.name}`);if(/(?:Root|Hip)\.position$/i.test(track.name)){for(let i=0;i<track.values.length;i+=3)if(Math.abs(track.values[i]-track.values[0])>.0001||Math.abs(track.values[i+2]-track.values[2])>.0001)errors.push('ROOT_XZ_DRIFT')}}
      return {id:clip.userData?.logicalId||clip.name,ok:errors.length===0,errors,tracks:clip.tracks.length,duration:clip.duration,rootMotionXZRemoved:true};
    }
  }

  const ANIMATION_VARIANT_PROFILES=Object.freeze({
    BASE:{durationScale:1,warp:[[0,0],[1,1]],speedCurve:'AUTHORED'},
    FAST:{durationScale:.78,warp:[[0,0],[.72,.62],[1,1]],speedCurve:'FAST_RELEASE'},
    HEAVY:{durationScale:1.08,warp:[[0,0],[.22,.35],[.72,.58],[1,1]],speedCurve:'SLOW_ANTICIPATION_FAST_RELEASE_SLOW_FOLLOW_THROUGH'},
    MIRROR:{durationScale:1,warp:[[0,0],[1,1]],speedCurve:'AUTHORED_MIRROR',mirror:true},
    TELEPORT_ENTRY:{durationScale:.82,warp:[[0,0],[.22,.12],[1,1]],speedCurve:'FAST_ENTRY_CONTROLLED_RECOVERY'},
    MAGIC_FINISHER:{durationScale:.96,warp:[[0,0],[.68,.58],[1,1]],speedCurve:'FAST_RELEASE_LONG_FOLLOW_THROUGH'},
    PHASE2:{durationScale:.92,warp:[[0,0],[.62,.56],[1,1]],speedCurve:'PHASE2_PRESSURE'},
    PHASE3:{durationScale:.84,warp:[[0,0],[.70,.61],[1,1]],speedCurve:'PHASE3_AGGRESSION'}
  });

  class BossAnimationVariantGenerator{
    constructor(retargeter){this.retargeter=retargeter;this.roleByName=new Map(Object.entries(retargeter.target).map(([role,rest])=>[rest.node.name,role]));}
    profile(name){return ANIMATION_VARIANT_PROFILES[name]||ANIMATION_VARIANT_PROFILES.BASE}
    warp(value,points){
      const p=Math.max(0,Math.min(1,value));for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(p<=b[0]){const span=Math.max(.000001,b[0]-a[0]),t=(p-a[0])/span;return a[1]+(b[1]-a[1])*t}}return 1;
    }
    counterpart(role){if(role.startsWith('left'))return`right${role.slice(4)}`;if(role.startsWith('right'))return`left${role.slice(5)}`;return role}
    mirrorTrack(track){
      const clone=track.clone(),dot=track.name.lastIndexOf('.'),nodeName=dot>=0?track.name.slice(0,dot):track.name,property=dot>=0?track.name.slice(dot+1):'',role=this.roleByName.get(nodeName),targetRole=this.counterpart(role||''),sourceRest=role?this.retargeter.target[role]:null,targetRest=targetRole?this.retargeter.target[targetRole]:null;
      if(targetRest)clone.name=`${targetRest.node.name}.${property}`;
      if(property==='quaternion'&&sourceRest&&targetRest){
        const sourceInverse=sourceRest.localQuaternion.clone().invert(),q=new THREE.Quaternion(),delta=new THREE.Quaternion(),mirrored=new THREE.Quaternion(),out=new THREE.Quaternion();
        for(let i=0;i<clone.values.length;i+=4){q.fromArray(clone.values,i);delta.copy(sourceInverse).multiply(q).normalize();mirrored.set(delta.x,-delta.y,-delta.z,delta.w).normalize();out.copy(targetRest.localQuaternion).multiply(mirrored).normalize();out.toArray(clone.values,i)}
      }else if(property==='position'&&sourceRest&&targetRest){
        for(let i=0;i<clone.values.length;i+=3){clone.values[i]=targetRest.localPosition.x-(clone.values[i]-sourceRest.localPosition.x);clone.values[i+1]=targetRest.localPosition.y+(clone.values[i+1]-sourceRest.localPosition.y);clone.values[i+2]=targetRest.localPosition.z+(clone.values[i+2]-sourceRest.localPosition.z)}
      }
      return clone;
    }
    generate(clip,name='BASE'){
      const variant=ANIMATION_VARIANT_PROFILES[name]?name:'BASE',profile=this.profile(variant);if(variant==='BASE')return clip;
      const duration=Math.max(.001,clip.duration*profile.durationScale),tracks=clip.tracks.map(track=>{
        const clone=profile.mirror?this.mirrorTrack(track):track.clone(),times=new Float32Array(clone.times.length);
        for(let i=0;i<clone.times.length;i++)times[i]=this.warp(clone.times[i]/Math.max(.001,clip.duration),profile.warp)*duration;
        clone.times=times;return clone;
      });
      const generated=new THREE.AnimationClip(`${clip.name}_${variant}`,duration,tracks);generated.userData={...(clip.userData||{}),variant,variantOf:clip.userData?.logicalId||clip.name,generated:true,speedCurve:profile.speedCurve,mirrored:profile.mirror===true};return generated;
    }
  }

  class BossAnimationLibrary{
    constructor(rec,loader,options={}){this.rec=rec;this.loader=loader;this.manifestUrl=options.manifestUrl||'/assets/boss_v10_25/animation_manifest.json';this.retargeter=new BossRetargeter(rec.model,{sampleRate:30});this.variantGenerator=new BossAnimationVariantGenerator(this.retargeter);this.definitions=new Map();this.status=new Map();this.ready=false;this.representative=['combat_idle','magic_cast','jab_cross','roundhouse','dodge_back'];this.onProgress=options.onProgress||(()=>{});}
    async loadManifest(){const response=await fetch(this.manifestUrl,{cache:'force-cache'});if(!response.ok)throw new Error(`ANIMATION_MANIFEST_${response.status}`);this.manifest=await response.json();for(const definition of this.manifest.clips||[])this.definitions.set(definition.id,definition);return this.manifest}
    loadGltf(url){return new Promise((resolve,reject)=>this.loader.load(url,resolve,undefined,reject))}
    async loadOne(id){
      const definition=this.definitions.get(id);if(!definition)return false;this.status.set(id,'loading');
      try{
        const gltf=await this.loadGltf(`${definition.url}?v=10.25-animation-fidelity-1`),source=gltf.scene||gltf.scenes?.[0],sourceClip=gltf.animations?.[0];if(!source||!sourceClip)throw new Error('SOURCE_CLIP_MISSING');
        const clip=this.retargeter.retargetClip(source,sourceClip,definition),action=this.rec.mixer.clipAction(clip);action.userData={logicalId:id,definition};
        this.rec.actions[`v1025_${id}`]=action;
        const upperRoles=['spine','spine1','chest','neck','head','leftShoulder','leftArm','leftForeArm','leftHand','rightShoulder','rightArm','rightForeArm','rightHand'],lowerRoles=['hips','leftUpLeg','leftLeg','leftFoot','rightUpLeg','rightLeg','rightFoot'];
        const names=roles=>new Set(roles.map(role=>this.retargeter.target[role]?.node?.name).filter(Boolean));
        const upperNames=names(upperRoles),lowerNames=names(lowerRoles),belongs=(track,set)=>set.has(String(track.name).split('.')[0]);
        const upperClip=new THREE.AnimationClip(`${clip.name}_UPPER`,clip.duration,clip.tracks.filter(track=>belongs(track,upperNames))),lowerClip=new THREE.AnimationClip(`${clip.name}_LOWER`,clip.duration,clip.tracks.filter(track=>belongs(track,lowerNames)));
        if(upperClip.tracks.length)this.rec.actions[`v1025_upper_${id}`]=this.rec.mixer.clipAction(upperClip);
        if(lowerClip.tracks.length)this.rec.actions[`v1025_lower_${id}`]=this.rec.mixer.clipAction(lowerClip);
        this.rec.logicalAnimations ||= {};this.rec.logicalAnimations[id]={definition,clip,upperClip,lowerClip,action,validation:this.retargeter.validation.at(-1)};this.status.set(id,'ready');this.onProgress(id,'ready');return true;
      }catch(error){this.status.set(id,'fallback');this.onProgress(id,'fallback',error);return false}
    }
    async initialize(){
      await this.loadManifest();for(const id of this.representative)await this.loadOne(id);
      const remaining=[...this.definitions.keys()].filter(id=>!this.representative.includes(id));
      for(let i=0;i<remaining.length;i+=3)await Promise.allSettled(remaining.slice(i,i+3).map(id=>this.loadOne(id)));
      this.ready=true;return this.summary();
    }
    ensureVariant(id,variant='BASE'){
      const family=this.rec.logicalAnimations?.[id],name=ANIMATION_VARIANT_PROFILES[variant]?variant:'BASE';if(!family||name==='BASE')return !!family;
      family.variants||={};if(family.variants[name])return true;
      try{
        const clip=this.variantGenerator.generate(family.clip,name),definition=family.definition,fullKey=`v1025_${name.toLowerCase()}_${id}`,action=this.rec.mixer.clipAction(clip);action.userData={logicalId:id,variant:name,definition};this.rec.actions[fullKey]=action;
        const upperRoles=['spine','spine1','chest','neck','head','leftShoulder','leftArm','leftForeArm','leftHand','rightShoulder','rightArm','rightForeArm','rightHand'],lowerRoles=['hips','leftUpLeg','leftLeg','leftFoot','rightUpLeg','rightLeg','rightFoot'],names=roles=>new Set(roles.map(role=>this.retargeter.target[role]?.node?.name).filter(Boolean)),belongs=(track,set)=>set.has(String(track.name).split('.')[0]),upperNames=names(upperRoles),lowerNames=names(lowerRoles);
        const upperClip=new THREE.AnimationClip(`${clip.name}_UPPER`,clip.duration,clip.tracks.filter(track=>belongs(track,upperNames))),lowerClip=new THREE.AnimationClip(`${clip.name}_LOWER`,clip.duration,clip.tracks.filter(track=>belongs(track,lowerNames)));
        if(upperClip.tracks.length)this.rec.actions[`v1025_upper_${name.toLowerCase()}_${id}`]=this.rec.mixer.clipAction(upperClip);
        if(lowerClip.tracks.length)this.rec.actions[`v1025_lower_${name.toLowerCase()}_${id}`]=this.rec.mixer.clipAction(lowerClip);
        family.variants[name]={clip,upperClip,lowerClip,fullKey};return true;
      }catch(error){this.onProgress(`${id}:${name}`,'variant-fallback',error);return false}
    }
    stateFor(id,variant='BASE',layer='full'){
      const name=ANIMATION_VARIANT_PROFILES[variant]?variant:'BASE',baseKey=layer==='upper'?`v1025_upper_${id}`:layer==='lower'?`v1025_lower_${id}`:`v1025_${id}`;if(!this.rec.actions[baseKey])return layer==='full'?(this.definitions.get(id)?.fallback||'boss_combat_idle'):'';
      if(name==='BASE'||!this.ensureVariant(id,name))return baseKey;
      const key=layer==='upper'?`v1025_upper_${name.toLowerCase()}_${id}`:layer==='lower'?`v1025_lower_${name.toLowerCase()}_${id}`:`v1025_${name.toLowerCase()}_${id}`;return this.rec.actions[key]?key:baseKey;
    }
    summary(){const variants=Object.values(this.rec.logicalAnimations||{}).reduce((count,family)=>count+Object.keys(family.variants||{}).length,0);return {version:VERSION,total:this.definitions.size,ready:[...this.status.values()].filter(value=>value==='ready').length,fallback:[...this.status.entries()].filter(([,value])=>value==='fallback').map(([id])=>id),variants,variantProfiles:Object.keys(ANIMATION_VARIANT_PROFILES),representative:this.representative.map(id=>this.rec.logicalAnimations?.[id]?.validation||{id,ok:false})}}
  }

  class BossAssetAssembler{
    constructor(scene,loader,rec){this.scene=scene;this.loader=loader;this.rec=rec;this.root=new THREE.Group();this.root.name='BOSS_ROOT';scene.add(this.root);this.groups={};for(const name of ['SKELETON','BODY','HAIR','DRESS','MANTLE','HIGH_COLLAR','CROWN','WITCH_CUFFS','MOON_CHOKER','NOCTURNE_CORE','ORB','HALO']){const group=new THREE.Group();group.name=name;group.userData.logicalOnly=true;this.root.add(group);this.groups[name]=group}this.items=[];this.ready=false;this.logicalHierarchy={BOSS_ROOT:rec.root.name||'boss',SKELETON:'Root/Hip',BODY:rec.model.name,HAIR:'HairRoot',DRESS:'SKINNED_PRODUCTION_BODY',MANTLE:'BAKED_IN_SKINNED_PRODUCTION_BODY',HIGH_COLLAR:'V1025_HIGH_COLLAR_CORE_CONTROLLED',CROWN:'Head/CrownSocket/CrownAxisCorrection/crown.glb',WITCH_CUFFS:'CONTROLLED_FOREARM_ANCHORS',MOON_CHOKER:'CONTROLLED_NECK_ANCHOR',NOCTURNE_CORE:'BAKED_IN_SKINNED_PRODUCTION_BODY',ORB:'BossOrbController',HALO:'BossHaloController'};}
    load(url){return new Promise((resolve,reject)=>this.loader.load(`${url}?v=10.25`,resolve,undefined,reject))}
    prepare(object,targetSize,name){
      object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object),size=new THREE.Vector3(),center=new THREE.Vector3();box.getSize(size);box.getCenter(center);const scale=targetSize/Math.max(.001,size.x,size.y,size.z);object.scale.multiplyScalar(scale);object.position.sub(center.multiplyScalar(scale));object.name=name;
      object.traverse(node=>{if(!node.isMesh)return;node.castShadow=false;node.receiveShadow=false;node.frustumCulled=false;const materials=Array.isArray(node.material)?node.material:[node.material];for(const material of materials){if(!material)continue;material.transparent=true;material.opacity=Math.min(.92,material.opacity??1);material.dithering=true;if(material.map)material.map.encoding=THREE.sRGBEncoding;if(material.emissive){material.emissive.lerp(new THREE.Color(0x7435aa),.22);material.emissiveIntensity=Math.max(.18,material.emissiveIntensity||0)}}});return object;
    }
    addControlled(object,anchorAliases,offset,rotation,name,groupKey=name,logicalGroups=[groupKey]){
      const anchor=findSemantic(this.rec.model,anchorAliases);if(!anchor)throw new Error(`ACCESSORY_ANCHOR_MISSING:${name}`);const holder=new THREE.Group();holder.name=`${name}_CONTROLLED`;holder.add(object);
      const logicalParent=this.groups[groupKey]||this.root;logicalParent.add(holder);this.items.push({holder,anchor,logicalGroups:[...logicalGroups],offset:new THREE.Vector3(...offset),rotation:new THREE.Euler(...rotation),worldPosition:new THREE.Vector3(),worldQuaternion:new THREE.Quaternion(),offsetWorld:new THREE.Vector3()});return holder;
    }
    addCrown(object){
      const anchor=findSemantic(this.rec.model,['Head']);if(!anchor)throw new Error('ACCESSORY_ANCHOR_MISSING:CROWN');
      const socket=new THREE.Group();socket.name='CrownSocket';socket.position.set(0,.137,0);const correction=new THREE.Group();correction.name='CrownAxisCorrection';correction.rotation.x=-Math.PI*.5;object.name='crown.glb';correction.add(object);socket.add(correction);anchor.add(socket);
      anchor.updateWorldMatrix(true,false);socket.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object),size=new THREE.Vector3();box.getSize(size);socket.scale.setScalar(.18/Math.max(.001,size.y));socket.updateMatrixWorld(true);
      this.items.push({holder:socket,anchor,logicalGroups:['CROWN'],boneParented:true,axisCorrection:correction,asset:object});return socket;
    }
    async initialize(){
      const definitions=[
        {id:'crown',url:'/assets/boss_v10_25/accessories/crown.glb'},
        {id:'moon_choker',url:'/assets/boss_v10_25/accessories/moon_choker.glb',size:.29,anchor:['NeckTwist02','NeckTwist01'],offset:[0,.02,.02],rotation:[0,0,0]},
        {id:'high_collar_core',url:'/assets/boss_v10_25/accessories/nocturne_core.glb',size:.58,anchor:['Spine02','NeckTwist01'],offset:[0,.12,.12],rotation:[0,0,0],group:'HIGH_COLLAR',logicalGroups:['HIGH_COLLAR']},
        {id:'witch_cuff_left',url:'/assets/boss_v10_25/accessories/witch_cuff.glb',size:.115,anchor:['L_Forearm','L_Hand'],offset:[0,-.10,0],rotation:[0,0,Math.PI*.5]},
        {id:'witch_cuff_right',url:'/assets/boss_v10_25/accessories/witch_cuff.glb',size:.115,anchor:['R_Forearm','R_Hand'],offset:[0,-.10,0],rotation:[0,0,-Math.PI*.5]}
      ];
      this.items.push({name:'production_mantle',baked:true,logicalGroups:['MANTLE'],disposition:'SKINNED_PRODUCTION_BODY'});
      this.items.push({name:'production_nocturne_core',baked:true,logicalGroups:['NOCTURNE_CORE'],disposition:'SKINNED_PRODUCTION_BODY'});
      let cuffSource=null;
      for(const definition of definitions){
        try{
          let object;if(definition.id==='witch_cuff_right'&&cuffSource)object=cuffSource.clone(true);else{const gltf=await this.load(definition.url);object=gltf.scene||gltf.scenes?.[0];if(definition.id==='witch_cuff_left')cuffSource=object}
          if(definition.id==='crown')this.addCrown(object);else{this.prepare(object,definition.size,`V1025_${definition.id}`);const defaultGroup=definition.id.startsWith('witch_cuff')?'WITCH_CUFFS':definition.id.toUpperCase();this.addControlled(object,definition.anchor,definition.offset,definition.rotation,definition.id.toUpperCase(),definition.group||defaultGroup,definition.logicalGroups||[definition.group||defaultGroup])}
        }catch(error){this.items.push({name:definition.id,error:String(error?.message||error),disabled:true})}
      }
      this.ready=true;return this.summary();
    }
    update(){
      for(const item of this.items){if(item.disabled||item.baked)continue;if(item.boneParented){item.holder.updateMatrixWorld(true);continue}item.anchor.getWorldPosition(item.worldPosition);item.anchor.getWorldQuaternion(item.worldQuaternion);item.offsetWorld.copy(item.offset).applyQuaternion(item.worldQuaternion);item.holder.position.copy(item.worldPosition).add(item.offsetWorld);item.holder.quaternion.copy(item.worldQuaternion);item.holder.rotateX(item.rotation.x);item.holder.rotateY(item.rotation.y);item.holder.rotateZ(item.rotation.z)}
    }
    summary(){return {ready:this.ready,hierarchy:this.logicalHierarchy,attached:this.items.filter(item=>!item.disabled&&!item.baked).map(item=>({name:item.holder.name,logicalGroups:item.logicalGroups})),baked:this.items.filter(item=>item.baked).map(item=>({name:item.name,logicalGroups:item.logicalGroups,disposition:item.disposition})),fallbacks:this.items.filter(item=>item.disabled).map(item=>item.name)}}
  }

  class OneEyeMobVisuals{
    constructor(loader){this.loader=loader;this.source=null;this.ready=false;this.tmp=new THREE.Vector3();}
    load(url='/assets/boss_v10_25/mobs/one_eye_mob.glb'){return new Promise((resolve,reject)=>this.loader.load(`${url}?v=10.25-one-eye-fidelity-1`,gltf=>{this.source=gltf.scene||gltf.scenes?.[0];this.prepare(this.source);this.ready=true;resolve(this.source)},undefined,reject))}
    prepare(model){model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=new THREE.Vector3(),center=new THREE.Vector3();box.getSize(size);box.getCenter(center);const referenceLength=4.45*.38,scale=referenceLength/Math.max(.001,size.x,size.y,size.z);model.scale.multiplyScalar(scale);model.position.sub(center.multiplyScalar(scale));model.traverse(node=>{if(!node.isMesh)return;node.castShadow=false;node.receiveShadow=false;node.frustumCulled=false;for(const material of (Array.isArray(node.material)?node.material:[node.material])){if(!material)continue;if(material.map)material.map.encoding=THREE.sRGBEncoding;if(material.emissive){material.emissive.setHex(0x6e21a8);material.emissiveIntensity=.75}}})}
    install(meshes){if(!this.ready||!this.source)return;for(const root of meshes){if(root.userData.v1025Model)continue;const model=this.source.clone(true),materials=[];model.name='OneEyeMobSourceVisual';model.traverse(node=>{if(!node.isMesh)return;const source=Array.isArray(node.material)?node.material:[node.material],clones=source.map(material=>{const clone=material?.clone?.()||material;if(clone){clone.transparent=true;clone.dithering=true;clone.userData={...(clone.userData||{}),v1025BaseOpacity:clone.opacity??1};materials.push(clone)}return clone});node.material=Array.isArray(node.material)?clones:clones[0]});root.add(model);root.userData.v1025Model=model;root.userData.v1025Materials=materials;if(root.userData.core)root.userData.core.visible=false}}
    update(root,data,now,target,authoritativeNow=Date.now()){
      if(!root||!data)return;const state=data.state||'IDLE_HOVER',phase=Number(data.seed)||data.id||0,pulse=.5+.5*Math.sin(now*.007+phase),charge=state==='CHARGE'?1:state==='GAZE_BEAM'?.92:state==='VOID_BOLT'?.65:state==='LUNGE'?.85:.25,stateStart=Number(data.stateStartedAt)||authoritativeNow,stateEnd=Math.max(stateStart+1,Number(data.stateUntil)||stateStart+1),stateProgress=Math.max(0,Math.min(1,(authoritativeNow-stateStart)/(stateEnd-stateStart))),dissolve=state==='DEATH'||state==='DESPAWN'?1-stateProgress:1;
      root.rotation.x=state==='LUNGE'?-.22:state==='POSITION'?.08:state==='DEATH'?.18*stateProgress:0;root.rotation.z=state==='STAGGER'?Math.sin(now*.085)*.16*(1-stateProgress):.045*Math.sin(now*.0015+phase);root.rotation.y=Math.sin(now*.0008+phase)*.18;
      if(target){const dx=target.x-root.position.x,dz=target.z-root.position.z;root.rotation.y=Math.atan2(dx,dz)}
      const spawnProgress=Math.max(0,Math.min(1,(authoritativeNow-(Number(data.spawnAt)||stateStart))/Math.max(1,(Number(data.stateUntil)||authoritativeNow)-(Number(data.spawnAt)||stateStart)))),baseScale=state==='SPAWN'?.55+.45*spawnProgress:state==='DEATH'?1-.25*stateProgress:state==='DESPAWN'?.75*(1-stateProgress):1+.045*pulse+.06*charge;root.scale.setScalar(Math.max(.02,baseScale));
      for(const material of root.userData.v1025Materials||[]){material.opacity=(material.userData?.v1025BaseOpacity??1)*dissolve;if(material.emissiveIntensity!=null)material.emissiveIntensity=(.55+1.25*charge)*dissolve}
      if(root.userData.core?.material){const mat=root.userData.core.material;if(mat.opacity!=null)mat.opacity=.9*dissolve;if(mat.emissiveIntensity!=null)mat.emissiveIntensity=(.65+1.1*charge)*dissolve}
      if(root.userData.eye){root.userData.eye.scale.setScalar(Math.max(.02,(1+.35*charge+.12*pulse)*dissolve));const mat=root.userData.eye.material;if(mat?.emissiveIntensity!=null)mat.emissiveIntensity=(.8+2.4*charge)*dissolve;if(mat?.opacity!=null)mat.opacity=dissolve}
      if(root.userData.ring){root.userData.ring.visible=dissolve>.02;const mat=root.userData.ring.material||root.userData.ring.children?.find?.(child=>child.material)?.material;if(mat?.opacity!=null)mat.opacity=(.28+.46*charge)*dissolve}
      if(root.userData.trail){root.userData.trail.visible=state==='LUNGE';root.userData.trail.material.opacity=state==='LUNGE'?.34+.30*pulse:0;root.userData.trail.scale.z=.72+.55*pulse}
      const sway=state==='STAGGER'?.46:state==='LUNGE'?.34:.22;for(let i=0;i<(root.userData.tentacles||[]).length;i++){const tentacle=root.userData.tentacles[i];tentacle.rotation.z=Math.sin(now*.0022+phase+i*.9)*sway;tentacle.rotation.x=Math.cos(now*.0017+i)*.12+(state==='DEATH'?stateProgress*.34:0);tentacle.scale.setScalar(Math.max(.04,dissolve))}
    }
  }

  class BossImpactStack{
    constructor(scene){this.scene=scene;this.pool=[];this.decals=[];this.phantoms=[];this.lightPool=[];for(let i=0;i<12;i++)this.pool.push(this.makeImpact(i));for(let i=0;i<4;i++){const light=new THREE.PointLight(0x9d5fff,0,7);scene.add(light);this.lightPool.push({light,until:0,start:0})}}
    detach(object){if(!object)return;if(typeof object.removeFromParent==='function')object.removeFromParent();else object.parent?.remove?.(object)}
    makeImpact(index){
      const group=new THREE.Group();group.visible=false;group.name=`V1025Impact_${index}`;
      const ring=new THREE.Mesh(new THREE.RingGeometry(.42,.50,40),new THREE.MeshBasicMaterial({color:0xc9a8ff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));ring.rotation.x=-Math.PI/2;
      const core=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
      const debris=new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.09,0),new THREE.MeshStandardMaterial({color:0x6b4a82,roughness:.9,transparent:true,opacity:0}),10);debris.frustumCulled=false;group.add(ring,core,debris);this.scene.add(group);return {group,ring,core,debris,start:0,until:0,tier:'normal',dummy:new THREE.Object3D()}
    }
    spawn(position,tier='normal',color=0xc9a8ff){
      const now=performance.now(),entry=this.pool.find(item=>!item.group.visible)||this.pool.reduce((a,b)=>a.until<b.until?a:b),duration=tier==='critical'?950:tier==='heavy'?760:tier==='normal'?560:380;entry.start=now;entry.until=now+duration;entry.tier=tier;entry.group.visible=true;entry.group.position.copy(position);entry.ring.material.color.setHex(color);entry.core.material.color.setHex(tier==='critical'?0xffffff:color);entry.debris.material.opacity=.82;entry.debris.count=tier==='quick'?4:tier==='normal'?6:10;
      const lightEntry=this.lightPool.find(item=>now>=item.until)||this.lightPool[0];lightEntry.start=now;lightEntry.until=now+Math.min(320,duration*.45);lightEntry.light.position.copy(position).add(new THREE.Vector3(0,.7,0));lightEntry.light.color.setHex(color);return entry;
    }
    spawnPhantoms(position,count=4,duration=1700){const now=performance.now();for(let i=0;i<count;i++){const ghost=new THREE.Mesh(new THREE.ConeGeometry(.48,2.5,10),new THREE.MeshBasicMaterial({color:0x8450c7,transparent:true,opacity:.20,depthWrite:false,blending:THREE.AdditiveBlending}));const angle=i/count*Math.PI*2;ghost.position.copy(position).add(new THREE.Vector3(Math.cos(angle)*2.3,1.25,Math.sin(angle)*2.3));ghost.userData={start:now,until:now+duration};this.scene.add(ghost);this.phantoms.push(ghost)}}
    clearPhantoms(){for(const ghost of this.phantoms){this.detach(ghost);ghost.geometry.dispose();ghost.material.dispose()}this.phantoms=[]}
    update(now=performance.now()){
      for(const entry of this.pool){if(!entry.group.visible)continue;if(now>=entry.until){entry.group.visible=false;continue}const p=Math.max(0,Math.min(1,(now-entry.start)/(entry.until-entry.start))),ease=1-Math.pow(1-p,3),power=entry.tier==='critical'?2.4:entry.tier==='heavy'?1.8:1.2;entry.ring.scale.setScalar(.35+power*ease);entry.ring.material.opacity=(.72-(entry.tier==='quick'?.18:0))*(1-p);entry.core.scale.setScalar(.5+2.6*ease);entry.core.material.opacity=(1-p)*Math.max(0,1-p*2.1);entry.debris.material.opacity=.72*(1-p);for(let i=0;i<entry.debris.count;i++){const angle=i/entry.debris.count*Math.PI*2+(i%2)*.3,radius=ease*(.6+power*.7);entry.dummy.position.set(Math.cos(angle)*radius,.12+Math.sin(p*Math.PI)*(i%3)*.24,Math.sin(angle)*radius);entry.dummy.rotation.set(p*5+i,p*7,p*3+i);entry.dummy.scale.setScalar(1-p*.65);entry.dummy.updateMatrix();entry.debris.setMatrixAt(i,entry.dummy.matrix)}entry.debris.instanceMatrix.needsUpdate=true}
      for(const entry of this.lightPool){if(now>=entry.until){entry.light.intensity=0;continue}const p=(now-entry.start)/(entry.until-entry.start);entry.light.intensity=Math.sin(Math.min(1,p)*Math.PI)*7}
      for(const ghost of this.phantoms){const p=(now-ghost.userData.start)/(ghost.userData.until-ghost.userData.start);if(p>=1){this.detach(ghost);ghost.geometry.dispose();ghost.material.dispose()}else{ghost.material.opacity=.20*(1-p);ghost.scale.setScalar(1+.22*p)}}this.phantoms=this.phantoms.filter(ghost=>ghost.parent)
    }
    dispose(){for(const entry of this.pool){this.detach(entry.group);entry.ring.geometry.dispose();entry.ring.material.dispose();entry.core.geometry.dispose();entry.core.material.dispose();entry.debris.geometry.dispose();entry.debris.material.dispose()}for(const entry of this.lightPool)this.detach(entry.light);this.clearPhantoms()}
  }

  function debugState(rec,snapshot,library,assembler){
    const action=rec?.active,clip=action?.getClip?.(),duration=clip?.duration||1,cast=snapshot?.cast,boss=snapshot?.boss||{};
    const distances=Object.values(snapshot?.players||{}).filter(player=>player&&!player.down).map(player=>Math.hypot((player.x||0)-(boss.x||0),(player.z||0)-(boss.z||0)));
    return {version:VERSION,bossState:boss.currentAction||rec?.activeState||'',phase:boss.phase||0,sourceAnimation:cast?.sourceAnimation||clip?.userData?.sourceClip||clip?.name||'',retargetedAnimation:clip?.userData?.logicalId||'',animationVariant:cast?.animationVariant||clip?.userData?.variant||'BASE',normalizedTime:Number(((action?.time||0)/duration).toFixed(3)),blendState:rec?.activeState||'',comboFamily:snapshot?.combo?.name||'',comboNode:snapshot?.combo?.node||'',branch:snapshot?.combo?.branch||'',playerDistance:distances.length?Number(Math.min(...distances).toFixed(3)):null,dodgeMemory:boss.aiMemory?.lastDodgeDirection||'none',poise:boss.poise,weakPoint:{orb:boss.orbWeakUntil,back:boss.backWeakUntil,upper:boss.upperWeakUntil},orbState:boss.orb?.state||'',haloState:boss.halo?.state||'',mobStates:(snapshot?.summons||[]).map(m=>({id:m.id,state:m.state})),aiCandidateWeights:boss.aiMemory?.candidateWeights||[],selectedAction:boss.aiMemory?.selectedAction||'',activeHitbox:cast?.actionCategory==='MELEE'&&Date.now()>=cast.impactAt-100&&Date.now()<=cast.impactAt+100?cast.actionId:'',activeTelegraphs:(snapshot?.arenaHazards||[]).map(h=>h.type),rootMotionXZRemoved:clip?.userData?.rootMotionXZRemoved===true,upperBodyLayer:cast?.upperBody?'MAGIC':'NONE',lowerBodyLayer:cast?.upperBody?'COMBAT_LOCOMOTION':'FULL_BODY',poseModifier:cast?.aim?'ADDITIVE_AIM':'PHASE_STANCE',animationLibrary:library?.summary?.()||null,assembly:assembler?.summary?.()||null};
  }

  global.PrincessRescueV1025={version:VERSION,ROLE_ALIASES,ANIMATION_VARIANT_PROFILES,findSemantic,BossRetargeter,BossAnimationVariantGenerator,BossAnimationLibrary,BossAssetAssembler,OneEyeMobVisuals,BossImpactStack,debugState};
})(window);
