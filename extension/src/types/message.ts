/**
 * 消息类型定义
 */

// Background ↔ Content Script 消息
export type ContentMessage =
  | { type: 'GET_DOM_TREE'; payload?: undefined }
  | { type: 'GET_ELEMENT_INFO'; payload: { selector: string } }
  | { type: 'EXTRACT_ELEMENTS'; payload: { selector: string; multiple: boolean; attributes?: string[] } }
  | { type: 'SCROLL_TO_ELEMENT'; payload: { selector: string } }
  | { type: 'HIGHLIGHT_ELEMENT'; payload: { selector: string } }
  | { type: 'EXECUTE_SCRIPT'; payload: { script: string } }
  | { type: 'SHOW_OVERLAY'; payload?: { status?: string } }
  | { type: 'HIDE_OVERLAY'; payload?: undefined }
  | { type: 'UPDATE_OVERLAY_STATUS'; payload: { status: string; shimmer?: boolean } }
  | { type: 'GET_OVERLAY_STATE'; payload?: undefined };

export type ContentResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };
