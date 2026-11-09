import { defaultQuality, powerSaving } from '../ui/performance.js';
import { geoEquirectangular, geoPath, geoGraticule10, rgb } from '../../lib/d3-7.9.0.js';
import { bindMapControls } from './controls.js';

export function createWorldMap(canvas, world, { onSelect, onZoom, onViewChange = () => {}, onPlayerPosition = () => {}, onProvinceSelect = () => {}, onProvinceMarkerPosition = () => {}, onWarOverlay = () => {} }) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('เบราว์เซอร์นี้ไม่รองรับแผนที่ Canvas');
  const { map } = world.settings;
  const projection = geoEquirectangular().scale(map.width / (2 * Math.PI))
    .translate([map.width / 2, map.height / 2]).precision(0.2);
  const path = geoPath(projection);
  const shapes = world.countries.map(country => {
    const polygons = country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;
    const largest = polygons.map(coordinates => ({ type: 'Polygon', coordinates }))
      .sort((a, b) => path.area(b) - path.area(a))[0];
    const color=rgb(country.properties.color);const gray=(color.r+color.g+color.b)/3;
    color.r=color.r*.75+gray*.25;color.g=color.g*.75+gray*.25;color.b=color.b*.75+gray*.25;
    return {
      muted:color.formatRgb(), country, path: new Path2D(path(country)), bounds: path.bounds(country),
      label: path.centroid(largest), area: path.area(largest), labelBounds: path.bounds(largest),
    };
  });
  const graticule = new Path2D(path(geoGraticule10()));
  let width = 0, height = 0, ratio = 1, fit = 1;
  let transform = { x: 0, y: 0, k: 1 };
  let selected = null;
  let provinceMarker=null;
  let provinceShapes=[],provinceMesh=null,selectedProvince=null;
  let ownerOf=p=>p.owner,ownerColor=()=>null,provinceCountry=()=>null,ownerRevision=-1,provinceAlert=null;
  let warModels=[];
  const warView=()=>({x:transform.x,y:transform.y,k:transform.k,width,height,zoom:transform.k/fit});
  function updateWarOverlay(){
    const byId=new Map(provinceShapes.map(p=>[p.feature.id,p]));
    const wars=warModels.map(w=>{const target=byId.get(w.target),sources=w.from.map(id=>byId.get(id)).filter(Boolean);let arrow=null;
      if(target&&sources.length){sources.sort((a,b)=>Math.hypot(a.label[0]-target.label[0],a.label[1]-target.label[1])-Math.hypot(b.label[0]-target.label[0],b.label[1]-target.label[1]));arrow=[sources[0].label,target.label];}
      return {id:w.id,path:w.fronts.map(id=>byId.get(id)?.pathString??'').join(''),arrow};
    });
    onWarOverlay({wars,view:warView()});
  }
  // รวมเส้นลงชั้นสีเดิม แท็บเล็ตจึงไม่ต้องวาดภาพเพิ่มระหว่างเลื่อน
  function paintProvinces(ctx,k){
    ctx.save();
    for(const shape of provinceShapes)if(ownerOf(shape.feature.properties)!==shape.feature.properties.owner){ctx.globalAlpha=.7;ctx.fillStyle=ownerColor(ownerOf(shape.feature.properties))??'#b59f83';ctx.fill(shape.path);}
    ctx.globalAlpha=1;
    ctx.strokeStyle='#102d40b3';ctx.lineWidth=Math.max(.3,.7/k);
    if(provinceMesh)ctx.stroke(provinceMesh);else for(const p of provinceShapes)ctx.stroke(p.path);
    if(selectedProvince){ctx.globalAlpha=.3;ctx.fillStyle='#ffe498';ctx.fill(selectedProvince.path);ctx.globalAlpha=1;ctx.strokeStyle='#fff2a8';ctx.lineWidth=2/k;ctx.stroke(selectedProvince.path);}
    ctx.restore();
  }
  let player = null;
  let frame = 0;
  let resourceColor = null;
  let visualHitTest = null;
  let quality = defaultQuality;
  let terrain = null;
  let countryLayer=null,provinceLayerKey='';
  function landLayer(){
    const show=provinceShapes.length>0&&player&&transform.k/fit>=3;
    const key=show?`${selectedProvince?.feature.id??''}:${Math.round(Math.log2(transform.k)*2)}`:'hidden';
    if(countryLayer&&provinceLayerKey===key)return countryLayer;
    const layer=document.createElement('canvas');layer.width=2048;layer.height=1024;const ctx=layer.getContext('2d');
    ctx.scale(layer.width/map.width,layer.height/map.height);
    for(const shape of shapes){ctx.globalAlpha=.6;ctx.fillStyle=resourceColor?resourceColor(shape.country):shape.muted;ctx.fill(shape.path);ctx.globalAlpha=1;ctx.lineWidth=.7;ctx.strokeStyle='#d0d6bd99';ctx.stroke(shape.path);}
    if(show)paintProvinces(ctx,transform.k);
    provinceLayerKey=key;countryLayer=layer;return layer;
  }
  let terrainSource = '';
  function loadTerrain() {
    const file = quality === 'high'&&!powerSaving() ? 'world-high.jpg' : 'world-low.jpg';
    if (terrainSource === file && terrain?.complete) { schedule(); return; }
    terrainSource = file;
    const image = new Image();
    image.onload = () => { if (terrainSource === file) { terrain = image; schedule(); } };
    image.onerror = () => { if (terrainSource === file) { terrain = null; schedule(); } };
    image.src = new URL(`../../assets/${file}`, import.meta.url);
  }
  loadTerrain();

  function constrain(next) {
    const k = Math.max(fit * map.minZoom, Math.min(fit * map.maxZoom, next.k));
    const axis = (position, viewport, size) => size * k <= viewport
      ? (viewport - size * k) / 2
      : Math.max(viewport - size * k, Math.min(0, position));
    return { k, x: axis(next.x, width, map.width), y: axis(next.y, height, map.height) };
  }
  function update(next) {
    transform = constrain(next);
    onZoom(transform.k / fit);
    onViewChange(viewState());
    schedule();
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function draw() {
    frame = 0;
    if (!width || !height) return;
    const { x, y, k } = transform;
    context.shadowBlur=0;context.filter='none';
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const ocean = context.createLinearGradient(0, 0, width * .7, height);
    ocean.addColorStop(0, '#123a63'); ocean.addColorStop(.55, '#0b2a4a'); ocean.addColorStop(1, '#123a63');
    context.fillStyle = ocean;
    context.fillRect(0, 0, width, height);
    const vignette = context.createRadialGradient(width * .5, height * .45, Math.min(width, height) * .12, width * .5, height * .45, Math.max(width, height) * .75);
    vignette.addColorStop(0, '#06111e00'); vignette.addColorStop(1, '#02081266');
    context.fillStyle = vignette; context.fillRect(0, 0, width, height);
    context.translate(x, y);
    context.scale(k, k);
    if (terrain?.complete && terrain.naturalWidth) context.drawImage(terrain, 0, 0, map.width, map.height);
    context.lineWidth = 0.45 / k;
    context.strokeStyle = '#a8d1df22';
    context.stroke(graticule);
    const visible = shapes.filter(shape => {
      const [[x0, y0], [x1, y1]] = shape.bounds;
      return x1 * k + x >= 0 && x0 * k + x <= width && y1 * k + y >= 0 && y0 * k + y <= height;
    });
    context.lineJoin = 'round';
    if(quality!=='high'||powerSaving())context.drawImage(landLayer(),0,0,map.width,map.height);
    else for (const shape of visible) {
      context.save();
      if(quality==='high'&&!powerSaving()){
      context.shadowColor = '#020b16aa'; context.shadowBlur = (quality === 'high' ? 4 : 1.5) / k;
      context.lineWidth = (quality === 'high' ? 2 : 1) / k; context.strokeStyle = '#07152299'; context.stroke(shape.path);
      context.shadowColor = '#70c6e277'; context.shadowBlur = (quality === 'high' ? 13 : 4) / k;
      context.lineWidth = (quality === 'high' ? 9 : 3) / k; context.strokeStyle = '#5eb7d544'; context.stroke(shape.path);
      }
      context.shadowBlur = 0;
      context.globalAlpha = .6;
      context.filter = 'none';
      context.fillStyle = resourceColor ? resourceColor(shape.country) : shape.muted;
      context.fill(shape.path); context.globalAlpha = 1;
      context.filter = 'none';
      context.lineWidth = .8 / k; context.strokeStyle = '#d0d6bd99'; context.stroke(shape.path);
      context.restore();
    }
    const showProvinces=provinceShapes.length>0&&k/fit>=3;
    if (selected) {
      context.fillStyle = map.highlightColor;
      context.globalAlpha = resourceColor||showProvinces ? 0 : 0.52;
      context.fill(selected.path);
      context.globalAlpha = 1;
      context.strokeStyle = map.highlightColor;
      context.shadowColor = map.highlightColor; context.shadowBlur = (quality === 'high'&&!powerSaving() ? 18 : 0) / k;
      context.lineWidth = 3.4 / k;
      context.stroke(selected.path);
    }
    if (player) {
      context.save();
      context.strokeStyle = '#91f2d0';
      context.shadowColor = '#5deec5';
      context.shadowBlur = quality==='high'&&!powerSaving()?12*ratio:0;
      context.lineWidth = 2.8 / k;
      context.stroke(player.path);
      context.restore();
    }
    if(canvas.dataset.provinceVisible!==String(showProvinces))canvas.dataset.provinceVisible=String(showProvinces);
    if(showProvinces&&player&&quality==='high'&&!powerSaving()){
      context.save();context.shadowBlur=0;context.filter='none';paintProvinces(context,k);context.restore();
    }
    // วาดชื่อด้วยขนาดคงที่และเว้นช่องว่างไม่ให้ทับกัน
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.shadowBlur=0;
    context.font = '14px Tahoma, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#1c3039';
    const occupied = [];
    for (const shape of [...visible].sort((a, b) => b.area - a.area)) {
      const labelThreshold = 15000 / Math.max(1, transform.k / fit);
      if (shape.area * k * k < labelThreshold) continue;
      const [lx, ly] = shape.label;
      const px = lx * k + x, py = ly * k + y;
      const text = shape.country.properties.nameTh;
      const textWidth = context.measureText(text).width;
      const labelWidth = (shape.labelBounds[1][0] - shape.labelBounds[0][0]) * k;
      if (textWidth > labelWidth * 0.9 || px < 0 || px > width || py < 0 || py > height) continue;
      const box = [px - textWidth / 2 - 5, py - 10, px + textWidth / 2 + 5, py + 10];
      if (occupied.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      occupied.push(box);
      context.fillStyle = resourceColor ? '#071c24' : '#1c3039';
      context.strokeStyle = '#ffffffbb'; context.lineWidth = 2;
      if (resourceColor) context.strokeText(text, px, py);
      context.fillText(text, px, py);
    }
    if(provinceMarker){
      const [mx,my]=projection(provinceMarker.point),px=mx*k+x,py=my*k+y;
      context.fillStyle='#ffd782';context.beginPath();context.arc(px,py,6,0,Math.PI*2);context.fill();
      context.font='bold 14px Tahoma, sans-serif';context.strokeStyle='#082331';context.lineWidth=3;context.strokeText(provinceMarker.name,px,py-16);context.fillText(provinceMarker.name,px,py-16);
    }
    if (player) {
      const [lx, ly] = player.label;
      onPlayerPosition({ x: lx * k + x, y: ly * k + y, visible: player.area * k * k < 1800 });
    } else onPlayerPosition(null);
    if(provinceAlert){const [mx,my]=provinceAlert.label,px=mx*k+x,py=my*k+y;onProvinceMarkerPosition({x:px,y:py,visible:px>=0&&px<=width&&py>=0&&py<=height});}
    else onProvinceMarkerPosition(null);
    if(warModels.length)onWarOverlay({view:warView()});
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const zoom = width ? transform.k / fit : 1;
    const center = width ? [(width / 2 - transform.x) / transform.k, (height / 2 - transform.y) / transform.k]
      : [map.width / 2, map.height / 2];
    width = rect.width;
    height = rect.height;
    const nextRatio=powerSaving()?1:Math.min(window.devicePixelRatio||1,quality==='high'?2:1.25);
    if(canvas.width===Math.round(width*nextRatio)&&canvas.height===Math.round(height*nextRatio))return;
    ratio=nextRatio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    fit = Math.min(width / map.width, height / map.height);
    const k = fit * zoom;
    update({ k, x: width / 2 - center[0] * k, y: height / 2 - center[1] * k });
  }
  function selectShape(shape) {
    selected = shape ?? null;provinceMarker=null;selectedProvince=null;countryLayer=null;onProvinceSelect(null);
    onSelect(selected?.country ?? null);
    schedule();
  }
  function viewState() {
    return { zoom: Math.max(1, Math.min(12, transform.k / fit)),
      center: [(width / 2 - transform.x) / transform.k, (height / 2 - transform.y) / transform.k] };
  }
  const view = {
    setProvinceFeatures: features=>{
      provinceShapes=features.map(f=>{const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;const largest=polygons.map(coordinates=>({type:'Polygon',coordinates})).sort((a,b)=>path.area(b)-path.area(a))[0],pathString=path(f);return {feature:f,pathString,path:new Path2D(pathString),bounds:path.bounds(f),label:path.centroid(largest)};});
      provinceMesh=new Path2D();
      if(typeof provinceMesh.addPath==='function')for(const p of provinceShapes)provinceMesh.addPath(p.path);else provinceMesh=null;
      selectedProvince=null;provinceMarker=null;countryLayer=null;canvas.dataset.provinceCount=String(features.length);onProvinceSelect(null);schedule();
    },
    setWarFronts:models=>{warModels=models;updateWarOverlay();schedule();},
    setProvinceOwners:(revision,resolve,color,country=()=>null)=>{ownerOf=resolve;ownerColor=color;provinceCountry=country;if(ownerRevision===revision)return;ownerRevision=revision;countryLayer=null;schedule();},
    setProvinceAlert:id=>{const shape=provinceShapes.find(p=>p.feature.id===id)??null;if(provinceAlert===shape)return;provinceAlert=shape;schedule();},
    focusProvince:id=>{const shape=provinceShapes.find(p=>p.feature.id===id);if(shape)view.focusPoint(projection.invert(shape.label),shape.feature.properties.nameTh,id);},
    focusPoint: (point,name,id) => {
      selectedProvince=provinceShapes.find(p=>p.feature.properties.id===id)??null;
      countryLayer=null;
      provinceMarker={point:[...point],name};const [px,py]=projection(point),k=fit*8;
      update({k,x:width/2-px*k,y:height/2-py*k});
    },
    setVisualHitTest: callback => { visualHitTest = callback; },
    setQuality: value => { quality = ['high','medium','low'].includes(value)?value:defaultQuality; loadTerrain(); resize(); schedule(); },
    setResourceColors: resolver => { resourceColor = resolver; countryLayer=null; schedule(); },
    getViewState: viewState,
    setViewState: saved => {
      const k = fit * saved.zoom;
      update({ k, x: width / 2 - saved.center[0] * k, y: height / 2 - saved.center[1] * k });
    },
    setPlayerCountry: id => {
      if(player?.country.id===id)return;
      player = shapes.find(shape => shape.country.id === id) ?? null;
      countryLayer=null;
      canvas.dataset.playerCountryId = player?.country.id ?? '';
      schedule();
    },
    getTransform: () => ({ ...transform }),
    pan: (dx, dy) => update({ ...transform, x: transform.x + dx, y: transform.y + dy }),
    pinch: (start, anchor, center, scale) => {
      const k = Math.max(fit * map.minZoom, Math.min(fit * map.maxZoom, start.k * scale));
      update({ k, x: center[0] - (anchor[0] - start.x) * k / start.k,
        y: center[1] - (anchor[1] - start.y) * k / start.k });
    },
    zoomBy: (factor, anchor = [width / 2, height / 2]) => view.pinch(transform, anchor, anchor, factor),
    reset: () => update({ k: fit, x: (width - map.width * fit) / 2, y: (height - map.height * fit) / 2 }),
    selectAt: (x, y) => {
      if (x < 0 || y < 0) { selectShape(null); return; }
      if (visualHitTest?.(x,y)) return;
      const mx = (x - transform.x) / transform.k, my = (y - transform.y) / transform.k;
      context.save();
      context.resetTransform();
      if(transform.k/fit>=3&&player){
        const province=provinceShapes.find(p=>mx>=p.bounds[0][0]&&mx<=p.bounds[1][0]&&my>=p.bounds[0][1]&&my<=p.bounds[1][1]&&context.isPointInPath(p.path,mx,my));
        if(province){
          selected=shapes.find(s=>s.country===provinceCountry(province.feature.properties))??player;onSelect(selected.country);selectedProvince=province;countryLayer=null;provinceMarker={point:projection.invert(province.label),name:province.feature.properties.nameTh};
          context.restore();schedule();onProvinceSelect(province.feature.properties);return;
        }
      }
      const shape = shapes.find(item => {
        const [[x0, y0], [x1, y1]] = item.bounds;
        return mx >= x0 && mx <= x1 && my >= y0 && my <= y1 && context.isPointInPath(item.path, mx, my);
      });
      context.restore();
      selectShape(shape);
    },
    selectCountry: id => {
      const shape = shapes.find(item => item.country.id === id);
      selectShape(shape);
      if (!shape) return;
      view.focusCountry(id);
    },
    focusCountry: id => {
      const shape = shapes.find(item => item.country.id === id);
      if (!shape) return;
      const [[x0, y0], [x1, y1]] = shape.bounds;
      const k = Math.max(fit, Math.min(fit * map.maxZoom, 0.65 * Math.min(width / (x1 - x0), height / (y1 - y0))));
      update({ k, x: width / 2 - (x0 + x1) * k / 2, y: height / 2 - (y0 + y1) * k / 2 });
    },
    resize,
  };
  const powerChanged=()=>{loadTerrain();resize();schedule();};
  document.addEventListener('power-saving-change',powerChanged);
  const unbind = bindMapControls(canvas, view, map);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  return { ...view, destroy: () => { document.removeEventListener('power-saving-change',powerChanged);unbind(); observer.disconnect(); cancelAnimationFrame(frame); } };
}
