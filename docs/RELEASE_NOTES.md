# v0.1.0-alpha.5

CadenceGraph can now build an original film from an empty project. The previous editor exposed revisions of an existing three-scene example; this release adds scene and layer authoring through the same validated, undoable transaction engine.

- Create a blank project, rename it, add blank/title/quote/three-point/closing scenes, and duplicate, delete or reorder scenes and layers.
- Insert text, cards, captions, CTA, image and video layers. Upload or reuse local media; attach and detach sentence audio without losing source assets.
- Change text size, weight, color and alignment; choose project design presets and per-scene inversion; edit entrance, delay and sentence-relative start/end timing. Timeline bars support pointer movement/edge trimming and keyboard edge adjustments.
- Ask Claude for original bilingual scenes as well as revisions. Review structural, style, motion and timing operations before applying. Stale revisions and protected human layouts still block conflicting transactions.
- New scenes render without the old demo's fixed logo, counter or progress decorations. Schema v1 and the existing demo remain compatible.

Validation covers 103 unit/integration tests and 21 Chromium browser tests, including real media upload, semantic timing, scene/layer CRUD, undo, protected/stale proposals, and responsive views at 390, 600, 1440 and 1588 pixels. A real authenticated Claude call created a new bilingual scene and preserved the protected existing scene. The short-video regression checks repeated and reverse seeks against actual decoded frames.

Release assets include four newly authored **Community Garden** H.264/AAC films at 24 fps: English 12s and Turkish 15s, in 1280×720 landscape and 720×1280 portrait. The original image, short video and instrumental audio fixture are bundled in the repository. A separate real 30 fps studio export verifies the export button, API queue and download. Exact hashes, dimensions, duration, audio tracks and output inspection counts are in `docs/verification/authoring-acceptance.json`. Each film also has a poster and render report. `SHA256SUMS` covers downloadable media.

The audio fixture is synthesized instrumental music, **not narration or speech recognition evidence**. The source video's audio is muted. Motion editing is four entrance presets and timing controls; arbitrary property keyframes/curves, source in/out trimming, generative media, automatic translation/transcription, cloud rendering and multi-user collaboration remain outside this alpha. Mobile proof uses Chromium viewport emulation, not physical-device certification.

Official-source competitor research, usage, architecture, format, renderer, components and design documentation were updated with the implemented scope and these limits.

---

# v0.1.0-alpha.4

This revision keeps each MP4 download labeled with the language, ratio and project revision that produced it. Switching the preview to another variant no longer presents an earlier export as the selected output. A browser regression test covers exporting EN 16:9, switching to TR 9:16, and exporting the new variant. The eight release videos are unchanged from alpha.3.

The preceding QA pass also fixed a missing favicon request and moved responsive test screenshots to Playwright's temporary output. The editor's film export and download controls produced a verified 19.5-second 1280×720 H.264/AAC MP4 in a separate browser session.

CadenceGraph is a working local motion studio built around a versioned project shared by a human editor and Claude. A sentence change can retime one language without moving a protected portrait layout. Proposals are reviewed and atomically applied; conflicts and undo remain explicit.

This alpha includes the React editor, core/JSON Schema, deterministic component registry, real Claude Code proposal integration, inspected media imports, local Chromium/FFmpeg MP4 export, docs and repeatable tests. Source is Apache-2.0; external tool and font licenses remain separate.

Release assets contain **eight real H.264/AAC films**: the three-scene English/Turkish × landscape/portrait base project, and four more after the five-revision acceptance scenario. Every MP4 has a poster and JSON report. `SHA256SUMS` verifies media downloads. Base English films are 19.5s, base Turkish films 22s; revised Turkish films 23s. Landscape 1280×720, portrait 720×1280, 24 fps.

Two actual Claude calls verified editing and adding a benefit while protecting existing human decisions. Browser tests exercise actual drag, imports, file upload, undo/redo, stale/conflicting proposals and responsive views. The local API export flow was also exercised end to end through MP4 download. Exact current checks and stream evidence are in `docs/verification/release-verification.json`.

The soundtrack is original synthesized music. Base films contain **no spoken narration**. Revised Turkish films attach an original nine-second instrumental timing fixture; this is proof of media timing, not Turkish speech alignment. User sentence audio import/mixing works. The synthesized score is added on export; studio playback previews attached sentence audio.

Boundaries: local trusted-operator alpha; no arbitrary HTML/React import, free-form keyframe editor, automatic translation/transcription, TTS generation, multi-user collaboration or hosted render farm. Components are trusted developer code. Automated geometry checks are not independent design/user/device acceptance.

Start with `npm ci`, `npx playwright install chromium`, installed FFmpeg/ffprobe, then `npm run dev`. Read the README for platform prerequisites and Claude setup.
