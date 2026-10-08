import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface McpToolDef { serverName: string; name: string; description?: string; inputSchema?: unknown; }
export interface ContextStatus { type: string; [key: string]: unknown; }
export interface JCodePromptOptions {
  systemPrompt?: string; providerID?: string; modelID?: string; thinkingLevel?: string;
  apiKey?: string; workspaceDir?: string; workspaceRoots?: unknown[]; tools?: McpToolDef[];
  permissionMode?: string; permissionRules?: unknown; images?: Array<{ data: string; mimeType: string }>;
}
export interface StreamHandlers {
  onText?: (partId: string, delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolCall?: (id: string, name: string, args: unknown) => void;
  onToolResult?: (id: string, name: string, result: unknown) => void;
  onToolApproval?: (request: any) => void;
  onStatus?: (status: ContextStatus) => void;
  onDone?: () => void;
}

function extractText(value: any): string {
  const p = value?.params ?? {};
  return p?.delta?.text ?? p?.delta?.content ?? p?.content?.text ?? p?.text ?? '';
}

function extractUpdate(event: any, handlers: StreamHandlers) {
  const method = event?.method || '';
  const p = event?.params ?? {};
  if (method === 'session/update') {
    const update = p.update ?? p;
    const kind = update?.sessionUpdate || update?.type || '';
    if (kind.includes('text')) {
      const text = extractText(update);
      if (text) handlers.onText?.('jcode-text', text);
    } else if (kind.includes('thought') || kind.includes('reason')) {
      const text = extractText(update);
      if (text) handlers.onThinking?.(text);
    } else if (kind.includes('tool')) {
      const id = update.toolCallId || update.id || 'tool-' + Date.now();
      const name = update.name || update.toolName || 'tool';
      if (kind.includes('result') || update.status === 'completed') handlers.onToolResult?.(id, name, update);
      else handlers.onToolCall?.(id, name, update.arguments || update.args || {});
    } else if (kind.includes('complete') || kind.includes('finished')) {
      handlers.onDone?.();
    }
  } else if (method === 'session/request_permission' || method === 'session/permission_request') {
    handlers.onToolApproval?.(p);
  } else if (method === 'session/closed') {
    handlers.onDone?.();
  }
}

export async function status() {
  return invoke<{ installed: boolean; path?: string; error?: string }>('jcode_status');
}
export async function createSession(workspaceDir?: string): Promise<{ id: string }> {
  const id = await invoke<string>('jcode_start_session', { workspaceDir });
  return { id };
}
export async function prompt(sessionId: string, text: string, options: JCodePromptOptions = {}) {
  const finalPrompt = options.systemPrompt ? options.systemPrompt + '\n\n' + text : text;
  await invoke('jcode_prompt', { sessionId, prompt: finalPrompt });
  return { text: '' };
}
export async function abortSession(sessionId: string) { await invoke('jcode_cancel', { sessionId }); }
export async function deleteSession(sessionId: string) { await invoke('jcode_close_session', { sessionId }); }
export async function subscribeStream(sessionId: string, handlers: StreamHandlers) {
  const unlisten = await listen<any>('jcode://event', (event) => {
    const payload = event.payload;
    if (payload?.sessionId === sessionId) extractUpdate(payload.event, handlers);
  });
  return () => { unlisten(); };
}
export async function sendMcpToolResponse(_sessionId: string, _requestId: string, _result: unknown, _error?: string) {}
export function installJCodeFetchInterceptor() {}
