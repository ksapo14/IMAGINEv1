import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def jpeg_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if not data.startswith(b"\xff\xd8"):
        raise AssertionError(f"{path} is not a JPEG")

    cursor = 2
    start_of_frame = {
        0xC0,
        0xC1,
        0xC2,
        0xC3,
        0xC5,
        0xC6,
        0xC7,
        0xC9,
        0xCA,
        0xCB,
        0xCD,
        0xCE,
        0xCF,
    }
    while cursor + 8 < len(data):
        if data[cursor] != 0xFF:
            cursor += 1
            continue
        marker = data[cursor + 1]
        cursor += 2
        if marker in {0xD8, 0xD9}:
            continue
        segment_length = int.from_bytes(data[cursor : cursor + 2], "big")
        if marker in start_of_frame:
            height = int.from_bytes(data[cursor + 3 : cursor + 5], "big")
            width = int.from_bytes(data[cursor + 5 : cursor + 7], "big")
            return width, height
        cursor += segment_length
    raise AssertionError(f"{path} has no JPEG start-of-frame marker")


def png_dimensions(path: Path) -> tuple[int, int]:
    """Read the fixed-width dimensions from a valid PNG header."""
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise AssertionError(f"{path} is not a PNG")
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


class FrontendContractTests(unittest.TestCase):
    def marketing_source(self) -> str:
        files = [
            *sorted((ROOT / "app" / "(marketing)").rglob("*.tsx")),
            *sorted((ROOT / "components" / "marketing").rglob("*.tsx")),
            *sorted((ROOT / "components" / "marketing").rglob("*.ts")),
        ]
        return "\n".join(path.read_text(encoding="utf-8") for path in files)

    def test_canvas_route_exists(self) -> None:
        canvas_page = ROOT / "app" / "canvas" / "page.tsx"
        self.assertTrue(canvas_page.is_file())
        canvas_source = canvas_page.read_text(encoding="utf-8")
        storage_source = (ROOT / "lib" / "whiteboard-session-storage.ts").read_text(
            encoding="utf-8"
        )
        self.assertIn("export default function CanvasPage", canvas_source)
        self.assertIn(
            'export type DashboardTab = "prepare" | "library" | "live"',
            storage_source,
        )
        self.assertIn('activeTab === "prepare"', canvas_source)
        self.assertIn('activeTab === "live"', canvas_source)
        self.assertNotIn('activeTab === "overview"', canvas_source)
        self.assertNotIn('activeTab === "teach"', canvas_source)

    def test_prepare_and_library_remain_in_the_dashboard_branch(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )
        live_branch = canvas_source.index('if (activeTab === "live")')
        dashboard_shell = canvas_source.index('className="dashboard-root', live_branch)
        prepare_branch = canvas_source.index('activeTab === "prepare"', dashboard_shell)
        library_branch = canvas_source.index('activeTab === "library"', prepare_branch)

        self.assertLess(live_branch, dashboard_shell)
        self.assertLess(dashboard_shell, prepare_branch)
        self.assertLess(prepare_branch, library_branch)
        self.assertIn('aria-label="Workspace views"', canvas_source[dashboard_shell:prepare_branch])
        self.assertIn("saveLessonContext", canvas_source)
        self.assertIn("saveLessonLibrary(window.localStorage, lessons)", canvas_source)
        self.assertIn("loadLessonLibrary(window.localStorage)", canvas_source)

    def test_lesson_context_is_local_and_generation_is_live_only(self) -> None:
        lesson_library = (
            ROOT / "lib" / "lesson-library.ts"
        ).read_text(encoding="utf-8")
        stream_client = (
            ROOT / "lib" / "generation-stream.ts"
        ).read_text(encoding="utf-8")

        self.assertIn("LESSON_LIBRARY_KEY", lesson_library)
        self.assertIn("schemaVersion: 2", lesson_library)
        self.assertIn("value.schemaVersion !== 1", lesson_library)
        self.assertNotIn("recallPhrases", lesson_library)
        self.assertNotIn("composition:", lesson_library)
        self.assertIn("/api/generate/stream", stream_client)
        self.assertIn("JSON.stringify(request)", stream_client)
        self.assertNotIn("text_delta", stream_client)

    def test_live_canvas_unifies_speech_context_and_cumulative_generation(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )
        live_session = (ROOT / "lib" / "live-session.ts").read_text(
            encoding="utf-8"
        )
        board_session = (ROOT / "lib" / "whiteboard-session.ts").read_text(
            encoding="utf-8"
        )

        self.assertIn("dispatchFinalizedTranscript", canvas_source)
        self.assertIn("dispatchTeachingTurn", canvas_source)
        self.assertIn("consumeWakeCommand", canvas_source)
        self.assertIn("IDLE_WAKE_COMMAND_STATE", canvas_source)
        self.assertIn('"Armed — say one command"', canvas_source)
        self.assertIn('value={capturedInput}', canvas_source)
        self.assertNotIn('value={displayValue}', canvas_source)
        self.assertIn("ordinaryTurnQueue", canvas_source)
        self.assertIn("generationInFlight.current", canvas_source)
        self.assertIn("lessonContext:", canvas_source)
        self.assertIn("recentTurns:", canvas_source)
        self.assertIn("concepts:", canvas_source)
        self.assertIn("board:", canvas_source)
        self.assertIn("MAX_QUEUED_TURNS = 2", live_session)
        self.assertIn("applyBoardDecision", board_session)
        self.assertIn("placementsConflict(candidate.placement, scene.placement)", board_session)
        self.assertIn("currentPage: scene.placement.page", board_session)

    def test_live_response_actions_exclude_hold_but_recent_turns_remain_compatible(self) -> None:
        types_source = (ROOT / "components" / "workspace" / "types.ts").read_text(
            encoding="utf-8"
        )
        stream_client = (ROOT / "lib" / "generation-stream.ts").read_text(
            encoding="utf-8"
        )
        self.assertIn('WhiteboardAction = "create" | "update"', types_source)
        self.assertIn('RecentTurnAction = WhiteboardAction | "hold"', types_source)
        self.assertIn('["create", "update"]', stream_client)
        self.assertNotIn('["hold", "create", "update"]', stream_client)
        self.assertIn('BoardStrategy = "integrate" | "reset"', types_source)
        self.assertIn('["integrate", "reset"]', stream_client)

    def test_live_canvas_is_a_compact_full_screen_teaching_surface(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )

        self.assertIn('if (activeTab === "live")', canvas_source)
        self.assertIn('h-[100dvh] min-h-[100dvh]', canvas_source)
        self.assertIn("Exit live whiteboard and return to library", canvas_source)
        self.assertIn("Open live whiteboard options", canvas_source)
        self.assertIn("Start fresh board", canvas_source)
        self.assertIn("Open lesson library", canvas_source)
        self.assertIn("pageCount > 1", canvas_source)
        self.assertIn("env(safe-area-inset-bottom)", canvas_source)
        self.assertIn("bg-white/65", canvas_source)
        self.assertIn("bg-white/75", canvas_source)
        self.assertIn("backdrop-blur-xl", canvas_source)
        self.assertIn("animationRequest={sceneAnimation}", canvas_source)
        self.assertIn("bg-[#fffdf7] text-neutral-950", canvas_source)
        self.assertIn("text-xs font-semibold text-neutral-600", canvas_source)
        self.assertIn("text-sm text-neutral-900", canvas_source)
        self.assertNotIn("data-live-summary", canvas_source)
        self.assertNotIn("currentConcepts", canvas_source)
        select_tab = canvas_source[canvas_source.index("function selectTab"):canvas_source.index("function handleLiveSubmit")]
        self.assertIn('if (tab !== "live")', select_tab)
        self.assertIn("setSceneAnimation(null)", select_tab)

    def test_live_typed_command_remains_readable_on_the_light_input(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )
        input_start = canvas_source.index('<Textarea id="workspace-input"')
        input_end = canvas_source.index("/>", input_start)
        live_input = canvas_source[input_start:input_end]

        self.assertIn("text-black", live_input)
        self.assertIn("caret-black", live_input)
        self.assertIn("placeholder:text-neutral-600", live_input)

    def test_live_success_notices_expire_without_clearing_persistent_status(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )
        self.assertIn("if (!notice) return", canvas_source)
        self.assertIn("}, 3500)", canvas_source)
        self.assertIn("return () => window.clearTimeout(timer)", canvas_source)
        self.assertIn("current === notice ? \"\" : current", canvas_source)
        self.assertIn("setNoticeRevision((current) => current + 1)", canvas_source)
        self.assertIn("[notice, noticeRevision]", canvas_source)
        self.assertNotIn('decision.action === "hold"', canvas_source)

    def test_live_canvas_bounds_scenes_and_restores_selected_lessons(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )
        board_session = (ROOT / "lib" / "whiteboard-session.ts").read_text(
            encoding="utf-8"
        )

        self.assertIn("MAX_BOARD_SCENES = 48", board_session)
        self.assertIn("board.scenes.length >= MAX_BOARD_SCENES", board_session)
        self.assertNotIn("board.scenes.slice(0, 48)", board_session)
        self.assertIn("const ownsVisualJob = () =>", canvas_source)
        self.assertGreaterEqual(canvas_source.count("if (!ownsVisualJob()) return;"), 3)
        self.assertIn("cancelSupersededVisualJob(", canvas_source)
        self.assertIn(
            "patchGeneratedAsset(currentBoard, sceneId, jobId, asset, failed)",
            canvas_source,
        )
        self.assertIn("sessionCache.current.delete(lessonId)", canvas_source)
        self.assertIn('activateLesson(next[0]?.id ?? "", false)', canvas_source)
        self.assertIn("const settledBoard = settlePendingVisualJobs(boardRef.current)", canvas_source)
        self.assertIn("if (snapshotOutgoing) snapshotCurrentSession()", canvas_source)

    def test_whiteboard_sessions_hydrate_before_autosave_and_strip_images(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )
        storage = (ROOT / "lib" / "whiteboard-session-storage.ts").read_text(
            encoding="utf-8"
        )
        stream = (ROOT / "lib" / "generation-stream.ts").read_text(
            encoding="utf-8"
        )

        self.assertIn("WHITEBOARD_SESSION_STORAGE_KEY", storage)
        self.assertIn("loadWhiteboardSessionStore", canvas_source)
        self.assertIn("if (!workspaceReady) return", canvas_source)
        self.assertIn("sessionCache.current.set(selectedLessonId", canvas_source)
        self.assertIn("turnSequence: turnSequenceValue", canvas_source)
        self.assertIn("generatedAsset: _asset", storage)
        self.assertIn("visualJobId: _job", storage)
        self.assertIn("createEmptyWhiteboardSession", canvas_source)
        self.assertIn("activateLesson(event.target.value)", canvas_source)
        self.assertIn("fresh board", canvas_source)
        self.assertIn("WHITEBOARD_SESSION_SCHEMA_VERSION = 6", storage)
        self.assertIn("sourceSchema === 1", storage)
        self.assertIn("sourceSchema < WHITEBOARD_SESSION_SCHEMA_VERSION", storage)
        self.assertIn(
            '!modes.includes("visual") && !modes.includes("diagram")', storage
        )
        self.assertIn("generatedAsset: null", storage)
        self.assertIn("visualJobId: null", storage)
        self.assertIn("const canGenerateAsset = hasVisual || hasDiagram", stream)
        self.assertIn(
            'if (hasDiagram && value.renderMode !== "generatedAsset")', stream
        )
        self.assertIn(
            "Boolean(value.generatedAsset) === Boolean(value.visualJobId)", stream
        )

    def test_whiteboard_uses_structured_visuals_and_generated_diagram_loader(self) -> None:
        canvas = (ROOT / "app" / "canvas" / "page.tsx").read_text(encoding="utf-8")
        board = (ROOT / "components" / "workspace" / "live-whiteboard.tsx").read_text(
            encoding="utf-8"
        )
        scene = (ROOT / "components" / "workspace" / "stick-scene.tsx").read_text(
            encoding="utf-8"
        )
        styles = (ROOT / "app" / "globals.css").read_text(encoding="utf-8")

        self.assertIn("function arrangeScenes", board)
        self.assertIn("function pageTemplate", board)
        self.assertIn('return notesOnly ? "grid-cols-2" : "grid-cols-1"', board)
        self.assertIn("scenes.length === 3 && index === 0", board)
        self.assertIn("min-h-[34rem]", board)
        self.assertIn("grid-cols-1", board)
        self.assertIn("md:grid-cols-2", board)
        self.assertIn("overflow-auto", board)
        self.assertIn("<StickScene", board)
        self.assertIn('aria-label="Visualization"', board)
        self.assertIn('aria-label="Notes"', board)
        self.assertIn('aria-label="Diagram"', board)
        self.assertNotIn("VisualSummary", board)
        self.assertIn("showConnections={false}", board)
        self.assertIn('const hasDiagram = scene.contentModes.includes("diagram")', board)
        self.assertIn("!hasDiagram && scene.generatedAsset", board)
        self.assertIn(
            'scene.stickScene && (hasDiagram || scene.renderMode === "structured")',
            board,
        )
        self.assertIn("scene.contentModes.map", board)
        self.assertIn("mode === \"visual\"", board)
        self.assertIn("mode === \"notes\"", board)
        self.assertIn("diagram is unavailable.", board)
        self.assertIn("scene.generatedAsset", board)
        self.assertIn('aria-label="Summary notes"', board)
        self.assertIn("scene.summaryBullets.map", board)
        self.assertNotIn("scene.keywords", board)
        self.assertNotIn('aria-label="Keywords"', board)
        self.assertIn("scenes.length === 1", board)
        self.assertIn('scene.headingMode === "show"', board)
        self.assertIn('className={`w-full object-contain', board)
        diagram_pane = board[
            board.index('data-content-mode="diagram"') : board.index("function placementOrder")
        ]
        self.assertNotIn("StickScene", diagram_pane)
        self.assertNotIn("scene.stickScene", diagram_pane)
        self.assertLess(diagram_pane.index("scene.generatedAsset"), diagram_pane.index("scene.visualJobId"))
        self.assertLess(diagram_pane.index("scene.visualJobId"), diagram_pane.index("scene.visualFailed"))
        self.assertLess(diagram_pane.index("scene.visualFailed"), diagram_pane.index("This restored diagram is unavailable"))
        self.assertIn('role="status" aria-live="polite" aria-atomic="true"', board)
        self.assertIn('aria-hidden="true" focusable="false"', board)
        self.assertIn("diagram-drawing-loader__stroke", board)
        self.assertIn("@keyframes diagram-draw-stroke", styles)
        self.assertIn("@keyframes diagram-node-pulse", styles)
        self.assertIn("@media (prefers-reduced-motion: reduce)", styles)
        self.assertIn("stroke-dashoffset: 0", styles)
        self.assertIn("animation: none", styles)
        self.assertNotIn("grayscale", board)
        self.assertNotIn("contrast-125", board)
        self.assertNotIn("mix-blend-multiply", board)
        self.assertIn('role="img"', scene)
        self.assertIn("useId()", scene)
        self.assertIn("id={markerId}", scene)
        self.assertIn("`url(#${markerId})`", scene)
        self.assertNotIn('id="stick-arrow"', scene)
        self.assertIn("scene.entities.map", scene)
        self.assertIn("getScenePalette(scene.conceptKey)", board)
        self.assertIn('ink: "#171717"', scene)
        self.assertIn('softFill: "transparent"', scene)
        self.assertIn('fontSize="0.44"', scene)
        self.assertIn("motion-reduce:animate-none", board)
        self.assertIn("data-scene-id={scene.sceneId}", board)
        self.assertIn("animationRequest?.revision", board)
        self.assertIn('window.matchMedia("(prefers-reduced-motion: reduce)")', board)
        self.assertIn("timeline.fromTo", board)
        self.assertNotIn("data-typewriter-char", board)
        self.assertNotIn("TypewriterText", board)
        self.assertIn('data-animation-block="heading"', board)
        self.assertIn('data-animation-block="notes"', board)
        self.assertIn('kind: "expandDiagramNotes"', canvas)
        self.assertIn("shouldAnimateDiagramNotesExpansion", canvas)
        self.assertIn('new Map<number, "running" | "complete">()', board)
        self.assertIn('animationLifecycle.current.set(animationRequest.revision, "running")', board)
        self.assertIn('animationLifecycle.current.set(animationRequest.revision, "complete")', board)
        self.assertIn("animationLifecycle.current.delete(animationRequest.revision)", board)
        self.assertLess(
            board.index('data-scene-id="${animationRequest.sceneId}"'),
            board.index("animationLifecycle.current.set(animationRequest.revision"),
        )
        self.assertIn(
            "dependencies: [animationRequest?.revision]",
            board,
        )
        self.assertIn('data-content-mode="diagram"', board)
        self.assertIn('data-content-mode="notes"', board)
        self.assertIn("data-semantic-notes", board)
        self.assertIn("data-semantic-bullet", board)
        self.assertIn('aria-hidden="true"', board)
        self.assertIn("duration: 0.26", board)
        expansion = board[
            board.index('if (animationRequest.kind === "expandDiagramNotes")')
            : board.index("const blocks = animationRequest.blocks")
        ]
        self.assertLess(expansion.index("timeline.to(modeGrid"), expansion.index("startTyping(timeline)"))
        self.assertLess(expansion.index("timeline.fromTo(artwork"), expansion.index("startTyping(timeline)"))
        self.assertIn('sharesWithNotes ? "max-h-[22rem]" : "max-h-[34rem]"', board)
        self.assertIn('maxHeight: "34rem"', board)
        self.assertIn("maxHeight: finalArtworkHeight", board)
        self.assertIn('clearProps: "maxHeight"', board)
        self.assertIn("columnGap * (modeList.length - 1)", board)
        self.assertIn("createSummaryTypingPlan", board)
        self.assertIn("createSummaryTypingSession", board)
        self.assertIn("textContent = text", board)
        self.assertIn("getBoundingClientRect().height", board)
        self.assertIn("typingBullets.forEach((bullet, index)", board)
        self.assertIn("semanticBullets[index].getBoundingClientRect().height", board)
        self.assertIn("data-typing-bullet", board)
        self.assertIn('className="text-pretty empty:invisible"', board)
        self.assertIn('window.matchMedia("(min-width: 768px)")', board)
        self.assertIn("md:grid-cols-2", board)
        self.assertIn("filter: \"blur(7px)\"", board)
        self.assertIn("scene.title}", board)
        self.assertLess(board.index("<h2"), board.index("scene.contentModes.map"))
        self.assertIn("revertOnUpdate: true", board)
        self.assertIn("pt-[calc(5rem+env(safe-area-inset-top))]", board)
        self.assertIn("pb-[calc(7.5rem+env(safe-area-inset-bottom))]", board)
        self.assertNotIn("backgroundSize", board)
        self.assertNotIn("border-2", board)
        self.assertNotIn("boxShadow", board)
        self.assertNotIn("dangerouslySetInnerHTML", board + scene)

    def test_inherited_scene_on_later_page_keeps_one_primary_heading(self) -> None:
        board = (ROOT / "components" / "workspace" / "live-whiteboard.tsx").read_text(
            encoding="utf-8"
        )

        self.assertIn("function inheritedPrimaryHeading", board)
        self.assertIn("const primaryScene = board.scenes[0]", board)
        self.assertIn("scene.sceneId === primaryScene.sceneId", board)
        self.assertIn('scene.headingMode === "inheritPrimary"', board)
        self.assertIn("const pagePrimaryHeading = inheritedPrimaryHeading(board, pageScenes)", board)
        self.assertEqual(board.count("data-board-primary-heading"), 1)
        self.assertIn("{pagePrimaryHeading.title}", board)
        self.assertIn("aria-label={`Board topic: ${pagePrimaryHeading.title}`}", board)

    def test_transcription_callbacks_are_scoped_to_one_session(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )

        self.assertIn("const transcriptionSessionId = useRef(0)", canvas_source)
        self.assertIn("transcriptionSessionId.current += 1", canvas_source)
        self.assertIn(
            "const ownsSession = () => transcriptionSessionId.current === sessionId",
            canvas_source,
        )
        self.assertGreaterEqual(canvas_source.count("if (!ownsSession())"), 8)
        self.assertIn("releaseSessionResources", canvas_source)
        self.assertNotIn("speechStopRequested", canvas_source)
        self.assertNotIn("deepgramConnected", canvas_source)

    def test_development_frontend_uses_advertised_port(self) -> None:
        package = json.loads((ROOT / "package.json").read_text())
        self.assertIn("scripts/dev.ps1", package["scripts"]["dev"])

        dev_script = (ROOT / "scripts" / "dev.ps1").read_text()
        self.assertIn("Frontend: http://localhost:3000", dev_script)
        self.assertIn("& $next dev -p 3000", dev_script)

    def test_vercel_install_uses_the_lockfile_peer_resolution_mode(self) -> None:
        npmrc = (ROOT / ".npmrc").read_text(encoding="utf-8").splitlines()
        vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        package_lock = json.loads(
            (ROOT / "package-lock.json").read_text(encoding="utf-8")
        )

        self.assertEqual(npmrc, ["legacy-peer-deps=true"])
        self.assertEqual(vercel["installCommand"], "npm ci")
        self.assertNotIn("webpack", package["dependencies"])
        self.assertNotIn("webpack", package["devDependencies"])
        self.assertNotIn("node_modules/webpack", package_lock["packages"])

    def test_vercel_uses_the_next_build_without_replacing_vinext(self) -> None:
        vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        wrapper = (ROOT / "scripts" / "vercel-build.mjs").read_text(
            encoding="utf-8"
        )
        next_config = (ROOT / "next.config.mjs").read_text(encoding="utf-8")
        package_lock = json.loads(
            (ROOT / "package-lock.json").read_text(encoding="utf-8")
        )

        self.assertEqual(
            vercel,
            {
                "$schema": "https://openapi.vercel.sh/vercel.json",
                "framework": "nextjs",
                "installCommand": "npm ci",
                "buildCommand": "npm run build:vercel",
            },
        )
        self.assertEqual(package["scripts"]["build"], "vinext build")
        self.assertEqual(
            package["scripts"]["build:vercel"], "node scripts/vercel-build.mjs"
        )
        self.assertEqual(package["scripts"]["build:docker"], "next build")
        self.assertEqual(package["engines"]["node"], "22.x")
        self.assertEqual(package_lock["packages"][""]["engines"]["node"], "22.x")
        for phrase in [
            "export function resolveVercelFrontendOnly",
            'IMAGINE_VERCEL_BUILD: "1"',
            "NEXT_PUBLIC_FRONTEND_ONLY: resolveVercelFrontendOnly(",
            'require.resolve("next/dist/bin/next")',
            'spawnSync(process.execPath, [nextCli, "build"]',
            "pathToFileURL(resolve(process.argv[1])).href === import.meta.url",
            "process.exitCode = result.status ?? 1",
        ]:
            self.assertIn(phrase, wrapper)
        self.assertIn('process.env.IMAGINE_VERCEL_BUILD === "1"', next_config)
        self.assertIn('process.env.VERCEL === "1"', next_config)
        self.assertIn(': { output: "standalone" }', next_config)

    def test_frontend_only_policy_and_canvas_guards_share_one_notice(self) -> None:
        deployment = (ROOT / "lib" / "deployment-mode.ts").read_text(
            encoding="utf-8"
        )
        stream = (ROOT / "lib" / "generation-stream.ts").read_text(
            encoding="utf-8"
        )
        canvas = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )

        self.assertIn("FRONTEND_ONLY_NOTICE", deployment)
        self.assertIn("process.env.NEXT_PUBLIC_FRONTEND_ONLY", deployment)
        self.assertIn('explicitMode === "true"', deployment)
        self.assertIn('explicitMode === "false"', deployment)
        self.assertIn("process.env.NEXT_PUBLIC_VERCEL_ENV", deployment)
        guard = stream.index("if (isFrontendOnlyDeployment())")
        fetch = stream.index("const response = await fetch", guard)
        self.assertLess(guard, fetch)
        self.assertIn("throw new Error(FRONTEND_ONLY_NOTICE)", stream)

        for phrase in [
            "if (frontendOnly) return;",
            "if (frontendOnly || !turn.input.trim()",
            "disabled={frontendOnly}",
            "disabled={frontendOnly || !capturedInput.trim()}",
            'id="frontend-only-notice"',
            'role="status"',
            'aria-live="polite"',
            "fetchDeepgramStatus",
            "navigator.mediaDevices.getUserMedia",
            "new WebSocket",
            "enqueueLiveTurn",
            "pollVisualJob",
        ]:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, canvas)
        self.assertGreaterEqual(canvas.count("FRONTEND_ONLY_NOTICE"), 3)
        self.assertIn("<StatusBanner", canvas)
        self.assertIn("loadLessonLibrary(window.localStorage)", canvas)
        self.assertIn("saveLessonLibrary(window.localStorage, lessons)", canvas)

    def test_site_origin_and_frontend_only_docs_follow_the_public_contract(self) -> None:
        site_origin = (ROOT / "lib" / "site-origin.ts").read_text(
            encoding="utf-8"
        )
        env_example = (ROOT / ".env.example").read_text(encoding="utf-8")
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertLess(
            site_origin.index("process.env.NEXT_PUBLIC_SITE_URL"),
            site_origin.index("process.env.VERCEL_PROJECT_PRODUCTION_URL"),
        )
        self.assertIn('`https://${productionHost', site_origin)
        self.assertIn('"http://localhost:3000"', site_origin)
        self.assertIn('replace(/\\/+$/, "")', site_origin)
        self.assertIn(".vercel/", gitignore.splitlines())
        for public_name in [
            "NEXT_PUBLIC_FRONTEND_ONLY=",
            "NEXT_PUBLIC_VERCEL_ENV=",
            "NEXT_PUBLIC_SITE_URL=",
        ]:
            self.assertIn(public_name, env_example)

        section = readme[readme.index("## Vercel frontend-only deployment") :]
        section = section[: section.index("## Cost and context controls")]
        for phrase in [
            "npm run build:vercel",
            "NEXT_PUBLIC_FRONTEND_ONLY",
            "NEXT_PUBLIC_SITE_URL",
            "no Vercel system-variable exposure or dashboard setup is required",
            "missing, blank, or invalid",
            "literal `false`",
            "marketing site, lesson",
            "microphone transcription are disabled",
        ]:
            self.assertIn(phrase, section)
        self.assertNotIn("NEXT_PUBLIC_VERCEL_ENV", section)
        self.assertNotIn("PROD_GEMINI_API_KEY", section)
        self.assertNotIn("DEEPGRAM_API_KEY", section)

    def test_public_routes_use_a_shared_marketing_layout(self) -> None:
        marketing = ROOT / "app" / "(marketing)"
        routes = {
            "/": marketing / "page.tsx",
            "/product": marketing / "product" / "page.tsx",
            "/educators": marketing / "educators" / "page.tsx",
            "/schools": marketing / "schools" / "page.tsx",
            "/about": marketing / "about" / "page.tsx",
            "/contact": marketing / "contact" / "page.tsx",
        }

        self.assertTrue((marketing / "layout.tsx").is_file())
        for route, path in routes.items():
            with self.subTest(route=route):
                self.assertTrue(path.is_file())
        self.assertFalse((ROOT / "app" / "page.tsx").exists())

        layout_sources = [
            path.read_text(encoding="utf-8")
            for path in (ROOT / "app").rglob("layout.tsx")
        ]
        self.assertEqual(sum(source.count("<html") for source in layout_sources), 1)

    def test_marketing_and_workspace_routes_are_isolated(self) -> None:
        marketing_source = self.marketing_source()
        marketing_pages = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (ROOT / "app" / "(marketing)").rglob("*.tsx")
        )
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )

        self.assertNotIn('href="/canvas"', marketing_source)
        self.assertNotIn('from "@/components/workspace', marketing_pages)
        self.assertNotIn('from "@/components/workspace', marketing_source)
        self.assertNotIn('from "@/lib/generation-stream', marketing_source)
        self.assertNotIn('from "@/lib/lesson-library', marketing_source)
        self.assertNotIn('from "@/lib/live-session', marketing_source)
        self.assertNotIn('from "@/lib/deployment-mode', marketing_source)
        self.assertNotIn('from "next/link"', canvas_source)
        self.assertNotIn('href="/"', canvas_source)
        self.assertIn('aria-label="Imagine educator workspace"', canvas_source)

    def test_public_content_matches_the_evidence_contract(self) -> None:
        marketing_source = self.marketing_source()

        required = [
            "Imaginer",
            "Revolutionizing the way people explain things",
            "Keep teaching. Let the picture take shape.",
            "Illustrative product walkthrough — non-interactive",
            "Save lesson context",
            "Interpret finalized speech",
            "Build one cumulative board",
            "Create or update.",
            "browser’s local storage",
            "Show a process as it unfolds",
            "Keep earlier ideas visible as the lesson develops",
            "Invitation-only pilots",
            "Context-entry effort",
            "Educator usability",
            "Scene decision reliability",
            "Lesson continuity",
            "A school-selected comprehension signal",
            "AP Biology",
            "Vivaan Grover",
            "Jackson Bizell",
            "Krish Sapovadia",
            "Lecture halls, boardrooms, and keynote stages",
            "Coming Soon",
            "Core values",
            "Help test Imaginev1 in the classroom.",
        ]
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, marketing_source)

        banned = [
            "prepare 3–5 diagrams",
            "prepare three to five diagrams",
            "exact prepared-recall",
            "exact spoken phrase",
            "try imagine",
            "pricing",
            "margin",
            "enrollment",
            "revenue",
            "competitor",
            "case study",
            "traction",
            "guaranteed latency",
            "quantified prep",
        ]
        lowered = marketing_source.lower()
        for phrase in banned:
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, lowered)

    def test_public_navigation_and_mobile_menu_are_accessible(self) -> None:
        header = (ROOT / "components" / "marketing" / "site-header.tsx").read_text(
            encoding="utf-8"
        )
        footer = (ROOT / "components" / "marketing" / "site-footer.tsx").read_text(
            encoding="utf-8"
        )
        layout = (ROOT / "app" / "(marketing)" / "layout.tsx").read_text(
            encoding="utf-8"
        )

        expected_links = [
            ('href: "/"', 'label: "Home"'),
            ('href: "/product"', 'label: "Product"'),
            ('href: "/about"', 'label: "About"'),
            ('href: "/contact"', 'label: "Contact"'),
        ]
        for source in [header, footer]:
            positions = []
            for href, label in expected_links:
                self.assertIn(href, source)
                self.assertIn(label, source)
                positions.append(source.index(label))
            self.assertEqual(positions, sorted(positions))
            self.assertNotIn('label: "Educators"', source)
            self.assertNotIn('label: "Schools"', source)
        self.assertIn("aria-expanded={open}", header)
        self.assertIn('aria-controls="marketing-mobile-navigation"', header)
        self.assertIn('event.key === "Escape"', header)
        self.assertIn('event.key !== "Tab"', header)
        self.assertIn('document.addEventListener("pointerdown"', header)
        self.assertIn("firstMenuLinkRef.current?.focus()", header)
        self.assertIn("element.inert = true", header)
        self.assertIn("toggleRef.current?.focus()", header)
        self.assertIn('window.matchMedia("(min-width: 721px)")', header)
        self.assertIn("activeElement.dataset.navigationHref", header)
        self.assertIn("desktopLinkRefs.current[activeMobileHref]", header)
        self.assertIn("desktopFocusTarget.focus()", header)
        self.assertIn('href="#main-content"', layout)
        self.assertIn("data-lenis-prevent", header)

    def test_aligned_marketing_pages_publish_the_requested_content(self) -> None:
        marketing = ROOT / "app" / "(marketing)"
        home = (marketing / "page.tsx").read_text(encoding="utf-8")
        product = (marketing / "product" / "page.tsx").read_text(encoding="utf-8")
        about = (marketing / "about" / "page.tsx").read_text(encoding="utf-8")
        contact = (marketing / "contact" / "page.tsx").read_text(encoding="utf-8")

        self.assertIn("<h1>Imaginer</h1>", home)
        self.assertIn(
            "<strong>Keep teaching. Let the picture take shape.</strong>", home
        )
        self.assertIn("Revolutionizing the way people explain things", home)
        self.assertIn("marketing-home-hero", home)
        self.assertNotIn("data-hero", home)
        self.assertNotIn("data-parallax-media", home)
        self.assertIn("Imaginev1", product)
        self.assertIn("<ol", product)
        self.assertIn("data-product-flow", product)
        self.assertIn("data-product-flow-step", product)
        self.assertIn("Coming Soon", product)
        self.assertIn('href="/contact"', product)
        self.assertIn("Core values", about)
        self.assertIn('title="Founder Team"', about)
        self.assertNotIn("team.map((member, index)", about)
        self.assertIn('src="/media/imagine-founders-showcase.jpg"', about)
        self.assertIn("export const metadata: Metadata", contact)
        self.assertIn("teacher beta test", contact.lower())
        for email in [
            "kcsapovadia@gmail.com",
            "vpvpgrover09@gmail.com",
            "jbizell09@gmail.com",
        ]:
            self.assertIn(f'email: "{email}"', contact)
            self.assertIn(f'href: "mailto:{email}"', contact)

    def test_marketing_photos_are_stable_optimized_jpegs(self) -> None:
        assets = {
            "imagine-founders-showcase.jpg": (1152, 1536, 300_000),
            "jackson-portrait.jpg": (800, 800, 100_000),
            "vivaan-portrait.jpg": (1200, 896, 350_000),
            "krish-portrait.jpg": (1043, 1451, 300_000),
        }
        for filename, (width, height, max_bytes) in assets.items():
            path = ROOT / "public" / "media" / filename
            with self.subTest(filename=filename):
                self.assertTrue(path.is_file())
                payload = path.read_bytes()
                self.assertEqual(payload[:2], b"\xff\xd8")
                self.assertEqual(jpeg_dimensions(path), (width, height))
                self.assertLess(len(payload), max_bytes)
                self.assertNotIn(b"Exif\x00\x00", payload)

        home = (ROOT / "app" / "(marketing)" / "page.tsx").read_text(
            encoding="utf-8"
        )
        about = (ROOT / "app" / "(marketing)" / "about" / "page.tsx").read_text(
            encoding="utf-8"
        )
        self.assertIn('src="/media/imagine-founders-showcase.jpg"', home)
        self.assertIn('src="/media/imagine-founders-showcase.jpg"', about)
        self.assertIn('objectPosition: "26.7% 38.5%"', home)
        self.assertIn(
            'alt="The three Imagine founders presenting together in a lecture hall."',
            home,
        )
        expected_portraits = [
            (
                "Vivaan Grover",
                "/media/vivaan-portrait.jpg",
                "34.9% 31.1%",
                "Vivaan Grover wearing a white suit beside a canal.",
            ),
            (
                "Jackson Bizell",
                "/media/jackson-portrait.jpg",
                "38.7% 31.7%",
                "Jackson Bizell wearing a dark suit in a museum.",
            ),
            (
                "Krish Sapovadia",
                "/media/krish-portrait.jpg",
                "23% 37.3%",
                "Krish Sapovadia smiling at a mountain overlook.",
            ),
        ]
        for name, path, focus, alt in expected_portraits:
            with self.subTest(name=name):
                self.assertIn(f'name: "{name}"', about)
                self.assertIn(f'photo: "{path}"', about)
                self.assertIn(f'focus: "{focus}"', about)
                self.assertIn(f'alt: "{alt}"', about)
        self.assertNotIn("tabIndex={0}", about)

    def test_marketing_scroll_lifecycle_and_motion_guards(self) -> None:
        package = json.loads((ROOT / "package.json").read_text())
        package_lock = (ROOT / "package-lock.json").read_text(encoding="utf-8")
        layout = (ROOT / "app" / "(marketing)" / "layout.tsx").read_text(
            encoding="utf-8"
        )
        smooth_scroll = (
            ROOT / "components" / "marketing" / "smooth-scroll.tsx"
        ).read_text(encoding="utf-8")
        motion = (
            ROOT / "components" / "marketing" / "motion-boundary.tsx"
        ).read_text(encoding="utf-8")
        styles = (ROOT / "app" / "globals.css").read_text(encoding="utf-8")

        self.assertEqual(package["dependencies"]["lenis"], "^1.3.25")
        self.assertIn('"node_modules/lenis"', package_lock)
        self.assertIn('import "lenis/dist/lenis.css"', layout)
        self.assertIn("<MarketingSmoothScroll />", layout)
        for phrase in [
            '"(prefers-reduced-motion: reduce)"',
            '"(pointer: coarse)"',
            'lenis.on("scroll", updateScroll)',
            'lenis.off("scroll", updateScroll)',
            "gsap.ticker.add(updateFrame)",
            "gsap.ticker.remove(updateFrame)",
            "lenis.destroy()",
        ]:
            self.assertIn(phrase, smooth_scroll)
        self.assertNotIn("killAll", smooth_scroll)

        self.assertIn("ScrollTrigger", motion)
        self.assertIn("motionMedia.add(", motion)
        self.assertIn(
            'reduceMotion: "(prefers-reduced-motion: reduce)"', motion
        )
        self.assertIn(
            'allowMotion: "(prefers-reduced-motion: no-preference)"', motion
        )
        self.assertIn('desktop: "(min-width: 901px)"', motion)
        self.assertIn('finePointer: "(pointer: fine)"', motion)
        self.assertIn("if (reduceMotion)", motion)
        self.assertIn("return () => motionMedia.revert()", motion)
        self.assertNotIn("window.matchMedia", motion)
        self.assertNotIn("data-product-story", motion)
        self.assertNotIn("pin:", motion)
        self.assertIn("[data-parallax-media]", motion)
        self.assertIn("[data-product-flow-step]", motion)
        self.assertIn("trigger: productFlow", motion)
        self.assertIn("stagger: 0.14", motion)
        flow_fallback = styles.index(
            ".marketing-root [data-product-flow-step]"
        )
        self.assertIn(
            "opacity: 1 !important", styles[flow_fallback:flow_fallback + 280]
        )
        self.assertNotIn("killAll", motion)

    def test_marketing_previews_use_static_rasters_with_exact_page_mappings(self) -> None:
        previews = (
            ROOT / "components" / "marketing" / "diagram-previews.tsx"
        ).read_text(encoding="utf-8")
        marketing = ROOT / "app" / "(marketing)"
        pages = {
            "home": (marketing / "page.tsx").read_text(encoding="utf-8"),
            "product": (marketing / "product" / "page.tsx").read_text(
                encoding="utf-8"
            ),
            "educators": (marketing / "educators" / "page.tsx").read_text(
                encoding="utf-8"
            ),
            "schools": (marketing / "schools" / "page.tsx").read_text(
                encoding="utf-8"
            ),
        }

        self.assertIn('from "next/image"', previews)
        self.assertIn("<Image", previews)
        self.assertIn("src={src}", previews)
        self.assertIn("alt={alt}", previews)
        self.assertNotIn("components/workspace", previews)
        self.assertNotIn("StickScene", previews)
        self.assertNotIn("DiagramRenderer", previews)
        self.assertNotIn("BuildingBlockDiagramData", previews)
        self.assertNotIn("generation-stream", previews)
        self.assertNotIn("lesson-library", previews)
        removed_component = "product-mode-" + "accordion.tsx"
        self.assertFalse(
            (ROOT / "components" / "marketing" / removed_component).exists()
        )

        expected_assets = {
            "home": [
                "/media/diagrams/lesson-context-flow.png",
                "/media/diagrams/cellular-energy-flow.png",
                "/media/diagrams/cumulative-board-flow.png",
            ],
            "product": ["/media/diagrams/cumulative-board-flow.png"],
            "educators": ["/media/diagrams/respiration-update.png"],
            "schools": ["/media/diagrams/pilot-review-flow.png"],
        }
        for page, assets in expected_assets.items():
            for asset in assets:
                with self.subTest(page=page, asset=asset):
                    self.assertIn(asset, pages[page])

        for assets in expected_assets.values():
            for asset in assets:
                path = ROOT / "public" / asset.removeprefix("/")
                with self.subTest(asset=asset):
                    self.assertTrue(path.is_file())
                    width, height = png_dimensions(path)
                    self.assertEqual(width * 2, height * 3)

        self.assertEqual(pages["home"].count("<MarketingScenePreview"), 1)
        self.assertIn("productModes.map", pages["home"])
        self.assertIn("<ol", pages["home"])
        self.assertNotIn("useState", pages["home"])

    def test_marketing_cleanup_removes_kickers_and_obsolete_home_patterns(self) -> None:
        source = self.marketing_source()
        home = (ROOT / "app" / "(marketing)" / "page.tsx").read_text(
            encoding="utf-8"
        )
        styles = (ROOT / "app" / "globals.css").read_text(encoding="utf-8")
        visual_language = (
            ROOT / "components" / "marketing" / "visual-language.tsx"
        ).read_text(encoding="utf-8")

        self.assertNotIn("marketing-" + "eyebrow", source + styles)
        self.assertNotIn("eye" + "brow:", visual_language)
        self.assertNotIn("data-product-story", source + styles)
        self.assertNotIn("marketing-visual-" + "marquee", source + styles)
        self.assertNotIn("From spoken explanation to a " + "useful visual.", home)
        self.assertNotIn(
            "Each turn changes only what the " + "explanation needs.", home
        )

    def test_live_assistant_is_the_public_and_backend_name(self) -> None:
        files = [
            *sorted((ROOT / "app").rglob("*.tsx")),
            *sorted((ROOT / "components").rglob("*.ts")),
            *sorted((ROOT / "components").rglob("*.tsx")),
            *sorted((ROOT / "backend").rglob("*.py")),
            ROOT / ".env.example",
            ROOT / "README.md",
            ROOT / "docs" / "LANDING_SITE_CHANGELOG.md",
        ]
        source = "\n".join(path.read_text(encoding="utf-8") for path in files)
        self.assertNotIn("Visual" + " Director", source)
        self.assertIn("Live Assistant", source)

    def test_canvas_is_not_indexed_or_in_the_public_sitemap(self) -> None:
        canvas_layout = (ROOT / "app" / "canvas" / "layout.tsx").read_text(
            encoding="utf-8"
        )
        robots = (ROOT / "app" / "robots.ts").read_text(encoding="utf-8")
        sitemap = (ROOT / "app" / "sitemap.ts").read_text(encoding="utf-8")
        site_origin = (ROOT / "lib" / "site-origin.ts").read_text(
            encoding="utf-8"
        )

        self.assertIn("index: false", canvas_layout)
        self.assertIn("follow: false", canvas_layout)
        self.assertIn('disallow: "/canvas"', robots)
        self.assertIn("getSiteOrigin()", robots)
        self.assertIn("`${origin}/sitemap.xml`", robots)
        self.assertNotIn('"/canvas"', sitemap)
        self.assertIn("getSiteOrigin()", sitemap)
        self.assertIn('"http://localhost:3000"', site_origin)
        self.assertIn('replace(/\\/+$/, "")', site_origin)
        self.assertIn(
            'const publicRoutes = ["", "/product", "/about", "/contact"]',
            sitemap,
        )
        for route in ['"/product"', '"/about"', '"/contact"']:
            self.assertIn(route, sitemap)
        for excluded_route in ['"/educators"', '"/schools"']:
            self.assertNotIn(excluded_route, sitemap)

    def test_superseded_marketing_runtime_is_removed(self) -> None:
        removed = [
            "app/loading.tsx",
            "app/debug/page.tsx",
            "components/marketing-experience.tsx",
            "components/knowledge-scene.tsx",
            "components/launch-loader.tsx",
            "components/smooth-scroll.tsx",
            "components/diagrams/structured-diagram.tsx",
            "components/building-blocks/debug.tsx",
            "components/building-blocks/sample-data.ts",
        ]
        for relative_path in removed:
            with self.subTest(path=relative_path):
                self.assertFalse((ROOT / relative_path).exists())

        package = json.loads((ROOT / "package.json").read_text())
        self.assertEqual(package["dependencies"]["lenis"], "^1.3.25")

    def test_fixed_template_runtime_is_removed(self) -> None:
        for relative_path in [
            "components/workspace/composition-view.tsx",
            "lib/composition-summary.ts",
        ]:
            with self.subTest(path=relative_path):
                self.assertFalse((ROOT / relative_path).exists())

        building_blocks = ROOT / "components" / "building-blocks"
        self.assertFalse(
            any(path.is_file() for path in building_blocks.rglob("*"))
        )

        runtime_files = [
            *sorted((ROOT / "app").rglob("*.ts")),
            *sorted((ROOT / "app").rglob("*.tsx")),
            *sorted((ROOT / "components").rglob("*.ts")),
            *sorted((ROOT / "components").rglob("*.tsx")),
            *sorted((ROOT / "lib").rglob("*.ts")),
            *sorted((ROOT / "lib").rglob("*.tsx")),
        ]
        runtime_source = "\n".join(
            path.read_text(encoding="utf-8") for path in runtime_files
        )
        for obsolete in [
            "components/building-blocks",
            "BuildingBlockDiagramData",
            "CompositionView",
            "CompositionCard",
            "CompositionResponse",
            "composition-summary",
        ]:
            with self.subTest(obsolete=obsolete):
                self.assertNotIn(obsolete, runtime_source)

    def test_readme_documents_the_live_whiteboard_contract(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        for phrase in [
            "one Live Assistant text call",
            "CREATE or UPDATE",
            "24-column by 14-row grid",
            "typed `WhiteboardDecision`",
            "schema-v2 lesson context records",
            "Optional images",
        ]:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, readme)
        self.assertNotIn("GEMINI_DIAGRAM_MODEL", readme)
        self.assertNotIn("VISUAL_CACHE_DIR", readme)


if __name__ == "__main__":
    unittest.main()
