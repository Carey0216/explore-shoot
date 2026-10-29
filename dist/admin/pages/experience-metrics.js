import { esc } from '/shared/ui.js';
export function renderExperience(data) {
  const name = {
      inp: '网页 INP',
      dock: 'Dock 点击至响应',
      'photo-open': '照片打开',
      landing: '建筑落位',
      upload: '上传',
    },
    state = {
      insufficient: '样本不足',
      good: '良好 ≤200ms',
      'needs-improvement': '需要改善',
      poor: '响应较慢',
      observed: '观察中',
    };
  return `<section class="jy-panel"><h3>操作流畅度</h3><p class="jy-muted">移动端与桌面分开观察；INP 是一次网页访问的交互指标，小程序点击耗时和动画长帧比例另列。</p><div class="table-wrap"><table><thead><tr><th>操作 / 页面</th><th>客户端 / 设备</th><th>系统 / 浏览器</th><th>样本 / 失败</th><th>P75 ms</th><th>长帧比例</th><th>状态</th></tr></thead><tbody>${data.rows.map((r) => `<tr><td>${esc(name[r.metric] || r.metric)}<br><small>${esc(r.page)}</small></td><td>${esc(r.platform)} / ${esc(r.device)}</td><td>${esc(r.os)} / ${esc(r.browser)}</td><td>${r.samples} / ${r.failures}</td><td>${r.p75Ms === null ? '—' : Number(r.p75Ms).toFixed(0)}</td><td>${r.metric === 'landing' ? (100 * r.averageDropped).toFixed(1) + '%' : '—'}</td><td>${esc(state[r.assessment] || r.assessment)}</td></tr>`).join('') || '<tr><td colspan="7">尚无实际操作样本，开始使用后会在这里出现。</td></tr>'}</tbody></table></div><p class="jy-muted">${esc(data.notice)}</p></section>`;
}
