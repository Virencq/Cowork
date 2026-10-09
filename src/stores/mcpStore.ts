import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { MCPServerConfig, MCPServerStatus, MCPTool, MCPResource } from '../types/mcp';
import { waitForServer } from '../utils/jcodeClient';
import {
  redactMCPServersForPersistence,
  splitMCPServerSecrets,
  type MCPSecretBundle,
} from '../utils/mcpConfigSecurity';

// ---- Tauri command response types (matches Rust mcp_manager.rs) ----

interface RustMCPTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface RustMCPServerStatus {
  name: string;
  status: string;
  error: string | null;
  tools: RustMCPTool[];
}

interface RemoteMCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface RemoteMCPResource {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
}

async function loadServerSecrets(name: string): Promise<MCPSecretBundle> {
  try {
    return await invoke<MCPSecretBundle>('mcp_secret_get', { name });
  } catch (error) {
    console.warn(`[mcp] Unable to load protected credentials for "${name}":`, error);
    return {};
  }
}

async function saveServerSecrets(config: MCPServerConfig): Promise<MCPServerConfig> {
  const split = splitMCPServerSecrets(config);
  if (Object.keys(split.secrets).length > 0) {
    await invoke('mcp_secret_merge', { name: config.name, values: split.secrets });
  }
  return split.config;
}

interface MCPState {
  servers: MCPServerConfig[];
  serverStatuses: Record<string, MCPServerStatus>;

  // Actions
  addServer: (config: MCPServerConfig) => void;
  updateServer: (name: string, config: Partial<MCPServerConfig>) => void;
  removeServer: (name: string) => void;
  toggleServer: (name: string) => void;

  // Status
  setServerStatus: (name: string, status: Partial<MCPServerStatus>) => void;
  refreshServer: (name: string) => Promise<void>;
  refreshAllServers: () => Promise<void>;

  // Direct MCP operations (via Tauri)
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;
  installRemoteServer: (config: MCPServerConfig, autoConnect?: boolean) => Promise<void>;
}

// Helper to map Rust type to local type
function mapRustTools(tools: RustMCPTool[]): MCPTool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.input_schema || {},
  }));
}

function mapRustStatus(rs: RustMCPServerStatus): MCPServerStatus {
  return {
    name: rs.name,
    status: (rs.status as MCPServerStatus['status']) || 'error',
    error: rs.error || undefined,
    tools: mapRustTools(rs.tools || []),
    resources: [],
  };
}

const DEFAULT_SERVERS: MCPServerConfig[] = [];

export const useMCPStore = create<MCPState>()(
  persist(
    (set, get) => ({
      servers: DEFAULT_SERVERS,
      serverStatuses: {},

      addServer: (config) => {
        const split = splitMCPServerSecrets(config);
        set((state) => ({
          servers: [...state.servers, split.config],
        }));
        if (Object.keys(split.secrets).length > 0) {
          invoke('mcp_secret_merge', { name: config.name, values: split.secrets }).catch((error) => {
            console.warn(`[mcp] Unable to protect credentials for "${config.name}":`, error);
          });
        }
      },

      updateServer: (name, updates) => {
        const existing = get().servers.find((server) => server.name === name);
        if (!existing) return;
        const split = splitMCPServerSecrets({ ...existing, ...updates, name });
        set((state) => ({
          servers: state.servers.map((server) =>
            server.name === name ? split.config : server
          ),
        }));
        if (Object.keys(split.secrets).length > 0) {
          invoke('mcp_secret_merge', { name, values: split.secrets }).catch((error) => {
            console.warn(`[mcp] Unable to protect credentials for "${name}":`, error);
          });
        }
      },

      removeServer: (name) => {
        // Disconnect from the correct backend without re-adding a status entry
        // after the config has been removed.
        const server = get().servers.find((item) => item.name === name);
        if (server?.type === 'stdio') {
          invoke('mcp_disconnect', { name }).catch(() => {});
        }
        invoke('mcp_secret_delete', { name }).catch(() => {});

        set((state) => {
          const newStatuses = { ...state.serverStatuses };
          delete newStatuses[name];
          return {
            servers: state.servers.filter((s) => s.name !== name),
            serverStatuses: newStatuses,
          };
        });
      },

      toggleServer: (name) => {
        const { servers } = get();
        const server = servers.find((s) => s.name === name);
        if (!server) return;

        const wasDisabled = !!server.disabled;

        set((state) => ({
          servers: state.servers.map((s) =>
            s.name === name ? { ...s, disabled: !s.disabled } : s
          ),
        }));

        if (wasDisabled) {
          // Was disabled, now enabling → connect
          get().connectServer(name);
        } else {
          // Was enabled, now disabling → disconnect
          get().setServerStatus(name, { status: 'disabled', tools: [], resources: [] });
          get().disconnectServer(name).catch(() => {});
        }
      },

      setServerStatus: (name, status) => {
        set((state) => ({
          serverStatuses: {
            ...state.serverStatuses,
            [name]: { ...state.serverStatuses[name], ...status } as MCPServerStatus,
          },
        }));
      },

      connectServer: async (name) => {
        const { servers } = get();
        const server = servers.find((s) => s.name === name);
        if (!server || server.disabled) return;

        get().setServerStatus(name, { status: 'connecting', tools: [], resources: [] });

        // JCode ACP currently consumes MCP from on-disk stdio configuration.
        // Do not pretend HTTP/SSE servers are connected through the removed
        // S-Loop sidecar; surface the capability boundary explicitly.
        if (server.type === 'sse' || server.type === 'http') {
          get().setServerStatus(name, {
            status: 'error',
            error: 'HTTP/SSE MCP is not supported by the JCode ACP runtime. Use a stdio MCP server.',
            tools: [],
            resources: [],
          });
          return;
        }

        // stdio type: connect via Rust backend
        get().setServerStatus(name, { status: 'connecting', tools: [], resources: [] });

        try {
          const command = server.type === 'stdio' ? (server.command || '') : '';
          const args = server.type === 'stdio' ? (server.args || []) : [];
          const secrets = server.hasStoredSecrets
            ? await loadServerSecrets(name)
            : {};
          const resolvedEnv = { ...(secrets.env || {}), ...(server.env || {}) };

          const result = await invoke<RustMCPServerStatus>('mcp_connect', {
            name,
            command,
            args,
            ...(Object.keys(resolvedEnv).length > 0 ? { env: resolvedEnv } : {}),
          });

          get().setServerStatus(name, mapRustStatus(result));

          // If connected successfully, refresh tools in the background
          if (result.status === 'connected') {
            invoke<RustMCPTool[]>('mcp_refresh_tools', { name })
              .then((tools) => {
                get().setServerStatus(name, {
                  tools: mapRustTools(tools || []),
                });
              })
              .catch((err) => {
                console.warn(`[mcp] Failed to refresh tools for '${name}':`, err);
              });
          }
        } catch (error) {
          get().setServerStatus(name, {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            tools: [],
            resources: [],
          });
        }
      },

      disconnectServer: async (name) => {
        const { servers } = get();
        const server = servers.find((s) => s.name === name);

        if (server?.type === 'stdio') {
          try {
            await invoke('mcp_disconnect', { name });
          } catch {
            // Ignore disconnect errors
          }
        }
        get().setServerStatus(name, { status: 'disabled', tools: [], resources: [] });
      },

      installRemoteServer: async (config, autoConnect = true) => {
        const publicConfig = await saveServerSecrets(config);
        const existing = get().servers.find((server) => server.name === config.name);
        if (existing) {
          get().updateServer(config.name, publicConfig);
        } else {
          get().addServer(publicConfig);
        }

        if (autoConnect && !publicConfig.disabled) {
          await get().connectServer(config.name);
        }
      },

      refreshServer: async (name) => {
        const { servers } = get();
        const server = servers.find((s) => s.name === name);
        if (!server || server.disabled) {
          get().setServerStatus(name, { status: 'disabled', tools: [], resources: [] });
          return;
        }

        if (server.type === 'sse' || server.type === 'http') {
          get().setServerStatus(name, {
            status: 'error',
            error: 'HTTP/SSE MCP is not supported by the JCode ACP runtime. Use a stdio MCP server.',
            tools: [],
            resources: [],
          });
          return;
        }

        // stdio: refresh via Rust backend
        try {
          const status = await invoke<RustMCPServerStatus>('mcp_get_status', { name });
          get().setServerStatus(name, mapRustStatus(status));

          // Refresh tools in background
          if (status.status === 'connected') {
            const tools = await invoke<RustMCPTool[]>('mcp_refresh_tools', { name });
            get().setServerStatus(name, { tools: mapRustTools(tools || []) });
          }
        } catch {
          // Not connected, try to connect
          get().connectServer(name);
        }
      },

      refreshAllServers: async () => {
        // Import servers configured directly in JCode's ~/.jcode/mcp.json first.
        // Merge by name so existing Cowork entries and secrets are not overwritten.
        try {
          const diskConfig = await invoke<unknown>('jcode_read_mcp_config');
          if (diskConfig && typeof diskConfig === 'object') {
            const rawServers = (diskConfig as Record<string, unknown>).mcpServers;
            if (rawServers && typeof rawServers === 'object' && !Array.isArray(rawServers)) {
              const currentNames = new Set(get().servers.map((server) => server.name));
              for (const [name, raw] of Object.entries(rawServers as Record<string, unknown>)) {
                if (currentNames.has(name) || !raw || typeof raw !== 'object') continue;
                const item = raw as Record<string, unknown>;
                const type = item.type === 'http' || item.type === 'sse' ? item.type : 'stdio';
                const command = typeof item.command === 'string' ? item.command : undefined;
                // JCode stdio entries need a command to be usable in Cowork.
                if (type === 'stdio' && !command) continue;
                const config: MCPServerConfig = {
                  name,
                  type,
                  ...(command ? { command } : {}),
                  ...(Array.isArray(item.args) ? { args: item.args.filter((arg): arg is string => typeof arg === 'string') } : {}),
                  ...(typeof item.url === 'string' ? { url: item.url } : {}),
                  ...(item.env && typeof item.env === 'object' && !Array.isArray(item.env) ? { env: item.env as Record<string, string> } : {}),
                  ...(item.headers && typeof item.headers === 'object' && !Array.isArray(item.headers) ? { headers: item.headers as Record<string, string> } : {}),
                  disabled: false,
                };
                await get().installRemoteServer(config, false);
                currentNames.add(name);
              }
            }
          }
        } catch (error) {
          console.warn('[mcp] Could not import JCode MCP config:', error);
        }

        const { servers } = get();
        const enabledServers = servers.filter((s) => !s.disabled);
        const statusMap: Record<string, MCPServerStatus> = {};

        // Fetch stdio MCP status from Rust backend
        try {
          const statuses = await invoke<RustMCPServerStatus[]>('mcp_list_servers');
          for (const s of statuses) {
            statusMap[s.name] = mapRustStatus(s);
          }
        } catch {
          // If listing fails, fallback to individual refresh
          for (const server of enabledServers) {
            if (server.type === 'stdio') {
              get().refreshServer(server.name).catch(() => {});
            }
          }
        }

        // JCode currently supports stdio MCP servers only. Mark configured
        // remote entries explicitly instead of probing a removed sidecar.
        for (const server of enabledServers) {
          if (server.type === 'sse' || server.type === 'http') {
            statusMap[server.name] = {
              name: server.name,
              status: 'error',
              error: 'HTTP/SSE MCP is not supported by the JCode ACP runtime. Use a stdio MCP server.',
              tools: [],
              resources: [],
            };
          }
        }

        // Publish the snapshot before starting asynchronous connections. This
        // prevents connectServer() results from being overwritten by the
        // stale snapshot below.
        set({ serverStatuses: statusMap });

        // Try connecting remote servers that aren't yet connected
        for (const server of enabledServers) {
          if ((server.type === 'sse' || server.type === 'http') && !statusMap[server.name]) {
            get().connectServer(server.name).catch(() => {});
          }
        }

        // Mark disabled servers
        for (const server of servers) {
          if (server.disabled) {
            get().setServerStatus(server.name, { status: 'disabled', tools: [], resources: [] });
          }
        }
      },
    }),
    {
      name: 'snotra-mcp-storage',
      partialize: (state) => ({
        servers: redactMCPServersForPersistence(state.servers),
      }),
      merge: (persisted, current) => {
        const stored = (persisted as Partial<MCPState>)?.servers || [];
        const servers = stored.map((server) => {
          const split = splitMCPServerSecrets(server);
          if (Object.keys(split.secrets).length > 0) {
            invoke('mcp_secret_merge', {
              name: server.name,
              values: split.secrets,
            }).catch(() => {});
          }
          return split.config;
        });
        return { ...current, servers };
      },
    }
  )
);
