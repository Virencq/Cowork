# Cowork Desktop

A lightweight Windows desktop AI workspace based on S-Loop and powered by the installed JCode CLI through JCode ACP.

## Architecture

- Tauri 2
- React
- TypeScript
- Rust
- JCode ACP
- SQLite where appropriate

Runtime:

`React -> Tauri -> Rust -> jcode acp -> installed JCode`

## Product

The application provides a polished Cowork-style workflow with:

- resizable left navigation sidebar
- central task workspace
- resizable right contextual sidebar
- projects
- task history
- filesystem/workspace context
- permissions
- MCP
- Skills
- scheduled tasks
- artifacts
- browser integration

## Language

The application UI is English-only.

## Development

See:

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/MIGRATION_PLAN.md`
- `docs/ENGLISH_ONLY.md`

## Upstream foundation

The implementation uses the architecture and reusable infrastructure of S-Loop, while replacing its Pi runtime with JCode ACP.

JCode is expected to be installed separately on the target Windows system.
