//! Tauri's local boundary for Pitch Mode. React sends only presentation input,
//! microphone chunks, and lifecycle commands; this module owns native state.

mod deepgram;
mod worker;

use deepgram::TranscriptionSession;
use std::{collections::HashSet, sync::Mutex};
use tauri::{AppHandle, Manager, State, Window};
use tokio::sync::Mutex as AsyncMutex;
use worker::{PitchDecision, PitchModelInput, Worker};

/// One process-wide state object keeps the model worker and Deepgram session private.
struct AppState {
    worker: AsyncMutex<Option<Worker>>,
    queue: Mutex<PitchQueue>,
    transcription: Mutex<Option<TranscriptionSession>>,
}

/// New requests replace the single waiting request. A running worker call is
/// allowed to finish, but cancellation prevents its result from reaching React.
#[derive(Default)]
struct PitchQueue {
    pending: Option<String>,
    canceled: HashSet<String>,
}

impl PitchQueue {
    fn enqueue(&mut self, request_id: String) {
        self.pending = Some(request_id);
    }

    fn begin(&mut self, request_id: &str) -> Result<(), String> {
        let canceled = self.canceled.remove(request_id);
        if self.pending.as_deref() != Some(request_id) || canceled {
            return Err("cancelled".into());
        }
        self.pending = None;
        Ok(())
    }

    fn cancel(&mut self, request_id: String) {
        if self.pending.as_deref() == Some(&request_id) {
            self.pending = None;
        }
        if self.canceled.len() >= 1024 {
            self.canceled.clear();
        }
        self.canceled.insert(request_id);
    }

    fn finish(&mut self, request_id: &str) -> bool {
        self.canceled.remove(request_id)
    }
}

impl AppState {
    fn new() -> Self {
        Self {
            worker: AsyncMutex::new(None),
            queue: Mutex::new(PitchQueue::default()),
            transcription: Mutex::new(None),
        }
    }
}

#[tauri::command]
async fn evaluate_pitch(
    state: State<'_, AppState>,
    request_id: String,
    input: PitchModelInput,
) -> Result<PitchDecision, String> {
    // The async worker lock serializes model access, while PitchQueue keeps only
    // the newest waiting request and records cancellations independently.
    state
        .queue
        .lock()
        .map_err(|_| "runtime_unavailable")?
        .enqueue(request_id.clone());
    let mut worker_guard = state.worker.lock().await;
    if state
        .queue
        .lock()
        .map_err(|_| "runtime_unavailable")?
        .begin(&request_id)
        .is_err()
    {
        return Err("cancelled".into());
    }
    if worker_guard.is_none() {
        *worker_guard = Some(Worker::start().await?);
    }
    let result = worker_guard
        .as_mut()
        .ok_or("runtime_unavailable")?
        .evaluate(&request_id, &input)
        .await;
    if result.is_err() {
        if let Some(worker) = worker_guard.take() {
            worker.stop().await;
        }
    }
    if state
        .queue
        .lock()
        .map_err(|_| "runtime_unavailable")?
        .finish(&request_id)
    {
        return Err("cancelled".into());
    }
    result
}

#[tauri::command]
fn cancel_pitch(state: State<'_, AppState>, request_id: String) -> Result<(), String> {
    state
        .queue
        .lock()
        .map_err(|_| "runtime_unavailable")?
        .cancel(request_id);
    Ok(())
}

#[tauri::command]
async fn start_transcription(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    // A new session replaces the old one; the handshake completes before React
    // begins streaming microphone chunks.
    let old = state
        .transcription
        .lock()
        .map_err(|_| "transcription_unavailable")?
        .take();
    if let Some(session) = old {
        session.stop().await;
    }
    let session = TranscriptionSession::start(app, session_id).await?;
    *state
        .transcription
        .lock()
        .map_err(|_| "transcription_unavailable")? = Some(session);
    Ok(())
}

#[tauri::command]
fn submit_audio(
    state: State<'_, AppState>,
    session_id: String,
    sequence: u64,
    audio: Vec<u8>,
) -> Result<(), String> {
    // Reject stale sessions and abort a stream after an ordering or queue error.
    let mut guard = state
        .transcription
        .lock()
        .map_err(|_| "transcription_unavailable")?;
    let session = guard.as_mut().ok_or("transcription_session_missing")?;
    if session.id != session_id {
        return Err("transcription_session_missing".into());
    }
    let result = session.submit(sequence, audio);
    if result.is_err() {
        if let Some(session) = guard.take() {
            session.abort();
        }
    }
    result
}

#[tauri::command]
async fn stop_transcription(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    // The session ID makes stop idempotent when React races a new start.
    let session = {
        let mut guard = state
            .transcription
            .lock()
            .map_err(|_| "transcription_unavailable")?;
        if guard.as_ref().map(|session| &session.id) != Some(&session_id) {
            return Ok(());
        }
        guard.take()
    };
    if let Some(session) = session {
        session.stop().await;
    }
    Ok(())
}

#[tauri::command]
fn toggle_fullscreen(window: Window) -> Result<bool, String> {
    let next = !window.is_fullscreen().map_err(|_| "window_unavailable")?;
    window
        .set_fullscreen(next)
        .map_err(|_| "window_unavailable")?;
    Ok(next)
}

pub fn run() {
    // Tauri exposes only these narrow commands to the bundled local WebView.
    let app = tauri::Builder::default()
        .setup(|app| {
            app.manage(AppState::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            evaluate_pitch,
            cancel_pitch,
            start_transcription,
            submit_audio,
            stop_transcription,
            toggle_fullscreen,
        ])
        .build(tauri::generate_context!())
        .expect("unable to initialize Imagine Pitch");
    app.run(|app, event| {
        // Exit closes the Deepgram task and the child process; Windows Job Object
        // ownership also closes the child if the desktop process crashes.
        if let tauri::RunEvent::Exit = event {
            let state = app.state::<AppState>();
            if let Ok(mut guard) = state.transcription.lock() {
                if let Some(session) = guard.take() {
                    session.abort();
                }
            }
            if let Ok(mut worker) = state.worker.try_lock() {
                if let Some(worker) = worker.take() {
                    tauri::async_runtime::block_on(worker.stop());
                }
            };
        }
    });
}

#[cfg(test)]
mod tests {
    use super::PitchQueue;

    #[test]
    fn newest_waiting_request_replaces_an_older_one() {
        let mut queue = PitchQueue::default();
        queue.enqueue("older".into());
        queue.enqueue("newer".into());
        assert_eq!(queue.begin("older"), Err("cancelled".into()));
        assert_eq!(queue.begin("newer"), Ok(()));
        assert!(!queue.finish("newer"));
    }

    #[test]
    fn cancellation_blocks_waiting_and_finished_decisions() {
        let mut queue = PitchQueue::default();
        queue.enqueue("waiting".into());
        queue.cancel("waiting".into());
        assert_eq!(queue.begin("waiting"), Err("cancelled".into()));
        queue.enqueue("running".into());
        assert_eq!(queue.begin("running"), Ok(()));
        queue.cancel("running".into());
        assert!(queue.finish("running"));
        assert!(!queue.finish("running"));
    }
}
