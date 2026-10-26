// Content-sized until the safe viewport limit; scroll only the conversation.
function chatHeight({
  windowHeight,
  keyboardHeight = 0,
  contentHeight,
  chromeHeight,
  weather = false,
}) {
  const available = Math.max(
    120,
    windowHeight - keyboardHeight - (keyboardHeight ? 24 : weather ? 156 : 48),
  );
  const limit = keyboardHeight ? available : Math.min(560, windowHeight * 0.65, available);
  return Math.round(
    Math.min(limit, Math.max(Math.min(190, limit), contentHeight + chromeHeight + 24)),
  );
}
module.exports = { chatHeight };
