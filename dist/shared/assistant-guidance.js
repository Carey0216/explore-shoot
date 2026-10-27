// User-triggered, destination-specific help; never opens a camera or submits a form.
export function assistantGuidance(link = {}) {
  const path = String(link.path || ''),
    title = String(link.title || '');
  const step = (web, mini, icon, heading, copy) => ({ web, mini, icon, title: heading, copy });
  if (path === '#publish') {
    if (/相机|摄像头|camera/i.test(title))
      return [
        step(
          '#publish-add-photo',
          '.photo-add',
          'camera',
          '先检查相机权限',
          '点击“添加照片”后再选择拍摄。网页需使用HTTPS，并在浏览器站点权限中允许相机；小程序请在微信的设置中检查相机权限。这里不会自动启动相机。',
        ),
        step(
          '#publish-add-photo',
          '.photo-grid',
          'check',
          '验证后继续；仍失败也有替代方式',
          '允许权限后重新拍一张，确认照片出现在这里。如果系统仍不能拍摄，可先用设备相机拍照，再从相册添加。已有文字和照片会保留，不必重新填写。',
        ),
      ];
    return [
      step(
        '.draft-notice',
        '.compose-page',
        'book',
        '先确认本机草稿',
        '同一设备、同一账号返回发布页，可以继续编辑照片、封面和文字；草稿仅在本机，不会自动公开。重新登录后请使用原账号。',
      ),
      step(
        '#publish-add-photo',
        '.photo-grid',
        'camera',
        '检查照片，再接着编辑',
        '照片下方的“封面”标记表示发布首图；点击其他照片可改封面。上传中断后再次发布，仅重试失败或过期的照片。离开前确认草稿保存提示。',
      ),
    ];
  }
  const guide = {
    '#settings': step(
      '.settings-card',
      '.card',
      'settings',
      '在这里调整显示偏好',
      '先选择外观、字号或动效；保存成功后检查页面效果。语言与手动偏好随账号保存，链接中的语言仅临时生效。',
    ),
    '#plans': step(
      '.plan-heading',
      '.section-title',
      'calendar',
      '继续安排你的拍摄',
      '选择或新建拍摄清单，加入机位、设置出发时间与停留时长。出发前检查开放情况、天气和准备清单；保存成功后再离开。',
    ),
    '#guides': step(
      '.guide-card',
      '.guide-card',
      'book',
      '先选一份适合你的指南',
      '打开指南后查看推荐机位与拍法，再选择附近的一站。进入地点后确认开放说明，出发前可加入拍摄清单。',
    ),
    '#contact': step(
      '#contact-request textarea',
      'textarea',
      'message',
      '把遇到的问题说明白',
      '登录后选择联系管理员，写清所在页面、操作步骤和提示文字。可附截图，但请遮住密码、验证码和其他私人信息；发送后在消息中心查看回复。',
    ),
    '#me': step(
      '.personal-toolbox73',
      '.tools-grid',
      'user',
      '在“我的”继续查找',
      '收藏、拍摄清单和个人记录都在这里。先选择对应工具，再确认要查看的地点；私人照片与留言不会自动公开。',
    ),
    '#shots': step(
      '.shots-filters',
      '.scroll-chips',
      'pin',
      '先找到要去的机位',
      '筛选或搜索地点，打开机位详情确认参考角度与开放说明。需要相机或定位时由你主动开启；到达后再拍摄和记录。',
    ),
  };
  return guide[path] ? [guide[path]] : [];
}
export function assistantLinkLabel(link) {
  if (link.path === '#publish' && /相机|摄像头|camera/i.test(link.title || ''))
    return '检查相机与拍照';
  return link.title || '查看下一步';
}
