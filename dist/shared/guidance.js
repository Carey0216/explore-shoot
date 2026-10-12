import { distance, direction, meters } from './routing.js';
const pair = (p) => (Array.isArray(p) ? p : [p.lng, p.lat]);
// Projection onto a road path, independent of sensors and map rendering.
export function routeProgress(path, point) {
  point = pair(point);
  let best,
    walked = 0;
  const scale = Math.cos((point[1] * Math.PI) / 180);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      x = (b[0] - a[0]) * scale,
      y = b[1] - a[1],
      length = distance(a, b);
    if (!length) continue;
    const t = Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * scale * x + (point[1] - a[1]) * y) / (x * x + y * y)),
      ),
      c = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
      gap = distance(point, c);
    if (!best || gap < best.gap)
      best = { gap, along: walked + t * length, coordinate: c, segment: i - 1 };
    walked += length;
  }
  return best
    ? { ...best, total: walked, remaining: Math.max(0, walked - best.along) }
    : {
        gap: distance(point, path[0] || point),
        along: 0,
        total: 0,
        remaining: 0,
        coordinate: path[0] || point,
        segment: 0,
      };
}
export function routeSteps(path) {
  const clean = [];
  let along = 0;
  for (let i = 0; i < path.length; i++) {
    if (i) along += distance(path[i - 1], path[i]);
    if (!clean.length || distance(clean.at(-1).coordinate, path[i]) >= 8 || i === path.length - 1)
      clean.push({ coordinate: path[i], along });
  }
  if (clean.length < 2) return [];
  const result = [];
  for (let i = 1; i < clean.length - 1; i++) {
    const before = direction(clean[i - 1].coordinate, clean[i].coordinate).bearing,
      after = direction(clean[i].coordinate, clean[i + 1].coordinate).bearing,
      delta = ((after - before + 540) % 360) - 180;
    if (Math.abs(delta) < 40) continue;
    result.push({
      ...clean[i],
      action: Math.abs(delta) > 150 ? '掉头' : delta > 0 ? '右转' : '左转',
      symbol: Math.abs(delta) > 150 ? '↶' : delta > 0 ? '↱' : '↰',
    });
  }
  return result;
}
export function providerStep(leg, progress) {
  if (leg.provider !== 'tencent' || !leg.steps?.length) return null;
  const traveled = progress.total ? (progress.along / progress.total) * leg.length : 0;
  let end = 0;
  for (let i = 0; i < leg.steps.length; i++) {
    const step = leg.steps[i];
    end += step.distance;
    if (end > traveled + 3 && step.instruction)
      return {
        text: step.instruction + ' · 本段剩余约 ' + meters(end - traveled),
        speech: step.instruction,
        nextSpeech: leg.steps.slice(i + 1).find((s) => s.instruction)?.instruction,
        symbol: /左转/.test(step.action) ? '↰' : /右转/.test(step.action) ? '↱' : '↑',
      };
  }
  return { text: '沿腾讯路线抵达道路终点后，请确认目的地入口', symbol: '↑' };
}
export function guidance(leg, point, target) {
  if (!leg?.available) return { valid: false, text: leg?.reason || '请先规划路线' };
  if (!Number.isFinite(point.accuracy) || point.accuracy > 80)
    return { valid: false, text: '定位精度较低，请到室外重试，暂不提供转向指令' };
  const progress = routeProgress(leg.path, point),
    approach = distance(leg.path.at(-1), target),
    near = distance(point, target);
  if (near < 30 && point.accuracy <= 25)
    return {
      valid: true,
      arrived: true,
      symbol: '✓',
      text: '已接近目的地，请确认现场入口',
      remaining: near,
      progress,
    };
  const approachPath = leg.connectors?.[0],
    onApproach =
      progress.along < 10 &&
      approachPath &&
      routeProgress(approachPath, point).gap <= Math.max(15, point.accuracy);
  const offRoute = !onApproach && progress.gap > Math.max(35, point.accuracy * 1.5);
  if (offRoute)
    return {
      valid: true,
      offRoute: true,
      symbol: '↻',
      text: '你已离开参考路线，正在重新规划',
      progress,
    };
  const provided = providerStep(leg, progress),
    step = routeSteps(leg.path).find((s) => s.along > progress.along + 10),
    lead = leg.path.slice(progress.segment + 1).find((p) => distance(point, p) > 12) || target,
    heading = direction(point, lead);
  const connector = progress.along < 8 && progress.gap > 20;
  return {
    valid: true,
    offRoute: false,
    progress,
    remaining: progress.remaining + approach + progress.gap,
    symbol: provided?.symbol || (step && step.along - progress.along < 45 ? step.symbol : '↑'),
    bearing: heading.bearing,
    speech: provided?.speech,
    nextSpeech: provided?.nextSpeech,
    text: provided
      ? provided.text
      : connector
        ? `先向${heading.name}靠近道路约 ${meters(progress.gap)}，虚线部分请确认可通行入口`
        : step
          ? `朝${heading.name}前进 ${meters(step.along - progress.along)}，然后${step.action}`
          : `朝${heading.name}沿路线前进 ${meters(progress.remaining)}，再确认目的地入口`,
  };
}
