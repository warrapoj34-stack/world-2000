import { geoEquirectangular, geoPath, geoGraticule10 } from '../../lib/d3-7.9.0.js';
import { bindMapControls } from './controls.js';

export function createWorldMap(canvas, world, { onSelect, onZoom, onViewChange = () => {} }) {
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
    return {
      country, path: new Path2D(path(country)), bounds: path.bounds(country),
      label: path.centroid(largest), area: path.area(largest), labelBounds: path.bounds(largest),
    };
  });
  const graticule = new Path2D(path(geoGraticule10()));
  let width = 0, height = 0, ratio = 1, fit = 1;
  let transform = { x: 0, y: 0, k: 1 };
  let selected = null;
  let player = null;
  let frame = 0;
  let resourceColor = null;
  let quality = 'high';
  let relief = null;
  let wavePattern = null;

  function createSurface() {
    const w = quality === 'high' ? 1350 : 540;
    const h = w / 2;
    relief = document.createElement('canvas');
    relief.width = w; relief.height = h;
    const surface = relief.getContext('2d');
    const pixels = surface.createImageData(w, h);
    let seed = 2000;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let y = 0; y < h; y++) {
      const latitude = Math.abs(y / h * 180 - 90);
      const base = latitude > 76 ? [205, 211, 207] : latitude > 62 ? [139, 145, 126] : latitude < 48 ? [91, 123, 79] : [121, 126, 94];
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const n = (random() - .5) * (quality === 'high' ? 25 : 10);
        const ridge = Math.sin(x * .018 + Math.sin(y * .037) * 2.2) * Math.cos(y * .061 + x * .004) * (latitude < 65 ? 12 : 5);
        pixels.data[i] = base[0] + n + ridge; pixels.data[i + 1] = base[1] + n + ridge; pixels.data[i + 2] = base[2] + n + ridge; pixels.data[i + 3] = 255;
      }
    }
    surface.putImageData(pixels, 0, 0);
    const waves = document.createElement('canvas'); waves.width = 512; waves.height = 256;
    const wc = waves.getContext('2d'); const image = wc.createImageData(512, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4; const v = 110 + Math.sin(x * .035 + Math.sin(y * .08) * 2) * 20 + Math.cos(y * .07 - x * .012) * 10;
      image.data[i] = v * .55; image.data[i + 1] = v * .8; image.data[i + 2] = v; image.data[i + 3] = 255;
    }
    wc.putImageData(image, 0, 0); wavePattern = context.createPattern(waves, 'repeat');
  }
  createSurface();

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
    context.drawImage(relief, 0, 0, map.width, map.height);
    context.lineWidth = 0.45 / k;
    context.strokeStyle = '#a8d1df22';
    context.stroke(graticule);
    const visible = shapes.filter(shape => {
      const [[x0, y0], [x1, y1]] = shape.bounds;
      return x1 * k + x >= 0 && x0 * k + x <= width && y1 * k + y >= 0 && y0 * k + y <= height;
    });
    context.lineJoin = 'round';
    for (const shape of visible) {
      context.save();
      context.shadowColor = '#020b16aa'; context.shadowBlur = (quality === 'high' ? 4 : 1.5) / k;
      context.lineWidth = (quality === 'high' ? 2 : 1) / k; context.strokeStyle = '#07152299'; context.stroke(shape.path);
      context.shadowColor = '#70c6e277'; context.shadowBlur = (quality === 'high' ? 13 : 4) / k;
      context.lineWidth = (quality === 'high' ? 9 : 3) / k; context.strokeStyle = '#5eb7d544'; context.stroke(shape.path);
      context.shadowBlur = 0; context.fillStyle = '#154b6b88'; context.fill(shape.path);
      context.globalAlpha = resourceColor ? .9 : .56;
      context.fillStyle = resourceColor ? resourceColor(shape.country) : shape.country.properties.color;
      context.fill(shape.path); context.globalAlpha = 1;
      context.lineWidth = .8 / k; context.strokeStyle = '#d0d6bd99'; context.stroke(shape.path);
      context.restore();
    }
    if (selected) {
      context.fillStyle = map.highlightColor;
      context.globalAlpha = resourceColor ? 0 : 0.52;
      context.fill(selected.path);
      context.globalAlpha = 1;
      context.strokeStyle = map.highlightColor;
      context.shadowColor = map.highlightColor; context.shadowBlur = (quality === 'high' ? 18 : 6) / k;
      context.lineWidth = 3.4 / k;
      context.stroke(selected.path);
    }
    if (player) {
      context.save();
      context.strokeStyle = '#91f2d0';
      context.shadowColor = '#5deec5';
      context.shadowBlur = 12 * ratio;
      context.lineWidth = 2.8 / k;
      context.stroke(player.path);
      context.restore();
    }
    context.save(); context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalAlpha = quality === 'high' ? .075 : .025;
    context.fillStyle = wavePattern; context.fillRect(0, 0, width, height); context.restore();

    // วาดชื่อด้วยขนาดคงที่และเว้นช่องว่างไม่ให้ทับกัน
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.font = '14px Tahoma, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#1c3039';
    const occupied = [];
    for (const shape of [...visible].sort((a, b) => b.area - a.area)) {
      if (shape.area * k * k < 2200) continue;
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
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const zoom = width ? transform.k / fit : 1;
    const center = width ? [(width / 2 - transform.x) / transform.k, (height / 2 - transform.y) / transform.k]
      : [map.width / 2, map.height / 2];
    width = rect.width;
    height = rect.height;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    fit = Math.min(width / map.width, height / map.height);
    const k = fit * zoom;
    update({ k, x: width / 2 - center[0] * k, y: height / 2 - center[1] * k });
  }
  function selectShape(shape) {
    selected = shape ?? null;
    onSelect(selected?.country ?? null);
    schedule();
  }
  function viewState() {
    return { zoom: Math.max(1, Math.min(12, transform.k / fit)),
      center: [(width / 2 - transform.x) / transform.k, (height / 2 - transform.y) / transform.k] };
  }
  const view = {
    setQuality: value => { quality = value === 'low' ? 'low' : 'high'; createSurface(); schedule(); },
    setResourceColors: resolver => { resourceColor = resolver; schedule(); },
    getViewState: viewState,
    setViewState: saved => {
      const k = fit * saved.zoom;
      update({ k, x: width / 2 - saved.center[0] * k, y: height / 2 - saved.center[1] * k });
    },
    setPlayerCountry: id => {
      player = shapes.find(shape => shape.country.id === id) ?? null;
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
      const mx = (x - transform.x) / transform.k, my = (y - transform.y) / transform.k;
      context.save();
      context.resetTransform();
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
      const [[x0, y0], [x1, y1]] = shape.bounds;
      const k = Math.max(fit, Math.min(fit * map.maxZoom, 0.65 * Math.min(width / (x1 - x0), height / (y1 - y0))));
      update({ k, x: width / 2 - (x0 + x1) * k / 2, y: height / 2 - (y0 + y1) * k / 2 });
    },
    resize,
  };
  const unbind = bindMapControls(canvas, view, map);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  return { ...view, destroy: () => { unbind(); observer.disconnect(); cancelAnimationFrame(frame); } };
}
