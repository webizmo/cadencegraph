# Acceptance evidence

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
