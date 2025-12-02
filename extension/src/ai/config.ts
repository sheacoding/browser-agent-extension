/**
 * AI 配置管理
 * 使用 chrome.storage 存储 API Key 和配置
 */

import type { AIConfig, AIProvider } from '@/types/ai';

const STORAGE_KEY = 'ai_config';

/**
 * 获取 AI 配置
 */
export async function getAIConfig(): Promise<AIConfig | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

/**
 * 保存 AI 配置
 */
export async function saveAIConfig(config: AIConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}

/**
 * 更新部分配置
 */
export async function updateAIConfig(updates: Partial<AIConfig>): Promise<AIConfig | null> {
  const current = await getAIConfig();
  if (!current) return null;

  const updated = { ...current, ...updates };
  await saveAIConfig(updated);
  return updated;
}

/**
 * 清除 AI 配置
 */
export async function clearAIConfig(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

/**
 * 检查配置是否有效
 */
export function isConfigValid(config: AIConfig | null): config is AIConfig {
  return config !== null && !!config.provider && !!config.apiKey;
}

/**
 * 获取所有支持的提供商
 */
export function getSupportedProviders(): AIProvider[] {
  return ['openai', 'anthropic', 'google'];
}
