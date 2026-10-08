# S-Loop -> JCode Migration Plan

## Phase 1 — Baseline

1. Bring the S-Loop Tauri/React application structure into Cowork.
2. Preserve the existing independent infrastructure.
3. Remove Pi from the application dependency graph.
4. Establish English-only UI resources.

## Phase 2 — Agent abstraction

Create a provider-neutral runtime interface:

- createSession
- resumeSession
- prompt
- cancel
- events
- listModels
- setModel
- approve
- reject

Frontend code must use this interface and must not depend directly on Pi or JCode protocol details.

## Phase 3 — JCode ACP

Implement JCodeAgentRuntime.

Use the existing installed JCode CLI.

The adapter is responsible for:

- locating JCode
- starting ACP
- maintaining the ACP process
- session lifecycle
- NDJSON/ACP message transport
- event normalization
- permission requests
- model/configuration
- cancellation
- process restart/error recovery

Minimum end-to-end milestone:

User prompt -> Tauri -> JCode ACP -> JCode -> streamed event -> UI.

## Phase 4 — UI

Build the three-panel interface.

### Left sidebar

- New Task
- Search
- Scheduled
- Ideas
- Customize
- Projects
- Recents
- Settings/account

Resizable, collapsible and persistent.

### Center

- task composer
- active task
- streamed response
- tool activity
- approvals
- artifacts
- final result

### Right sidebar

Contextual information:

- project
- workspace
- files
- skills
- task details
- model
- activity
- artifacts
- settings

Resizable, collapsible and persistent.

## Phase 5 — Tools

Connect the retained S-Loop systems:

- filesystem
- shell
- permissions
- MCP
- Skills
- artifacts

All tool activity must be represented through normalized agent events.

## Phase 6 — Projects and history

Persist:

- projects
- workspaces
- tasks
- sessions
- messages/events
- artifacts
- settings

## Phase 7 — Scheduler

Retain and adapt S-Loop scheduling so scheduled tasks execute through JCode rather than Pi.

## Phase 8 — Browser

Keep browser functionality modular and independent of the core JCode integration.

Do not introduce Electron.

## Phase 9 — Validation

Validate on Windows 11:

- fresh install
- JCode discovery
- ACP startup
- new session
- prompt streaming
- tool execution
- permission approval/denial
- session resume
- cancellation
- MCP
- Skills
- scheduled tasks
- project persistence
- sidebar persistence
- build/package

## Definition of done

The application is not considered functional until a real prompt is executed by the user's installed JCode CLI through ACP and the streamed result appears in the UI.
