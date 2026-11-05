export function bindMapControls(canvas, view, { tapThreshold }) {
  const pointers = new Map();
  let multiTouch = false;
  let pinch = null;

  const point = event => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return {
      center: [(a.x + b.x) / 2, (a.y + b.y) / 2],
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  };
  function resetPinch() {
    pinch = pointers.size >= 2 ? { ...pinchState(), transform: view.getTransform() } : null;
  }
  function track(pointer, x, y) {
    pointer.distance = Math.max(pointer.distance, Math.hypot(x - pointer.startX, y - pointer.startY));
  }
  function onDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (!pointers.size) multiTouch = false;
    const [x, y] = point(event);
    pointers.set(event.pointerId, { x, y, startX: x, startY: y, distance: 0, dragging: false });
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size > 1) multiTouch = true;
    resetPinch();
  }
  function onMove(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const [x, y] = point(event);
    track(pointer, x, y);
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    pointer.x = x;
    pointer.y = y;
    if (pinch) {
      const state = pinchState();
      view.pinch(pinch.transform, pinch.center, state.center, state.distance / pinch.distance);
    } else if (multiTouch || pointer.distance >= tapThreshold) {
      // นับระยะจากจุดเริ่มก่อนเลื่อนครั้งแรก
      view.pan(pointer.dragging || multiTouch ? dx : x - pointer.startX,
        pointer.dragging || multiTouch ? dy : y - pointer.startY);
      pointer.dragging = true;
    }
    canvas.classList.toggle('is-dragging', multiTouch || pointer.dragging);
  }
  function finish(event, cancelled = false) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const [x, y] = point(event);
    track(pointer, x, y);
    const isTap = !cancelled && !multiTouch && pointers.size === 1 && pointer.distance < tapThreshold;
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    resetPinch();
    if (!pointers.size) canvas.classList.remove('is-dragging');
    if (isTap) view.selectAt(x, y);
  }
  function onWheel(event) {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
    view.zoomBy(Math.exp(-delta * 0.003), point(event));
  }
  function onKey(event) {
    const actions = {
      ArrowLeft: () => view.pan(60, 0), ArrowRight: () => view.pan(-60, 0),
      ArrowUp: () => view.pan(0, 60), ArrowDown: () => view.pan(0, -60),
      '+': () => view.zoomBy(1.4), '=': () => view.zoomBy(1.4),
      '-': () => view.zoomBy(1 / 1.4), Home: () => view.reset(),
      Escape: () => view.selectAt(-1, -1),
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  }
  const onUp = event => finish(event);
  const onCancel = event => finish(event, true);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('lostpointercapture', onCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKey);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('lostpointercapture', onCancel);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('keydown', onKey);
  };
}
