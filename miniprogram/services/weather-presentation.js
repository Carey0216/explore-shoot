// App-launch lifetime only: refreshing weather never renews permission to interrupt.
let owner = null,
  consumed = false;
function enter(token) {
  if (owner === null) owner = token;
  return owner === token && !consumed;
}
function consume(token) {
  if (!enter(token)) return false;
  consumed = true;
  return true;
}
function dismiss(token) {
  if (owner === token) consumed = true;
}
module.exports = { enter, consume, dismiss };
