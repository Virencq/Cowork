use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, io::{BufRead, BufReader, Write}, path::PathBuf, process::{Child, ChildStdin, Command, Stdio}, sync::{Arc, Mutex}, thread};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JCodeEvent { pub session_id: String, pub event: Value }

pub(crate) struct SessionProcess { child: Child, stdin: Arc<Mutex<ChildStdin>>, session_id: String }
pub struct JCodeState(pub Arc<Mutex<HashMap<String, SessionProcess>>>);

#[derive(Debug, Deserialize)]
struct RpcEnvelope { id: Option<Value>, result: Option<Value>, error: Option<Value> }

fn send_rpc(stdin: &Arc<Mutex<ChildStdin>>, id: u64, method: &str, params: Value) -> Result<(), String> {
    let request = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
    let mut guard = stdin.lock().map_err(|e| e.to_string())?;
    writeln!(&mut *guard, "{}", request).map_err(|e| format!("Failed to write ACP request: {e}"))?;
    guard.flush().map_err(|e| format!("Failed to flush ACP request: {e}"))
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

fn start_reader(app: AppHandle, session_key: String, stdout: std::process::ChildStdout) {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let line = line.trim();
            if line.is_empty() { continue; }
            let Ok(value) = serde_json::from_str::<Value>(line) else { continue };
            if value.get("method").and_then(Value::as_str).is_some() || value.get("result").is_some() || value.get("error").is_some() {
                let _ = app.emit("jcode://event", JCodeEvent { session_id: session_key.clone(), event: value });
            }
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
        "clientCapabilities": {"fs": {"readTextFile": true, "writeTextFile": true}, "terminal": true}
    }))?;
    let _ = read_until_response(&mut reader, 1)?;

    let cwd = workspace_dir.clone().unwrap_or_else(|| std::env::current_dir().unwrap_or_default().to_string_lossy().to_string());
    // JCode currently manages MCP from its own configuration. Do not send
    // mcpServers here; JCode ACP versions may reject host-supplied servers.
    send_rpc(&stdin, 2, "session/new", json!({"cwd": cwd}))?;
    let result = read_until_response(&mut reader, 2)?;
    let session_id = result.get("sessionId").and_then(Value::as_str).ok_or_else(|| format!("JCode ACP did not return sessionId: {result}"))?.to_string();

    let process = SessionProcess { child, stdin: stdin.clone(), session_id: session_id.clone() };
    state.0.lock().map_err(|e| e.to_string())?.insert(session_id.clone(), process);
    start_reader(app, session_id.clone(), reader.into_inner());
    Ok(session_id)
}

#[tauri::command]
pub fn jcode_prompt(state: State<'_, JCodeState>, session_id: String, prompt: String) -> Result<(), String> {
    let sessions = state.0.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&session_id).ok_or_else(|| format!("JCode session not found: {session_id}"))?;
    if prompt.trim().is_empty() {
        return Err("Prompt cannot be empty.".to_string());
    }
    send_rpc(&session.stdin, 100, "session/prompt", json!({
        "sessionId": session.session_id,
        "prompt": [{"type":"text","text":prompt}]
    }))
}

#[tauri::command]
pub fn jcode_cancel(state: State<'_, JCodeState>, session_id: String) -> Result<(), String> {
    let sessions = state.0.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&session_id).ok_or_else(|| format!("JCode session not found: {session_id}"))?;
    send_rpc(&session.stdin, 101, "session/cancel", json!({"sessionId":session.session_id}))
}

#[tauri::command]
pub fn jcode_close_session(state: State<'_, JCodeState>, session_id: String) -> Result<(), String> {
    let mut sessions = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = send_rpc(&session.stdin, 102, "session/close", json!({"sessionId":session.session_id}));
        let _ = session.child.wait();
        let _ = session.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn jcode_status() -> Result<Value, String> {
    match find_jcode() {
        Ok(path) => Ok(json!({"installed":true,"path":path.to_string_lossy(),"command":"jcode acp"})),
        Err(error) => Ok(json!({"installed":false,"error":error})),
    }
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

    let mut config = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or_else(|| json!({}))
    } else {
        json!({})
    };
    if !config.is_object() { config = json!({}); }
    let root = config.as_object_mut().ok_or("Invalid JCode MCP config.")?;
    let existing = root.entry("mcpServers").or_insert_with(|| json!({}));
    let map = existing.as_object_mut().ok_or("JCode mcpServers must be an object.")?;
    for (name, server) in mcp_servers { map.insert(name, server); }
    std::fs::write(&path, serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Failed to write JCode MCP config: {e}"))?;
    Ok(json!({"path": path.to_string_lossy(), "servers": map.len()}))
}
