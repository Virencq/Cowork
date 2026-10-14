use std::{fs, path::PathBuf};

fn jcode_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or("Cannot locate the user home directory")?;
    let dir = home.join(".jcode");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    Ok(dir)
}

fn managed_path(file: &str) -> Result<PathBuf, String> {
    match file {
        // JCode natively loads global instructions from this documented path.
        "instructions" => Ok(jcode_dir()?.join("AGENTS.md")),
        // Orbito-managed editable memory is stored alongside JCode data.
        "memory" => Ok(jcode_dir()?.join("orbito-memory.md")),
        _ => Err("Unsupported instructions/memory document".to_string()),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionDocument {
    pub kind: String,
    pub path: String,
    pub content: String,
    pub exists: bool,
    pub native_jcode: bool,
}

#[tauri::command]
pub fn jcode_read_instruction_document(kind: String) -> Result<InstructionDocument, String> {
    let path = managed_path(&kind)?;
    let exists = path.is_file();
    let content = if exists {
        fs::read_to_string(&path).map_err(|e| format!("Cannot read {}: {e}", path.display()))?
    } else {
        String::new()
    };
    Ok(InstructionDocument {
        kind: kind.clone(),
        path: path.to_string_lossy().into_owned(),
        content,
        exists,
        native_jcode: kind == "instructions",
    })
}

#[tauri::command]
pub fn jcode_save_instruction_document(kind: String, content: String) -> Result<InstructionDocument, String> {
    if content.len() > 1_000_000 {
        return Err("Document exceeds the 1 MB safety limit".to_string());
    }
    let path = managed_path(&kind)?;
    // Write atomically so a crash cannot truncate the user's existing document.
    let temp = path.with_extension("md.tmp");
    fs::write(&temp, content.as_bytes()).map_err(|e| format!("Cannot write temporary file: {e}"))?;
    fs::rename(&temp, &path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Cannot replace {}: {e}", path.display())
    })?;
    jcode_read_instruction_document(kind)
}
