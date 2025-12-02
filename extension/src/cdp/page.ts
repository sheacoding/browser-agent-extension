/**
 * Page - 单标签页操作封装
 * 提供高级浏览器操作 API
 */

import { ExtensionTransport } from './transport';
import type {
  CaptureScreenshotParams,
  MouseEventParams,
  EvaluateResult,
  BoxModel
} from '@/types/cdp';

export class Page {
  private tabId: number;
  private transport: ExtensionTransport;
  private initialized: boolean = false;

  constructor(tabId: number) {
    this.tabId = tabId;
    this.transport = new ExtensionTransport(tabId);
  }

  /**
   * 初始化页面连接
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.transport.attach();

    // 启用必要的 CDP 域
    await Promise.all([
      this.transport.send('Page.enable'),
      this.transport.send('DOM.enable'),
      this.transport.send('Runtime.enable'),
    ]);

    this.initialized = true;
  }

  /**
   * 关闭页面连接
   */
  async close(): Promise<void> {
    if (!this.initialized) return;
    await this.transport.detach();
    this.initialized = false;
  }

  /**
   * 导航到指定 URL
   */
  async navigateTo(url: string): Promise<{ frameId: string; loaderId: string }> {
    const result = await this.transport.send<{ frameId: string; loaderId: string }>(
      'Page.navigate',
      { url }
    );
    return result;
  }

  /**
   * 等待页面加载完成
   */
  async waitForNavigation(timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.transport.off(handler);
        reject(new Error('Navigation timeout'));
      }, timeout);

      const handler = (method: string) => {
        if (method === 'Page.loadEventFired') {
          clearTimeout(timer);
          this.transport.off(handler);
          resolve();
        }
      };

      this.transport.on(handler);
    });
  }

  /**
   * 后退
   */
  async goBack(): Promise<void> {
    const history = await this.transport.send<{ currentIndex: number; entries: unknown[] }>(
      'Page.getNavigationHistory'
    );

    if (history.currentIndex > 0) {
      await this.transport.send('Page.navigateToHistoryEntry', {
        entryId: (history.entries[history.currentIndex - 1] as { id: number }).id,
      });
    }
  }

  /**
   * 前进
   */
  async goForward(): Promise<void> {
    const history = await this.transport.send<{ currentIndex: number; entries: unknown[] }>(
      'Page.getNavigationHistory'
    );

    if (history.currentIndex < history.entries.length - 1) {
      await this.transport.send('Page.navigateToHistoryEntry', {
        entryId: (history.entries[history.currentIndex + 1] as { id: number }).id,
      });
    }
  }

  /**
   * 刷新页面
   */
  async reload(): Promise<void> {
    await this.transport.send('Page.reload');
  }

  /**
   * 截图
   */
  async captureScreenshot(options: CaptureScreenshotParams = {}): Promise<string> {
    const result = await this.transport.send<{ data: string }>(
      'Page.captureScreenshot',
      {
        format: options.format || 'png',
        quality: options.quality,
        clip: options.clip,
        captureBeyondViewport: options.captureBeyondViewport ?? true,
      }
    );
    return result.data;
  }

  /**
   * 执行 JavaScript
   */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.transport.send<EvaluateResult>(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }
    );

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }

    return result.result.value as T;
  }

  /**
   * 点击坐标
   */
  async clickAt(x: number, y: number, options: { button?: 'left' | 'right' | 'middle'; clickCount?: number } = {}): Promise<void> {
    const button = options.button || 'left';
    const clickCount = options.clickCount || 1;

    // 移动鼠标
    await this.transport.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });

    // 按下
    await this.transport.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button,
      clickCount,
    });

    // 释放
    await this.transport.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button,
      clickCount,
    });
  }

  /**
   * 通过选择器点击元素
   */
  async clickElement(selector: string): Promise<{ tagName: string; text: string }> {
    // 获取元素中心坐标
    const elementInfo = await this.evaluate<{ x: number; y: number; tagName: string; text: string }>(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ${selector}');
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          tagName: el.tagName,
          text: el.textContent?.slice(0, 100) || ''
        };
      })()
    `);

    await this.clickAt(elementInfo.x, elementInfo.y);

    return {
      tagName: elementInfo.tagName,
      text: elementInfo.text,
    };
  }

  /**
   * 输入文本
   */
  async type(text: string, delay: number = 0): Promise<void> {
    if (delay === 0) {
      // 快速输入
      await this.transport.send('Input.insertText', { text });
    } else {
      // 逐字输入
      for (const char of text) {
        await this.transport.send('Input.insertText', { text: char });
        await this.sleep(delay);
      }
    }
  }

  /**
   * 在元素中输入文本
   */
  async typeInElement(selector: string, text: string, options: { clearFirst?: boolean; delay?: number } = {}): Promise<void> {
    // 先点击元素获取焦点
    await this.clickElement(selector);

    // 清空现有内容
    if (options.clearFirst) {
      await this.evaluate(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (el) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
              el.value = '';
            } else {
              el.textContent = '';
            }
          }
        })()
      `);
    }

    // 输入文本
    await this.type(text, options.delay);
  }

  /**
   * 按键
   */
  async pressKey(key: string): Promise<void> {
    await this.transport.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
    });
    await this.transport.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
    });
  }

  /**
   * 滚动页面
   */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', distance: number = 500): Promise<{ x: number; y: number }> {
    let deltaX = 0;
    let deltaY = 0;

    switch (direction) {
      case 'up':
        deltaY = -distance;
        break;
      case 'down':
        deltaY = distance;
        break;
      case 'left':
        deltaX = -distance;
        break;
      case 'right':
        deltaX = distance;
        break;
    }

    await this.transport.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 400,
      y: 300,
      deltaX,
      deltaY,
    });

    // 返回当前滚动位置
    return this.evaluate<{ x: number; y: number }>(`
      ({ x: window.scrollX, y: window.scrollY })
    `);
  }

  /**
   * 滚动到元素
   */
  async scrollToElement(selector: string): Promise<void> {
    await this.evaluate(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      })()
    `);
  }

  /**
   * 滚动到指定位置
   */
  async scrollTo(x: number, y: number): Promise<void> {
    await this.evaluate(`window.scrollTo(${x}, ${y})`);
  }

  /**
   * 获取页面信息
   */
  async getPageInfo(): Promise<{ url: string; title: string }> {
    return this.evaluate<{ url: string; title: string }>(`
      ({ url: window.location.href, title: document.title })
    `);
  }

  /**
   * 获取视口尺寸
   */
  async getViewportSize(): Promise<{ width: number; height: number }> {
    return this.evaluate<{ width: number; height: number }>(`
      ({ width: window.innerWidth, height: window.innerHeight })
    `);
  }

  /**
   * 辅助方法：延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 移动鼠标到指定坐标
   */
  async moveMouse(x: number, y: number, steps: number = 1): Promise<void> {
    if (steps <= 1) {
      await this.transport.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
      });
    } else {
      // 获取当前鼠标位置（默认从视口中心开始）
      const viewport = await this.getViewportSize();
      let currentX = viewport.width / 2;
      let currentY = viewport.height / 2;

      const deltaX = (x - currentX) / steps;
      const deltaY = (y - currentY) / steps;

      for (let i = 1; i <= steps; i++) {
        currentX += deltaX;
        currentY += deltaY;
        await this.transport.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: Math.round(currentX),
          y: Math.round(currentY),
        });
        await this.sleep(10);
      }
    }
  }

  /**
   * 选择下拉框选项
   */
  async selectOption(
    selector: string,
    options: { value?: string; text?: string; index?: number }
  ): Promise<{ value: string; text: string }> {
    const result = await this.evaluate<{ value: string; text: string }>(`
      (function() {
        const select = document.querySelector(${JSON.stringify(selector)});
        if (!select || select.tagName !== 'SELECT') {
          throw new Error('Element is not a SELECT: ${selector}');
        }

        let optionToSelect = null;

        ${options.value !== undefined ? `
        // 按 value 选择
        optionToSelect = Array.from(select.options).find(opt => opt.value === ${JSON.stringify(options.value)});
        ` : ''}

        ${options.text !== undefined ? `
        // 按 text 选择
        if (!optionToSelect) {
          optionToSelect = Array.from(select.options).find(opt => opt.text === ${JSON.stringify(options.text)});
        }
        ` : ''}

        ${options.index !== undefined ? `
        // 按 index 选择
        if (!optionToSelect) {
          optionToSelect = select.options[${options.index}];
        }
        ` : ''}

        if (!optionToSelect) {
          throw new Error('Option not found');
        }

        select.value = optionToSelect.value;

        // 触发 change 事件
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));

        return {
          value: optionToSelect.value,
          text: optionToSelect.text
        };
      })()
    `);

    return result;
  }

  /**
   * 启用控制台日志收集
   */
  async enableConsoleCapture(): Promise<void> {
    await this.transport.send('Runtime.enable');
    await this.transport.send('Log.enable');
  }

  /**
   * 获取控制台日志
   */
  async getConsoleLogs(): Promise<Array<{
    type: 'log' | 'info' | 'warn' | 'error' | 'debug';
    text: string;
    timestamp: number;
    url?: string;
    lineNumber?: number;
  }>> {
    // 通过注入脚本获取控制台日志
    const logs = await this.evaluate<Array<{
      type: string;
      text: string;
      timestamp: number;
      url?: string;
      lineNumber?: number;
    }>>(`
      (function() {
        // 如果还没有设置日志收集器，设置一个
        if (!window.__agentsCCConsoleLogs) {
          window.__agentsCCConsoleLogs = [];
          window.__agentsCCMaxLogs = 1000;

          const originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
            debug: console.debug
          };

          ['log', 'info', 'warn', 'error', 'debug'].forEach(type => {
            console[type] = function(...args) {
              window.__agentsCCConsoleLogs.push({
                type: type,
                text: args.map(arg => {
                  try {
                    return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
                  } catch {
                    return String(arg);
                  }
                }).join(' '),
                timestamp: Date.now()
              });

              // 限制日志数量
              if (window.__agentsCCConsoleLogs.length > window.__agentsCCMaxLogs) {
                window.__agentsCCConsoleLogs.shift();
              }

              originalConsole[type].apply(console, args);
            };
          });

          // 监听全局错误
          window.addEventListener('error', (event) => {
            window.__agentsCCConsoleLogs.push({
              type: 'error',
              text: event.message,
              timestamp: Date.now(),
              url: event.filename,
              lineNumber: event.lineno
            });
          });

          // 监听未处理的 Promise 错误
          window.addEventListener('unhandledrejection', (event) => {
            window.__agentsCCConsoleLogs.push({
              type: 'error',
              text: 'Unhandled Promise Rejection: ' + String(event.reason),
              timestamp: Date.now()
            });
          });
        }

        // 返回并清空日志
        const logs = window.__agentsCCConsoleLogs.slice();
        window.__agentsCCConsoleLogs = [];
        return logs;
      })()
    `);

    return logs as Array<{
      type: 'log' | 'info' | 'warn' | 'error' | 'debug';
      text: string;
      timestamp: number;
      url?: string;
      lineNumber?: number;
    }>;
  }

  /**
   * 获取 transport 实例（用于高级操作）
   */
  getTransport(): ExtensionTransport {
    return this.transport;
  }

  /**
   * 获取标签页 ID
   */
  getTabId(): number {
    return this.tabId;
  }
}
