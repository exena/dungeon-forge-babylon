/** Babylon equivalents of the upstream procedural liquid/ambient effects. MIT. */
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { Scene } from '@babylonjs/core/scene';
import type { DungeonData, Point2, ThemeSpec } from '../core/types';
import { makeRng, FLOOR } from '../core/generator.js';
import { createGlowTexture, createRuneTexture, createSwirlTexture } from './kit';

export const rgb = (value: number) => Color3.FromInts((value>>16)&255,(value>>8)&255,value&255);
const liquidVertex = `precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec2 vCoord;
void main(){vCoord=position.xz;gl_Position=worldViewProjection*vec4(position,1.0);}`;
const liquidFragment = `precision highp float;
varying vec2 vCoord;
uniform float time; uniform float mode; uniform float ramp; uniform float glow;
uniform vec3 colorA; uniform vec3 colorB;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
float speed=mode==1.0?0.0:time*.22;
float n=noise(vCoord*2.8+vec2(speed,-speed*.4))*.65+noise(vCoord*7.0-speed)*.35;
float ripples=sin(vCoord.x*6.0+vCoord.y*3.0+speed*5.0)*.07;
float cracks=pow(1.0-abs(n*2.0-1.0),8.0);
float t=mode==0.0?cracks:smoothstep(.2,.85,n+ripples);
vec3 col=mix(colorA,colorB,t)*(mode==0.0?glow:1.0);
gl_FragColor=vec4(col,ramp);
}`;

export interface DungeonEffects {
  liquids: Mesh[];
  particles: ParticleSystem;
  spinners: Mesh[];
  update(time: number, ramp: number): void;
  setParticlesVisible(visible: boolean): void;
}

export function createEffects(scene: Scene, d: DungeonData, th: ThemeSpec): DungeonEffects {
  const liquids: Mesh[]=[];
  const liquidMats: ShaderMaterial[]=[];
  const wx=(x:number)=>x-d.W/2+.5,wz=(y:number)=>y-d.H/2+.5;
  const liquid=(cells: Point2[],y:number,mode:number) => {
    if(!cells.length || !th.pools) return;
    const mesh=new Mesh('liquid',scene),positions:number[]=[],indices:number[]=[];
    for(const p of cells) {
      const x=wx(p.x),z=wz(p.y),i=positions.length/3;
      positions.push(x-.49,y,z-.49,x+.49,y,z-.49,x+.49,y,z+.49,x-.49,y,z+.49);
      indices.push(i,i+2,i+1,i,i+3,i+2);
    }
    const data=new VertexData();data.positions=positions;data.indices=indices;data.applyToMesh(mesh);
    const mat=new ShaderMaterial('liquidShader',scene,{vertexSource:liquidVertex,fragmentSource:liquidFragment},
      {attributes:['position'],uniforms:['worldViewProjection','time','mode','ramp','glow','colorA','colorB'],needAlphaBlending:true});
    mat.backFaceCulling=false;mat.setColor3('colorA',rgb(th.pools.colA));mat.setColor3('colorB',rgb(th.pools.colB));
    mat.setFloat('mode',mode);mat.setFloat('glow',th.pools.glow);mat.setFloat('time',0);mat.setFloat('ramp',1);
    mesh.material=mat;mesh.isPickable=false;liquids.push(mesh);liquidMats.push(mat);
  };
  liquid(d.pools,-.08,th.pools?.mode??0);liquid(d.lakeCells,-.12,1);

  const spinners:Mesh[]=[];
  const disc=(name:string,roomIndex:number,size:number,color:number,rune:boolean) => {
    const room=d.rooms[roomIndex],mesh=MeshBuilder.CreateGround(name,{width:size,height:size},scene);
    mesh.position.set(wx(room.cx),.06,wz(room.cy));mesh.isPickable=false;
    const mat=new StandardMaterial(`${name}-material`,scene);mat.disableLighting=true;
    const texture=rune?createRuneTexture(scene):createSwirlTexture(scene);
    mat.emissiveColor=rgb(color);mat.diffuseTexture=texture;mat.opacityTexture=texture;
    mat.useAlphaFromDiffuseTexture=true;mat.backFaceCulling=false;mat.alpha=.85;mesh.material=mat;
    spinners.push(mesh);
  };
  disc('entrance-portal',d.entrance,2.5,0x3fd0bb,false);
  disc('boss-runes',d.boss,4.6,0xff5040,true);

  // Particle sources follow each theme, rather than filling void space.
  const rng=makeRng(d.seed^0x123abc),sources:Vector3[]=[];
  if(th.particles.kind===1) {
    for(const p of d.pools) sources.push(new Vector3(wx(p.x),0,wz(p.y)));
    for(const t of d.torches) sources.push(new Vector3(wx(t.x)+t.dx*.66,1.5,wz(t.y)+t.dy*.66));
  } else if(th.particles.kind===3 || th.particles.kind===4) {
    const kinds=th.particles.kind===3?['grave','sarco','candle','bones']:['moss','roots'];
    for(const p of d.props) if(kinds.includes(p.kind)) sources.push(new Vector3(wx(p.x),.2,wz(p.y)));
  }
  if(!sources.length) for(let i=0;i<d.grid.length;i++) if(d.grid[i]===FLOOR && rng.chance(.12)) sources.push(new Vector3(wx(i%d.W),0,wz(Math.floor(i/d.W))));
  if(!sources.length) {
    const entrance=d.rooms[d.entrance];sources.push(new Vector3(wx(entrance.cx),0,wz(entrance.cy)));
  }
  const spec=th.particles,particles=new ParticleSystem('ambient',spec.n,scene);
  particles.particleTexture=createGlowTexture(scene);particles.emitter=Vector3.Zero();
  const color=rgb(spec.color);
  particles.color1=new Color4(color.r,color.g,color.b,.7);particles.color2=new Color4(color.r,color.g,color.b,.25);
  particles.colorDead=new Color4(color.r,color.g,color.b,0);
  particles.minSize=.025;particles.maxSize=spec.kind===2?.13:.08;
  particles.minLifeTime=3;particles.maxLifeTime=7;particles.emitRate=spec.n/4;
  particles.minEmitPower=.12;particles.maxEmitPower=.4;particles.updateSpeed=.012;
  particles.blendMode=ParticleSystem.BLENDMODE_ADD;
  particles.startPositionFunction=(_world,position) => {
    const src=sources[rng.i(0,sources.length-1)];
    position.copyFrom(src);position.x+=rng.f(-.4,.4);position.z+=rng.f(-.4,.4);
    position.y+=spec.kind===2?rng.f(3,8):rng.f(0,.7);
  };
  particles.startDirectionFunction=(_world,direction)=>direction.set(rng.f(-.2,.2),spec.kind===2?-.55:.3,rng.f(-.2,.2));
  particles.start();
  let particlesVisible=true;
  return {
    liquids,particles,spinners,
    setParticlesVisible(visible){particlesVisible=visible; if(!visible) particles.reset();},
    update(time,ramp){
      for(const mat of liquidMats){mat.setFloat('time',time);mat.setFloat('ramp',ramp);}
      spinners.forEach((m,i)=>{m.rotation.y=time*(i===0?.55:-.16);if(m.material)m.material.alpha=.85*ramp;});
      particles.emitRate=particlesVisible?spec.n/4*ramp:0;
    },
  };
}
