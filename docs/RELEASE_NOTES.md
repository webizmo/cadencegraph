# v0.1.0-alpha.2

This revision normalizes source formatting for the CI style gate. Runtime behavior and the verified video assets are unchanged from alpha.1.

CadenceGraph is a working local motion studio built around a versioned project shared by a human editor and Claude. A sentence change can retime one language without moving a protected portrait layout. Proposals are reviewed and atomically applied; conflicts and undo remain explicit.

This alpha includes the React editor, core/JSON Schema, deterministic component registry, real Claude Code proposal integration, inspected media imports, local Chromium/FFmpeg MP4 export, docs and repeatable tests. Source is Apache-2.0; external tool and font licenses remain separate.

Release assets contain **eight real H.264/AAC films**: the three-scene English/Turkish × landscape/portrait base project, and four more after the five-revision acceptance scenario. Every MP4 has a poster and JSON report. `SHA256SUMS` verifies media downloads. Base English films are 19.5s, base Turkish films 22s; revised Turkish films 23s. Landscape 1280×720, portrait 720×1280, 24 fps.

Two actual Claude calls verified editing and adding a benefit while protecting existing human decisions. Browser tests exercise actual drag, imports, file upload, undo/redo, stale/conflicting proposals and responsive views. The local API export flow was also exercised end to end through MP4 download. Exact current checks and stream evidence are in `docs/verification/release-verification.json`.

The soundtrack is original synthesized music. Base films contain **no spoken narration**. Revised Turkish films attach an original nine-second instrumental timing fixture; this is proof of media timing, not Turkish speech alignment. User sentence audio import/mixing works. The synthesized score is added on export; studio playback previews attached sentence audio.

Boundaries: local trusted-operator alpha; no arbitrary HTML/React import, free-form keyframe editor, automatic translation/transcription, TTS generation, multi-user collaboration or hosted render farm. Components are trusted developer code. Automated geometry checks are not independent design/user/device acceptance.

Start with `npm ci`, `npx playwright install chromium`, installed FFmpeg/ffprobe, then `npm run dev`. Read the README for platform prerequisites and Claude setup.
