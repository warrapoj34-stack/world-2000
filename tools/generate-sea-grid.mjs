import { readFile, writeFile } from 'node:fs/promises';
import { geoContains, geoBounds } from '../lib/d3-7.9.0.js';
import { prepareWorld } from '../js/data/world.js';
const read=async n=>JSON.parse(await readFile(new URL(`../data/${n}.json`,import.meta.url)));
const [topology,names,settings]=await Promise.all(['countries-50m','country-names-th','world-2000'].map(read));
const world=prepareWorld(topology,names,settings);
const polygons=world.countries.flatMap(c=>(c.geometry.type==='Polygon'?[c.geometry.coordinates]:c.geometry.coordinates).map(coordinates=>{const geometry={type:'Polygon',coordinates};return{geometry,bounds:geoBounds(geometry)};}));
const land=([x,y])=>polygons.some(({geometry,bounds:[[a,b],[c,d]]})=>y>=b&&y<=d&&(a<=c?x>=a&&x<=c:x>=a||x<=c)&&geoContains(geometry,[x,y]));
const width=180,height=80,step=2;
const point=i=>[-179+(i%width)*step,-79+Math.floor(i/width)*step];
const water=Array.from({length:width*height},(_,i)=>{const [x,y]=point(i);return ![[x,y],[x-.65,y-.65],[x+.65,y-.65],[x-.65,y+.65],[x+.65,y+.65]].some(land);});
const links=new Array(water.length).fill(0);
for(let i=0;i<water.length;i++)if(water[i])for(const [dx,dy,bit,reverse] of [[1,0,1,4],[0,1,2,8]]){
 const col=i%width,row=Math.floor(i/width),targetRow=row+dy;if(targetRow>=height)continue;
 const j=targetRow*width+(col+dx)%width;if(!water[j])continue;
 const p=point(i),q=point(j);let delta=q[0]-p[0];if(delta<-180)delta+=360;
 let clear=true;for(let t=1;t<8;t++){let x=p[0]+delta*t/8;if(x>180)x-=360;if(land([x,p[1]+(q[1]-p[1])*t/8])){clear=false;break;}}
 if(clear){links[i]|=bit;links[j]|=reverse;}
}
const nearest=([x,y])=>{let best=-1,d=Infinity;for(let i=0;i<water.length;i++)if(water[i]){const p=point(i),delta=Math.min(Math.abs(p[0]-x),360-Math.abs(p[0]-x));const distance=(delta*Math.cos(y*Math.PI/180))**2+(p[1]-y)**2;if(distance<d){d=distance;best=i;}}return best;};
const channels=[
 {name:'ยิบรอลตาร์',points:[[-8,35],[-6,35.8],[-5.5,35.95],[-4,36],[-1,37]]},
 {name:'สุเอซ',points:[[31,33],[32.3,31.4],[32.35,30.6],[32.55,29.8],[33.1,28.7],[34,27],[38,22]]},
 {name:'บับเอลมันเดบ',points:[[40,17],[42.8,12.7],[43.5,12.3],[46,11]]},
 {name:'ฮอร์มุซ',points:[[52,26],[56.5,26.6],[57,25.5],[58.5,24.5],[61,24],[62,22]]},
 {name:'มะละกา',points:[[95,7],[98,6],[99,4.5],[100.3,3.2],[101.6,2.5],[102.5,1.9],[103.5,1.2],[103.7,1.2],[103.85,1.19],[104.1,1.2],[104.4,1.3],[105,3]]},
 {name:'ช่องแคบเดนมาร์ก',points:[[14,55],[13.2,55.15],[12.7,55.5],[12.65,55.85],[12.6,56.1],[12.4,56.3],[11.4,57.6],[8,58]]},
 {name:'บอสฟอรัส',points:[[30,43],[29.1,41.2],[29,41],[28.8,40.7],[26.7,40.5],[26.2,40],[25.8,39.9],[25,38],[24,35]]},
 {name:'ปานามา',points:[[-80,11],[-79.9,9.4],[-79.7,9.1],[-79.6,8.9],[-80,7]]}
].map(channel=>({...channel,from:nearest(channel.points[0]),to:nearest(channel.points.at(-1))}));
const neighbors=i=>{const x=i%width,y=Math.floor(i/width),out=[];for(const[bit,dx,dy]of[[1,1,0],[2,0,1],[4,-1,0],[8,0,-1]])if(links[i]&bit)out.push((y+dy)*width+(x+dx+width)%width);for(const c of channels){if(c.from===i)out.push(c.to);if(c.to===i)out.push(c.from);}return out;};
const seen=new Set();let largest=[];for(let i=0;i<water.length;i++)if(water[i]&&!seen.has(i)){const queue=[i];seen.add(i);for(let k=0;k<queue.length;k++)for(const j of neighbors(queue[k]))if(!seen.has(j)){seen.add(j);queue.push(j);}if(queue.length>largest.length)largest=queue;}
const ocean=new Set(largest);for(let i=0;i<links.length;i++)if(!ocean.has(i)){water[i]=false;links[i]=0;}
await writeFile(new URL('../data/sea_grid.json',import.meta.url),JSON.stringify({width,height,step,origin:[-179,-79],water:water.map(v=>v?'1':'0').join(''),links:links.map(v=>v.toString(16)).join(''),channels:channels.filter(c=>ocean.has(c.from)&&ocean.has(c.to))}));
console.log(`Sea grid: ${ocean.size} ocean nodes, ${channels.length} approximate narrow passages`);


