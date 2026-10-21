# Project format and transaction semantics

CadenceGraph's source of truth is a versioned JSON graph, not rendered HTML. The editor, Claude bridge, preview and export share this graph and its transaction engine. Version 1 is described by [the project JSON Schema](../schemas/project-v1.schema.json); edit transactions use [the transaction JSON Schema](../schemas/transaction-v1.schema.json). Claude returns the constrained proposal schema in [server/ai.ts](../server/ai.ts), which the application converts to a transaction when applied. The executable runtime validator additionally checks relationships that JSON Schema cannot express, including globally unique IDs, complete locale maps, media references and cue bounds.

The original alpha.4 sample is [examples/demo.json](../examples/demo.json), with a typed equivalent in [examples/demo.ts](../examples/demo.ts). Alpha.5 also includes the independently authored [Community Garden project](../examples/community-garden.cadence.json). The studio creates new projects and scene sequences directly; JSON/code authoring remains available for custom components and integrations.

## Identity, localization and time

`schemaVersion: 1` is the format version. Alpha.5 expands the operation vocabulary without changing the project schema; alpha.4 projects keep the same format. `revision` is the project's monotonic edit counter, not a format version. Unsupported format versions fail with a readable error. IDs are stable strings starting with a letter, up to 96 characters, and globally unique across the project, assets, scenes, sentences and nodes. Reordering or editing an element never regenerates its ID.

Every scene contains one or more narration sentences. Each sentence has localized `text` and `duration` maps. Durations are seconds measured for each language, not a single duration copied across translations. Scenes and sentences follow array order. The compiler adds their durations; an English change cannot accidentally retime the Turkish output.

```json
{
  "id": "sentence-intro",
  "text": { "en": "Ideas move.", "tr": "Fikirler hareket eder." },
  "duration": { "en": 2.4, "tr": 3.1 }
}
```

A node's `timing.sentenceId` must reference a sentence in its own scene. Optional `start` and `end` are second offsets from that sentence's start. Omit `end` to follow its current end. A node starting at `0.5` therefore stays half a second after its sentence even when earlier narration gets longer. Explicit ends are fixed offsets: shortening narration past such a cue is rejected, not silently clamped. This release provides sentence timing, not phoneme alignment or automatic word timing.

Optional sentence `audioAssetId` maps a locale to an audio asset. `set-sentence-audio` atomically adds/reuses the selected audio asset, assigns it and changes that locale's duration. `remove-sentence-audio` detaches that locale's recording while preserving its current duration and the reusable asset. Changing narration text does not synthesize or rewrite an audio file; the transaction describes that distinction and the user must review audio separately.

## Scene authoring and reuse

`createBlankProject` creates EN/TR × 16:9/9:16 at 30 FPS with one empty four-second scene. The project format retains at least one scene; each scene retains at least one sentence, while its `nodes` array can be empty. A blank scene has no mandatory logo, heading, progress bar or movie artwork.

`createScene` provides editable `blank`, `title`, `quote`, `cards` and `closing` starting points with distinct IDs, complete locale maps and ratio layouts. `BRAND_PRESETS` offers Midnight, Paper and Cobalt; applying a brand updates project colors/font settings, while manual layout overrides remain intact. These factories produce ordinary version-1 data, not a separate template format or a locked scene sequence.

`add-scene` inserts the supplied complete scene at optional zero-based `index`, or appends it. `move-scene` places an existing scene at a zero-based destination. `remove-scene` cannot remove the last scene. `set-scene` changes a name, theme or both; `set-project-name` renames the project.

`duplicate-scene` inserts a copy after its source with the caller's `newId`. It deterministically assigns fresh sentence/node IDs and rewrites internal timing links; the core helper bounds generated IDs to 96 characters. Asset references and localized content remain reusable. `duplicate-node` inserts a new-identity copy after the source within the same scene. `move-node` changes a layer's order inside its existing scene; later layers draw above earlier layers. Duplication collisions and broken references reject the transaction rather than overwriting existing data.

## Layout and human decisions

`layout` uses canvas percentages: `x` and `y` are the top-left position, `width` and `height` are box dimensions. `rotation` is degrees. Native composition canvases are `16:9` at 1920×1080 and `9:16` at 1080×1920; default MP4 exports are 1280×720 and 720×1280 respectively. Text style `fontSize` is in native canvas pixels. The responsive preview and export scale the composition to their display/output size while preserving its layout.

Each node may have ratio-specific layout overrides:

```json
{
  "layout": { "x": 53, "y": 16, "width": 43, "height": 66 },
  "overrides": {
    "9:16": {
      "layout": { "x": 8, "y": 48, "width": 84, "height": 38 },
      "protected": true
    }
  }
}
```

The compiler overlays only the selected ratio's fields. Human `set-layout` operations protect that ratio by default. A human can explicitly unlock it. AI cannot change protection, move a protected layout, remove/duplicate/reorder a protected node, remove/duplicate a scene containing protected nodes, or inject protection through a new node/scene. Scene order, text, brand, timing and supported styling changes remain possible and preserve the override. Protection belongs to manual layout decisions; it does not freeze every property or the whole scene.

## Supported nodes and components

Version 1 supports `text`, `media`, `card`, `caption`, `cta` and `component` nodes. All nodes have stable identity, localized `content`, layout and sentence timing. Media nodes reference a registered image or video asset; caption nodes are explicit editable text. `set-node-media` replaces an image or video through a human selection, atomically adding or reusing its asset while preserving the node's identity, order, timing, layout and protection. Existing assets remain available; replacement does not delete a file. Components reference a deterministic registry name and plain JSON `props`. A scene can use `theme: "inverted"` to swap the shared brand foreground/background while retaining the accent. Only legacy `kind: "intro"`, `"features"` and `"outro"` scenes receive the original demo's decorative chrome; other kinds render their own nodes against the scene background.

`set-node-style` replaces the style object (not a partial merge); send `{}` to return to renderer defaults. `fontSize`, `fontWeight`, `color` and `align` apply to text, card, caption and CTA text. `set-node-animation` replaces entrance configuration with `rise`, `slide`, `scale` or `fade` and an optional delay. Omitting `animation` removes explicit configuration and restores the renderer's default rise entrance; it does **not** mean no animation.

`set-node-timing` replaces the whole timing object and may bind the node to another sentence in its own scene. It always requires `sentenceId`; omit `end` to follow the sentence. Timing and animation are shared across languages, so explicit offsets must remain within every locale's duration. The inspector and timeline edit this same data. Moving a layer or trimming its start preserves follow-sentence timing when its end is unset. Trimming the end writes an explicit end offset; clear End offset in the inspector to follow the sentence again. Trimming changes node visibility, not a video's source in/out points. These are entrance presets and semantic timing controls, not general keyframes.

Custom component code must be installed and registered by a developer. Imported JSON cannot contain JavaScript, run code or register a new renderer. Arbitrary React/HTML import and lossless code round-tripping are not supported. The component SDK defines the editable surface; a model can update only declared project operations.

## Transactions, conflicts and undo

```ts
import { applyTransaction } from '../src/core';

const result = applyTransaction(project, {
  id: 'move-portrait-card',
  baseRevision: project.revision,
  actor: 'human',
  operations: [{
    type: 'set-layout',
    nodeId: 'features-board',
    ratio: '9:16',
    layout: { y: 47 },
  }],
});
```

The engine supports these operation groups:

| Group | Operations |
| --- | --- |
| Project and scenes | `set-project-name`, `add-scene`, `set-scene`, `duplicate-scene`, `remove-scene`, `move-scene` |
| Layers | `add-node`, `duplicate-node`, `remove-node`, `move-node`, `set-text`, `set-layout`, `set-node-style`, `set-node-animation`, `set-node-timing`, `set-protection` |
| Script and media | `set-sentence-text`, `set-sentence-duration`, `set-sentence-audio`, `remove-sentence-audio`, `set-node-media`, `add-asset` |
| Shared design | `set-brand` |

`set-sentence-audio`, `remove-sentence-audio`, `set-node-media`, `add-asset` and `set-protection` require a human actor. The server's Claude proposal schema exposes a subset of the engine's operations and forces actor `ai`; a model cannot promote itself by placing `human` in its response. AI can reference existing media in newly authored nodes but cannot invent a source or upload a file.

A transaction is atomic. Its base revision must equal the current revision. Every operation is checked, then the complete resulting graph is validated. A stale revision, protected property, nonexistent target, invalid node, broken reference or invalid timing rejects the whole batch with explicit `conflicts`; no preceding operation survives. A successful result includes affected locale/ratio lists and a snapshot for undo.

`undoTransaction(current, previous)` restores the snapshot's content and advances revision again. Undo must never rewind the revision counter: a model proposal created before the intervening edits remains stale. An editor can use the same mechanism for redo by saving the state it is leaving. This is an in-memory transaction/history model, not a distributed CRDT or a multi-user database.

## Import and output validation

`parseProject(unknown)` returns a cloned, validated project or throws `ProjectValidationError` with structured `issues`. `validateProject(unknown)` is the non-throwing form. Unknown structural fields, executable values, prototype-bearing keys, cycles, oversized documents, duplicate IDs, unsupported versions and invalid references are rejected. Asset sources must be portable relative paths or HTTP(S) URLs; the server/export layer must independently constrain filesystem access and remote retrieval.

`compileProject(project, locale, ratio)` produces absolute second-based scene, sentence and node intervals plus resolved layout. `validateVariant` reports per-output canvas bounds, entrance timing, estimated text capacity and reading time. These checks are separate from structural validity: an overflowing layout remains editable, while export can reject it. Text capacity is an estimate; actual font loading, media availability and rendered text overflow require the renderer's preflight. Rotation bounds receive a visual-review warning.

The first schema intentionally has finite limits: at most 12 locales, 100 scenes, 100 sentences per scene, 500 nodes per scene and 500 assets; durations of 0.2–120 seconds per sentence; 1–100 operations per transaction. Supported FPS values are 24, 25, 30, 50 and 60. These are current implementation limits, not claims of unlimited editing or automatic layout quality.
