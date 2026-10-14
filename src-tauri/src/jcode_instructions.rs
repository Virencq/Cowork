use std::fs;
use std::path::PathBuf;

#[derive(serde::Serialize)]
pub struct GlobalInstructionsDocument {
    path: String,
    content: String,
}

fn global_instructions_path() -> Result<PathBuf, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .ok_or_else(|| "Could not determine the user home directory".to_string())?;
    Ok(PathBuf::from(home).join(".jcode").join("AGENTS.md"))
}

#[tauri::command]
pub fn jcode_read_global_instructions() -> Result<GlobalInstructionsDocument, String> {
    let path = global_instructions_path()?;
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(format!("Could not read global instructions: {error}")),
    };
    Ok(GlobalInstructionsDocument { path: path.display().to_string(), content })
}

#[tauri::command]
pub fn jcode_save_global_instructions(content: String) -> Result<GlobalInstructionsDocument, String> {
    if content.len() > 1_000_000 {
        return Err("Global instructions must be 1 MB or smaller".to_string());
    }
    let path = global_instructions_path()?;
    let parent = path.parent().ok_or_else(|| "Invalid global instructions path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("Could not create .jcode directory: {error}"))?;
    fs::write(&path, content.as_bytes()).map_err(|error| format!("Could not save global instructions: {error}"))?;
    Ok(GlobalInstructionsDocument { path: path.display().to_string(), content })
}
