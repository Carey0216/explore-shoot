const { toTencent } = require('./coordinates');

const radians = Math.PI / 180;
const metresPerDegree = 111195;

const mapPoint = (point) => {
  const { lat, lng } = toTencent(point);
  return { latitude: lat, longitude: lng };
};

function campusOverview(boundary, width, height) {
  const points = boundary.map(mapPoint);
  const longitudes = points.map((point) => point.longitude);
  const latitudes = points.map((point) => point.latitude);
  const west = Math.min(...longitudes),
    east = Math.max(...longitudes);
  const south = Math.min(...latitudes),
    north = Math.max(...latitudes);
  const latitude = (south + north) / 2;
  const span = Math.max(
    (east - west) / Math.max(1, width - 44),
    (north - south) / (Math.cos(latitude * radians) * Math.max(1, height - 44)),
  );
  return {
    latitude,
    longitude: (west + east) / 2,
    mapScale: Math.min(17, Math.floor(Math.log2(360 / (256 * span)) * 10) / 10),
  };
}

function openRing(ring) {
  const points = ring.map(mapPoint);
  const first = points[0],
    last = points[points.length - 1];
  if (first.latitude === last.latitude && first.longitude === last.longitude) points.pop();
  return points;
}

const edges = (ring) => ring.map((point, index) => [point, ring[(index + 1) % ring.length]]);

// Native map polygons have one ring. Split roofs with courtyards into horizontal bands.
function roofFaces(rings) {
  if (rings.length === 1) return rings;
  const levels = [...new Set(rings.flat().map((point) => point.latitude))].sort((a, b) => a - b);
  const boundaries = rings.flatMap(edges);
  const faces = [];
  for (let i = 1; i < levels.length; i++) {
    const bottom = levels[i - 1],
      top = levels[i],
      middle = (bottom + top) / 2;
    const cuts = boundaries
      .filter(([a, b]) => a.latitude > middle !== b.latitude > middle)
      .map(
        ([a, b]) =>
          (y) =>
            a.longitude +
            ((y - a.latitude) / (b.latitude - a.latitude)) * (b.longitude - a.longitude),
      )
      .sort((a, b) => a(middle) - b(middle));
    for (let j = 1; j < cuts.length; j += 2) {
      const left = cuts[j - 1],
        right = cuts[j];
      faces.push([
        { latitude: bottom, longitude: left(bottom) },
        { latitude: bottom, longitude: right(bottom) },
        { latitude: top, longitude: right(top) },
        { latitude: top, longitude: left(top) },
      ]);
    }
  }
  return faces;
}

function prepareBuildings(data) {
  if (data.coordinateSystem !== 'WGS84') return [];
  return (data.supplements || [])
    .filter((item) => item.coverage === 'missing' && item.footprint?.length >= 3 && item.height > 0)
    .map((item) => {
      const rings = [item.footprint, ...(item.holes || [])].map(openRing);
      return { height: item.height, color: item.color, rings, roofs: roofFaces(rings) };
    });
}

function buildingFaces(buildings, rotate, skew) {
  const bearing = rotate * radians;
  const north = Math.cos(bearing);
  const east = Math.sin(bearing);
  // Project the estimated height into the tilted native map plane.
  const rise = Math.tan(Math.min(40, Math.max(0, skew)) * radians);
  return buildings.flatMap(({ height, color, rings, roofs }) => {
    const latitudeOffset = (north * height * rise) / metresPerDegree;
    const longitudeOffset =
      (east * height * rise) / (metresPerDegree * Math.cos(rings[0][0].latitude * radians));
    const roofPoint = ({ latitude, longitude }) => ({
      latitude: latitude + latitudeOffset,
      longitude: longitude + longitudeOffset,
    });
    const walls = rise
      ? rings.flatMap(edges).map(([a, b]) => ({
          points: [a, b, roofPoint(b), roofPoint(a)],
          fillColor: '#7c8b9d',
          strokeWidth: 0,
          zIndex: 1,
        }))
      : [];
    return [
      ...walls,
      ...roofs.map((roof) => ({
        points: roof.map(roofPoint),
        fillColor: /^#[a-f0-9]{6}$/i.test(color) ? color : '#bac4d1',
        strokeColor: '#7c8b9d',
        strokeWidth: rings.length === 1 ? 1 : 0,
        zIndex: 2,
      })),
    ];
  });
}

module.exports = { campusOverview, prepareBuildings, buildingFaces };
