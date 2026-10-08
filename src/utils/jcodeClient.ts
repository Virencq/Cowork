import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface McpToolDef { serverName: string; name: string; description?: string; inputSchema?: unknown; }
export interface ContextStatus { type: string; [key: string]: unknown; }

export interface JCodePromptOptions {
  systemPrompt?: string;
  providerID?: string;
  providerAPI?: string;
  providerConfig?: unknown;
  modelID?: string;
  thinkingLevel?: string;
  apiKey?: string;
  workspaceDir?: string;
  workspaceRoots?: unknown[];
  tools?: McpToolDef[];
  permissionMode?: string;
  permissionRules?: unknown;
  images?: Array<{ data: string; mimeType: string }>;
  webSearchConfig?: unknown;
  allowedSseMcpToolNames?: string[];
}

export interface StreamHandlers {
  onText?: (partId: string, delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolCall?: (id: string, name: string, args: unknown) => void;
  onToolResult?: (id: string, name: string, result: unknown) => void;
  onToolApproval?: (request: any) => void;
  onMcpToolRequest?: (request: any) => void;
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

  if (event?.result?.stopReason) {
    handlers.onDone?.();
    return;
  }

  if (method === 'session/update') {
    const update = p.update ?? p;
    const kind = update?.sessionUpdate || update?.type || '';

    if (kind === 'agent_message_chunk' || kind.includes('text')) {
      const text = extractText(update);
      if (text) handlers.onText?.('jcode-text', text);
    } else if (kind === 'agent_thought_chunk' || kind.includes('thought') || kind.includes('reason')) {
      const text = extractText(update);
      if (text) handlers.onThinking?.(text);
    } else if (kind === 'tool_call') {
      const id = update.toolCallId || update.id || 'tool-' + Date.now();
      const name = update.title || update.name || update.toolName || 'tool';
      handlers.onToolCall?.(id, name, update.rawInput || update.arguments || update.args || {});
    } else if (kind === 'tool_call_update') {
      const id = update.toolCallId || update.id || 'tool';
      const name = update.title || update.name || update.toolName || 'tool';
      handlers.onToolResult?.(id, name, update);
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

export async function syncMcpConfig(servers: unknown[]) {
  return invoke<{ path: string; servers: number }>('jcode_sync_mcp_config', { servers })
}

export function getBaseUrl() { return ''; }
export async function waitForServer(..._args: any[]) { return true; }

export async function fetchModels(..._args: any[]) {
  return [] as Array<{ id: string; name: string }>;
}

export async function fetchProviders(): Promise<any[]> {
  return [];
}

export async function fetchModelCapabilities(..._args: any[]): Promise<any> {
  return {
    reasoning: true,
    supportedThinkingLevels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    recommendedThinkingLevel: 'medium',
  };
}

export async function prompt(sessionId: string, text: string, options: JCodePromptOptions = {}) {
  const finalPrompt = options.systemPrompt ? options.systemPrompt + '\\n\\n' + text : text;
  await invoke('jcode_prompt', { sessionId, prompt: finalPrompt });
  return { text: '', error: undefined as string | undefined };
}

export async function abortSession(sessionId: string) {
  await invoke('jcode_cancel', { sessionId });
}

export async function deleteSession(sessionId: string) {
  await invoke('jcode_close_session', { sessionId });
}

export async function subscribeStream(sessionId: string, handlers: StreamHandlers) {
  const unlisten = await listen<any>('jcode://event', (event) => {
    const payload = event.payload;
    if (payload?.sessionId === sessionId) extractUpdate(payload.event, handlers);
  });
  return () => { unlisten(); };
}

export async function sendMcpToolResponse(_sessionId: string, _requestId: string, _result: unknown, _error?: string) {}
export async function sendToolApproval(_sessionId: string, _requestId: string, _decision: any) {}
export function installJCodeFetchInterceptor() {}
export function setServerConnection(_url: string, _token: string) {}
export async function syncRuntimeConfig(_config: unknown) {}

export interface SubagentInfo {
  name: string;
  description: string;
  model?: string;
  tools: string[];
  source: 'builtin' | 'user';
}

export interface SubagentRunInfo {
  runId: string;
  agent: string;
  task: string;
  status: string;
  usage: { input: number; output: number; turns: number };
  budget: { maxTurns: number; maxTokens: number };
  durationMs?: number;
  errorMessage?: string;
  stopReason?: string;
}

export async function fetchSubagents(_projectDir?: string): Promise<SubagentInfo[]> { return []; }
export async function fetchSubagentRuns(_limit = 12): Promise<SubagentRunInfo[]> { return []; }
export async function saveSubagent(_name: string, _config: unknown) { return { ok: true }; }
export async function deleteSubagent(_name: string, _projectDir?: string) {}
export async function cancelSubagentRun(_runId: string) {}
