# Studio design contract

Reference: `docs/design/studio-concept.png` (generated full-screen concept). The implementation retains the three-rail studio: a graphite shell, scene/layer rail, ratio-correct preview, property inspector, and track timeline. Alpha.5 extends this shell for original scene authoring. Mint is reserved for the primary export action, selected states, protected-layout status, and playhead.

## Tokens and anatomy

- Background `#101315`, raised surfaces `#181c1f`, selected surface `#262c30`, borders `#2a3034`.
- Primary text `#f4f6f5`, secondary text `#a3adb4`, muted utility text `#7f8a93`.
- Accent `#9bf5ce`; timeline tracks lavender, mint, blue, and rose.
- System sans for studio chrome, bundled Manrope in the original demo and project-selected brand fonts in authored scenes; monospaced timecodes/identities. Controls are deliberately 11–13px, section headings 11px with modest tracking, project name 14px.
- 58px header; scene rail 224px; property rail 280px; workspace canvas flexible. 4px/6px control corner radius and minimal panel framing.
- Lucide outline icons at 14–18px with 1.7–2px strokes, no emoji or ornamental icon badges.
- Single open timeline band below the canvas. Scene and layer rows retain the concept's compact hierarchy. Narrow layouts become stacked editing regions without horizontal viewport overflow.

## Functional extensions and intentional deviations

The project model has percent-based responsive transforms, so position and size fields use percentages rather than the concept's illustrative pixel fields. The concept's rotation/opacity inspector controls remain omitted. Scene copy and media come from the open project, which can be the original demo or a new user-authored film. `New project`, `Import`, `Save project`, and `Export film` expose the project lifecycle. The right rail has `Properties`, `Claude`, and `Checks` tabs for editing, proposal review and preflight. Four-variant review uses real compiled previews. No speculative metrics, fake proposed changes, or unsupported media controls are shown.

## Alpha.5 authoring surfaces

- **Project and scenes:** an editable project name and a blank-project action; a scene picker offers Blank canvas, Title, Quote, Three points and Closing. These create editable layers. Scene & design controls rename, duplicate, delete or move the active scene, invert its colors, and choose Midnight, Paper or Cobalt for the project.
- **Layers and assets:** add text, card, caption or CTA layers; import an image/video as a new layer or reuse existing project media. The selected layer can be moved backward/forward, duplicated or deleted. A blank scene displays a clear instruction to add a layer, with no mandatory demo artwork.
- **Properties:** localized copy and script remain separate from shared font size, weight, alignment and color. Transform fields and canvas dragging protect the selected ratio. Motion controls expose four named entrance presets, delay and start/end offsets; an empty end follows the sentence.
- **Timeline:** layer bars expose sentence-relative timing and support movement/trimming. The same values remain editable in Properties. Fixed offsets must fit the shortest language duration; this is layer visibility editing, not arbitrary source-footage trimming or a keyframe curve editor.
- **Audio and AI:** sentence audio can be attached or detached without deleting its reusable source asset. Claude can propose original scenes and supported revisions; operation summaries, conflicts and explicit apply/dismiss controls remain visible.

Keep creation actions usable in narrow stacked layouts. Scene actions must stay associated with the selected scene, layer actions with the selected layer, and disabled last-scene deletion must explain why it is unavailable. A design preset affects all scenes; copy/duration edits clearly identify their language, while motion/style/offset controls identify their shared scope.

## Interaction model

Create or select a scene/layer, scrub/play the timeline, choose language and ratio, and edit content, timing and responsive transforms. Structural changes use the same transaction/history flow as content changes. Human transform edits protect that ratio from future AI edits; protected layers also block destructive AI structural operations. Explicitly unlocking the toggle authorizes AI layout changes. Claude suggestions are requested from the local API, displayed as a proposal, checked against the current revision, and applied atomically. History supports undo/redo. Project JSON imports validate before replacement; exports include the complete source graph. Local storage keeps a versioned project and visibly reports storage failure. MP4 jobs show actual server status and a download link only after completion.

## Verification records

Alpha.5's current evidence belongs in [authoring acceptance](verification/authoring-acceptance.json), including the actual desktop/narrow-browser workflows and [Community Garden](../examples/community-garden.cadence.json) render outputs. That record must identify completed checks, provider fixtures versus live calls, and any unresolved limits. No alpha.5 test count or physical-device acceptance is inferred from the older work below.

### Historical studio verification

The following ledger describes the original studio-shell work before alpha.5 authoring. Its measurements and test counts are historical snapshots, not a rerun against the current UI.

The built-in IAB browser was used for live inspection and interaction checks. Initial visible-tab creation was not supported in the subagent, so the same IAB ran in its supported background mode; no browser-engine fallback was needed. The core agent’s Playwright acceptance suite saved repeatable screenshots. Both the concept and `docs/verification/studio-wide.png` were directly inspected with `view_image` at the concept’s native 1588 × 992 dimensions; `studio-mobile.png` was inspected too.

| Comparison | Evidence and repair |
| --- | --- |
| Container anatomy | Header, left scene/layer rail, center canvas and transport, right inspector, bottom timeline preserve the reference hierarchy. A persistent bottom status bar is a functional extension. |
| Palette | Graphite backgrounds, restrained gray borders, off-white type and mint selection/export accents match the reference family; timeline colors remain lavender, mint, blue and rose. |
| Typography and copy | Explicit font sizes cover all controls, inputs, rows and utility labels. Actual project scene names, IDs and timings replace illustrative concept copy. The demo’s internal headline/art differs intentionally from the concept as described below. |
| Canvas framing | Inspection found `max-height` compressing the frame. Replaced it with container-based width/height fitting. Both single and four-variant layouts now measure 1.7778 for landscape and 0.5625 for portrait. |
| Mobile overflow | 390px inspection exposed min-content rail expansion to 618px. Changed the mobile grid track to `minmax(0,1fr)` and confined horizontal scene scrolling. A separate export-button width conflict was repaired. IAB measured body/client widths of 385/385 at a 390px viewport and 595/595 at 600px. |
| Interaction states | IAB changed portrait X from 9 to 12, observed the protected state, switched to landscape and confirmed X remained 7, then undid and confirmed portrait X returned to 9 and the lock cleared. Core Playwright tests additionally verify real drag, import/export, narration retiming and fixture proposal conflict/application. |
| Icons | Lucide outline family, wave brand mark, thin scene/layer glyphs, mint lock/status states and transport metaphors retain the concept’s line-icon language. Unsupported rotation/opacity controls were intentionally omitted. |

Above-the-fold copy review: reference header/scene/property structure is retained; `Import`, `4 variants`, `Claude`, `Checks`, real scene names and real timing are documented functional additions. No fake proposals or unsupported controls are presented. Scene artwork uses registered, deterministic vector components in place of the concept’s photorealistic glass rendering; demo text and scale are driven by the source project and output-fit requirements. Therefore the product chrome is faithfully verified against the reference, while the movie is a functional original composition rather than a pixel-identical rendering of the concept.

At that historical checkpoint, no global viewport overflow or distorted preview ratios remained at the tested 390, 600, 1440 and 1588 widths. The 11-case acceptance suite passed before the later image/video replacement extension. The source-format canvas is 1920 × 1080 / 1080 × 1920; default server MP4 export is 1280 × 720 / 720 × 1280.

Image/video replacement and sentence narration are independent file controls. Uploaded visual media replaces the selected media node atomically while retaining its stable identity and ratio overrides. The audio file control retimes only its selected sentence and language. JSON import increments the current revision so an in-flight AI response cannot accidentally become valid after loading a same-revision file. Four-variant review and locale switching preserve scene-relative progress, making comparisons meaningful when language durations differ.
