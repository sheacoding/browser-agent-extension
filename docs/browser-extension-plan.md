# AI Agent 浏览器插件开发计划

## 项目概述

开发一个 Chrome 浏览器插件，作为 AI Agent 与浏览器交互的桥梁。采用 MCP (Model Context Protocol) 协议，通过 Side Panel + WebSocket 与本地 MCP Server 通信，使用 Chrome DevTools Protocol (CDP) 控制浏览器。

### 设计原则

- **MCP 协议** - 标准化 AI 工具接口，原生支持 Claude Desktop / Cursor
- **Side Panel UI** - 用户可见的任务状态，明确的开启/关闭控制
- **不集成 LLM** - 插件只负责执行，AI 逻辑在外部客户端
- **CDP 为主** - 核心交互通过 chrome.debugger API 实现

---

## 架构设计

```
┌────────────────────────┐
│  Claude Desktop/Cursor │
│     (MCP Client)       │
└───────────┬────────────┘
            │ stdio (JSON-RPC 2.0)
            ▼
┌─────────────────────────┐
│    Go MCP Server        │
│  ┌───────────────────┐  │
│  │ MCP Tools         │  │
│  │ • browser_*       │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ WebSocket (:3026) │  │
│  └─────────┬─────────┘  │
└────────────┼────────────┘
             │
             ▼
┌───────────────────────────────────────────────┐
│              Chrome Extension                  │
│  ┌─────────────────────────────────────────┐  │
│  │  Side Panel                              │  │
│  │  • WebSocket Client                     │  │
│  │  • 任务日志 UI                          │  │
│  │  • 连接状态显示                         │  │
│  └─────────────────┬───────────────────────┘  │
│                    │ chrome.runtime           │
│  ┌─────────────────▼───────────────────────┐  │
│  │  Service Worker                          │  │
│  │  • BrowserContext (多标签页)            │  │
│  │  • Page (CDP 操作)                      │  │
│  └─────────────────┬───────────────────────┘  │
│                    │ chrome.debugger          │
│  ┌─────────────────▼───────────────────────┐  │
│  │  Content Script                          │  │
│  │  • DOM 辅助 / 遮罩层                    │  │
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
```

---

## 技术栈

| 类别 | 技术选型 | 说明 |
|------|----------|------|
| 扩展框架 | Chrome Extension Manifest V3 | 最新标准 |
| 开发语言 | TypeScript | 类型安全 |
| 构建工具 | Vite + CRXJS | 快速热重载 |
| MCP Server | Go + mcp-go | MCP 协议实现 |
| 扩展通信 | WebSocket | Side Panel 连接 |
| 浏览器控制 | chrome.debugger (CDP) | 核心自动化能力 |
| 包管理 | pnpm | 高效依赖管理 |

---

## 项目结构

```
browser-agent-extension/
├── src/
│   ├── background/           # Service Worker
│   │   └── index.ts          # 消息路由 + CDP 操作
│   │
│   ├── sidepanel/            # Side Panel
│   │   ├── index.html        # 页面
│   │   └── sidepanel.ts      # WebSocket + UI
│   │
│   ├── cdp/                  # CDP 封装层
│   │   ├── transport.ts      # ExtensionTransport
│   │   ├── page.ts           # Page 操作
│   │   └── context.ts        # BrowserContext
│   │
│   ├── content/              # Content Script
│   │   └── index.ts          # DOM 辅助 + 遮罩层
│   │
│   └── types/                # 类型定义
│
├── mcp-server/               # Go MCP Server
│   ├── main.go               # 入口
│   ├── tools.go              # MCP 工具定义
│   ├── websocket.go          # WebSocket 服务
│   └── go.mod
│
├── manifest.json
├── package.json
└── vite.config.ts
```

---

## MCP 工具列表

| 工具名 | 参数 | 说明 |
|--------|------|------|
| `browser_navigate` | url | 导航到 URL |
| `browser_click` | selector | 点击元素 |
| `browser_type` | selector, text | 输入文本 |
| `browser_screenshot` | fullPage? | 截图 |
| `browser_extract` | selector | 提取文本 |
| `browser_evaluate` | script | 执行 JS |
| `browser_scroll` | direction, distance | 滚动页面 |
| `browser_get_page_info` | - | 获取 URL/标题 |
| `browser_get_tabs` | - | 获取标签页列表 |
| `browser_switch_tab` | tabId | 切换标签页 |

---

## 消息协议

### WebSocket 消息格式

**请求 (MCP Server → Extension):**
```json
{
  "type": "REQUEST",
  "id": "req_123",
  "action": "navigate",
  "params": {
    "url": "https://example.com"
  }
}
```

**响应 (Extension → MCP Server):**
```json
{
  "type": "RESPONSE",
  "id": "req_123",
  "payload": {
    "success": true,
    "data": { "url": "https://example.com", "title": "Example" }
  }
}
```

---

## 使用流程

### 1. 启动 MCP Server

**claude_desktop_config.json:**
```json
{
  "mcpServers": {
    "browser-agent": {
      "command": "C:\path\to\mcp-server.exe"
    }
  }
}
```

### 2. 安装并打开扩展

1. 在 Chrome 加载扩展
2. 点击扩展图标，打开 Side Panel
3. Side Panel 自动连接 MCP Server

### 3. 使用 AI 控制浏览器

```
用户: 打开 google.com 并搜索 "MCP protocol"

Claude: 我来帮你完成这个任务。

[调用 browser_navigate]
[调用 browser_type]
[调用 browser_click]

已完成搜索，结果页面已显示。
```

---

## Side Panel 界面

```
┌─────────────────────────────────┐
│  Browser Agent           [─][×] │
├─────────────────────────────────┤
│  Status: ● Connected            │
├─────────────────────────────────┤
│  Task Log:                      │
│  ┌─────────────────────────────┐│
│  │ [10:30:01] navigate         ││
│  │   → https://google.com      ││
│  │ [10:30:02] ✓ completed      ││
│  │                             ││
│  │ [10:30:03] type             ││
│  │   → #search: "MCP"          ││
│  │ [10:30:04] ✓ completed      ││
│  └─────────────────────────────┘│
├─────────────────────────────────┤
│  [Clear Logs]                   │
└─────────────────────────────────┘
```

---

## 开发计划

### Phase 1: 基础架构
- [ ] Go MCP Server 框架
- [ ] WebSocket 通信层
- [ ] Chrome 扩展 Side Panel
- [ ] Service Worker 消息路由

### Phase 2: 核心功能
- [ ] CDP 封装层 (Page, BrowserContext)
- [ ] 基础 MCP 工具 (navigate, click, type)
- [ ] 截图功能
- [ ] 内容提取

### Phase 3: 增强功能
- [ ] 多标签页管理
- [ ] 遮罩层 UI
- [ ] 日志收集
- [ ] 错误处理

### Phase 4: 优化
- [ ] 连接重试机制
- [ ] 性能优化
- [ ] 文档完善

---

## 配置说明

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "Browser Agent",
  "version": "1.0.0",
  "permissions": [
    "sidePanel",
    "debugger",
    "tabs",
    "activeTab",
    "scripting"
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "Open Browser Agent"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

### 端口配置

| 服务 | 端口 | 说明 |
|------|------|------|
| MCP Server WebSocket | 3026 | 扩展连接 |

---

## 注意事项

1. **Side Panel 必须打开才能接收命令**
2. **MCP Server 由 AI 客户端启动**（Claude Desktop 会自动启动）
3. **WebSocket 仅监听 127.0.0.1**
4. **chrome.debugger 会显示调试提示条**
