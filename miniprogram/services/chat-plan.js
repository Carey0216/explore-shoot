function context(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.spotIds)) return null;
  return {
    budget: Math.max(6, Math.min(180, Number(value.budget) || 20)),
    preference: String(value.preference || '').slice(0, 300),
    spotIds: value.spotIds.filter((id) => typeof id === 'string').slice(0, 6),
    favorites: value.favorites === true,
    quiet: value.quiet === true,
  };
}
function payload(preview, saved) {
  return {
    title: preview.plan.title,
    items: preview.plan.items.map(({ id, spotId, composition, done, minutes }) => ({
      id,
      spotId,
      composition,
      done,
      minutes,
    })),
    departure: saved?.departure || '',
    checklist: saved?.checklist || {},
    ...(saved?.id ? { revision: saved.revision } : {}),
  };
}
module.exports = { context, payload };
