export async function diagnoseImage(value) {
  let url;
  try {
    url = new URL(value, location.href);
    if (
      url.origin !== location.origin ||
      !/^\/(?:admin\/)?(?:api\/|media\/|shared\/)/.test(url.pathname)
    )
      return { kind: 'image-address', message: '图片地址不可用' };
  } catch {
    return { kind: 'image-address', message: '图片地址不可用' };
  }
  let response;
  try {
    response = await fetch(url.href, {
      credentials: 'same-origin',
      cache: 'reload',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { kind: 'image-failed', message: '网络未能载入图片，可单独重试' };
  }
  if (!response.ok)
    return {
      kind: [400, 404, 410].includes(response.status) ? 'image-address' : 'image-failed',
      status: response.status,
      message:
        response.status === 401
          ? '登录已过期，请登录后重试这张图片'
          : [404, 410].includes(response.status)
            ? '图片地址已失效，请重试或反馈此资源'
            : '图片服务暂不可用，可单独重试',
    };
  let blob;
  try {
    blob = await response.blob();
  } catch {
    return { kind: 'image-failed', status: response.status, message: '图片下载中断，可单独重试' };
  }
  const local = URL.createObjectURL(blob),
    image = new Image();
  image.src = local;
  try {
    await image.decode();
    return { kind: 'image-failed', status: 200, message: '图片加载曾中断，可单独重试' };
  } catch {
    return { kind: 'image-decode', status: 200, message: '图片格式暂未解码成功，可单独重试' };
  } finally {
    URL.revokeObjectURL(local);
  }
}
