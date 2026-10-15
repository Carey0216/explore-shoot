export function distance(a, b) {
  const r = Math.PI / 180;
  return (
    6371000 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2,
        ),
      ),
    )
  );
}
export function sortNearby(points, location) {
  return dislikedLast(
    location ? [...points].sort((a, b) => distance(location, a) - distance(location, b)) : points,
  );
}

// Stable partition is applied after distance or popularity: only this viewer's dislikes move down.
export function dislikedLast(points) {
  return points.some((p) => p.myReaction === 'dislike')
    ? [...points].sort(
        (a, b) => Number(a.myReaction === 'dislike') - Number(b.myReaction === 'dislike'),
      )
    : points;
}
