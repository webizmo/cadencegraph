# Deterministic preview and MP4 export

CadenceGraph compiles one versioned project into absolute scene, sentence and node timings. The React `Composition` is shared by the studio and the renderer. It receives `project`, `locale`, `ratio` and absolute `time` in seconds. Motion is pure arithmetic from time; there are no running animation clocks, random particles, CSS transitions or hidden animation state. Seeking backward and forward produces the same frame.

## Render a project

```sh
npm ci
npx playwright install chromium
# Install FFmpeg separately; both ffmpeg and ffprobe must be on PATH.
npm run render -- --all
npm run render -- --locale tr --ratio 9:16 --output outputs/tr-portrait.mp4
npm run render -- --project examples/demo.json --locale en --ratio 16:9 --width 1920
npm run render -- --project examples/community-garden.cadence.json --all
```

Default exports are 1280×720 landscape and 720×1280 portrait, at the project's FPS. The original alpha.4 demo uses 24 FPS, with 19.5-second English and 22-second Turkish timelines. New blank projects start at 30 FPS; their actual durations come from authored sentences. Save a project in the studio and pass its JSON path using `--project` to render your own film. PNG posters and JSON validation reports are written beside each MP4. Intermediate frames are streamed into FFmpeg and removed after export; they are never committed. A standalone invocation starts its own local Vite server. The application server passes its existing preview URL.

The pipeline uses headless Chromium to seek the exact frame time, wait for bundled fonts and local media, and capture that same composition. FFmpeg encodes H.264 4:2:0 MP4 with AAC audio and fast-start metadata. Video metadata is loaded before clamping seeks; short sources hold their final decoded frame. Export owns video seeking independently of the preview clock. After the seek decodes, it draws the current video frame to a same-size canvas before capture, avoiding races with Chromium’s asynchronous video compositor; a stalled seek blocks export. The encode is checked using ffprobe for dimensions and duration. Native browser, OS and font-rendering differences can change pixels between machines; deterministic here means stable project/time behavior, not identical video bytes across all hosts.

## Authored scenes and motion

Alpha.5 renders arbitrary valid scene sequences within the version-1 model. Blank and newly authored scenes contain only their background and user-authored layers. The original decoration, logo/count and progress treatment is confined to legacy scene kinds `intro`, `features` and `outro`, preserving the older demo without imposing its artwork on new films.

Text, card, caption and CTA nodes honor their font size, weight, alignment and color. Rise, slide, scale and fade entrances use node-local time and delay. A missing animation object restores the default rise entrance. Start/end offsets and timeline edits change the same sentence-relative visibility interval used in export; timing is shared across language variants. Moving a layer or trimming its start preserves an omitted end, so longer languages keep their own sentence end. Trimming the end writes a fixed offset valid in every language; clear End offset to follow sentence duration again. Trimming a layer is not source-footage trimming, and there is no general property-keyframe/curve system.

## Audio

The included demo has an **original synthesized instrumental score and no spoken narration**. `scripts/generate-audio.ts` produces deterministic PCM without samples or third-party recordings. Score-only exports use a comfortable foreground music gain; when sentence audio is attached, the score stays at a quieter background level. Use `--no-score` to omit the score (attached sentence audio is still included).

A sentence can reference a local audio asset per language with `audioAssetId`. During export the audio is measured with ffprobe, fitted to that sentence's declared duration using chained FFmpeg `atempo`, and delayed to the compiled sentence start. Audio longer or shorter than its slot is time-stretched; changing the sentence duration to the actual recording length preserves natural delivery. Multiple sentence tracks are mixed with the score and limited. Source audio remains unchanged. The studio plays attached sentence audio with pause and seek on the same semantic clock; variant thumbnails stay muted. Preview follows the recording-to-slot playback rate, while export uses pitch-preserving FFmpeg tempo filters. The generated score is currently added at export time, so review the exported mix as well as the studio preview.

Detaching sentence audio removes only the selected language's reference; duration and reusable asset remain. Source-video audio is muted in the composition and is not mixed into the export. Attach a separate audio file when narration is needed. Captions are authored text, not automatic transcription. The [alpha.5 acceptance record](verification/authoring-acceptance.json) identifies the media/audio cases actually checked; the older demo's eight exports and instrumental fixture are historical evidence, not proof of spoken narration or every new authoring operation.

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

Alpha scope: fixed landscape/portrait canvases, editable scene/layer sequences, registered components and one composition renderer; no GPU 3D editor, arbitrary HTML import, plugin sandbox, cloud rendering, source-video audio mixing or professional audio workstation. A successful render proves the recorded source/variant on the tested environment; it does not certify every browser, physical mobile device, codec input or custom component.
