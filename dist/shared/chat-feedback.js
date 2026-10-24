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
export async function revealReply(node, text, reduced, valid = () => true) {
  if (!node || reduced || !valid()) return;
  node.textContent = '';
  node.setAttribute('aria-label', text);
  const chunks = replyChunks(text);
  for (const chunk of chunks) {
    const span = document.createElement('span');
    span.className = 'chat-reveal';
    span.textContent = chunk.text;
    span.style.animationDelay = chunk.delay + 'ms';
    span.setAttribute('aria-hidden', 'true');
    node.append(span);
  }
  await pauseReply((chunks.at(-1)?.delay || 0) + 350);
  if (valid() && node.isConnected) {
    node.textContent = text;
    node.removeAttribute('aria-label');
  }
}
