# Current release verification

Alpha.6 adds commit-bound release packages and production-mode browser/export acceptance. See [the release guide](../releasing.md) for reproducible commands and CI targets. The release assets contain `production-verification.json`, desktop/mobile screenshots, one short studio-export film and four freshly rendered Community Garden films, their posters/reports, exact Git source archive, `release-manifest.json` and `SHA256SUMS`.

`npm run release:verify -- <directory>` checks the complete asset inventory and hashes, then ffprobe properties and full FFmpeg decoding of all five films. `npm run verify:production` runs against a fresh production server, independently of the development-server E2E suite. CI evidence includes the Node/OS matrix and retains failure traces. These are automated Chromium viewport checks, not physical-device or independent creative acceptance. Live Claude is not invoked in these gates; the alpha.5 record below is explicitly historical.

---

# Acceptance evidence

## Alpha.5 authoring

The historical alpha.5 baseline had 103 passing unit/integration tests and 21 Chromium browser tests. `npm run check`, `npm run format:check`, `npm run test:e2e` and `npm audit --audit-level=high` form the local/CI gate.

| Evidence | Verified scope |
| --- | --- |
| [authoring-acceptance.json](authoring-acceptance.json) | Empty project → original four-scene film through real UI controls; image/video/audio upload; duplicate/delete/order; bad media recovery; JSON export/reload; 1440×1000 and 390×844 screenshots; four real EN/TR × ratio MP4s, plus a studio-button/API export |
| [authoring-ai.json](authoring-ai.json) | Real Claude Code call adds a bilingual scene, followed by explicit transaction application; existing protected scene remains byte-for-byte unchanged |
| `authoring-desktop.png`, `authoring-mobile.png` | Actual authoring interface after building the new film |
| [garden-contact-sheet.png](garden-contact-sheet.png) | Sixteen frames decoded from the four final MP4s, covering all four scenes in both languages and ratios |
| `demos/garden-*.report.json` | FFprobe stream properties and Chromium text/media/font inspection for each released film |
| `tests/e2e/timing.spec.ts` | Pointer and keyboard trimming, language-following ends, invalid timing rejection, style/motion persistence and narration detach/undo |
| `tests/render.integration.test.ts` | Real short MP4/audio encoding and identical decoded video pixels across repeated/reverse seeks after the media source ends |

The repository Playwright workflow was used because the Browser plugin was not available. Desktop/mobile page identity, visible content, absence of framework overlays, console errors (apart from the expected HTTP 400 invalid-upload test), screenshots and interactions were checked. Browser sizes are emulation; physical phones, other browser engines and full accessibility review remain unverified.

Run the studio, then `npx tsx scripts/verify-authoring.ts` to rebuild the UI-authored example and output evidence. `CADENCE_URL` overrides its localhost URL. This creates five MP4s and overwrites the example/evidence files. Run `npx tsx scripts/verify-authoring-media.ts` afterward to verify hashes, dimensions, durations and complete decoding, and extract scene frames. `npx tsx scripts/verify-authoring-ai.ts` is a separate optional live provider call and consumes configured Claude allowance.

The garden artwork/video and audio fixture are original; the English attached audio is an instrumental timing fixture, not speech. New films are 12s in English and 15s in Turkish. Automated checks establish timing, structure and mechanical bounds, not independent artistic acceptance or feature parity with mature editors.

## Historical alpha.4 evidence


This directory records what was actually exercised. Automated assertions, a real provider call, browser tests and real encoded media are distinct forms of evidence.

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| `claude-live.json` | Real installed Claude Code returned edits; applying them preserved protected portrait layout/outro and isolated Turkish duration | Every possible prompt or future provider availability |
| `five-revisions.json` | Two manual layout decisions, longer Turkish audio, a real Claude added card, brand update, JSON roundtrip and undo | Word-level speech alignment or automatic translation |
| `studio-*.png` | Editor rendered at desktop, wide, tablet and mobile viewport sizes | Physical-device behavior or full accessibility certification |
| `release-verification.json` | Exact source/output hashes, stream properties, source revision and output inspection counts | Independent motion-design approval |
| GitHub Actions | Clean checkout checks on Ubuntu for the published source | Other operating systems or production-hosted service security |

Run `npm run check` for core/API/motion invariants, TypeScript and build. The renderer integration test creates a real short MP4 and checks audio/video streams. Run `npm run test:e2e` for browser workflows, actual file upload and mobile bounds. Browser AI responses are explicit fixtures; the separate live-provider records above were not mocked. `npm audit` checks the locked Node dependency graph.

Optional `npx tsx scripts/verify-claude.ts` and `npx tsx scripts/verify-revisions.ts` call your real configured Claude provider and consume its allowance. They regenerate reports; the second also writes `examples/revised-demo.json` and an original nine-second instrumental WAV fixture.

The four base outputs use `examples/demo.json`; the four revised outputs use `examples/revised-demo.json`. Every output includes Chromium layout/media/font inspection and FFprobe metadata. MP4s and full reports are release assets to avoid growing Git history. The revised Turkish outputs contain an original musical timing fixture attached as sentence audio. This demonstrates real file duration and placement, **not a recorded Turkish speaker or transcription accuracy**. Base demos contain original synthesized music and authored sentence-level caption text, with no spoken narration.

The base demo was visually inspected at intro, features and closing scenes in landscape and portrait. Passing bounds checks do not evaluate all aesthetic overlaps or all font accessibility. The studio is a working technical alpha; independent designer/user acceptance and physical-device testing remain separate work.
