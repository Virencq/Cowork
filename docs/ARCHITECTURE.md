# Cowork Desktop Architecture

## Objective

Cowork Desktop is a Windows-first Tauri 2 desktop agent built from the S-Loop architecture and powered by the existing installed JCode CLI through JCode ACP.

The UI is English-only.

## Runtime

React UI -> Tauri IPC -> Rust agent adapter -> JCode ACP -> installed JCode CLI/runtime

Pi is not used as the agent runtime.
OpenCode is not used as the agent runtime.
Electron is not used.

## S-Loop components to retain

Use S-Loop's existing architecture where it is independent of Pi:

- Tauri 2 desktop shell
- React/TypeScript application structure
- MCP manager
- Skills management
- credential storage
- application configuration
- filesystem/workspace handling
- task/session state
- scheduling/background infrastructure where compatible
- existing tests and build configuration

## Components to replace

Replace the Pi-specific runtime layer:

- src-tauri/src/pi_server.rs
- src-tauri/pi-server/
- Pi-specific frontend API/types and event handling
- Pi-specific package dependencies

The replacement is a provider-neutral agent layer:

- src-tauri/src/agent/
- JCode ACP transport
- JCode session manager
- normalized agent events
- permission bridge
- model/config bridge

## JCode requirement

Use the JCode CLI already installed on the user's Windows system.

The application should locate JCode rather than bundle a second copy by default.

The ACP process should be long-lived for an active session and should support:

- initialize
- session/new
- session/load
- session/resume
- session/prompt
- session/cancel
- session/close
- model/configuration changes
- reasoning effort changes where supported
- streaming events
- tool calls
- permission requests
- errors

## UI architecture

Use a three-region desktop layout:

- resizable left navigation sidebar
- central task workspace
- resizable right contextual sidebar

Panel widths must persist across restarts.

## English-only policy

All application UI text must be English.

Do not ship Chinese translations, Chinese labels, Chinese menu items, Chinese onboarding, or Chinese documentation as application resources.

Do not add a Chinese locale.

Developer comments and source identifiers should also use English.

Third-party packages may contain their own documentation or metadata; do not modify third-party source merely because it contains another language.

## Design direction

Use an original implementation with the same broad visual language requested by the project:

- warm neutral background
- charcoal text
- warm orange accent
- rounded surfaces
- subtle borders
- restrained shadows
- generous spacing
- polished typography
- minimal visual noise

Do not copy proprietary Claude/Anthropic source code or assets.

## Target

The result should feel like a polished Cowork-style desktop agent while remaining technically based on S-Loop and using JCode as the actual agent engine.
