// Canvas uses the same image-pixel outlines as the web SVG; these are not GPS coordinates.
function area(ring) {
  return ring.reduce((a, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return a + p[0] * q[1] - q[0] * p[1];
  }, 0);
}
function ring(ctx, points) {
  points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}
function path(ctx, building) {
  ctx.beginPath();
  ring(ctx, building.outline);
  for (const hole of building.holes || [])
    ring(ctx, area(hole) * area(building.outline) > 0 ? [...hole].reverse() : hole);
}
function draw(canvas, image, atlas, frame, width, pixelRatio) {
  const photo = frame === 'photo';
  const sourceWidth = photo ? atlas.photoWidth : atlas.planWidth;
  const sourceHeight = photo ? atlas.photoHeight : atlas.planHeight;
  const rotatedWidth = photo ? sourceHeight : 1120;
  const rotatedHeight = photo ? sourceWidth : 466;
  const height = (width * rotatedHeight) / rotatedWidth;
  // Bound the backing store: mobile image overlays should not allocate full-resolution panoramas.
  const ratio = Math.min(2, pixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  const transform = () => {
    ctx.setTransform((ratio * width) / rotatedWidth, 0, 0, (ratio * width) / rotatedWidth, 0, 0);
    if (photo) {
      ctx.translate(0, sourceWidth);
      ctx.rotate(-Math.PI / 2);
    } else ctx.translate(-85, -112);
  };
  transform();
  ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray =
      0.2126 * pixels.data[i] + 0.7152 * pixels.data[i + 1] + 0.0722 * pixels.data[i + 2];
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 150 + gray * 0.36;
  }
  ctx.putImageData(pixels, 0, 0);
  transform();
  for (const b of atlas.buildings.filter((b) => b.frame === frame)) {
    if (b.collected) {
      ctx.save();
      path(ctx, b);
      ctx.clip();
      ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight);
      ctx.restore();
    }
    path(ctx, b);
    ctx.strokeStyle = b.collected ? '#dba842' : '#7e8d86';
    ctx.lineWidth = (rotatedWidth / width) * (b.collected ? 1.5 : 0.55);
    ctx.stroke();
  }
  return height;
}
module.exports = { area, path, draw };
