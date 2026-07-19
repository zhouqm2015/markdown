import {
  getAiApiConfig,
  AI_TYPESET_CONFIG,
  isApiKeyConfigured,
} from '../config/apiConfig.js'

function getChatCompletionsUrl() {
  const base = getAiApiConfig().apiUrl.replace(/\/$/, '')
  if (base.endsWith('/chat/completions')) return base
  return `${base}/chat/completions`
}

export function hasApiKey() {
  return isApiKeyConfigured()
}

export class DeepSeekTypesetError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'DeepSeekTypesetError'
    this.code = code
  }
}

export class DeepSeekTypesetClient {
  constructor() {
    this.apiKey = getAiApiConfig().apiKey
  }

  hasApiKey() {
    return isApiKeyConfigured(this.apiKey)
  }

  async requestTypeset(systemPrompt, userPrompt) {
    if (!this.hasApiKey()) {
      throw new DeepSeekTypesetError('API Key 未配置，请点击「API 配置」填写后重试', 'NO_KEY')
    }

    return chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: AI_TYPESET_CONFIG.temperature,
        maxTokens: AI_TYPESET_CONFIG.maxTokens,
      }
    )
  }
}

export async function chatCompletion(messages, options = {}) {
  const cfg = getAiApiConfig()
  if (!isApiKeyConfigured(cfg.apiKey)) {
    throw new DeepSeekTypesetError('API Key 未配置，请点击「API 配置」填写后重试', 'NO_KEY')
  }

  const response = await fetch(getChatCompletionsUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 4096,
    }),
  })

  if (!response.ok) {
    const status = response.status
    if (status === 401) {
      throw new DeepSeekTypesetError('API Key 无效或已过期，请在「API 配置」中检查', 'AUTH_FAIL')
    }
    if (status === 429) {
      throw new DeepSeekTypesetError('请求过于频繁，请稍后重试', 'RATE_LIMIT')
    }
    throw new DeepSeekTypesetError(`API 请求失败 (${status})，请重试`, 'API_ERROR')
  }

  const data = await response.json()

  if (!data.choices?.[0]?.message?.content) {
    throw new DeepSeekTypesetError('API 返回格式异常', 'PARSE_ERROR')
  }

  return data.choices[0].message.content
}

export async function formatWithAI(text) {
  const { systemPrompt, userPromptTemplate } = await import('../config/promptConfig.js')
  const userPrompt = userPromptTemplate.replace('{{text}}', text)
  const client = new DeepSeekTypesetClient()
  return client.requestTypeset(systemPrompt, userPrompt)
}
