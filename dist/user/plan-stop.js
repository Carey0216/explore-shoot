export const isPlaceStop = (stop) => String(stop.spotId).startsWith('point:');

export function planStopHref(stop) {
  return isPlaceStop(stop)
    ? '#place/' + encodeURIComponent(stop.pointId)
    : '#spot/' + encodeURIComponent(stop.spotId);
}
