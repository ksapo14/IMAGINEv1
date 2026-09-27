//! Deepgram is the desktop app's only remote connection. Rust keeps its key out
//! of the WebView and converts one WebM/Opus microphone session into Tauri events.

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::{sync::mpsc, task::JoinHandle, time::timeout};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, Message},
};

const AUDIO_QUEUE_CAPACITY: usize = 16;
const MAX_AUDIO_CHUNK: usize = 64 * 1024;
const MAX_PROVIDER_MESSAGE: usize = 64 * 1024;
const SESSION_LIMIT: Duration = Duration::from_secs(60 * 60);

enum AudioControl {
    Chunk(Vec<u8>),
    Stop,
}

pub struct TranscriptionSession {
    pub id: String,
    next_sequence: u64,
    sender: mpsc::Sender<AudioControl>,
    task: JoinHandle<()>,
}

impl TranscriptionSession {
    pub async fn start(app: AppHandle, session_id: String) -> Result<Self, String> {
        // Validate the session before touching the key or opening a socket. The
        // browser never receives the key, only safe connection categories.
        if session_id.is_empty()
            || session_id.len() > 80
            || !session_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err("invalid_session".into());
        }
        let key = std::env::var("DEEPGRAM_API_KEY").unwrap_or_default();
        if key.trim().is_empty() {
            return Err("deepgram_key_missing".into());
        }
        let mut url = url::Url::parse("wss://api.deepgram.com/v2/listen")
            .map_err(|_| "transcription_unavailable")?;
        {
            let mut query = url.query_pairs_mut();
            query.append_pair(
                "model",
                &environment_option("DEEPGRAM_MODEL", "flux-general-en"),
            );
            query.append_pair(
                "eot_threshold",
                &environment_option("DEEPGRAM_EOT_THRESHOLD", "0.7"),
            );
            query.append_pair(
                "eot_timeout_ms",
                &environment_option("DEEPGRAM_EOT_TIMEOUT_MS", "1500"),
            );
            let language = std::env::var("DEEPGRAM_LANGUAGE_HINT").unwrap_or_default();
            if !language.trim().is_empty() {
                query.append_pair("language_hint", language.trim());
            }
        }
        let mut request = url
            .as_str()
            .into_client_request()
            .map_err(|_| "transcription_unavailable")?;
        request.headers_mut().insert(
            "Authorization",
            HeaderValue::from_str(&format!("Token {}", key.trim()))
                .map_err(|_| "deepgram_key_invalid")?,
        );
        let (socket, _) = timeout(Duration::from_secs(8), connect_async(request))
            .await
            .map_err(|_| "transcription_timeout")?
            .map_err(|error| match error {
                tokio_tungstenite::tungstenite::Error::Http(response)
                    if response.status().as_u16() == 401 || response.status().as_u16() == 403 =>
                {
                    "deepgram_key_invalid"
                }
                _ => "transcription_unavailable",
            })?;
        let (mut writer, mut reader) = socket.split();
        let (sender, mut receiver) = mpsc::channel(AUDIO_QUEUE_CAPACITY);
        emit(
            &app,
            &session_id,
            json!({"type":"Status", "status":"connected"}),
        );
        let task_id = session_id.clone();
        // This task owns both directions of the WebSocket. A bounded queue
        // applies backpressure; the session deadline prevents idle leaks.
        let task = tokio::spawn(async move {
            let result = timeout(SESSION_LIMIT, async {
                loop {
                    tokio::select! {
                        audio = receiver.recv() => match audio {
                            Some(AudioControl::Chunk(chunk)) => {
                                if writer.send(Message::Binary(chunk.into())).await.is_err() { return Err("transcription_connection_lost"); }
                            }
                            Some(AudioControl::Stop) | None => {
                                let _ = writer.send(Message::Text(r#"{"type":"CloseStream"}"#.into())).await;
                                let _ = writer.close().await;
                                return Ok(());
                            }
                        },
                        message = reader.next() => match message {
                            Some(Ok(Message::Text(text))) => {
                                if text.len() > MAX_PROVIDER_MESSAGE { return Err("transcription_protocol_error"); }
                                if let Ok(mut value) = serde_json::from_str::<Value>(&text) {
                                    if value.is_object() {
                                        if value.get("type").and_then(Value::as_str) == Some("Error") {
                                            emit(&app, &task_id, json!({"type":"Error", "message":"The speech provider reported an error."}));
                                            return Ok(());
                                        }
                                        if let Some(object) = value.as_object_mut() { object.remove("sessionId"); }
                                        emit(&app, &task_id, value);
                                    }
                                }
                            }
                            Some(Ok(Message::Close(_))) | None => return Err("transcription_connection_lost"),
                            Some(Err(_)) => return Err("transcription_connection_lost"),
                            Some(Ok(_)) => {}
                        }
                    }
                }
            }).await;
            match result {
                Ok(Err(category)) => {
                    emit(&app, &task_id, json!({"type":"Error", "message":category}))
                }
                Err(_) => emit(
                    &app,
                    &task_id,
                    json!({"type":"Error", "message":"transcription_session_timeout"}),
                ),
                Ok(Ok(())) => {}
            }
        });
        Ok(Self {
            id: session_id,
            next_sequence: 0,
            sender,
            task,
        })
    }

    pub fn submit(&mut self, sequence: u64, audio: Vec<u8>) -> Result<(), String> {
        // A rejected chunk fails the session at the command boundary, avoiding
        // gaps or reordered bytes in the provider's audio stream.
        if sequence != self.next_sequence {
            return Err("audio_out_of_order".into());
        }
        if audio.is_empty() || audio.len() > MAX_AUDIO_CHUNK {
            return Err("audio_format_unsupported".into());
        }
        if self.task.is_finished() {
            return Err("transcription_connection_lost".into());
        }
        self.sender
            .try_send(AudioControl::Chunk(audio))
            .map_err(|_| "audio_buffer_overflow".to_string())?;
        self.next_sequence += 1;
        Ok(())
    }

    pub async fn stop(self) {
        // Give Deepgram a close frame, then abort if its socket stalls.
        if self.sender.try_send(AudioControl::Stop).is_err() {
            self.task.abort();
            return;
        }
        let mut task = self.task;
        if timeout(Duration::from_secs(3), &mut task).await.is_err() {
            task.abort();
        }
    }

    pub fn abort(self) {
        self.task.abort();
    }
}

fn environment_option(name: &str, default: &str) -> String {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| default.into())
}

fn emit(app: &AppHandle, session_id: &str, mut message: Value) {
    // Reattach the app-owned session ID after removing any provider field with
    // that name so React can ignore events from superseded recordings.
    if let Some(object) = message.as_object_mut() {
        object.insert("sessionId".into(), Value::String(session_id.into()));
    }
    let _ = app.emit("pitch-transcription", message);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    #[test]
    fn environment_defaults_are_stable() {
        let missing = environment_option("IMAGINE_UNSET_TEST_OPTION", "flux-general-en");
        assert_eq!(missing, "flux-general-en");
    }

    #[tokio::test]
    async fn audio_queue_preserves_order_and_rejects_duplicate_sequence() {
        let (sender, mut receiver) = mpsc::channel(2);
        let task = tokio::spawn(async { std::future::pending::<()>().await });
        let mut session = TranscriptionSession {
            id: "test".into(),
            next_sequence: 0,
            sender,
            task,
        };
        assert_eq!(session.submit(0, vec![1]), Ok(()));
        assert_eq!(session.submit(1, vec![2]), Ok(()));
        assert_eq!(session.submit(1, vec![3]), Err("audio_out_of_order".into()));
        assert!(matches!(receiver.try_recv(), Ok(AudioControl::Chunk(bytes)) if bytes == [1]));
        assert!(matches!(receiver.try_recv(), Ok(AudioControl::Chunk(bytes)) if bytes == [2]));
        session.abort();
    }

    #[tokio::test]
    async fn full_audio_queue_reports_overflow_without_advancing_sequence() {
        let (sender, _receiver) = mpsc::channel(1);
        let task = tokio::spawn(async { std::future::pending::<()>().await });
        let mut session = TranscriptionSession {
            id: "test".into(),
            next_sequence: 0,
            sender,
            task,
        };
        assert_eq!(session.submit(0, vec![1]), Ok(()));
        assert_eq!(
            session.submit(1, vec![2]),
            Err("audio_buffer_overflow".into())
        );
        assert_eq!(session.next_sequence, 1);
        session.abort();
    }

    #[tokio::test]
    async fn stopping_a_session_delivers_close_control_and_joins_its_task() {
        let (sender, mut receiver) = mpsc::channel(1);
        let saw_stop = Arc::new(AtomicBool::new(false));
        let observed = Arc::clone(&saw_stop);
        let task = tokio::spawn(async move {
            if matches!(receiver.recv().await, Some(AudioControl::Stop)) {
                observed.store(true, Ordering::SeqCst);
            }
        });
        let session = TranscriptionSession {
            id: "test".into(),
            next_sequence: 0,
            sender,
            task,
        };
        session.stop().await;
        assert!(saw_stop.load(Ordering::SeqCst));
    }
}
