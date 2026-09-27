// Importing node:test suites in one process avoids sandbox child-process restrictions.
await import("../tests/pitch-mode.test.mjs");
await import("../tests/pitch-speech.test.mjs");
await import("../tests/pitch-deck.test.mjs");
