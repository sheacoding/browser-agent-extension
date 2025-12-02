/**
 * Content Script
 * 用于复杂 DOM 操作、Shadow DOM 访问和控制遮罩
 */

import type { ContentMessage, ContentResponse } from '@/types/message';

// ============================================================================
// Agent 控制遮罩层
// ============================================================================

interface OverlayState {
  enabled: boolean;
  status: string;
  element: HTMLDivElement | null;
}

const overlayState: OverlayState = {
  enabled: false,
  status: '',
  element: null,
};

/**
 * 创建控制遮罩层的样式
 */
function createOverlayStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.id = 'agents-cc-overlay-styles';
  style.textContent = `
    @keyframes agents-cc-border-pulse {
      0%, 100% {
        box-shadow: inset 0 0 0 4px rgba(59, 130, 246, 0.8),
                    inset 0 0 30px rgba(59, 130, 246, 0.3),
                    0 0 20px rgba(59, 130, 246, 0.4);
      }
      50% {
        box-shadow: inset 0 0 0 4px rgba(59, 130, 246, 1),
                    inset 0 0 50px rgba(59, 130, 246, 0.5),
                    0 0 40px rgba(59, 130, 246, 0.6);
      }
    }

    @keyframes agents-cc-dot-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }

    @keyframes agents-cc-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    #agents-cc-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 2147483646;
      pointer-events: auto;
      animation: agents-cc-border-pulse 2s ease-in-out infinite;
      transition: opacity 0.3s ease;
    }

    #agents-cc-overlay.agents-cc-hidden {
      opacity: 0;
      pointer-events: none;
    }

    #agents-cc-overlay-blocker {
      position: absolute;
      top: 4px;
      left: 4px;
      right: 4px;
      bottom: 4px;
      background: transparent;
      cursor: not-allowed;
    }

    #agents-cc-status-bar {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 10px;
      background: linear-gradient(135deg, rgba(30, 58, 138, 0.95), rgba(59, 130, 246, 0.9));
      backdrop-filter: blur(10px);
      padding: 10px 20px;
      border-radius: 50px;
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4),
                  0 0 0 1px rgba(255, 255, 255, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #agents-cc-status-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #agents-cc-status-icon svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    #agents-cc-status-dot {
      width: 8px;
      height: 8px;
      background: #4ade80;
      border-radius: 50%;
      animation: agents-cc-dot-pulse 1.5s ease-in-out infinite;
      box-shadow: 0 0 10px #4ade80;
    }

    #agents-cc-status-text {
      color: white;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.3px;
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      background: linear-gradient(90deg, white 40%, rgba(255,255,255,0.6) 50%, white 60%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      background-clip: text;
    }

    #agents-cc-status-text.agents-cc-shimmer {
      animation: agents-cc-shimmer 2s linear infinite;
      -webkit-text-fill-color: transparent;
    }

    #agents-cc-corner-indicator {
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(30, 58, 138, 0.9);
      backdrop-filter: blur(10px);
      padding: 8px 14px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }

    #agents-cc-corner-indicator span {
      color: rgba(255, 255, 255, 0.9);
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  `;
  return style;
}

/**
 * 创建遮罩层 DOM 结构
 */
function createOverlayElement(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'agents-cc-overlay';
  overlay.className = 'agents-cc-hidden';

  overlay.innerHTML = `
    <div id="agents-cc-overlay-blocker"></div>
    <div id="agents-cc-status-bar">
      <div id="agents-cc-status-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
      <div id="agents-cc-status-dot"></div>
      <span id="agents-cc-status-text">Agent is controlling this page</span>
    </div>
    <div id="agents-cc-corner-indicator">
      <div id="agents-cc-status-dot" style="width:6px;height:6px;"></div>
      <span>Agents CC Active</span>
    </div>
  `;

  // 阻止所有用户输入事件
  const blocker = overlay.querySelector('#agents-cc-overlay-blocker') as HTMLDivElement;

  const blockEvent = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  };

  // 阻止鼠标事件
  ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel'].forEach(event => {
    blocker.addEventListener(event, blockEvent, true);
  });

  // 阻止键盘事件（在 document 级别）
  const keyBlocker = (e: KeyboardEvent) => {
    if (overlayState.enabled) {
      // 允许一些系统快捷键
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
        return; // 允许打开 DevTools
      }
      e.preventDefault();
      e.stopPropagation();
    }
  };

  document.addEventListener('keydown', keyBlocker, true);
  document.addEventListener('keyup', keyBlocker, true);
  document.addEventListener('keypress', keyBlocker, true);

  return overlay;
}

/**
 * 初始化遮罩层
 */
function initOverlay(): void {
  // 检查是否已初始化
  if (document.getElementById('agents-cc-overlay')) {
    return;
  }

  // 添加样式
  const existingStyle = document.getElementById('agents-cc-overlay-styles');
  if (!existingStyle) {
    document.head.appendChild(createOverlayStyles());
  }

  // 创建遮罩层
  overlayState.element = createOverlayElement();
  document.body.appendChild(overlayState.element);
}

/**
 * 显示遮罩层
 */
function showOverlay(status?: string): ContentResponse<boolean> {
  try {
    initOverlay();

    if (overlayState.element) {
      overlayState.element.classList.remove('agents-cc-hidden');
      overlayState.enabled = true;

      if (status) {
        updateOverlayStatus(status);
      }
    }

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to show overlay',
    };
  }
}

/**
 * 隐藏遮罩层
 */
function hideOverlay(): ContentResponse<boolean> {
  try {
    if (overlayState.element) {
      overlayState.element.classList.add('agents-cc-hidden');
      overlayState.enabled = false;
    }

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to hide overlay',
    };
  }
}

/**
 * 更新遮罩层状态文本
 */
function updateOverlayStatus(status: string, shimmer: boolean = false): ContentResponse<boolean> {
  try {
    initOverlay();

    const statusText = document.getElementById('agents-cc-status-text');
    if (statusText) {
      statusText.textContent = status;
      overlayState.status = status;

      if (shimmer) {
        statusText.classList.add('agents-cc-shimmer');
      } else {
        statusText.classList.remove('agents-cc-shimmer');
      }
    }

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update status',
    };
  }
}

/**
 * 获取遮罩层状态
 */
function getOverlayState(): ContentResponse<{ enabled: boolean; status: string }> {
  return {
    success: true,
    data: {
      enabled: overlayState.enabled,
      status: overlayState.status,
    },
  };
}

/**
 * 构建 DOM 树（带元素索引）
 */
function buildDomTree(): DOMTreeNode[] {
  let index = 0;

  function processNode(node: Element): DOMTreeNode | null {
    // 跳过不可见元素
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return null;
    }

    const rect = node.getBoundingClientRect();

    // 跳过零尺寸元素
    if (rect.width === 0 && rect.height === 0) {
      return null;
    }

    const currentIndex = index++;
    const children: DOMTreeNode[] = [];

    // 处理 Shadow DOM
    if (node.shadowRoot) {
      for (const child of node.shadowRoot.children) {
        if (child instanceof Element) {
          const childNode = processNode(child);
          if (childNode) {
            children.push(childNode);
          }
        }
      }
    }

    // 处理普通子节点
    for (const child of node.children) {
      const childNode = processNode(child);
      if (childNode) {
        children.push(childNode);
      }
    }

    // 获取文本内容（仅直接文本）
    let text = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent?.trim() || '';
      }
    }

    return {
      index: currentIndex,
      tagName: node.tagName.toLowerCase(),
      id: node.id || undefined,
      className: node.className || undefined,
      text: text.slice(0, 200),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      attributes: getImportantAttributes(node),
      children: children.length > 0 ? children : undefined,
    };
  }

  const result: DOMTreeNode[] = [];
  const root = processNode(document.body);
  if (root) {
    result.push(root);
  }

  return result;
}

interface DOMTreeNode {
  index: number;
  tagName: string;
  id?: string;
  className?: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
  children?: DOMTreeNode[];
}

/**
 * 获取重要属性
 */
function getImportantAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  const important = ['href', 'src', 'alt', 'title', 'placeholder', 'type', 'name', 'value', 'role', 'aria-label'];

  for (const attr of important) {
    const value = element.getAttribute(attr);
    if (value) {
      attrs[attr] = value;
    }
  }

  return attrs;
}

/**
 * 获取元素信息
 */
function getElementInfo(selector: string): ContentResponse<ElementInfo> {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      success: true,
      data: {
        tagName: element.tagName.toLowerCase(),
        text: element.textContent?.trim().slice(0, 500) || '',
        html: element.outerHTML.slice(0, 2000),
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        visible: style.display !== 'none' && style.visibility !== 'hidden',
        attributes: Object.fromEntries(
          Array.from(element.attributes).map(a => [a.name, a.value])
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface ElementInfo {
  tagName: string;
  text: string;
  html: string;
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
  attributes: Record<string, string>;
}

/**
 * 提取多个元素
 */
function extractElements(
  selector: string,
  multiple: boolean,
  attributes?: string[]
): ContentResponse<ExtractedElement[]> {
  try {
    const elements = multiple
      ? Array.from(document.querySelectorAll(selector))
      : [document.querySelector(selector)].filter((e): e is Element => e !== null);

    const result: ExtractedElement[] = elements.map((el, idx) => {
      const rect = el.getBoundingClientRect();
      const attrs: Record<string, string> = {};

      if (attributes && attributes.length > 0) {
        for (const attr of attributes) {
          const value = el.getAttribute(attr);
          if (value !== null) {
            attrs[attr] = value;
          }
        }
      } else {
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
      }

      return {
        index: idx,
        tagName: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 500) || '',
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        attributes: attrs,
      };
    });

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface ExtractedElement {
  index: number;
  tagName: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
}

/**
 * 滚动到元素
 */
function scrollToElement(selector: string): ContentResponse<boolean> {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 高亮元素
 */
function highlightElement(selector: string): ContentResponse<boolean> {
  try {
    // 移除之前的高亮
    document.querySelectorAll('.agents-cc-highlight').forEach(el => el.remove());

    const element = document.querySelector(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    const rect = element.getBoundingClientRect();

    const highlight = document.createElement('div');
    highlight.className = 'agents-cc-highlight';
    highlight.style.cssText = `
      position: fixed;
      left: ${rect.x}px;
      top: ${rect.y}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 2px solid #4CAF50;
      background: rgba(76, 175, 80, 0.2);
      pointer-events: none;
      z-index: 999999;
      transition: opacity 0.3s;
    `;

    document.body.appendChild(highlight);

    // 3秒后移除
    setTimeout(() => {
      highlight.style.opacity = '0';
      setTimeout(() => highlight.remove(), 300);
    }, 3000);

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 执行脚本
 */
function executeScript(script: string): ContentResponse<unknown> {
  try {
    const result = eval(script);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 消息处理器
 */
chrome.runtime.onMessage.addListener(
  (message: ContentMessage, sender, sendResponse) => {
    let response: ContentResponse<unknown>;

    switch (message.type) {
      case 'GET_DOM_TREE':
        response = { success: true, data: buildDomTree() };
        break;

      case 'GET_ELEMENT_INFO':
        response = getElementInfo(message.payload.selector);
        break;

      case 'EXTRACT_ELEMENTS':
        response = extractElements(
          message.payload.selector,
          message.payload.multiple,
          message.payload.attributes
        );
        break;

      case 'SCROLL_TO_ELEMENT':
        response = scrollToElement(message.payload.selector);
        break;

      case 'HIGHLIGHT_ELEMENT':
        response = highlightElement(message.payload.selector);
        break;

      case 'EXECUTE_SCRIPT':
        response = executeScript(message.payload.script);
        break;

      // 遮罩层控制
      case 'SHOW_OVERLAY':
        response = showOverlay(message.payload?.status);
        break;

      case 'HIDE_OVERLAY':
        response = hideOverlay();
        break;

      case 'UPDATE_OVERLAY_STATUS':
        response = updateOverlayStatus(
          message.payload.status,
          message.payload.shimmer
        );
        break;

      case 'GET_OVERLAY_STATE':
        response = getOverlayState();
        break;

      default:
        // 对于未知消息类型，不响应，让其他监听器处理
        return false;
    }

    sendResponse(response);
    return true;
  }
);

// 标识 Content Script 已加载
console.log('[Browser Agent] Content Script loaded');
