// Visual reveal only: replies still use the shared, authenticated chat API.
export const replyDelay = (started, now = Date.now()) => Math.max(0, 1250 - (now - started));
export const replyChunks = (text) => {
  const letters =
    typeof Intl.Segmenter === 'function'
      ? Array.from(
          new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(String(text)),
          (x) => x.segment,
        )
      : Array.from(String(text));
  const size = Math.max(1, Math.ceil(letters.length / 160));
  return Array.from({ length: Math.ceil(letters.length / size) }, (_, i) => ({
    text: letters.slice(i * size, (i + 1) * size).join(''),
    delay: Math.min(i * 24, 1800),
  }));
};
export const pauseReply = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function revealReply(node, text, reduced, valid = () => true, transcript) {
  if (!node || !valid()) return;
  if (reduced) {
    node.textContent = text;
    return;
  }
  node.textContent = '';
  node.setAttribute('aria-label', text);
  const chunks = replyChunks(text);
  const started = performance.now();
  for (let i = 0; i < chunks.length;) {
    const wait = chunks[i].delay - (performance.now() - started);
    if (wait > 0) await pauseReply(wait);
    if (!valid() || !node.isConnected) return;
    const follow =
      transcript && transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 48;
    const until = Math.max(chunks[i].delay, performance.now() - started) + 32;
    let visible = '';
    while (i < chunks.length && chunks[i].delay <= until) visible += chunks[i++].text;
    const span = document.createElement('span');
    span.className = 'chat-reveal';
    span.textContent = visible;
    span.setAttribute('aria-hidden', 'true');
    node.append(span);
    if (follow) transcript.scrollTop = transcript.scrollHeight;
  }
  await pauseReply(160);
  if (valid() && node.isConnected) {
    node.removeAttribute('aria-label');
    for (const span of node.children) span.removeAttribute('aria-hidden');
  }
}
