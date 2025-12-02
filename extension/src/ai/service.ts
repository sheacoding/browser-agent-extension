/**
 * AI 服务核心模块
 * 基于 Vercel AI SDK 实现多提供商支持
 */

import { generateText, streamText, type CoreMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type {
  AIConfig,
  AIRequestOptions,
  AIResponse,
  ChatMessage,
  StreamCallback,
} from '@/types/ai';
import { DEFAULT_MODELS } from '@/types/ai';
import { getAIConfig, isConfigValid } from './config';

/**
 * 创建提供商客户端
 */
function createProviderClient(config: AIConfig) {
  const { provider, apiKey, baseURL } = config;

  switch (provider) {
    case 'openai':
      return createOpenAI({
        apiKey,
        baseURL,
      });

    case 'anthropic':
      return createAnthropic({
        apiKey,
        baseURL,
      });

    case 'google':
      return createGoogleGenerativeAI({
        apiKey,
        baseURL,
      });

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * 获取模型实例
 */
function getModel(config: AIConfig) {
  const client = createProviderClient(config);
  const modelId = config.model || DEFAULT_MODELS[config.provider];
  return client(modelId);
}

/**
 * 转换消息格式为 Vercel AI SDK 格式
 */
function convertMessages(messages: ChatMessage[]): CoreMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * AI 服务类
 */
export class AIService {
  private config: AIConfig | null = null;

  /**
   * 初始化服务（从存储加载配置）
   */
  async initialize(): Promise<boolean> {
    this.config = await getAIConfig();
    return isConfigValid(this.config);
  }

  /**
   * 设置配置（不保存到存储）
   */
  setConfig(config: AIConfig): void {
    this.config = config;
  }

  /**
   * 获取当前配置
   */
  getConfig(): AIConfig | null {
    return this.config;
  }

  /**
   * 检查服务是否可用
   */
  isReady(): boolean {
    return isConfigValid(this.config);
  }

  /**
   * 生成文本（非流式）
   */
  async generateText(options: AIRequestOptions): Promise<AIResponse> {
    if (!isConfigValid(this.config)) {
      throw new Error('AI service not configured. Please set API key first.');
    }

    const model = getModel(this.config);
    const messages = convertMessages(options.messages);

    const result = await generateText({
      model,
      messages,
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
    });

    // 处理 usage 数据（新版 SDK 使用 inputTokens/outputTokens）
    let usage: AIResponse['usage'];
    if (result.usage) {
      const u = result.usage;
      usage = {
        promptTokens: u.inputTokens ?? 0,
        completionTokens: u.outputTokens ?? 0,
        totalTokens: u.totalTokens ?? 0,
      };
    }

    return {
      content: result.text,
      model: this.config.model || DEFAULT_MODELS[this.config.provider],
      usage,
      finishReason: result.finishReason,
    };
  }

  /**
   * 流式生成文本
   */
  async streamText(
    options: AIRequestOptions,
    onChunk: StreamCallback
  ): Promise<AIResponse> {
    if (!isConfigValid(this.config)) {
      throw new Error('AI service not configured. Please set API key first.');
    }

    const model = getModel(this.config);
    const messages = convertMessages(options.messages);

    const result = streamText({
      model,
      messages,
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
    });

    let fullContent = '';

    for await (const chunk of result.textStream) {
      fullContent += chunk;
      onChunk(chunk, false);
    }

    onChunk('', true);

    // 等待获取最终结果
    const [usage, finishReason] = await Promise.all([
      result.usage,
      result.finishReason,
    ]);

    // 处理 usage 数据（新版 SDK 使用 inputTokens/outputTokens）
    let usageData: AIResponse['usage'];
    if (usage) {
      usageData = {
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      };
    }

    return {
      content: fullContent,
      model: this.config.model || DEFAULT_MODELS[this.config.provider],
      usage: usageData,
      finishReason,
    };
  }

  /**
   * 简单对话（单轮）
   */
  async chat(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.generateText({ messages });
    return response.content;
  }

  /**
   * 多轮对话
   */
  async conversation(
    messages: ChatMessage[],
    options?: Partial<AIRequestOptions>
  ): Promise<AIResponse> {
    return this.generateText({
      messages,
      ...options,
    });
  }
}

// 导出单例
export const aiService = new AIService();
