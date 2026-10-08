# Cowork Desktop Development Instructions

## Project

Build a Windows-first desktop AI workspace based on S-Loop and powered by the installed JCode CLI through JCode ACP.

## Non-negotiable runtime

- Use the installed JCode CLI.
- Use `jcode acp` for agent communication.
- Do not bundle a separate JCode runtime unless explicitly required later.
- Do not use Pi as the agent runtime.
- Do not use OpenCode.
- Do not use Electron.
- Use Tauri 2.

## Architecture

React/TypeScript UI
-> Tauri IPC
-> Rust agent/runtime layer
-> JCode ACP
-> installed JCode CLI

Keep the frontend independent from ACP wire details.

Normalize agent events before they reach React.

## UI

Use three real application regions:

1. Resizable left navigation sidebar.
2. Central task workspace.
3. Resizable right contextual sidebar.

Both sidebars must support:

- drag resizing
- minimum and maximum widths
- collapse/expand
- persisted width/state

The visual direction is a polished Cowork-style interface:

- warm neutral surfaces
- charcoal typography
- warm orange accent
- rounded cards
- subtle borders
- restrained shadows
- generous spacing

Use original code and assets. Do not copy proprietary Claude/Anthropic source or assets.

## English only

The application is English-only.

Never add Chinese UI strings, Chinese locale files, Chinese navigation labels, Chinese onboarding or Chinese documentation.

## S-Loop reuse

Retain S-Loop functionality that is independent of Pi, especially:

- MCP
- Skills
- permissions
- filesystem/workspaces
- scheduling
- projects
- task/session persistence
- artifact handling
- settings
- existing testing infrastructure

Replace Pi-specific runtime code with a provider-neutral JCode runtime.

## JCode ACP

The first real milestone is:

User prompt
-> UI
-> Tauri IPC
-> Rust
-> `jcode acp`
-> streamed ACP events
-> Rust normalization
-> UI

Support the ACP lifecycle required by JCode, including initialization, session creation/resume, prompting, cancellation, configuration/model changes, tool activity, permissions and errors.

## Quality

- Do not create mock agent behavior.
- Do not claim a feature works without testing it.
- Keep changes modular.
- Prefer small commits.
- Run TypeScript/Rust/build checks after major changes.
- Preserve existing working S-Loop functionality unless it conflicts with JCode.
