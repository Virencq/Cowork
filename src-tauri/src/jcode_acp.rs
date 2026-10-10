use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, io::{BufRead, BufReader, Write}, path::PathBuf, process::{Child, ChildStdin, Command, Stdio}, sync::{Arc, Mutex}, sync::atomic::{AtomicU64, Ordering}, thread};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JCodeEvent { pub session_id: String, pub event: Value }

pub(crate) struct SessionProcess {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    session_id: String,
    next_request_id: AtomicU64,
    permission_requests: Arc<Mutex<HashMap<u64, Value>>>,
}
pub struct JCodeState(pub Arc<Mutex<HashMap<String, SessionProcess>>>);

#[derive(Debug, Deserialize)]
struct RpcEnvelope { id: Option<Value>, result: Option<Value>, error: Option<Value> }

fn send_rpc(stdin: &Arc<Mutex<ChildStdin>>, id: u64, method: &str, params: Value) -> Result<(), String> {
    let request = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
    let mut guard = stdin.lock().map_err(|e| e.to_string())?;
    writeln!(&mut *guard, "{}", request).map_err(|e| format!("Failed to write ACP request: {e}"))?;
    guard.flush().map_err(|e| format!("Failed to flush ACP request: {e}"))
}

fn send_rpc_result(stdin: &Arc<Mutex<ChildStdin>>, id: u64, result: Value) -> Result<(), String> {
    let response = json!({"jsonrpc":"2.0","id":id,"result":result});
    let mut guard = stdin.lock().map_err(|e| e.to_string())?;
    writeln!(&mut *guard, "{}", response).map_err(|e| format!("Failed to write ACP response: {e}"))?;
    guard.flush().map_err(|e| format!("Failed to flush ACP response: {e}"))
}

fn read_until_response(reader: &mut BufReader<std::process::ChildStdout>, request_id: u64) -> Result<Value, String> {
    let mut line = String::new();
    loop {
        line.clear();
        let n = reader.read_line(&mut line).map_err(|e| format!("Failed to read ACP response: {e}"))?;
        if n == 0 { return Err("JCode ACP exited before returning a response.".to_string()); }
        let value: RpcEnvelope = serde_json::from_str(line.trim()).map_err(|e| format!("Invalid JCode ACP JSON: {e}"))?;
        if value.id.as_ref().and_then(Value::as_u64) == Some(request_id) {
            if let Some(error) = value.error { return Err(format!("JCode ACP error: {error}")); }
            return Ok(value.result.unwrap_or(Value::Null));
        }
    }
}

fn find_jcode() -> Result<PathBuf, String> {
    let candidates = if cfg!(windows) { vec!["jcode.exe", "jcode"] } else { vec!["jcode"] };
    for candidate in candidates {
        if Command::new(candidate).arg("--version").stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok() {
            return Ok(PathBuf::from(candidate));
        }
    }
    Err("JCode was not found on PATH. Install JCode and ensure the jcode command is available.".to_string())
}

fn start_reader(
    app: AppHandle,
    session_key: String,
    stdout: std::process::ChildStdout,
    permission_requests: Arc<Mutex<HashMap<u64, Value>>>,
    sessions: Arc<Mutex<HashMap<String, SessionProcess>>>,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let line = line.trim();
            if line.is_empty() { continue; }
            let Ok(value) = serde_json::from_str::<Value>(line) else { continue };
            if value.get("method").and_then(Value::as_str) == Some("session/request_permission") {
                if let Some(id) = value.get("id").and_then(Value::as_u64) {
                    if let Ok(mut requests) = permission_requests.lock() {
                        requests.insert(id, value.clone());
                    }
                }
            }
            if value.get("method").and_then(Value::as_str).is_some() || value.get("result").is_some() || value.get("error").is_some() {
                let _ = app.emit("jcode://event", JCodeEvent { session_id: session_key.clone(), event: value });
            }
        }
        // Remove and reap a process that exited unexpectedly so later prompts
        // cannot keep targeting a dead ACP session in the registry.
        let exited = sessions.lock().ok().and_then(|mut sessions| sessions.remove(&session_key));
        if let Some(mut session) = exited {
            let _ = session.child.wait();
        }
        let _ = app.emit("jcode://event", JCodeEvent {
            session_id: session_key,
            event: json!({"method":"session/closed","params":{"reason":"JCode ACP process exited"}}),
        });
    });
}

#[tauri::command]
pub fn jcode_start_session(app: AppHandle, state: State<'_, JCodeState>, workspace_dir: Option<String>) -> Result<String, String> {
    let executable = find_jcode()?;
    let mut command = Command::new(executable);
    command.arg("acp").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    if let Some(dir) = workspace_dir.as_deref() { command.current_dir(dir); }
    let mut child = command.spawn().map_err(|e| format!("Failed to start JCode ACP: {e}"))?;
    let stdin = Arc::new(Mutex::new(child.stdin.take().ok_or("JCode ACP stdin unavailable")?));
    let stdout = child.stdout.take().ok_or("JCode ACP stdout unavailable")?;
    let mut reader = BufReader::new(stdout);

    send_rpc(&stdin, 1, "initialize", json!({
        "protocolVersion": 1,
        "clientInfo": {"name":"Cowork","version":"0.1.0"},
        "clientCapabilities": {}
    }))?;
    let _ = read_until_response(&mut reader, 1)?;

    let cwd = workspace_dir.clone().unwrap_or_else(|| std::env::current_dir().unwrap_or_default().to_string_lossy().to_string());
    send_rpc(&stdin, 2, "session/new", json!({"cwd": cwd}))?;
    let result = read_until_response(&mut reader, 2)?;
    let session_id = result.get("sessionId").and_then(Value::as_str).ok_or_else(|| format!("JCode ACP did not return sessionId: {result}"))?.to_string();

    let permission_requests = Arc::new(Mutex::new(HashMap::new()));
    let process = SessionProcess {
        child,
        stdin: stdin.clone(),
        session_id: session_id.clone(),
        next_request_id: AtomicU64::new(100),
        permission_requests: permission_requests.clone(),
    };
    state.0.lock().map_err(|e| e.to_string())?.insert(session_id.clone(), process);
    start_reader(app, session_id.clone(), reader.into_inner(), permission_requests, state.0.clone());
    Ok(session_id)
}

#[tauri::command]
pub fn jcode_prompt(state: State<'_, JCodeState>, session_id: String, prompt: String) -> Result<(), String> {
    let sessions = state.0.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&session_id).ok_or_else(|| format!("JCode session not found: {session_id}"))?;
    if prompt.trim().is_empty() {
        return Err("Prompt cannot be empty.".to_string());
    }
    let request_id = session.next_request_id.fetch_add(1, Ordering::Relaxed);
    send_rpc(&session.stdin, request_id, "session/prompt", json!({
        "sessionId": session.session_id,
        "prompt": [{"type":"text","text":prompt}]
    }))?;
    // ACP is streamed: return immediately after the request is written.
    // The background reader forwards session/update chunks and the final
    // session/prompt response to the frontend through jcode://event.
    Ok(())
}

#[tauri::command]
pub fn jcode_permission_response(
    state: State<'_, JCodeState>,
    session_id: String,
    request_id: String,
    approve: bool,
) -> Result<(), String> {
    let sessions = state.0.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&session_id).ok_or_else(|| format!("JCode session not found: {session_id}"))?;
    let id = request_id.parse::<u64>().map_err(|_| format!("Invalid ACP permission request id: {request_id}"))?;

    let request = session.permission_requests.lock().map_err(|e| e.to_string())?.get(&id).cloned()
        .ok_or_else(|| format!("ACP permission request not found: {request_id}"))?;
    let options = request.get("params")
        .and_then(|v| v.get("options"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let selected = options.iter().find(|option| {
        option.get("kind").and_then(Value::as_str).map(|kind| {
            if approve { kind == "allow_once" || kind == "allow_always" }
            else { kind == "reject_once" || kind == "reject_always" }
        }).unwrap_or(false)
    });

    let result = if let Some(option) = selected {
        let option_id = option.get("optionId").and_then(Value::as_str)
            .or_else(|| option.get("id").and_then(Value::as_str))
            .ok_or("ACP permission option has no optionId.")?;
        json!({"outcome":{"outcome":"selected","optionId":option_id}})
    } else {
        json!({"outcome":{"outcome":"cancelled"}})
    };

    send_rpc_result(&session.stdin, id, result)?;
    {
        let mut requests = session.permission_requests.lock().map_err(|e| e.to_string())?;
        requests.remove(&id);
    }
    Ok(())
}

#[tauri::command]
pub fn jcode_cancel(state: State<'_, JCodeState>, session_id: String) -> Result<(), String> {
    let sessions = state.0.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&session_id).ok_or_else(|| format!("JCode session not found: {session_id}"))?;
    let request_id = session.next_request_id.fetch_add(1, Ordering::Relaxed);
    send_rpc(
        &session.stdin,
        request_id,
        "session/cancel",
        json!({"sessionId": session.session_id}),
    )
}

#[tauri::command]
pub fn jcode_close_session(state: State<'_, JCodeState>, session_id: String) -> Result<(), String> {
    let mut sessions = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&session_id) {
        // Never block the UI indefinitely waiting for an ACP process to exit.
        // JCode receives the close request, then the process is terminated
        // explicitly if it does not exit on its own.
        let request_id = session.next_request_id.fetch_add(1, Ordering::Relaxed);
        let _ = send_rpc(
            &session.stdin,
            request_id,
            "session/close",
            json!({"sessionId": session.session_id}),
        );
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
    Ok(())
}

/// Close all child ACP processes when the desktop application exits.
pub fn shutdown_all(state: &JCodeState) {
    let sessions = match state.0.lock() {
        Ok(mut sessions) => std::mem::take(&mut *sessions),
        Err(_) => return,
    };

    for (_, mut session) in sessions {
        let request_id = session.next_request_id.fetch_add(1, Ordering::Relaxed);
        let _ = send_rpc(
            &session.stdin,
            request_id,
            "session/close",
            json!({"sessionId": session.session_id}),
        );
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
}

#[tauri::command]
pub fn jcode_status() -> Result<Value, String> {
    match find_jcode() {
        Ok(path) => Ok(json!({"installed":true,"path":path.to_string_lossy(),"command":"jcode acp"})),
        Err(error) => Ok(json!({"installed":false,"error":error})),
    }
}


#[tauri::command]
pub fn jcode_runtime_info() -> Result<Value, String> {
    let executable = find_jcode()?;
    let output = Command::new(&executable)
        .args(["--quiet", "--no-update", "--no-selfdev", "provider", "current", "--json"])
        .output()
        .map_err(|e| format!("Failed to query JCode provider: {e}"))?;

    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let mut provider = None::<String>;
    let mut model = None::<String>;
    let mut effort = None::<String>;
    if let Ok(value) = serde_json::from_str::<Value>(&raw) {
        fn find_string(value: &Value, keys: &[&str]) -> Option<String> {
            match value {
                Value::Object(map) => {
                    for key in keys {
                        if let Some(Value::String(v)) = map.get(*key) { if !v.is_empty() { return Some(v.clone()); } }
                    }
                    for child in map.values() { if let Some(v) = find_string(child, keys) { return Some(v); } }
                }
                Value::Array(items) => for child in items { if let Some(v) = find_string(child, keys) { return Some(v); } },
                _ => {}
            }
            None
        }
        provider = find_string(&value, &["resolved_provider", "provider", "providerId", "provider_id"]);
        model = find_string(&value, &["selected_model", "model", "modelId", "model_id"]);
        effort = find_string(&value, &["effort", "thinkingLevel", "reasoningEffort"]);
    }

    if model.is_none() {
        // Some JCode builds expose the current selection as human-readable output.
        let text = if raw.is_empty() { String::from_utf8_lossy(&output.stderr).to_string() } else { raw.clone() };
        for line in text.lines() {
            let lower = line.to_ascii_lowercase();
            if model.is_none() && lower.contains("model") {
                if let Some((_, value)) = line.split_once(':') { let value = value.trim(); if !value.is_empty() { model = Some(value.to_string()); } }
            }
        }
    }

    Ok(json!({
        "installed": true,
        "path": executable.to_string_lossy(),
        "provider": provider,
        "model": model,
        "effort": effort,
        "raw": raw
    }))
}

#[tauri::command]
pub fn jcode_sync_mcp_config(servers: Value) -> Result<Value, String> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(std::path::PathBuf::from).ok_or("Unable to resolve the user home directory.")?;
    let dir = home.join(".jcode");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create JCode config directory: {e}"))?;
    let path = dir.join("mcp.json");

    let mut mcp_servers = serde_json::Map::new();
    if let Some(items) = servers.as_array() {
        for server in items {
            if server.get("type").and_then(Value::as_str).unwrap_or("stdio") != "stdio" {
                continue;
            }
            let Some(name) = server.get("name").and_then(Value::as_str) else { continue };
            let Some(command) = server.get("command").and_then(Value::as_str) else { continue };
            if server.get("disabled").and_then(Value::as_bool).unwrap_or(false) {
                continue;
            }
            let mut entry = serde_json::Map::new();
            entry.insert("command".into(), Value::String(command.to_string()));
            if let Some(args) = server.get("args") { entry.insert("args".into(), args.clone()); }
            if let Some(env) = server.get("env") { entry.insert("env".into(), env.clone()); }
            mcp_servers.insert(name.to_string(), Value::Object(entry));
        }
    }

    // Keep track of only the servers managed by Cowork. This lets us remove a
    // server when the user disables/deletes it without touching MCP entries
    // configured independently in JCode.
    let managed_path = dir.join("cowork-mcp-managed.json");
    let previously_managed: Vec<String> = std::fs::read_to_string(&managed_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .unwrap_or_default();

    let mut config = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or_else(|| json!({}))
    } else {
        json!({})
    };
    if !config.is_object() { config = json!({}); }

    let server_count = {
        let root = config.as_object_mut().ok_or("Invalid JCode MCP config.")?;
        let existing = root.entry("mcpServers").or_insert_with(|| json!({}));
        let map = existing.as_object_mut().ok_or("JCode mcpServers must be an object.")?;

        for name in previously_managed {
            map.remove(&name);
        }
        for (name, server) in &mcp_servers {
            map.insert(name.clone(), server.clone());
        }
        map.len()
    };

    let managed_names: Vec<String> = mcp_servers.keys().cloned().collect();
    std::fs::write(
        &managed_path,
        serde_json::to_vec_pretty(&managed_names).map_err(|e| e.to_string())?,
    ).map_err(|e| format!("Failed to write Cowork MCP state: {e}"))?;

    let content = serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write JCode MCP config: {e}"))?;
    Ok(json!({"path": path.to_string_lossy(), "servers": server_count}))
}

/// Read JCode's on-disk MCP configuration so the settings UI can import servers
/// that were added outside Cowork. This is read-only and never rewrites the file.
#[tauri::command]
pub fn jcode_read_mcp_config() -> Result<Value, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or("Unable to resolve the user home directory.")?;
    let path = home.join(".jcode").join("mcp.json");
    if !path.exists() {
        return Ok(json!({ "mcpServers": {} }));
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str::<Value>(&raw)
        .map_err(|e| format!("Invalid JSON in {}: {e}", path.display()))
}
