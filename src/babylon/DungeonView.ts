/** Independent Babylon.js presentation of Dungeon Forge (upstream MIT).
 * Owns its engine, scene, input, effects and lifecycle; never imports a host app.
 */
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import './registrations';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { THEMES, TINT, delaunay } from '../core/generator.js';
import type { DungeonData, ThemeSpec } from '../core/types';
import { createGeometryKit, createStoneTexture, createCrackTexture, createGlowTexture } from './kit';
import { createEffects, rgb, type DungeonEffects } from './effects';
import { planScene, type Placement } from './placements';
import { groundPanDelta } from './cameraInput';

export type Layer = 'props' | 'torches' | 'particles' | 'liquids' | 'lights';
export interface RenderStats { fps: number; drawCalls: number; triangles: number; lights: number }
interface ViewOptions { onFrame?: (stats: RenderStats) => void; onStage?: (stage: number) => void }
const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const glowing=new Set(['flame','flameCore','chestGlow','emblem','band2','band3','crystal','ring','coals','bossGlow']);
const metal=new Set(['torchArm','chestTrim','bannerRod','brazier']);
const torchKeys=new Set(['torchArm','flame','flameCore','brazier','coals']);
const structural=new Set(['floor','wall','wallCap']);

class Batch {
  readonly matrixData: Float32Array;
  readonly colors: Float32Array;
  readonly baseColors: Float32Array;
  readonly dynamic: boolean;
  private settled=false;
  private scale=Vector3.One();
  private position=Vector3.Zero();
  private rotation=Quaternion.Identity();
  private matrix=Matrix.Identity();
  constructor(readonly key:string, readonly mesh:Mesh, readonly items:Placement[]) {
    this.dynamic=key==='flame'||key==='flameCore'||key==='crystal';
    this.matrixData=new Float32Array(items.length*16);this.colors=new Float32Array(items.length*4);
    items.forEach((p,i)=>{const c=rgb(p.color);this.colors.set([c.r,c.g,c.b,1],i*4);});
    this.baseColors=this.colors.slice();
    this.write(Infinity,0,true);
    mesh.thinInstanceSetBuffer('matrix',this.matrixData,16,false);
    mesh.thinInstanceSetBuffer('color',this.colors,4,false);
    mesh.thinInstanceRefreshBoundingInfo();
    mesh.setEnabled(true);mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;
  }
  write(revealTime:number,clock:number,initial=false) {
    if(this.settled&&!this.dynamic&&!initial) return;
    let complete=true;
    this.items.forEach((p,i)=>{
      const progress=clamp((revealTime-p.delay)/.4),ease=1-Math.pow(1-progress,3);
      if(progress<1) complete=false;
      const size=Math.max(.0001,ease),flame=this.key==='flame'||this.key==='flameCore';
      this.scale.set(p.sx*size,p.sy*size*(flame?1+.14*Math.sin(clock*8+i*2.4):1),p.sz*size);
      this.position.set(p.x,p.y+(this.key==='crystal'?.06*Math.sin(clock*1.8+i):0),p.z);
      Quaternion.RotationYawPitchRollToRef(p.ry+(this.key==='crystal'?clock*.3:0),0,0,this.rotation);
      Matrix.ComposeToRef(this.scale,this.rotation,this.position,this.matrix);
      this.matrix.copyToArray(this.matrixData,i*16);
    });
    this.settled=complete;
    if(!initial)this.mesh.thinInstanceBufferUpdated('matrix');
  }
  restart(){this.settled=false;this.write(-100,0);}
  heatmap(colors:number[]|null){
    if(colors) colors.forEach((c,i)=>{const v=rgb(c);this.colors.set([v.r,v.g,v.b,1],i*4);});
    else this.colors.set(this.baseColors);
    this.mesh.thinInstanceBufferUpdated('color');
  }
}

interface SceneState {
  scene:Scene;camera:ArcRotateCamera;instrumentation:SceneInstrumentation;
  batches:Batch[];floorHeat:number[];effects:DungeonEffects;
  lights:PointLight[];pipeline:DefaultRenderingPipeline|null;
  graph:LinesMesh[];rects:LinesMesh;rectLines:Vector3[][];
  d:DungeonData;end:number;half:number;
}

/** Construct once, build repeatedly, and dispose on unmount. */
export class DungeonView {
  readonly engine:Engine;
  private state:SceneState|null=null;
  private abort=new AbortController();
  private elapsed=0;
  private reveal=Infinity;
  private lastStats=0;
  private lastStage=-1;
  private postFX=true;
  private graphVisible=false;
  private heatmap=false;
  private layers:Record<Layer,boolean>={props:true,torches:true,particles:true,liquids:true,lights:true};
  private disposed=false;
  constructor(private canvas:HTMLCanvasElement,private options:ViewOptions={}) {
    this.engine=new Engine(canvas,true,{stencil:true,preserveDrawingBuffer:false,doNotHandleContextLost:false},false);
    this.engine.setHardwareScalingLevel(1/Math.min(window.devicePixelRatio||1,1.6));
    canvas.style.touchAction='none';this.bindInput();
    this.engine.runRenderLoop(()=>this.frame());
  }
  build(d:DungeonData,animate:boolean){
    if(this.disposed)throw new Error('DungeonView has been disposed.');
    // Construct off to the side: an exception does not dispose the last good level.
    const scene=new Scene(this.engine);
    let next:SceneState;
    try { next=this.createScene(scene,d); } catch(error){scene.dispose();throw error;}
    const previous=this.state;this.state=next;
    this.reveal=animate?0:Infinity;this.lastStage=-1;
    if(animate)for(const batch of next.batches)batch.restart();
    this.applyLayers();this.setHeatmap(this.heatmap);this.updateOverlay();
    if(previous){previous.instrumentation.dispose();previous.pipeline?.dispose();previous.scene.dispose();}
    this.stage(animate?0:6);this.resize();
  }
  private createScene(scene:Scene,d:DungeonData):SceneState {
    const th=THEMES[d.params.themeKey],previous=this.state;
    scene.clearColor=Color4.FromColor3(rgb(th.bg));scene.fogMode=Scene.FOGMODE_EXP2;scene.fogColor=rgb(th.fog);scene.fogDensity=th.fogD;
    scene.skipPointerMovePicking=true;
    const camera=new ArcRotateCamera('camera',previous?.camera.alpha??-Math.PI/4,previous?.camera.beta??.93,220,Vector3.Zero(),scene);
    camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.1;camera.maxZ=1000;
    scene.activeCamera=camera;
    const hemi=new HemisphericLight('fill',Vector3.Up(),scene);
    hemi.diffuse=Color3.Lerp(rgb(th.hemi[0]),Color3.White(),.5);hemi.groundColor=rgb(th.hemi[1]);hemi.intensity=.9;
    const sun=new DirectionalLight('sun',new Vector3(-.6,-1,-.4),scene);
    sun.position.set(60,110,45);sun.diffuse=rgb(th.dir[0]);sun.intensity=th.dir[1]*1.5;
    // Use the complete map extent throughout the reveal animation.
    sun.shadowFrustumSize=Math.max(d.W,d.H)*1.6;
    sun.shadowMinZ=1;sun.shadowMaxZ=400;sun.autoCalcShadowZBounds=false;
    const shadows=new ShadowGenerator(2048,sun);
    shadows.bias=.0003;shadows.normalBias=.03;shadows.setDarkness(.35);
    shadows.usePercentageCloserFiltering=true;
    const stone=new StandardMaterial('stone',scene);stone.specularColor=new Color3(.06,.06,.06);
    // Eight total lights fit WebGL2's minimum vertex UBO budget, including the
    // material/scene blocks. Keep six accent lights plus sun and hemisphere.
    stone.diffuseTexture=createStoneTexture(scene);stone.maxSimultaneousLights=8;
    const trim=new StandardMaterial('metal',scene);trim.specularColor=new Color3(.25,.25,.25);trim.maxSimultaneousLights=8;
    const glow=new StandardMaterial('emissive',scene);glow.disableLighting=true;glow.emissiveColor=Color3.White();
    const decal=new StandardMaterial('cracks',scene);decal.disableLighting=true;decal.emissiveColor=Color3.White();
    decal.diffuseTexture=createCrackTexture(scene);decal.opacityTexture=decal.diffuseTexture;
    decal.useAlphaFromDiffuseTexture=true;decal.backFaceCulling=false;decal.zOffset=-1;
    const skirt=new StandardMaterial('ground-glow',scene);skirt.disableLighting=true;skirt.emissiveColor=Color3.White();
    skirt.diffuseTexture=createGlowTexture(scene);skirt.opacityTexture=skirt.diffuseTexture;
    skirt.useAlphaFromDiffuseTexture=true;skirt.backFaceCulling=false;skirt.zOffset=-1;
    const cloth=stone.clone('banner-cloth');cloth.backFaceCulling=false;
    const kit=createGeometryKit(scene),plan=planScene(d),batches:Batch[]=[];
    for(const [key,items] of Object.entries(plan.batches)) {
      if(!items.length)continue;
      const mesh=kit[key];if(!mesh)throw new Error(`Missing geometry prototype: ${key}`);
      mesh.material=key==='crackD'?decal:key==='skirt'?skirt:key==='bannerCloth'?cloth:glowing.has(key)?glow:metal.has(key)?trim:stone;
      mesh.receiveShadows=!glowing.has(key);
      batches.push(new Batch(key,mesh,items));
      if(!glowing.has(key)&&key!=='floor'&&key!=='crackD'&&key!=='skirt')shadows.addShadowCaster(mesh);
    }
    for(const [key,mesh] of Object.entries(kit))if(!plan.batches[key])mesh.dispose();
    const effects=createEffects(scene,d,th);
    const lights=this.createLights(scene,d,th);
    const instrumentation=new SceneInstrumentation(scene);
    const graph=this.createGraph(scene,d);
    const rectLines=this.roomRects(d,1);
    const rects=MeshBuilder.CreateLineSystem('room-outlines',{lines:rectLines,updatable:true},scene);
    rects.color=new Color3(.5,.65,.75);rects.isPickable=false;
    const result:SceneState={scene,camera,instrumentation,batches,floorHeat:plan.floorHeat,effects,lights,pipeline:null,graph,rects,rectLines,d,end:2.3+d.maxBfs*.016+2,half:Math.max(d.W,d.H)*.58};
    if(this.postFX)result.pipeline=this.createPipeline(scene,camera);
    return result;
  }
  private createLights(scene:Scene,d:DungeonData,th:ThemeSpec):PointLight[]{
    const specs:Array<{x:number;y:number;color:number;intensity:number;range:number}>=[];
    for(const [index,color,intensity,range] of [[d.entrance,0x3fd0bb,1,13],[d.boss,0xff4030,1.7,17]]) {
      const r=d.rooms[index];specs.push({x:r.cx,y:r.cy,color,intensity,range});
    }
    const shrine=d.rooms.find(r=>r.type==='shrine');if(shrine)specs.push({x:shrine.cx,y:shrine.cy,color:0x6f9dff,intensity:1,range:12});
    const chosen:typeof d.torches=[];
    if(d.torches.length)chosen.push(d.torches[0]);
    while(chosen.length<Math.min(6-specs.length,d.torches.length)) {
      let best=d.torches[0],distance=-1;
      for(const t of d.torches){const closest=Math.min(...chosen.map(c=>(c.x-t.x)**2+(c.y-t.y)**2));if(closest>distance){best=t;distance=closest;}}
      chosen.push(best);
    }
    for(const t of chosen)specs.push({x:t.x+t.dx*.6,y:t.y+t.dy*.6,color:th.torchLight[0],intensity:th.torchLight[1],range:th.torchLight[2]});
    return specs.map((s,i)=>{
      const light=new PointLight(`accent-${i}`,new Vector3(s.x-d.W/2+.5,1.8,s.y-d.H/2+.5),scene);
      light.diffuse=rgb(s.color);light.intensity=s.intensity*.65;light.range=s.range;
      light.metadata={base:light.intensity};return light;
    });
  }
  private createPipeline(scene:Scene,camera:Camera){
    const pipeline=new DefaultRenderingPipeline('dungeon-post',true,scene,[camera]);
    pipeline.fxaaEnabled=true;pipeline.bloomEnabled=true;pipeline.bloomThreshold=.85;pipeline.bloomWeight=.25;pipeline.bloomKernel=48;pipeline.bloomScale=.5;
    pipeline.imageProcessingEnabled=true;
    const image=scene.imageProcessingConfiguration;
    image.toneMappingEnabled=true;image.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
    image.exposure=1.5;image.contrast=1.08;image.vignetteEnabled=true;image.vignetteWeight=1.1;
    pipeline.grainEnabled=true;pipeline.grain.intensity=3;pipeline.grain.animated=true;
    return pipeline;
  }
  private createGraph(scene:Scene,d:DungeonData):LinesMesh[]{
    const sets=[
      {name:'delaunay',color:0x6a7385,pairs:delaunay(d.rooms.map(r=>({x:r.cx,y:r.cy}))).map(([a,b])=>({a,b}))},
      {name:'mst',color:0xdfe4f0,pairs:d.edges.filter(e=>!e.isLoop)},
      {name:'loops',color:0x39d5e0,pairs:d.edges.filter(e=>e.isLoop)},
      {name:'critical',color:0xff4d4d,pairs:d.edges.filter(e=>e.isCritical)},
    ];
    const meshes:LinesMesh[]=[];
    for(const [index,s] of sets.entries()){
      if(!s.pairs.length)continue;
      const lines=s.pairs.map(e=>[e.a,e.b].map(id=>new Vector3(d.rooms[id].cx-d.W/2+.5,3+index*.05,d.rooms[id].cy-d.H/2+.5)));
      const mesh=MeshBuilder.CreateLineSystem(s.name,{lines},scene);mesh.color=rgb(s.color);mesh.isPickable=false;
      mesh.metadata={stage:index===0?2:3,opacity:index===0?.25:.8};meshes.push(mesh);
    }
    return meshes;
  }
  private roomRects(d:DungeonData,progress:number):Vector3[][]{
    const t=1-Math.pow(1-clamp(progress),3);
    return d.rooms.map(r=>{
      const x=r.sx0+(r.cx-r.sx0)*t-d.W/2+.5,z=r.sy0+(r.cy-r.sy0)*t-d.H/2+.5;
      return [new Vector3(x-r.w/2,.15,z-r.h/2),new Vector3(x+r.w/2,.15,z-r.h/2),new Vector3(x+r.w/2,.15,z+r.h/2),new Vector3(x-r.w/2,.15,z+r.h/2),new Vector3(x-r.w/2,.15,z-r.h/2)];
    });
  }
  private updateOverlay(){
    const s=this.state;if(!s)return;
    const active=Number.isFinite(this.reveal),t=this.reveal;
    s.rects.setEnabled(this.graphVisible||(active&&t<3.2));
    if(active&&t<=1.05){s.rectLines=this.roomRects(s.d,t/.95);MeshBuilder.CreateLineSystem('room-outlines',{lines:s.rectLines,instance:s.rects});}
    else if(s.rects.isEnabled()){s.rectLines=this.roomRects(s.d,1);MeshBuilder.CreateLineSystem('room-outlines',{lines:s.rectLines,instance:s.rects});}
    s.rects.alpha=this.graphVisible?.35:.9*(1-clamp((t-2.5)/.7));
    for(const line of s.graph){
      const start=line.metadata.stage===2?.95:1.55;
      line.setEnabled(this.graphVisible||(active&&t>=start&&t<4.1));
      line.alpha=line.metadata.opacity*(active?clamp((t-start)/.6):1)*(this.graphVisible?1:1-clamp((t-3.2)/.9));
    }
  }
  private stage(value:number){if(value!==this.lastStage){this.lastStage=value;this.options.onStage?.(value);}}
  private frame(){
    const s=this.state;if(!s||this.disposed)return;
    const dt=Math.min(this.engine.getDeltaTime()/1000,.05);this.elapsed+=dt;
    if(Number.isFinite(this.reveal)){
      this.reveal+=dt;
      const bounds=[0,.3,.95,1.55,2.3,2.3+(s.end-2.3)*.55];
      this.stage(bounds.reduce((stage,start,i)=>this.reveal>=start?i:stage,0));
      if(this.reveal>=s.end){this.reveal=Infinity;this.stage(6);}
      this.updateOverlay();
    }
    for(const batch of s.batches)batch.write(this.reveal-2.3,this.elapsed);
    const ramp=clamp((this.reveal-2.7)/Math.max(.9,s.end*.8-2.7));
    s.effects.update(this.elapsed,ramp);
    s.lights.forEach((l,i)=>l.intensity=l.metadata.base*ramp*(1+.06*Math.sin(this.elapsed*3+i*1.7)));
    s.scene.render();
    if(this.elapsed-this.lastStats>.25){
      this.lastStats=this.elapsed;
      this.options.onFrame?.({fps:this.engine.getFps(),drawCalls:s.instrumentation.drawCallsCounter.current,triangles:Math.round(s.scene.getActiveIndices()/3),lights:this.layers.lights?s.lights.length:0});
    }
  }
  private applyLayers(){
    const s=this.state;if(!s)return;
    for(const b of s.batches)b.mesh.setEnabled(structural.has(b.key)||this.layers[torchKeys.has(b.key)?'torches':'props']);
    for(const mesh of s.effects.liquids)mesh.setEnabled(this.layers.liquids);
    for(const mesh of s.effects.spinners)mesh.setEnabled(this.layers.props);
    s.effects.setParticlesVisible(this.layers.particles);
    for(const light of s.lights)light.setEnabled(this.layers.lights);
  }
  setLayerVisible(layer:Layer,visible:boolean){this.layers[layer]=visible;this.applyLayers();}
  setGraphVisible(visible:boolean){this.graphVisible=visible;this.updateOverlay();}
  setHeatmap(visible:boolean){this.heatmap=visible;const s=this.state;s?.batches.find(b=>b.key==='floor')?.heatmap(visible?s.floorHeat:null);}
  setPostFX(visible:boolean){
    this.postFX=visible;const s=this.state;if(!s)return;
    if(visible&&!s.pipeline)s.pipeline=this.createPipeline(s.scene,s.camera);
    else if(!visible&&s.pipeline){
      s.pipeline.dispose();s.pipeline=null;
      const image=s.scene.imageProcessingConfiguration;
      image.vignetteEnabled=false;image.toneMappingEnabled=false;
      image.exposure=1;image.contrast=1;image.applyByPostProcess=false;
    }
  }
  skipAnimation(){this.reveal=Infinity;if(this.state)for(const b of this.state.batches)b.write(Infinity,this.elapsed);this.stage(6);this.updateOverlay();}
  resize(){
    this.engine.resize();const s=this.state;if(!s)return;
    const aspect=this.engine.getRenderWidth()/Math.max(1,this.engine.getRenderHeight());
    const half=s.half*(aspect<1?1/aspect:1);
    s.camera.orthoLeft=-half*aspect;s.camera.orthoRight=half*aspect;s.camera.orthoTop=half;s.camera.orthoBottom=-half;
  }
  private bindInput(){
    const {signal}=this.abort;
    let drag:{id:number;x:number;y:number;orbit:boolean}|null=null;
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
    this.canvas.addEventListener('pointerdown',e=>{
      if(drag||![0,2].includes(e.button))return;
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,orbit:e.button===2||e.shiftKey};
      this.canvas.setPointerCapture(e.pointerId);e.preventDefault();
    },{signal});
    this.canvas.addEventListener('pointermove',e=>{
      const s=this.state;if(!drag||drag.id!==e.pointerId||!s)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
      if(drag.orbit){s.camera.alpha-=dx*.006;s.camera.beta=clamp(s.camera.beta+dy*.006,.2,1.45);}
      else {
        const unit=(s.camera.orthoTop??s.half)*2/Math.max(1,this.canvas.clientHeight),a=s.camera.alpha;
        s.camera.target.addInPlace(groundPanDelta(dx,dy,a,s.camera.beta,unit));
      }
    },{signal});
    const end=(e:PointerEvent)=>{if(drag?.id===e.pointerId){drag=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);}};
    this.canvas.addEventListener('pointerup',end,{signal});this.canvas.addEventListener('pointercancel',end,{signal});
    this.canvas.addEventListener('lostpointercapture',()=>{drag=null;},{signal});
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();const s=this.state;if(s){s.half=clamp(s.half*Math.exp(clamp(e.deltaY,-150,150)*.0015),4,240);this.resize();}},{signal,passive:false});
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.abort.abort();this.engine.stopRenderLoop();
    if(this.state){this.state.instrumentation.dispose();this.state.pipeline?.dispose();this.state.scene.dispose();this.state=null;}
    this.engine.dispose();
  }
}
