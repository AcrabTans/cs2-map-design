export const EDITOR_SHAPES = {
  line: { name: '直线', steps: ['起点', '终点'] },
  rectangle: { name: '矩形', steps: ['第一个角', '对角'] },
  square: { name: '正方形', steps: ['第一个角', '对角方向与边长'] },
  triangle: { name: '正三角形', steps: ['中心', '顶点'] },
  hexagon: { name: '正六边形', steps: ['中心', '顶点'] },
  circle: { name: '圆', steps: ['圆心', '半径端点'] },
  semicircle: { name: '半圆', steps: ['圆心', '直径端点', '弧线朝向'] },
  ellipse: { name: '椭圆', steps: ['中心', '长轴端点', '短轴宽度'] },
};

export function editorShape(type, controls, closedArea) {
  const definition = Object.hasOwn(EDITOR_SHAPES, type) ? EDITOR_SHAPES[type] : null;
  if (!definition || controls.length !== definition.steps.length) return null;
  const [origin, end, side] = controls;
  const [x, y] = origin;
  let dx = end[0] - x, dy = end[1] - y;
  if (type === 'line') return Math.hypot(dx, dy) >= 1 ? { points: controls, controls, lines: [{ points: [origin, end], label: '长度' }], markers: [] } : null;
  if (type === 'rectangle' || type === 'square') {
    if (type === 'square') {
      const edge = Math.max(Math.abs(dx), Math.abs(dy));
      dx = (dx < 0 ? -1 : 1) * edge;
      dy = (dy < 0 ? -1 : 1) * edge;
    }
    if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return null;
    const corner = [x + dx, y + dy];
    const points = [origin, [x + dx, y], corner, [x, y + dy]];
    if (!closedArea) points.push(origin);
    const lines = [
      { points: [origin, points[1]], label: type === 'square' ? '边长' : '横宽' },
      { points: [points[1], corner], label: '纵高' },
    ];
    if (type === 'square') lines.pop();
    return { points, controls: [origin, corner], lines, markers: [{ point: [x + dx / 2, y + dy / 2], label: '中心' }] };
  }

  const radius = Math.hypot(dx, dy);
  if (radius < 1) return null;
  const ux = dx / radius, uy = dy / radius;
  const along = (a, b = 0) => [x + ux * a - uy * b, y + uy * a + ux * b];
  let width = radius, span = 2 * Math.PI;
  let count = Math.min(240, Math.max(48, Math.ceil(Math.PI * Math.sqrt(radius))));
  const centerLabel = (type === 'circle' || type === 'semicircle') ? '圆心' : '中心';
  const markers = [{ point: origin, label: centerLabel }];
  const lines = [{ points: [origin, end], label: type === 'circle' ? '半径' : '外接半径' }];
  let handles = controls;
  if (type === 'triangle') count = 3;
  if (type === 'hexagon') count = 6;
  if (side) {
    const offset = -uy * (side[0] - x) + ux * (side[1] - y);
    if (Math.abs(offset) < 1) return null;
    const sign = Math.sign(offset);
    const opposite = along(-radius);
    if (type === 'semicircle') {
      span = sign * Math.PI;
      count = Math.ceil(count / 2);
      const arcMiddle = along(0, sign * radius);
      handles = [origin, end, arcMiddle];
      lines[0] = { points: [opposite, end], label: '直径' };
      lines.push({ points: [origin, arcMiddle], label: '半径' });
    } else {
      width = Math.min(radius, Math.abs(offset));
      handles = [origin, end, along(0, sign * width)];
      lines[0] = { points: [opposite, end], label: '长轴' };
      lines.push({ points: [along(0, -width), along(0, width)], label: '短轴' });
      const focus = Math.sqrt(radius * radius - width * width);
      if (focus > 0.01) {
        const f1 = along(-focus), f2 = along(focus);
        markers.push({ point: f1, label: '焦点 F₁' }, { point: f2, label: '焦点 F₂' });
        lines.push({ points: [f1, f2], label: '焦距', secondary: true });
      }
      else markers[0].label = '中心、两焦点';
    }
  }
  const arc = type === 'semicircle';
  const points = Array.from({ length: count + Number(arc) }, (_, i) => {
    const angle = span * i / count;
    return i === 0 ? end : along(radius * Math.cos(angle), width * Math.sin(angle));
  });
  if (type === 'triangle' || type === 'hexagon') lines.push({ points: [points[0], points[1]], label: '边长' });
  if (arc) points[points.length - 1] = along(-radius);
  else if (!closedArea) points.push(points[0]);
  return { points, controls: handles, lines, markers };
}

export function geometryInsideEditorBox(parts, box, padding = 0) {
  const [left, top, right, bottom] = box;
  // A rectangular selection is convex, so containing all vertices contains
  // the intervening straight edges too. Padding includes a drawn stroke.
  return parts.every(points => points.every(([x, y]) =>
    x - padding >= left && x + padding <= right && y - padding >= top && y + padding <= bottom));
}

export function findEditorReference(point, references, { snap, align, radius, exclude }) {
  let closest = null, nearestX = null, nearestY = null;
  let best = radius, bestX = radius, bestY = radius;
  for (const reference of references) {
    if (reference.id === exclude) continue;
    const target = reference.points[0];
    const dx = Math.abs(target[0] - point[0]), dy = Math.abs(target[1] - point[1]);
    if (snap && dx <= best && dy <= best) {
      const distance = Math.hypot(dx, dy);
      if (distance <= best) { closest = target; best = distance; }
    }
    if (align && dx <= bestX) { nearestX = target; bestX = dx; }
    if (align && dy <= bestY) { nearestY = target; bestY = dy; }
  }
  if (closest) return { point: [...closest], marker: closest, guides: [] };
  if (!nearestX && !nearestY) return null;
  const aligned = [nearestX?.[0] ?? point[0], nearestY?.[1] ?? point[1]];
  const guides = [nearestX, nearestY].filter(Boolean).map(target => [target, aligned]);
  return { point: aligned, marker: aligned, guides };
}
