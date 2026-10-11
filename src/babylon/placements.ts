/** Scene placement adapted from Dungeon Forge, © 2026 Majid Manzarpour (MIT).
 * This module is plain data: no DOM, engine, or platform dependency.
 */
import { FLOOR, WALL, POOL, TINT, THEMES, makeRng } from '../core/generator.js';
import type { DungeonData } from '../core/types';

export interface Placement {
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  ry: number; color: number; delay: number;
}
export interface ScenePlan {
  batches: Record<string, Placement[]>;
  floorHeat: number[];
}
export function mix(a: number, b: number, t: number): number {
  return [16, 8, 0].reduce((n, s) => n | Math.round(((a >> s) & 255) * (1-t) + ((b >> s) & 255) * t) << s, 0);
}
export function shade(c: number, factor: number): number {
  return [16, 8, 0].reduce((n, s) => n | Math.min(255, Math.max(0, Math.round(((c >> s) & 255)*factor))) << s, 0);
}
export function planScene(d: DungeonData): ScenePlan {
  const th = THEMES[d.params.themeKey], rng = makeRng(d.seed ^ 0x9e3779b9);
  const batches: Record<string, Placement[]> = {}, floorHeat: number[] = [];
  const wx = (x: number) => x-d.W/2+.5, wz = (y: number) => y-d.H/2+.5;
  const add = (key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, color: number, delay: number) => {
    (batches[key] ??= []).push({x,y,z,sx,sy,sz,ry,color,delay});
  };
  const nearBfs = (x: number, y: number) => {
    let min = Infinity;
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
      const nx=x+dx, ny=y+dy;
      if(nx>=0 && nx<d.W && ny>=0 && ny<d.H && d.bfs[ny*d.W+nx]>=0) min=Math.min(min,d.bfs[ny*d.W+nx]);
    }
    return Number.isFinite(min) ? min : 0;
  };
  const moss = new Set(d.props.filter(p=>p.kind==='moss').map(p=>p.y*d.W+p.x));
  for(let y=0;y<d.H;y++) for(let x=0;x<d.W;x++) {
    const i=y*d.W+x, X=wx(x), Z=wz(y);
    if(d.grid[i]===FLOOR && !d.lakeMask[i]) {
      let neighbors=0;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        if(!dx&&!dy) continue;
        const nx=x+dx,ny=y+dy;
        if(nx<0 || ny<0 || nx>=d.W || ny>=d.H || d.grid[ny*d.W+nx]===WALL) neighbors++;
      }
      const room=d.rooms[d.roomId[i]], diff=room?.difficulty ?? d.bfs[i]/Math.max(1,d.maxBfs);
      let color=d.corridor[i] ? th.corridor : th.floor;
      if(room && room.type!=='combat') color=mix(color,TINT[room.type],.17);
      if(d.doorway[i]) color=shade(color,1.14);
      if(moss.has(i)) color=mix(color,0x4c7a42,.32);
      if(th.pools?.mode===0 && [i-1,i+1,i-d.W,i+d.W].some(n=>d.grid[n]===POOL)) color=mix(color,0xff7a33,.3);
      color=shade(color,(1-.11*Math.min(neighbors,4))*(((x+y)&1)?.965:1)*rng.f(.94,1.06));
      add('floor',X,rng.f(-.02,.008),Z,1,1,1,0,color,Math.max(0,d.bfs[i])*.016);
      floorHeat.push(shade(mix(0x2f4bb0,0xe8502f,Math.min(1,diff)),.55+.45*(1-.09*Math.min(neighbors,4))));
    } else if(d.grid[i]===WALL) {
      const h=2+rng.f(-.25,.25), delay=nearBfs(x,y)*.016+.3;
      add('wall',X,0,Z,1,h,1,0,shade(th.wall,rng.f(.9,1.08)),delay);
      add('wallCap',X,h,Z,1,1,1,0,shade(th.cap,rng.f(.92,1.1)),delay+.12);
    }
  }
  for(const p of d.props) {
    const X=wx(p.x),Z=wz(p.y),delay=nearBfs(p.x,p.y)*.016+.62;
    const put=(key:string,color:number,s=p.scale,y=0,rot=p.rot) => add(key,X,y,Z,s,s,s,rot,color,delay);
    switch(p.kind) {
      case 'pillar': put('pillar',th.pillar,p.scale*1.15,0,rng.i(0,3)*Math.PI/2); break;
      case 'debris': put(['debrisA','debrisB','debrisC'][p.v??0],mix(th.debris[0],th.debris[1],rng.raw())); break;
      case 'chest': put('chest',0x8a5a2c); put('chestTrim',0xc8a24a); put('chestGlow',0xffd27a); break;
      case 'shrineCrystal':
        put('plinth',mix(th.pillar,0xffffff,.12),1);
        put('crystal',0x8fbcff,1.05,1.4);
        for(let k=0;k<4;k++) {
          const a=k*Math.PI/2+Math.PI/4,cx=X+Math.cos(a)*.36,cz=Z+Math.sin(a)*.36;
          add('candle',cx,.5,cz,.8,.8,.8,0,0xd8cba8,delay);
          add('flameCore',cx,.65,cz,.5,.5,.5,0,th.flameCore,delay+.2);
        }
        break;
      case 'ring':
        put('platform',mix(th.floor,0xffffff,.1),1,-.02,0);
        put('ring',0x3fd0bb,1,.16,0);
        for(const dx of [-1.45,1.45]) add('pillar',X+dx,.1,Z,.72,.72,.72,0,th.pillar,delay+.15);
        break;
      case 'bossCrystal':
        put('bossGlow',0xff4636,1.15);
        add('bossGlow',X+.55,0,Z-.42,.6,.75,.6,p.rot+1.2,0xff6a45,delay+.12);
        for(const [dx,dz,s] of [[-.62,.42,.75],[.75,.55,.55],[-.5,-.62,.5]]) add('bossRock',X+dx,0,Z+dz,s,s,s,p.rot+2.1,0x4a3336,delay+.2);
        break;
      case 'brazier':
        put('brazier',0x3a3f4a,1,0,rng.f(0,6.28)); put('coals',0xff7a30,1);
        put('flame',th.flame,1.35,.62,0); put('flameCore',th.flameCore,1.3,.66,0); break;
      case 'grave': put('grave',mix(th.wall,0xffffff,.15)); break;
      case 'sarco': put('sarco',mix(th.pillar,0xffffff,.08),1); break;
      case 'candle': put('candle',0xd8cba8); put('flameCore',th.flameCore,.55,.19*p.scale,0); break;
      case 'icicle': add('icicle',X+(p.dx??0)*.42,1.75,Z+(p.dy??0)*.42,p.scale,p.scale,p.scale,p.rot,0xbfe2ff,delay); break;
      case 'shardIce': put('shardIce',0xcfeaff,p.scale,-.1); break;
      case 'roots': put('roots',0x5a4632,p.scale,0,Math.atan2(p.dx??0,p.dy??0)); break;
      case 'moss': put('moss',mix(0x3f6b3a,0x5a8a4a,rng.raw())); break;
      case 'crack': add('crackD',X-(p.dx??0)*.5,.015,Z-(p.dy??0)*.5,p.scale,p.scale,p.scale,p.rot,p.ice?0x9fd8ff:th.pools?.mode===3?0x86c05a:0xff6a28,delay); break;
      case 'bones': put('bone',0xcfc4a4); break;
      case 'banner': {
        const dx=p.dx??0,dz=p.dy??0,rot=Math.atan2(dx,dz);
        add('bannerRod',X+dx*.54,1.98,Z+dz*.54,1,1,1,rot,0x6a5a3a,delay);
        add('bannerCloth',X+dx*.57,1.96,Z+dz*.57,1,1,1,rot,th.cloth,delay);
        add('emblem',X+dx*.6,1.6,Z+dz*.6,1,1,1,rot,parseInt(th.accent.slice(1),16),delay); break;
      }
    }
  }
  for(const t of d.torches) {
    const X=wx(t.x)+t.dx*.5,Z=wz(t.y)+t.dy*.5,delay=nearBfs(t.x,t.y)*.016+.66;
    add('torchArm',X,1.02,Z,1,1,1,Math.atan2(t.dx,t.dy),0x4a4038,delay);
    add('flame',X+t.dx*.16,1.5,Z+t.dy*.16,1.2,1.2,1.2,0,th.flame,delay+.08);
    add('flameCore',X+t.dx*.16,1.53,Z+t.dy*.16,1.2,1.2,1.2,0,th.flameCore,delay+.08);
  }
  for(const p of d.spawns) {
    const X=wx(p.x),Z=wz(p.y),delay=nearBfs(p.x,p.y)*.016+.72,rot=rng.f(0,6.28),tier=Math.min(3,Math.max(1,p.tier));
    add(`spawn${tier}`,X,0,Z,1,1,1,rot,[0,0x5f4b45,0x5a4348,0x4c4258][tier],delay);
    const s=tier===1?.7:1;
    add(tier===3?'band3':'band2',X,tier===1?.14:tier===2?.55:.62,Z,s,s,s,rot,tier===3?0x9b6cf0:0xd8433a,delay+.1);
    if(tier===3) add('crystal',X,1.98,Z,.42,.42,.42,rot,0xb794ff,delay+.2);
  }
  for(const a of d.arches) {
    const X=wx(a.x),Z=wz(a.y),half=a.len/2+.15,delay=nearBfs(Math.round(a.x),Math.round(a.y))*.016+.7,color=mix(th.wall,0xffffff,.12);
    for(const sign of [-1,1]) add('arch',X+sign*a.px*half,0,Z+sign*a.py*half,1,1,1,0,color,delay);
    add('archL',X,1.62,Z,a.len+.42,1,1,a.px===1?0:Math.PI/2,color,delay+.1);
  }
  for(const p of d.pools) {
    const X=wx(p.x),Z=wz(p.y),delay=nearBfs(p.x,p.y)*.016+.5;
    add('basin',X,0,Z,1,1,1,0,shade(th.wall,.65),delay);
    add('skirt',X,.008,Z,rng.f(.85,1.25),1,rng.f(.85,1.25),rng.f(0,6.28),th.pools?.colB??0x11463c,delay+.15);
  }
  return {batches,floorHeat};
}
