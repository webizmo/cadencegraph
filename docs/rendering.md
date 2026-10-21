# Deterministic preview and MP4 export

CadenceGraph compiles one versioned project into absolute scene, sentence and node timings. The React `Composition` is shared by the studio and the renderer. It receives `project`, `locale`, `ratio` and absolute `time` in seconds. Motion is pure arithmetic from time; there are no running animation clocks, random particles, CSS transitions or hidden animation state. Seeking backward and forward produces the same frame.

## Render the included film

```sh
npm ci
npx playwright install chromium
# Install FFmpeg separately; both ffmpeg and ffprobe must be on PATH.
npm run render -- --all
npm run render -- --locale tr --ratio 9:16 --output outputs/tr-portrait.mp4
npm run render -- --project examples/demo.json --locale en --ratio 16:9 --width 1920
```

Default exports are 1280×720 landscape and 720×1280 portrait, at the project's FPS. The sample uses 24 FPS, with 19.5-second English and 22-second Turkish timelines. PNG posters and JSON validation reports are written beside each MP4. Intermediate frames are streamed into FFmpeg and removed after export; they are never committed. A standalone invocation starts its own local Vite server. The application server passes its existing preview URL.

The pipeline uses headless Chromium to seek the exact frame time, wait for bundled fonts and local media, and capture that same composition. FFmpeg encodes H.264 4:2:0 MP4 with AAC audio and fast-start metadata. The encode is checked using ffprobe for dimensions and duration. Native browser, OS and font-rendering differences can change pixels between machines; deterministic here means stable project/time behavior, not identical video bytes across all hosts.

## Audio

The included demo has an **original synthesized instrumental score and no spoken narration**. `scripts/generate-audio.ts` produces deterministic PCM without samples or third-party recordings. Score-only exports use a comfortable foreground music gain; when sentence audio is attached, the score stays at a quieter background level. Use `--no-score` to omit the score (attached sentence audio is still included).

A sentence can reference a local audio asset per language with `audioAssetId`. During export the audio is measured with ffprobe, fitted to that sentence's declared duration using chained FFmpeg `atempo`, and delayed to the compiled sentence start. Audio longer or shorter than its slot is time-stretched; changing the sentence duration to the actual recording length preserves natural delivery. Multiple sentence tracks are mixed with the score and limited. Source audio remains unchanged. The studio plays attached sentence audio with pause and seek on the same semantic clock; variant thumbnails stay muted. Preview follows the recording-to-slot playback rate, while export uses pitch-preserving FFmpeg tempo filters. The generated score is currently added at export time, so review the exported mix as well as the studio preview.

## Output checks

Before encoding, the renderer samples every node after its entrance and every scene at two settled points. It checks real DOM text dimensions, canvas bounds, decoded images/videos, explicit component registration and loaded fonts. It repeats checks each second during capture. Core preflight separately checks the versioned schema, missing asset references, timing and estimated reading speed. Errors block export. Reports retain sample times, node IDs and findings so another person can inspect what was checked.

These checks do not certify artistic quality, accessibility, translated copy quality, correct pronunciation, all possible visual overlap, or the legal rights to user media. Rotation is reported by core as a visual-review warning. Users should inspect the MP4s, especially when importing a new font or resizing text.

## Custom components

Register a deterministic React component in `src/render/registry.tsx` (or import your registration before mounting). Components receive local node time, duration, locale, aspect ratio, brand colors and JSON props. `metric-bars` is a small complete example. A project node selects it using `type: "component"` and `component: "metric-bars"`. Registration rejects duplicate names. Unknown names block export. Plugin code is trusted local application code; project JSON cannot carry executable code.

For selection and dragging, each rendered node exposes `data-node-id`. Composition's `onSelect` and `onNodePointerDown` callbacks let the editor operate on stable IDs. Resolved ratio overrides come from the compiler; the renderer never rewrites or discards a protected manual layout.

## Media and dependencies

- Manrope is bundled under SIL OFL 1.1, with its license in `public/assets/fonts/`.
- All demo artwork and the synthesized score are original Apache-2.0 material; see `public/assets/ATTRIBUTION.md`.
- Chromium is launched through Playwright. Chromium and Playwright have their own licenses; neither is relicensed by this repository.
- FFmpeg is an external executable and is not bundled. Its exact license depends on the user's build (including whether GPL components such as libx264 are enabled). H.264 patent/licensing obligations may depend on use and jurisdiction. CadenceGraph's Apache-2.0 license applies to this repository's code, not to an installed encoder or codec.
- Export blocks remote network requests and accepts local assets. Audio paths are constrained to `public/` after resolving symlinks. Do not expect arbitrary web pages or React applications to import as editable motion projects.

Alpha scope: fixed landscape/portrait canvases, bundled sample components and one composition renderer; no GPU 3D editor, arbitrary HTML import, plugin sandbox, cloud rendering, or professional audio workstation. The declarative model and exported films are real, editable and reproducible with the stated tools.
