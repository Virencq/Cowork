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
- Compact desktop UI with clear agent activity feedback

## Architecture

- **Desktop shell:** Tauri 2 (Rust)
- **UI:** React, TypeScript, and Vite
- **Agent runtime:** JCode CLI through the Agent Client Protocol (ACP)
- **Local data:** SQLite where appropriate

Orbito is a desktop client. It does not bundle JCode or provide model access by itself. Install JCode separately and configure at least one supported model/provider before using agent features.

## Requirements

- Windows 10/11 x64 for the current desktop target
- [JCode CLI](https://github.com/cnjack/jcode) installed and available on `PATH`
- A model/provider configured for JCode
- For development: Node.js LTS, npm, Rust stable, and Tauri's Windows build prerequisites

## Install JCode

JCode source and releases: **[github.com/cnjack/jcode](https://github.com/cnjack/jcode)** · [Documentation](https://www.j-code.net/docs)

### Windows

JCode's quick installer is a shell script, not a PowerShell script. Use a supported Bash environment such as **WSL2** or **Git Bash** and run:

```bash
curl -fsSL https://raw.githubusercontent.com/cnjack/jcode/main/script/install.sh | sh
```

Alternatively, follow the current [JCode installation instructions](https://github.com/cnjack/jcode#install) for the method supported by your environment. Do not paste the Bash installer command directly into PowerShell.

Open a new terminal after installation and verify:

```bash
jcode --version
jcode doctor
```

Then follow the [JCode setup guide](https://www.j-code.net/docs/get-started) to configure your model/provider and authentication. Keep API keys and credentials in JCode's local configuration; never commit them to Orbito.

## Development

Install Node.js LTS, Rust stable, and the Tauri 2 Windows prerequisites. Then run in PowerShell:

```powershell
git clone https://github.com/Virencq/Orbito.git
cd Orbito
npm ci
npm run tauri:dev
```

Create production Windows installer packages:

```powershell
npm run tauri:build
```

Installer output is written under `src-tauri/target/release/bundle/`. The build regenerates native Orbito icon assets before packaging.

### Validation

```powershell
npm run build
npm test
cargo check --manifest-path src-tauri/Cargo.toml
```

## Branding

The selected identity is **Orbit Dot (Option 10)**: an orange open orbital ring with a distinct satellite node, on a deep-charcoal background. The mark is used in the app icon, title bar, favicon, and activity indicator. During agent work, the activity indicator may animate while keeping the mark recognizable.

## Security

- Never commit API keys, tokens, authentication files, or private chat exports.
- Review MCP server configuration before enabling tools that can access local files or execute commands.
- Remove credentials and private data from logs before sharing them in an issue.

## Reporting issues

Report reproducible bugs through [GitHub Issues](https://github.com/Virencq/Orbito/issues). Include the OS, Orbito version, relevant sanitized logs, and steps to reproduce.

## Thanks

Orbito builds on the open-source work of the [JCode project](https://github.com/cnjack/jcode), [Tauri](https://tauri.app/), [React](https://react.dev/), and the wider open-source ecosystem. Thank you to their maintainers and contributors.

## License

See [LICENSE](LICENSE).
