use serde_json::{json, Value};
use std::path::PathBuf;

fn jcode_home() -> Result<PathBuf, String> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "Unable to resolve the user home directory.".to_string())
}

fn read_json_object(path: &std::path::Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!({}));
    }
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let value: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Invalid JSON in {}: {e}", path.display()))?;
    if !value.is_object() {
        return Err(format!("Invalid configuration at {}: expected a JSON object.", path.display()));
    }
    Ok(value)
}

fn write_json(path: &std::path::Path, value: &Value) -> Result<(), String> {
    let parent = path.parent().ok_or("Configuration path has no parent directory.")?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|e| format!("Failed to serialize {}: {e}", path.display()))?;
    std::fs::write(path, bytes)
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

#[tauri::command]
pub fn jcode_model_catalog() -> Result<Value, String> {
    let directory = jcode_home()?.join(".jcode");
    let config_path = directory.join("config.json");
    let config = read_json_object(&config_path)?;
    let active = config.get("model").and_then(Value::as_str).unwrap_or("");
    let active_parts = active.split_once('/');

    let mut providers = Vec::new();
    let configured = config.get("providers").and_then(Value::as_object);
    if let Some(configured) = configured {
        for (provider_id, provider_config) in configured {
            let mut models: Vec<Value> = Vec::new();
            if let Some(items) = provider_config.get("custom_models").and_then(Value::as_array) {
                for item in items {
                    if let Some(id) = item.get("id").and_then(Value::as_str).filter(|s| !s.trim().is_empty()) {
                        models.push(json!({
                            "id": id,
                            "name": item.get("name").and_then(Value::as_str).unwrap_or(id)
                        }));
                    }
                }
            }
            if let Some(items) = provider_config.get("models").and_then(Value::as_array) {
                for item in items.iter().filter_map(Value::as_str) {
                    if !models.iter().any(|existing| existing.get("id").and_then(Value::as_str) == Some(item)) {
                        models.push(json!({"id": item, "name": item}));
                    }
                }
            }
            if let Some((active_provider, active_model)) = active_parts {
                if active_provider == provider_id && !models.iter().any(|existing| existing.get("id").and_then(Value::as_str) == Some(active_model)) {
                    models.push(json!({"id": active_model, "name": active_model}));
                }
            }
            let display_name = provider_config.get("name").and_then(Value::as_str).filter(|s| !s.trim().is_empty()).unwrap_or(provider_id);
            providers.push(json!({
                "id": provider_id,
                "name": display_name,
                "models": models
            }));
        }
    }

    if let Some((active_provider, active_model)) = active_parts {
        if !providers.iter().any(|provider| provider.get("id").and_then(Value::as_str) == Some(active_provider)) {
            providers.push(json!({
                "id": active_provider,
                "name": active_provider,
                "models": [{"id": active_model, "name": active_model}]
            }));
        }
    }

    let model_state = read_json_object(&directory.join("model_state.json"))?;
    let effort_overrides = model_state.get("effort_overrides").cloned().unwrap_or_else(|| json!({}));
    Ok(json!({
        "activeModel": active,
        "providers": providers,
        "effortOverrides": effort_overrides,
        "configPath": config_path.to_string_lossy(),
        "modelStatePath": directory.join("model_state.json").to_string_lossy()
    }))
}

#[tauri::command]
pub fn jcode_set_active_model(provider: String, model: String) -> Result<Value, String> {
    let provider = provider.trim();
    let model = model.trim();
    if provider.is_empty() || model.is_empty() {
        return Err("Provider and model are both required.".to_string());
    }
    if provider.contains('/') || model.contains('\n') || model.contains('\r') {
        return Err("Invalid provider or model identifier.".to_string());
    }

    let path = jcode_home()?.join(".jcode").join("config.json");
    let mut config = read_json_object(&path)?;
    let providers = config.get("providers").and_then(Value::as_object);
    let current_model = config.get("model").and_then(Value::as_str).unwrap_or("");
    let is_current_provider = current_model.split_once('/').is_some_and(|(current_provider, _)| current_provider == provider);
    if !providers.is_some_and(|items| items.contains_key(provider)) && !is_current_provider {
        return Err(format!("Provider '{provider}' is not configured in ~/.jcode/config.json. Add it through JCode's supported setup first."));
    }
    let object = config.as_object_mut().ok_or("JCode config must be a JSON object.")?;
    object.insert("model".to_string(), Value::String(format!("{provider}/{model}")));
    write_json(&path, &config)?;
    jcode_model_catalog()
}

#[tauri::command]
pub fn jcode_set_model_effort(provider: String, model: String, effort: String) -> Result<Value, String> {
    let provider = provider.trim();
    let model = model.trim();
    let effort = effort.trim();
    if provider.is_empty() || model.is_empty() {
        return Err("Provider and model are both required.".to_string());
    }
    if !matches!(effort, "" | "low" | "medium" | "high") {
        return Err("Reasoning effort must be Default, low, medium, or high.".to_string());
    }

    let path = jcode_home()?.join(".jcode").join("model_state.json");
    let mut state = read_json_object(&path)?;
    let object = state.as_object_mut().ok_or("JCode model state must be a JSON object.")?;
    if !object.get("effort_overrides").is_none_or(Value::is_object) {
        return Err("JCode model_state.json has an invalid effort_overrides value; file was not changed.".to_string());
    }
    let overrides = object.entry("effort_overrides".to_string()).or_insert_with(|| json!({}));
    let map = overrides.as_object_mut().ok_or("JCode effort_overrides must be a JSON object.")?;
    let key = format!("{provider}/{model}");
    if effort.is_empty() {
        map.remove(&key);
    } else {
        map.insert(key, Value::String(effort.to_string()));
    }
    write_json(&path, &state)?;
    jcode_model_catalog()
}
