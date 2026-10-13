import { esc } from '/shared/ui.js';

export function pointPickerHTML(prefix) {
  return `<div class="admin-map-pick-controls"><button type="button" class="button secondary" id="${esc(prefix)}-pick">在地图上选点</button><button type="button" class="button admin-map-pick-confirm" id="${esc(prefix)}-confirm" aria-label="确认选点" title="确认选点" hidden>√</button></div>`;
}

// A confirmed position is locked until the operator explicitly starts another selection.
export function createPointSelection({
  onChange,
  onConfirm,
  onMode = () => {},
  accepts = () => true,
  onError = () => {},
}) {
  let selecting = false,
    pending = null;
  const mode = () => onMode({ selecting, hasPoint: !!pending });
  return {
    get selecting() {
      return selecting;
    },
    begin(position) {
      selecting = true;
      pending =
        position && Number.isFinite(position.lng) && Number.isFinite(position.lat)
          ? { ...position }
          : null;
      mode();
    },
    accept(position) {
      if (!selecting) return false;
      if (
        !Number.isFinite(position?.lng) ||
        !Number.isFinite(position?.lat) ||
        !accepts(position)
      ) {
        onError('请选择校园范围内的位置');
        return false;
      }
      pending = { lng: position.lng, lat: position.lat };
      onChange({ ...pending });
      mode();
      return true;
    },
    confirm() {
      if (!selecting || !pending || !accepts(pending)) {
        onError('请先在地图上选择校园内的位置');
        return false;
      }
      selecting = false;
      onConfirm({ ...pending });
      mode();
      return true;
    },
    reset() {
      selecting = false;
      pending = null;
      mode();
    },
    validate() {
      if (selecting) throw Error('请先点击 √ 确认选点，再保存');
    },
  };
}

export function formFeedback(form, message, { error = true, focus = null, scroll = true } = {}) {
  const target = form.querySelector('.form-error');
  if (target) {
    target.textContent = message;
    target.classList.toggle('form-success', !error);
  }
  if (focus) {
    const details = focus.closest('details');
    if (details) details.open = true;
    focus.scrollIntoView({ block: 'center', behavior: 'smooth' });
    focus.focus();
  } else if (scroll) target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// novalidate lets us reveal folded controls before explaining validation errors.
export function validateEditableForm(form) {
  const invalid = Array.from(form.elements).find((e) => e.willValidate && !e.validity.valid);
  if (!invalid) return;
  const label = invalid.closest('label')?.textContent.trim() || '当前字段';
  const message = label + '：' + invalid.validationMessage;
  formFeedback(form, message, { focus: invalid });
  throw Error(message);
}
