# Releasing CadenceGraph

The version in `package.json` and the lockfile is the release version. Keep prereleases marked as prereleases; this remains a bounded local authoring alpha. Do not relabel old provider or browser evidence as a new run.

## Local gates

Use a clean checkout with Node 22.12+ (22 and 24 are the CI versions), FFmpeg/ffprobe with libx264 and Playwright Chromium. Install dependencies with `npm ci` and `npx playwright install chromium` (`--with-deps` on Linux).

```sh
npm run doctor
npm run check
npm run format:check
npm run test:e2e
npm audit --audit-level=high
```

Update usage, release notes and both package versions; commit the finished source before packaging. `npm run verify:production` starts and stops its own production server on a temporary loopback port. It needs a fresh `npm run build`. It uploads an image after that build, opens/reloads a real project in Chromium, checks desktop/mobile, downloads an actual MP4 through the studio and fully decodes it. Its short film must also have a PNG poster. Provider calls are not part of this check.

```sh
npm run build
npm run verify:production
npm run release:prepare
npm run release:verify -- outputs/releases/v0.1.0-alpha.6
```

Preparation refuses a dirty worktree, an occupied destination, or production evidence from another commit/version. It renders the checked-in Community Garden example in all four variants, decodes the films, copies production evidence, and archives the exact Git source with bundled example media and fonts. It creates `release-manifest.json` with source commit/hash and each asset's size/hash, plus `SHA256SUMS` for every downloadable file except the checksum file itself. Release verification rechecks the complete directory inventory, hashes, stream properties, frames, duration and full decode of all five films. A changed file fails verification. Keep old packages by moving their directories before retrying.

`Prepare release` is also available as a manual GitHub Actions workflow for an existing matching version tag. It runs all gates and produces a downloadable artifact; it does not publish a release. Regular CI runs checks and the real production export on Ubuntu/Node 22, Ubuntu/Node 24 and macOS/Node 24. Artifacts retain screenshots, MP4 and test failure traces for seven days.

## Publication

1. Push the reviewed commit and wait for every required CI job to succeed.
2. Tag that exact commit with the package version; never move a published tag.
3. Create a draft prerelease under `webizmo/cadencegraph` using that version's notes. Upload all files from its verified release directory.
4. Read GitHub's uploaded asset inventory. Match every name, byte count and `sha256:` digest against the local files, including `SHA256SUMS`. Verify the tag's commit matches `sourceCommit`.
5. Publish only after those comparisons and CI pass. Check the public release URL and asset inventory again.

The source archive is a portable source checkout, not a standalone binary: extract it, then follow the README prerequisites and `npm ci`. JSON alone does not include uploaded media. GitHub's automatically generated source archive is also available.

Historical alpha.4 verification remains in `scripts/verify-legacy-release.ts`; alpha.5 original-authoring/provider records remain in `docs/verification/`. The current release manifest and production record ship with the release assets so they can refer to the final source commit without a circular evidence-only commit.
