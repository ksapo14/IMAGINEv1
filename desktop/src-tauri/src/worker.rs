//! Owns the local Python evaluator as one private child process. Requests and
//! replies use versioned JSON lines over pipes; no local HTTP port is opened.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashSet, path::Path, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    time::timeout,
};

const MAX_FRAME: usize = 64 * 1024;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(300);
const INFERENCE_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Clone, Deserialize, Serialize)]
pub struct SlideDescriptor {
    pub id: String,
    pub title: String,
    pub description: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchModelInput {
    pub latest_utterance: String,
    pub current_slide: SlideDescriptor,
    pub available_slides: Vec<SlideDescriptor>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum PitchDecision {
    GotoSlide { slide_id: String },
    NoAction,
}

pub struct Worker {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    inference_timeout: Duration,
    #[cfg(windows)]
    _job: WindowsJob,
}

impl Worker {
    /// Start the repository's local Python environment when evaluation is first requested.
    pub async fn start() -> Result<Self, String> {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(Path::parent)
            .ok_or("python_unavailable")?;
        let configured = std::env::var_os("IMAGINE_PYTHON");
        let python = configured
            .map(|value| {
                let path = Path::new(&value);
                if path.is_absolute() {
                    path.to_path_buf()
                } else {
                    repo_root.join(path)
                }
            })
            .unwrap_or_else(|| repo_root.join("backend/.venv/Scripts/python.exe"));
        if !python.is_file() || !repo_root.join("backend/evaluate.py").is_file() {
            return Err("python_unavailable".into());
        }
        Self::start_process(
            &python,
            None,
            Some(repo_root),
            STARTUP_TIMEOUT,
            INFERENCE_TIMEOUT,
        )
        .await
    }

    #[cfg(test)]
    pub async fn start_for_test(
        executable: &Path,
        model_path: &Path,
        startup_timeout: Duration,
        inference_timeout: Duration,
    ) -> Result<Self, String> {
        Self::start_process(
            executable,
            Some(model_path),
            None,
            startup_timeout,
            inference_timeout,
        )
        .await
    }

    async fn start_process(
        executable: &Path,
        model_path: Option<&Path>,
        repo_root: Option<&Path>,
        startup_timeout: Duration,
        inference_timeout: Duration,
    ) -> Result<Self, String> {
        // Production loads the cached model by ID. Tests may pass a fixture path.
        if let Some(path) = model_path {
            if !path.is_dir() || !path.join("config.json").is_file() {
                return Err("model_folder_invalid".into());
            }
        }
        if !executable.is_file() {
            return Err("python_unavailable".into());
        }
        let mut command = Command::new(executable);
        if let Some(root) = repo_root {
            command
                .current_dir(root)
                .args(["-u", "-m", "backend.evaluate"]);
        }
        if let Some(path) = model_path {
            command.arg(path);
        }
        command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .env("HF_HUB_OFFLINE", "1")
            .env("TRANSFORMERS_OFFLINE", "1")
            .env("HF_HUB_DISABLE_TELEMETRY", "1")
            .env("DO_NOT_TRACK", "1")
            .env_remove("DEEPGRAM_API_KEY")
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let mut child = command
            .spawn()
            .map_err(|_| "python_unavailable".to_string())?;
        #[cfg(windows)]
        let job = match WindowsJob::attach(child.id().ok_or("python_unavailable")?) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill().await;
                return Err(error);
            }
        };
        let stdin = child.stdin.take().ok_or("python_unavailable")?;
        let stdout = BufReader::new(child.stdout.take().ok_or("python_unavailable")?);
        let mut worker = Self {
            child,
            stdin,
            stdout,
            inference_timeout,
            #[cfg(windows)]
            _job: job,
        };
        // Startup is a separate protocol frame because model loading can take
        // much longer than a warm inference. Failure categories stay bounded.
        let startup = worker.read_frame(startup_timeout).await?;
        if startup.get("version") != Some(&json!(1))
            || startup.get("kind") != Some(&json!("startup"))
        {
            return Err("protocol_error".into());
        }
        if startup.get("ok") != Some(&json!(true)) {
            let category = startup
                .get("category")
                .and_then(Value::as_str)
                .unwrap_or("load_failure");
            return Err(match category {
                "dependency_missing" | "load_failure" => category,
                "invalid_model_folder" => "model_folder_invalid",
                _ => "load_failure",
            }
            .into());
        }
        Ok(worker)
    }

    pub async fn evaluate(
        &mut self,
        request_id: &str,
        input: &PitchModelInput,
    ) -> Result<PitchDecision, String> {
        // Rust validates the deck before writing. The worker must reply with
        // the matching request ID and one action for an available slide.
        validate_input(request_id, input)?;
        let request = json!({
            "version": 1,
            "kind": "decision",
            "id": request_id,
            "utterance": input.latest_utterance,
            "current_slide": input.current_slide,
            "available_slides": input.available_slides,
        });
        let mut payload = serde_json::to_vec(&request).map_err(|_| "protocol_error")?;
        payload.push(b'\n');
        if payload.len() > MAX_FRAME {
            return Err("request_too_large".into());
        }
        // One deadline covers pipe backpressure and generation together; a
        // stalled write must not grant the worker a second inference window.
        let deadline = self.inference_timeout;
        let result = timeout(deadline, async {
            self.stdin
                .write_all(&payload)
                .await
                .map_err(|_| "worker_crashed")?;
            self.stdin.flush().await.map_err(|_| "worker_crashed")?;
            self.read_frame(deadline).await
        })
        .await
        .map_err(|_| "timeout")??;
        validate_result(result, request_id, &input.available_slides)
    }

    async fn read_frame(&mut self, duration: Duration) -> Result<Value, String> {
        // Byte-wise reading caps a malicious or broken child before buffering
        // an unbounded line; timeout also covers a child that stops producing.
        let mut frame = Vec::new();
        timeout(duration, async {
            loop {
                let byte = self.stdout.read_u8().await.map_err(|_| "worker_crashed")?;
                frame.push(byte);
                if frame.len() > MAX_FRAME {
                    return Err("protocol_error");
                }
                if byte == b'\n' {
                    return Ok(());
                }
            }
        })
        .await
        .map_err(|_| "timeout")??;
        decode_frame(&frame)
    }

    pub async fn stop(mut self) {
        let _ = self.child.kill().await;
        let _ = self.child.wait().await;
    }
}

fn decode_frame(frame: &[u8]) -> Result<Value, String> {
    if frame.is_empty() || frame.len() > MAX_FRAME || frame.last() != Some(&b'\n') {
        return Err("protocol_error".into());
    }
    let value: Value = serde_json::from_slice(frame).map_err(|_| "protocol_error")?;
    if !value.is_object() {
        return Err("protocol_error".into());
    }
    Ok(value)
}

fn validate_result(
    result: Value,
    request_id: &str,
    available_slides: &[SlideDescriptor],
) -> Result<PitchDecision, String> {
    // Never trust model text or an arbitrary JSON object as an executable
    // instruction; only the two deck-scoped proposal shapes are accepted.
    if result.get("version") != Some(&json!(1))
        || result.get("kind") != Some(&json!("result"))
        || result.get("id") != Some(&json!(request_id))
    {
        return Err("protocol_error".into());
    }
    if result.get("ok") != Some(&json!(true)) {
        return Err(match result.get("category").and_then(Value::as_str) {
            Some("inference_failure") => "inference_failure",
            _ => "protocol_error",
        }
        .into());
    }
    let decision: PitchDecision =
        serde_json::from_value(result.get("decision").cloned().ok_or("protocol_error")?)
            .map_err(|_| "protocol_error")?;
    if let PitchDecision::GotoSlide { slide_id } = &decision {
        if !available_slides.iter().any(|slide| &slide.id == slide_id) {
            return Err("protocol_error".into());
        }
    }
    Ok(decision)
}

fn validate_input(request_id: &str, input: &PitchModelInput) -> Result<(), String> {
    if request_id.is_empty()
        || request_id.len() > 80
        || !request_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("invalid_request".into());
    }
    if input.latest_utterance.trim().is_empty()
        || input.latest_utterance.len() > 8192
        || input.available_slides.is_empty()
        || input.available_slides.len() > 100
    {
        return Err("invalid_request".into());
    }
    let mut ids = HashSet::new();
    for slide in &input.available_slides {
        if slide.id.is_empty()
            || slide.id.len() > 80
            || !slide
                .id
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
            || slide.title.len() > 200
            || slide.description.len() > 2000
            || !ids.insert(&slide.id)
        {
            return Err("invalid_request".into());
        }
    }
    if !ids.contains(&input.current_slide.id) {
        return Err("invalid_request".into());
    }
    Ok(())
}

#[cfg(windows)]
struct WindowsJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for WindowsJob {}

#[cfg(windows)]
impl WindowsJob {
    fn attach(pid: u32) -> Result<Self, String> {
        // Kill-on-close handles the hard-crash case where normal Tauri exit
        // cleanup cannot run and would otherwise orphan a model process.
        use windows_sys::Win32::{
            Foundation::CloseHandle,
            System::{
                JobObjects::{
                    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                },
                Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE},
            },
        };
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err("python_unavailable".into());
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let set = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            );
            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            let assigned = !process.is_null() && AssignProcessToJobObject(job, process) != 0;
            if !process.is_null() {
                CloseHandle(process);
            }
            if set == 0 || !assigned {
                CloseHandle(job);
                return Err("python_unavailable".into());
            }
            Ok(Self(job))
        }
    }
}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_deck_scoped_decisions() {
        assert_eq!(
            serde_json::from_value::<PitchDecision>(json!({"action":"no_action"})).unwrap(),
            PitchDecision::NoAction
        );
        assert!(serde_json::from_value::<PitchDecision>(
            json!({"action":"goto_slide", "slide_id":"intro", "other":1})
        )
        .is_err());
        assert!(serde_json::from_value::<PitchDecision>(json!({"action":"open_file"})).is_err());
    }

    #[test]
    fn rejects_duplicate_deck_ids() {
        let slide = SlideDescriptor {
            id: "intro".into(),
            title: "Intro".into(),
            description: "First".into(),
        };
        let input = PitchModelInput {
            latest_utterance: "next".into(),
            current_slide: slide.clone(),
            available_slides: vec![slide.clone(), slide],
        };
        assert!(validate_input("request_1", &input).is_err());
    }

    #[test]
    fn result_requires_matching_request_and_available_slide() {
        let slide = SlideDescriptor {
            id: "intro".into(),
            title: "Intro".into(),
            description: "First".into(),
        };
        let response = json!({"version":1,"kind":"result","id":"one","ok":true,"decision":{"action":"goto_slide","slide_id":"intro"}});
        assert_eq!(
            validate_result(response.clone(), "one", &[slide.clone()]).unwrap(),
            PitchDecision::GotoSlide {
                slide_id: "intro".into()
            }
        );
        assert!(validate_result(response.clone(), "two", &[slide]).is_err());
        assert!(validate_result(response, "one", &[]).is_err());
    }

    #[test]
    fn frame_must_be_one_bounded_json_line() {
        assert!(decode_frame(b"{\"version\":1}\n").is_ok());
        assert!(decode_frame(b"{\"version\":1}").is_err());
        assert!(decode_frame(b"{}\n{}\n").is_err());
        assert!(decode_frame(&vec![b'x'; MAX_FRAME + 1]).is_err());
    }
}
