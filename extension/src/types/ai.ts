/**
 * AI 服务相关类型定义
 */

/**
 * 支持的 AI 提供商
 */
export type AIProvider = 'openai' | 'anthropic' | 'google';

/**
 * AI 配置
 */
export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  baseURL?: string; // 自定义 API 地址（用于代理）
}

/**
 * 各提供商的默认模型
 */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-1.5-pro',
};

/**
 * 聊天消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * AI 请求选项
 */
export interface AIRequestOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/**
 * AI 响应
 */
export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

/**
 * 流式响应回调
 */
export type StreamCallback = (chunk: string, done: boolean) => void;
