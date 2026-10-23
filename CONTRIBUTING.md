# Contributing

Welcome. Start with a reproducible issue or a small focused pull request. Include a sanitized project JSON and the failing locale/ratio/time when reporting a visual or timing problem. Do not upload private media or provider credentials.

Use Node 22.12+ or 24 LTS, `npm ci`, and `npx playwright install chromium`. FFmpeg/ffprobe must be on PATH for media/export checks. Run `npm run doctor` to check prerequisites. Run `npm run check`, `npm run test:e2e` and relevant render checks before submitting. Purely visual changes need a before/after screenshot; timing changes need an output or deterministic assertion that demonstrates the relationship.

Core tests must protect stable IDs, atomic rollback, locale isolation, protected overrides and monotonic revisions. Do not add side effects to `compileProject`. Keep providers behind the proposal boundary. New fields need runtime validation, JSON Schema, docs and a schema-version/migration decision. A new major project version must fail clearly in older readers, not silently discard fields.

New components live in the explicit registry and accept time as data. No random values, wall-clock animation, remote fetches, secrets or global mutable state during rendering. Include a real example, editable props, bounds and renderer verification. See [components](docs/components.md).

By contributing you agree to license your contribution under Apache-2.0. Preserve dependency and asset attribution. Be respectful and constructive; maintainers may remove abusive content.

For release work, follow [the release guide](docs/releasing.md), including production-mode export and exact asset verification.
