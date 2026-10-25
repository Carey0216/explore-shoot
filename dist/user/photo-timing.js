import { $, api, esc, icon, toast, modal, closeModal, formSubmit, errorHTML } from '/shared/ui.js';
import { featureOn, featureVisible, maintenanceMessage } from '/shared/features.js';
export const weatherSymbol = (code) =>
  code >= 95
    ? '⛈️'
    : (code >= 71 && code <= 77) || code === 85 || code === 86
      ? '🌨️'
      : code >= 51
        ? '🌧️'
        : code >= 45
          ? '🌫️'
          : code >= 3
            ? '☁️'
            : code >= 1
              ? '🌤️'
              : '☀️';
export const campusTime = (value) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
export const weatherLine = (weather) =>
  `${Math.round(weather.temperature)}° · 最高 ${Math.round(weather.high)}° / 最低 ${Math.round(weather.low)}°`;

let whisperInstalled = false;
let weatherData = null,
  weatherPending = null,
  weatherAt = 0;
export async function loadCampusWeather() {
  if (weatherData && Date.now() - weatherAt < (weatherData.available ? 20 * 60000 : 60000))
    return weatherData;
  if (weatherPending) return weatherPending;
  weatherPending = api('/api/weather')
    .then((data) => {
      weatherData = data;
      weatherAt = Date.now();
      return data;
    })
    .finally(() => {
      weatherPending = null;
    });
  return weatherPending;
}
export function weatherCardHTML(data) {
  return `<span class="weather-symbol81" aria-hidden="true">${weatherSymbol(data.code)}</span><div><strong data-user-content>${esc(data.label)}${data.stale ? ' · 上次预报' : ''}</strong><p><span class="weather-current81">${Math.round(data.temperature)}°</span><span class="weather-range81" data-user-content>最高 ${Math.round(data.high)}° / 最低 ${Math.round(data.low)}°</span></p></div>`;
}
export function installWeatherWhisper() {
  if (whisperInstalled) return;
  const orb = $('.support-orb');
  if (!orb) return;
  whisperInstalled = true;
  const bubble = document.createElement('aside');
  bubble.className = 'weather-whisper81';
  bubble.hidden = true;
  bubble.setAttribute('aria-label', '校园助手的天气提醒');
  document.body.append(bubble);
  let timer,
    consumed = false;
  const hide = () => {
    consumed = true;
    bubble.hidden = true;
    clearTimeout(timer);
  };
  const position = () => {
    const rect = orb.getBoundingClientRect();
    bubble.style.right = Math.max(16, window.innerWidth - rect.right) + 'px';
    bubble.style.bottom = Math.max(20, window.innerHeight - rect.top + 12) + 'px';
  };
  const show = async () => {
    if (
      consumed ||
      !featureOn('weather') ||
      !featureVisible('weather') ||
      !featureOn('support') ||
      !featureVisible('support')
    )
      return;
    try {
      const data = await loadCampusWeather();
      if (
        consumed ||
        !data?.available ||
        document.hidden ||
        !featureOn('weather') ||
        !featureVisible('weather') ||
        !featureOn('support') ||
        !featureVisible('support') ||
        orb.getAttribute('aria-expanded') === 'true' ||
        $('#dialog')
      )
        return;
      consumed = true;
      position();
      bubble.innerHTML = `<button class="weather-whisper-close81" aria-label="关闭天气提醒">×</button><div class="weather-whisper-copy81">${weatherCardHTML(data)}</div>`;
      $('.weather-whisper-close81', bubble).onclick = hide;
      bubble.hidden = false;
      timer = setTimeout(hide, 8000);
    } catch {}
  };
  new MutationObserver(() => {
    if (orb.getAttribute('aria-expanded') === 'true') hide();
  }).observe(orb, { attributes: true, attributeFilter: ['aria-expanded'] });
  window.addEventListener('features:change', () => {
    if (
      !featureOn('weather') ||
      !featureVisible('weather') ||
      !featureOn('support') ||
      !featureVisible('support')
    )
      hide();
  });
  window.addEventListener('resize', position, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hide();
  });
  window.addEventListener('hashchange', hide);
  void show();
}

export async function addTimingToPlan(
  spot,
  window,
  { requireAccount, alive = () => true, getOwner = () => null, onSaved = () => {} },
) {
  if (!(await requireAccount()) || !alive()) return;
  const owner = getOwner(),
    data = await api('/api/my/plans');
  if (!alive() || getOwner() !== owner) return;
  modal(
    '把这段好光线放进计划',
    `<p>${esc(spot.title)} · ${campusTime(window.start)}–${campusTime(window.end)} · ${esc(window.label)}</p><form id="timing-plan81"><label>保存到<select name="plan"><option value="">新建一份拍摄计划</option>${data.items.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></label><label class="check"><input type="checkbox" name="replaceTime">加入已有计划时，也将出发时间设为这个时段</label><p class="muted">已有计划的时间默认保留。新计划会使用所选时段，出发前仍可调整。</p>${errorHTML}<button class="button wide" type="submit">加入拍摄计划</button></form>`,
    (d) => {
      $('#timing-plan81', d).onsubmit = (e) =>
        formSubmit(e, async (values) => {
          if (!alive() || getOwner() !== owner) throw Error('账号或页面已改变，请重新选择');
          const selected = data.items.find((p) => p.id === values.plan);
          const items = (selected?.items || []).map(
            ({ id, spotId, composition, done, minutes = 5 }) => ({
              id,
              spotId,
              composition,
              done,
              minutes,
            }),
          );
          items.push({
            id: crypto.randomUUID(),
            spotId: spot.id,
            composition: `${window.label} · ${campusTime(window.start)}–${campusTime(window.end)}。${window.reason}`,
            done: false,
            minutes: 30,
          });
          const body = {
            title: selected?.title || '今天的校园拍摄',
            items,
            departure:
              !selected || values.replaceTime || !selected.departure
                ? window.start
                : selected.departure,
            checklist: selected?.checklist || {},
          };
          if (selected) body.revision = selected.revision;
          const saved = await api(
            '/api/my/plans' + (selected ? '/' + selected.id : ''),
            selected ? 'PUT' : 'POST',
            body,
          );
          if (getOwner() !== owner) return;
          closeModal();
          onSaved(saved);
          toast('已加入拍摄计划，可继续调整路线与时间');
        });
    },
  );
}

export function mountPhotoTiming(host, spot, options) {
  let disposed = false;
  const alive = () => !disposed && host.isConnected && options.alive();
  const load = async () => {
    host.hidden = !featureVisible('photo-timing');
    if (host.hidden) return;
    host.dataset.feature = 'photo-timing';
    if (!featureOn('photo-timing')) {
      host.innerHTML = `<button class="button secondary" data-feature="photo-timing">查看拍摄时机</button>`;
      return;
    }
    host.innerHTML =
      '<h2>今天什么时候适合拍？</h2><p class="muted" role="status">正在结合天气与机位朝向…</p>';
    try {
      const data = await api('/api/photography/timing?spotId=' + encodeURIComponent(spot.id));
      if (!alive() || !featureOn('photo-timing')) return;
      const weather = data.weather;
      host.innerHTML = `<div class="section-title73"><h2>今天什么时候适合拍？</h2><small>北京时间</small></div>${weather.available ? `<p class="timing-weather81"><span aria-hidden="true">${weatherSymbol(weather.code)}</span> ${esc(weather.label)} · ${weatherLine(weather)}${weather.stale ? ' · 上次预报' : ''}</p>` : ''}<p>${esc(data.message)}</p><div class="timing-grid81">${data.windows.map((w, i) => `<article class="timing-window81"><time>${campusTime(w.start)}–${campusTime(w.end)}</time><strong>${esc(w.label)}</strong><p>${esc(w.reason)}</p><small>太阳方位 ${w.solarAzimuth}° · 高度 ${w.solarElevation}°${w.openingUnverified ? ' · 开放时段待核对' : ''}</small>${featureVisible('plans') ? `<button class="button secondary small" data-feature="plans" data-timing="${i}">${icon('plus')} 加入计划</button>` : ''}</article>`).join('')}</div><p class="muted timing-note81">${esc(data.notice)} · 预报：Open-Meteo</p>`;
      host.querySelectorAll('[data-timing]').forEach(
        (b) =>
          (b.onclick = () => {
            if (!featureOn('plans')) return toast(maintenanceMessage);
            void addTimingToPlan(spot, data.windows[Number(b.dataset.timing)], {
              ...options,
              alive,
            }).catch((e) => toast(e.message));
          }),
      );
    } catch (e) {
      if (alive()) {
        host.innerHTML = `<h2>今天什么时候适合拍？</h2><p class="muted">${esc(e.message)}</p><button class="text-btn" data-retry-timing>重试</button>`;
        $('[data-retry-timing]', host).onclick = load;
      }
    }
  };
  void load();
  window.addEventListener('features:change', load);
  return () => {
    disposed = true;
    window.removeEventListener('features:change', load);
  };
}
