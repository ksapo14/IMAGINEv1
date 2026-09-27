//! Deterministic JSONL fixture for Rust process-boundary tests. Never bundled with the app.

use serde_json::{json, Value};
use std::{
    fs,
    io::{self, BufRead, Write},
    path::PathBuf,
    thread,
    time::Duration,
};

fn send(value: Value) {
    let mut output = io::stdout().lock();
    serde_json::to_writer(&mut output, &value).expect("fixture response");
    output.write_all(b"\n").expect("fixture newline");
    output.flush().expect("fixture flush");
}

fn main() {
    let model_path = PathBuf::from(std::env::args_os().nth(1).expect("fixture model path"));
    let mode = fs::read_to_string(model_path.join("test-mode")).unwrap_or_else(|_| "normal".into());
    let counter_path = model_path.join("startup-count");
    let startups = fs::read_to_string(&counter_path)
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0)
        + 1;
    fs::write(counter_path, startups.to_string()).expect("fixture startup count");
    send(json!({"version":1,"kind":"startup","ok":true}));
    for line in io::stdin().lock().lines() {
        let line = line.expect("fixture request");
        let request: Value = serde_json::from_str(&line).expect("fixture request json");
        let id = request
            .get("id")
            .and_then(Value::as_str)
            .expect("fixture id");
        match mode.trim() {
            "hang" => thread::sleep(Duration::from_secs(5)),
            "crash" => std::process::exit(2),
            "bad_frame" => {
                let mut output = io::stdout().lock();
                output.write_all(b"not-json\n").expect("fixture bad frame");
                output.flush().expect("fixture flush");
            }
            _ => send(
                json!({"version":1,"kind":"result","id":id,"ok":true,"decision":{"action":"goto_slide","slide_id":"second"}}),
            ),
        }
    }
}
