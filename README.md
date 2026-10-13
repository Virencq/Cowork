# Orbito — AI Workspace for Real Work

Orbito is a desktop AI workspace that brings projects, agents, tools, and tasks together in one place.

> **AI Workspace for Real Work**

## Product

- Project-based workspaces and task history
- Agent conversations and tool execution
- Contextual sidebars and workspace files
- MCP integrations and Skills
- Scheduled tasks and artifacts
- Browser integration

## Technology

- Tauri 2
- React and TypeScript
- Rust
- JCode CLI through JCode ACP
- SQLite where appropriate

Runtime: `React → Tauri → Rust → JCode ACP → installed JCode`

## Requirements

Orbito currently targets Windows desktop. The JCode CLI must be installed separately on the target machine.

## Development

```bash
npm install
npm run tauri:dev
```

For a production build:

```bash
npm run tauri:build
```

See `AGENTS.md` and the `docs/` directory for architecture, security, and development notes.

## Branding

Orbito uses a warm orange orbital mark on a deep-charcoal background. The activity indicator animates while an agent is working. The logo and wordmark are original project assets.

## License

See [LICENSE](LICENSE).
