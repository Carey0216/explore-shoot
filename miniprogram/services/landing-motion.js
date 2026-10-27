const duration = 1100,
  impactAt = 594;
function pose(elapsed) {
  const t = Math.max(0, Math.min(1, elapsed / duration));
  if (t < 0.54) {
    const p = Math.pow(t / 0.54, 1.75);
    return {
      scale: 3.2 - 2.2 * p,
      drop: -96 * (1 - p),
      alpha: Math.min(1, 0.25 + p * 3),
      recoil: 0,
      landed: false,
    };
  }
  const u = (t - 0.54) / 0.46,
    w = Math.exp(-6 * u) * Math.cos(u * 13);
  return {
    scale: 1 - 0.1 * w,
    drop: 7 * w,
    alpha: 1,
    recoil: Math.sin(u * 22) * Math.exp(-5 * u) * 3,
    landed: true,
  };
}
module.exports = { duration, impactAt, pose };
