# Third-party software and media

CadenceGraph's original code and procedural demo graphics use Apache-2.0. Dependency licenses remain applicable; the package lock records the exact versions used.

| Component | Role | License / source |
| --- | --- | --- |
| React / React DOM | UI and deterministic composition | [MIT](https://github.com/facebook/react/blob/main/LICENSE) |
| Vite | Local build and development server | [MIT](https://github.com/vitejs/vite/blob/main/LICENSE) |
| Express | Loopback-only application server | [MIT](https://github.com/expressjs/express/blob/master/LICENSE) |
| Lucide | UI icons | [ISC](https://lucide.dev/license) |
| Playwright | Chromium frame capture and browser tests | [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE) |
| Chromium | External browser executable | [BSD and third-party licenses](https://www.chromium.org/chromium-os/licenses/) |
| FFmpeg | External media probe, mixing, MP4 encoder | [LGPL/GPL depending on build](https://ffmpeg.org/legal.html) |
| Manrope | Bundled font | [SIL Open Font License 1.1](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt); notice alongside font |

FFmpeg is executed as a separately installed program, not bundled, linked or relicensed by this project. libx264-enabled FFmpeg builds have GPL obligations; redistribution of binaries or an appliance requires reviewing that build's notices, source obligations and applicable codec patents. This repository's Apache-2.0 license does not grant rights to external codecs, user uploads or providers.

No Remotion, HyperFrames or Diffusion Studio source is incorporated. They are independent projects with substantial existing capabilities. HyperFrames is Apache-2.0; Remotion has its own licensing terms. CadenceGraph's narrow focus is preserving explicit human layout decisions through sentence-linked edits in one inspectable JSON project. It does not claim feature parity, universal React/HTML import, superior performance or industry-first functionality.

The included demo score is synthesized by project source; no stock music or proprietary system voice recordings are included. The visual concept was generated with OpenAI Image Gen; it is documentation, not a runtime dependency. User-provided audio and other media remain the user's responsibility.
