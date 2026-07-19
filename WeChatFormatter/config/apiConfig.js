/**
 * AI 助手 API 配置
 * 密钥与端点保存在浏览器 localStorage，不写死在源码中。
 * 打开页头「API 配置」弹窗即可设置。
 */

export const AI_API_STORAGE_KEY = 'WeChatFormatter_ai_api'

/** 源码内默认值（不含真实 Key） */
export const AI_API_DEFAULTS = {
  apiKey: '',
  model: 'deepseek-chat',
  apiUrl: 'https://api.deepseek.com/v1',
}

/** 一键排版（AI 排版模式）参数 */
export const AI_TYPESET_CONFIG = {
  temperature: 0.3,
  maxTokens: 8192,
}

/** AI 助手（润色 / 扩写 / 翻译等）参数 */
export const AI_REWRITE_CONFIG = {
  temperature: 0.3,
  maxTokens: 4096,
  systemPrompt:
    '你是一个专业的文字编辑助手。请根据用户要求处理文字，直接返回处理结果，不要添加解释或额外内容。',
}

export const PLACEHOLDER_API_KEY = 'your-api-key-here'

function normalizeConfig(raw = {}) {
  return {
    apiKey: String(raw.apiKey ?? '').trim(),
    model: String(raw.model ?? AI_API_DEFAULTS.model).trim() || AI_API_DEFAULTS.model,
    apiUrl: String(raw.apiUrl ?? AI_API_DEFAULTS.apiUrl).trim() || AI_API_DEFAULTS.apiUrl,
  }
}

/** 读取当前生效的 API 配置（localStorage 优先） */
export function getAiApiConfig() {
  try {
    const raw = localStorage.getItem(AI_API_STORAGE_KEY)
    if (raw) return normalizeConfig(JSON.parse(raw))
  } catch (e) { /* ignore */ }
  return { ...AI_API_DEFAULTS }
}

/** 保存到 localStorage */
export function saveAiApiConfig(partial = {}) {
  const next = normalizeConfig({ ...getAiApiConfig(), ...partial })
  try {
    localStorage.setItem(AI_API_STORAGE_KEY, JSON.stringify(next))
  } catch (e) { /* ignore */ }
  return next
}

/** 清除已保存配置 */
export function clearAiApiConfig() {
  try {
    localStorage.removeItem(AI_API_STORAGE_KEY)
  } catch (e) { /* ignore */ }
  return { ...AI_API_DEFAULTS }
}

export function isApiKeyConfigured(key = getAiApiConfig().apiKey) {
  return !!key && key !== PLACEHOLDER_API_KEY
}

/**
 * 兼容旧代码：对象属性实时读 localStorage。
 * 请优先使用 getAiApiConfig()。
 */
export const AI_API_CONFIG = {
  get apiKey() { return getAiApiConfig().apiKey },
  get model() { return getAiApiConfig().model },
  get apiUrl() { return getAiApiConfig().apiUrl },
}

/** @deprecated 请使用 getAiApiConfig().apiKey */
export const BACKEND_API_KEY = {
  toString() { return getAiApiConfig().apiKey },
  valueOf() { return getAiApiConfig().apiKey },
}
