import { createRoot } from "react-dom/client";
import { PitchWorkspace } from "../../components/pitch/pitch-workspace.tsx";
import { desktopPitchModel } from "./model.ts";
import { createDesktopTranscriptionTransport } from "./transcription.ts";
import { invoke } from "./tauri.ts";
import "./style.css";

const toggleFullscreen = () => invoke<void>("toggle_fullscreen");

function DesktopApp() {
  return <PitchWorkspace adapter={desktopPitchModel} createTransport={createDesktopTranscriptionTransport} toggleFullscreen={toggleFullscreen} />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Desktop root element is missing.");
createRoot(root).render(<DesktopApp />);
