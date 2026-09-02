use std::sync::Mutex;
use tauri::{Emitter, Manager};

// Holds a PDF path passed on the command line at the moment the app first
// launches (i.e. someone double-clicked a .pdf, or chose PDF Suite Pro from
// "Open with"). The frontend calls take_pending_file() once, right after it
// mounts, to pick this up — deliberately not just emitting an event at
// startup, since the frontend's event listener might not be registered yet
// by the time Rust would emit it, and a missed event here would silently
// mean "double-click a PDF" does nothing on a fresh launch.
struct PendingFile(Mutex<Option<String>>);

fn extract_pdf_path(args: &[String]) -> Option<String> {
  args
    .iter()
    .skip(1) // args[0] is the executable path itself
    .find(|a| a.to_lowercase().ends_with(".pdf"))
    .cloned()
}

#[tauri::command]
fn take_pending_file(state: tauri::State<PendingFile>) -> Option<String> {
  state.0.lock().unwrap().take()
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
  std::fs::read(&path).map_err(|e| format!("Could not read \"{path}\": {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      // Fired in the *already-running* instance when the OS tries to launch
      // a second one — e.g. the user double-clicks another PDF while the
      // app is already open. Forward that file straight to the frontend
      // and bring the window to the front, rather than opening a second
      // window or silently doing nothing.
      if let Some(path) = extract_pdf_path(&argv) {
        let _ = app.emit("open-file", path);
      }
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .manage(PendingFile(Mutex::new(
      extract_pdf_path(&std::env::args().collect::<Vec<_>>()),
    )))
    .invoke_handler(tauri::generate_handler![take_pending_file, read_file_bytes])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
