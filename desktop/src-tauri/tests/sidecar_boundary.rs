#[path = "../src/worker.rs"]
mod worker;

use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use worker::{PitchDecision, PitchModelInput, SlideDescriptor, Worker};

struct Fixture {
    path: PathBuf,
}

impl Fixture {
    fn new(mode: &str) -> Self {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "imagine pitch evaluator {}-{suffix}",
            std::process::id()
        ));
        fs::create_dir(&path).expect("fixture directory");
        fs::write(path.join("config.json"), b"{}").expect("fixture model config");
        fs::write(path.join("test-mode"), mode).expect("fixture mode");
        Self { path }
    }

    fn set_mode(&self, mode: &str) {
        fs::write(self.path.join("test-mode"), mode).expect("fixture mode");
    }
    fn startups(&self) -> u32 {
        fs::read_to_string(self.path.join("startup-count"))
            .expect("startup count")
            .parse()
            .expect("numeric count")
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        for name in ["config.json", "test-mode", "startup-count"] {
            let _ = fs::remove_file(self.path.join(name));
        }
        let _ = fs::remove_dir(&self.path);
    }
}

fn fake_executable() -> &'static Path {
    Path::new(env!("CARGO_BIN_EXE_fake_sidecar"))
}

fn pitch_input() -> PitchModelInput {
    let current = SlideDescriptor {
        id: "first".into(),
        title: "First".into(),
        description: "Opening".into(),
    };
    let target = SlideDescriptor {
        id: "second".into(),
        title: "Second".into(),
        description: "Next".into(),
    };
    PitchModelInput {
        latest_utterance: "Please show the next idea".into(),
        current_slide: current.clone(),
        available_slides: vec![current, target],
    }
}

async fn start(fixture: &Fixture, inference_timeout: Duration) -> Worker {
    Worker::start_for_test(
        fake_executable(),
        &fixture.path,
        Duration::from_secs(5),
        inference_timeout,
    )
    .await
    .expect("fixture startup")
}

#[tokio::test]
async fn reuses_one_process_for_multiple_decisions() {
    let fixture = Fixture::new("normal");
    let mut worker = start(&fixture, Duration::from_secs(2)).await;
    let expected = PitchDecision::GotoSlide {
        slide_id: "second".into(),
    };
    assert_eq!(
        worker.evaluate("request_1", &pitch_input()).await.unwrap(),
        expected
    );
    assert_eq!(
        worker.evaluate("request_2", &pitch_input()).await.unwrap(),
        expected
    );
    assert_eq!(fixture.startups(), 1);
    worker.stop().await;
}

#[tokio::test]
async fn timeout_kills_worker_and_new_process_can_start() {
    let fixture = Fixture::new("hang");
    let mut worker = start(&fixture, Duration::from_millis(150)).await;
    assert_eq!(
        worker
            .evaluate("request_1", &pitch_input())
            .await
            .unwrap_err(),
        "timeout"
    );
    worker.stop().await;
    fixture.set_mode("normal");
    let mut restarted = start(&fixture, Duration::from_secs(2)).await;
    assert!(restarted
        .evaluate("request_2", &pitch_input())
        .await
        .is_ok());
    assert_eq!(fixture.startups(), 2);
    restarted.stop().await;
}

#[tokio::test]
async fn crash_and_malformed_output_are_recoverable() {
    let fixture = Fixture::new("crash");
    let mut worker = start(&fixture, Duration::from_secs(2)).await;
    assert_eq!(
        worker
            .evaluate("request_1", &pitch_input())
            .await
            .unwrap_err(),
        "worker_crashed"
    );
    worker.stop().await;
    fixture.set_mode("bad_frame");
    let mut worker = start(&fixture, Duration::from_secs(2)).await;
    assert_eq!(
        worker
            .evaluate("request_2", &pitch_input())
            .await
            .unwrap_err(),
        "protocol_error"
    );
    worker.stop().await;
    fixture.set_mode("normal");
    let mut restarted = start(&fixture, Duration::from_secs(2)).await;
    assert!(restarted
        .evaluate("request_3", &pitch_input())
        .await
        .is_ok());
    assert_eq!(fixture.startups(), 3);
    restarted.stop().await;
}
