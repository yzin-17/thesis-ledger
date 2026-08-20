const FEISHU_WEBHOOK_HOSTS = new Set(['open.feishu.cn', 'open.larksuite.com']);
const FEISHU_WEBHOOK_PATH_PREFIX = '/open-apis/bot/v2/hook/';

export const assertAllowedFeishuWebhookUrl = (webhook: string) => {
  let url: URL;
  try {
    url = new URL(webhook);
  } catch {
    throw new Error('Webhook 地址格式不正确');
  }
  if (url.protocol !== 'https:') throw new Error('Feishu/Lark Webhook 必须使用 HTTPS');
  if (!FEISHU_WEBHOOK_HOSTS.has(url.hostname.toLowerCase()))
    throw new Error('只允许 Feishu/Lark 官方 Webhook Host');
  if (url.port && url.port !== '443') throw new Error('Feishu/Lark Webhook 不允许自定义端口');
  if (url.username || url.password) throw new Error('Webhook 地址不能包含 URL 凭证');
  if (
    !url.pathname.startsWith(FEISHU_WEBHOOK_PATH_PREFIX) ||
    url.pathname.slice(FEISHU_WEBHOOK_PATH_PREFIX.length).length === 0
  )
    throw new Error('Feishu/Lark Webhook 路径无效');
  return url;
};
