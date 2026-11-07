export const monthIndex = state => state.date.year*12+state.date.month-1;
export function recordExport(state,resourceId,units,value) {
  if(!Array.isArray(state.exportVisuals))state.exportVisuals=[];
  const month=monthIndex(state),countryId=state.playerCountryId;
  let entry=state.exportVisuals.find(e=>e.month===month&&e.countryId===countryId&&e.resourceId===resourceId);
  if(!entry){entry={month,countryId,resourceId,units:0,value:0};state.exportVisuals.push(entry);}
  entry.units+=units;entry.value+=value;
  state.exportVisuals=state.exportVisuals.filter(e=>e.month>=month-24);
}
export function takeMonthlyExports(state) {
  if(!Array.isArray(state.exportVisuals))return [];
  const month=monthIndex(state),ready=state.exportVisuals.filter(e=>e.month<month&&Number.isFinite(e.units)&&e.units>0&&Number.isFinite(e.value)&&e.value>=0);
  state.exportVisuals=state.exportVisuals.filter(e=>e.month>=month);return ready;
}
export function exportVisualCount(entries,cap=30) { return Math.min(cap,Math.ceil(entries.reduce((sum,e)=>sum+e.units,0)/10)); }
export function nearestSea(grid,point) {
  let best=-1,distance=Infinity;
  for(let i=0;i<grid.water.length;i++)if(grid.water[i]==='1'){
    const p=seaPoint(grid,i),dx=Math.min(Math.abs(p[0]-point[0]),360-Math.abs(p[0]-point[0]));
    const d=(dx*Math.cos(point[1]*Math.PI/180))**2+(p[1]-point[1])**2;
    if(d<distance){distance=d;best=i;}
  }return best;
}
export function seaPoint(grid,i) { return [grid.origin[0]+(i%grid.width)*grid.step,grid.origin[1]+Math.floor(i/grid.width)*grid.step]; }
export function seaRoute(grid,from,to) {
  if(from===to)return [seaPoint(grid,from),seaPoint(grid,to)];
  const previous=new Int32Array(grid.water.length).fill(-1),queue=[from];previous[from]=from;
  for(let k=0;k<queue.length&&previous[to]<0;k++){
    const i=queue[k],x=i%grid.width,y=Math.floor(i/grid.width),mask=parseInt(grid.links[i],16),neighbors=[];
    for(const[bit,dx,dy]of[[1,1,0],[2,0,1],[4,-1,0],[8,0,-1]])if(mask&bit)neighbors.push((y+dy)*grid.width+(x+dx+grid.width)%grid.width);
    for(const c of grid.channels){if(c.from===i)neighbors.push(c.to);if(c.to===i)neighbors.push(c.from);}
    for(const j of neighbors)if(previous[j]<0){previous[j]=i;queue.push(j);}
  }
  if(previous[to]<0)return [];
  const nodes=[to];while(nodes.at(-1)!==from)nodes.push(previous[nodes.at(-1)]);nodes.reverse();
  const points=[seaPoint(grid,from)];
  for(let i=1;i<nodes.length;i++){
    const channel=grid.channels.find(c=>c.from===nodes[i-1]&&c.to===nodes[i]||c.to===nodes[i-1]&&c.from===nodes[i]);
    if(channel)points.push(...(channel.from===nodes[i-1]?channel.points:[...channel.points].reverse()));
    points.push(seaPoint(grid,nodes[i]));
  }return points;
}
const unwrap = points => { const out=[];for(const [lon,lat] of points){let x=lon;if(out.length){while(x-out.at(-1)[0]>180)x-=360;while(x-out.at(-1)[0]<-180)x+=360;}out.push([x,lat]);}return out; };
export function curvedSeaPath(points) {
  const p=unwrap(points);if(p.length<3)return p;
  const out=[p[0]];
  for(let i=1;i<p.length-1;i++){
    const a=p[i-1],b=p[i],c=p[i+1],start=[b[0]*.8+a[0]*.2,b[1]*.8+a[1]*.2],end=[b[0]*.8+c[0]*.2,b[1]*.8+c[1]*.2];out.push(start);
    for(let t=.25;t<=1;t+=.25)out.push([(1-t)**2*start[0]+2*(1-t)*t*b[0]+t*t*end[0],(1-t)**2*start[1]+2*(1-t)*t*b[1]+t*t*end[1]]);
  }out.push(p.at(-1));return out;
}
export function flightPath(from,to) {
  const [a,b]=unwrap([from,to]),out=[];
  for(let i=0;i<=32;i++){const t=i/32;out.push([a[0]+(b[0]-a[0])*t,Math.min(78,a[1]+(b[1]-a[1])*t+Math.sin(t*Math.PI)*12)]);}return out;
}
export function pathSampler(points) {
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  return fraction=>{const target=Math.max(0,Math.min(1,fraction))*lengths.at(-1);let low=1,high=points.length-1;while(low<high){const mid=(low+high)>>1;if(lengths[mid]<target)low=mid+1;else high=mid;}const i=low,t=(target-lengths[i-1])/(lengths[i]-lengths[i-1]||1);return [points[i-1][0]+(points[i][0]-points[i-1][0])*t,points[i-1][1]+(points[i][1]-points[i-1][1])*t];};
}
