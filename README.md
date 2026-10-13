# Orbito — AI Workspace for Real Work

Orbito is a Windows desktop AI workspace that brings projects, conversations, agents, tools, and tasks together in one place.

**AI Workspace for Real Work**

## Features

- Project-based workspaces and conversation history
- Agent conversations and tool execution
- Contextual sidebars and workspace files
- MCP integrations and Skills
- Scheduled tasks and artifacts
- Browser integration
- A compact desktop interface with clear agent activity feedback

## Architecture

- **Desktop shell:** Tauri 2 (Rust)
- **UI:** React + TypeScript + Vite
- **Agent runtime:** JCode CLI through the Agent Client Protocol (ACP)
- **Local data:** SQLite where appropriate

Orbito is a desktop client; it does not bundle the JCode executable or provide model access by itself. Install JCode separately and configure at least one supported model/provider before using agent features.

## Prerequisites

- Windows 10/11 x64 for the current desktop release
- [JCode CLI](https://github.com/cnjack/jcode) installed and available on `PATH`
- A model/provider configured for JCode
- For development: Node.js LTS, npm, Rust stable, and the Windows build tools required by Tauri 2

## Install JCode

JCode project: **[github.com/cnjack/jcode](https://github.com/cnjack/jcode)**

Open **PowerShell** and run the official quick installer:

```powershell
irm https://raw.githubusercontent.com/cnjack/jcode/main/script/install.sh | sh
```

If you are using Windows PowerShell, check the JCode repository's current Windows instructions first; use the installer supported by that project version. After installation, open a new terminal and verify:

```powershell
jcode --version
jcode doctor
```

Then follow the [JCode README](https://github.com/cnjack/jcode#readme) to configure your model/provider and authentication. Keep API keys and credentials in JCode's local configuration; never commit them to Orbito.

## Get Orbito

Download a Windows installer from the repository's **Actions** artifacts when a successful build is available, or use a published release when one is listed:

- [GitHub Releases](https://github.com/Virencq/Orbito/releases)
- [Latest CI builds](https://github.com/Virencq/Orbito/actions)

CI artifacts are temporary build outputs, not stable releases. Use a tagged GitHub Release for production distribution.

## Development

Clone the repository and install the JavaScript dependencies:

```powershell
git clone https://github.com/Virencq/Orbito.git
cd Orbito
npm ci
npm run tauri:dev
```

Create a production Windows installer:

```powershell
npm run tauri:build
```

The production build generates the Orbito native icon assets before invoking Tauri. The generated installer packages are written under `src-tauri/target/release/bundle/`.

Useful checks:

```powershell
npm run build
npm test
cargo check --manifest-path src-tauri/Cargo.toml
```

## Branding

Orbito's selected identity is **Orbit Dot (Option 10)**: an orange open orbital ring with a distinct orbiting node, on a deep-charcoal background. The mark is used across the app icon, title bar, favicon, and activity state. During work, the activity indicator may animate; the core mark remains legible.

## Security and support

- Never commit provider API keys, tokens, auth files, or private chat exports.
- Review MCP server configuration before enabling tools that can access local files or execute commands.
- Report reproducible bugs through [GitHub Issues](https://github.com/Virencq/Orbito/issues), including your OS, Orbito version, relevant logs, and steps to reproduce. Remove credentials and private data from logs before sharing.

## Thanks

Orbito builds on the open-source work of the [JCode project](https://github.com/cnjack/jcode), [Tauri](https://tauri.app/), [React](https://react.dev/), and the broader open-source ecosystem. Thank you to their maintainers and contributors.

## License

See [LICENSE](LICENSE).
