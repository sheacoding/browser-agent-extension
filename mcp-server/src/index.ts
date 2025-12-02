#!/usr/bin/env node
/**
 * Browser Agent MCP Server
 *
 * 通过 stdio 与 AI 客户端通信 (MCP 协议)
 * 通过 WebSocket 与浏览器扩展通信
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket } from 'ws';

const WS_PORT = 3026;

// 存储当前连接的扩展客户端
let extensionClient: WebSocket | null = null;

// 请求ID计数器
let requestIdCounter = 0;

// 等待响应的 Promise 映射
const pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}>();

/**
 * 发送请求到浏览器扩展
 */
async function sendToExtension(action: string, params?: Record<string, unknown>): Promise<unknown> {
  if (!extensionClient || extensionClient.readyState !== WebSocket.OPEN) {
    throw new Error('Browser extension not connected. Please open the extension side panel.');
  }

  const id = `req_${++requestIdCounter}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request timeout: ${action}`));
    }, 30000); // 30秒超时

    pendingRequests.set(id, { resolve, reject, timeout });

    const request = {
      type: 'REQUEST',
      id,
      action,
      params,
    };

    extensionClient!.send(JSON.stringify(request));
  });
}

/**
 * 定义 MCP 工具
 */
const TOOLS: Tool[] = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL in the browser',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: 'Click on an element or at specific coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to click' },
        x: { type: 'number', description: 'X coordinate to click at' },
        y: { type: 'number', description: 'Y coordinate to click at' },
      },
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an element or the currently focused element',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to type' },
        selector: { type: 'string', description: 'CSS selector of the element to type into (optional)' },
        clearFirst: { type: 'boolean', description: 'Clear the element before typing' },
      },
      required: ['text'],
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page in a direction or to an element',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Direction to scroll' },
        distance: { type: 'number', description: 'Distance to scroll in pixels' },
        selector: { type: 'string', description: 'CSS selector of element to scroll to' },
      },
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', description: 'Capture the full page or just the viewport' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp'], description: 'Image format' },
      },
    },
  },
  {
    name: 'browser_extract',
    description: 'Extract text and HTML content from an element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to extract' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_evaluate',
    description: 'Execute JavaScript code in the page context',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'JavaScript code to execute' },
      },
      required: ['script'],
    },
  },
  {
    name: 'browser_get_page_info',
    description: 'Get information about the current page (URL, title)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_get_tabs',
    description: 'Get list of all open browser tabs',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_switch_tab',
    description: 'Switch to a specific browser tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'The ID of the tab to switch to' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press (e.g., "Enter", "Escape", "Tab")' },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_select_option',
    description: 'Select an option from a dropdown/select element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the select element' },
        value: { type: 'string', description: 'Value of the option to select' },
        text: { type: 'string', description: 'Text content of the option to select' },
        index: { type: 'number', description: 'Index of the option to select' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_go_back',
    description: 'Navigate back in browser history',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_go_forward',
    description: 'Navigate forward in browser history',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_reload',
    description: 'Reload the current page',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * 工具名称到操作的映射
 */
function getActionFromToolName(toolName: string): string {
  const mapping: Record<string, string> = {
    browser_navigate: 'navigate',
    browser_click: 'click',
    browser_type: 'type',
    browser_scroll: 'scroll',
    browser_screenshot: 'screenshot',
    browser_extract: 'extract',
    browser_evaluate: 'evaluate',
    browser_get_page_info: 'get_page_info',
    browser_get_tabs: 'get_tabs',
    browser_switch_tab: 'switch_tab',
    browser_press_key: 'press_key',
    browser_select_option: 'select_option',
    browser_go_back: 'go_back',
    browser_go_forward: 'go_forward',
    browser_reload: 'reload',
  };
  return mapping[toolName] || toolName;
}

/**
 * 启动 WebSocket 服务器
 */
function startWebSocketServer(): WebSocketServer {
  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on('connection', (ws) => {
    console.error(`[MCP Server] Browser extension connected`);
    extensionClient = ws;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'RESPONSE') {
          const pending = pendingRequests.get(message.id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.delete(message.id);

            if (message.payload.success) {
              pending.resolve(message.payload.data);
            } else {
              pending.reject(new Error(message.payload.error || 'Unknown error'));
            }
          }
        }
      } catch (error) {
        console.error('[MCP Server] Failed to parse message:', error);
      }
    });

    ws.on('close', () => {
      console.error(`[MCP Server] Browser extension disconnected`);
      if (extensionClient === ws) {
        extensionClient = null;
      }
    });

    ws.on('error', (error) => {
      console.error('[MCP Server] WebSocket error:', error);
    });
  });

  wss.on('listening', () => {
    console.error(`[MCP Server] WebSocket server listening on port ${WS_PORT}`);
  });

  return wss;
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  // 启动 WebSocket 服务器
  startWebSocketServer();

  // 创建 MCP 服务器
  const server = new Server(
    {
      name: 'browser-agent',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 处理工具列表请求
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // 处理工具调用请求
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const action = getActionFromToolName(name);
      const result = await sendToExtension(action, args as Record<string, unknown>);

      // 特殊处理截图结果
      if (name === 'browser_screenshot' && result && typeof result === 'object') {
        const screenshotResult = result as { image?: string; width?: number; height?: number };
        if (screenshotResult.image) {
          return {
            content: [
              {
                type: 'image',
                data: screenshotResult.image,
                mimeType: 'image/png',
              },
              {
                type: 'text',
                text: `Screenshot captured: ${screenshotResult.width}x${screenshotResult.height}`,
              },
            ],
          };
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // 连接 stdio 传输
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP Server] MCP Server started');
}

main().catch((error) => {
  console.error('[MCP Server] Fatal error:', error);
  process.exit(1);
});
