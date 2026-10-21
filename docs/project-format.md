# Project format and transaction semantics

CadenceGraph's source of truth is a versioned JSON graph, not rendered HTML. The editor, Claude bridge, preview and export share this graph and its transaction engine. Version 1 is described by [the project JSON Schema](../schemas/project-v1.schema.json); proposal envelopes use [the transaction JSON Schema](../schemas/transaction-v1.schema.json). The executable runtime validator additionally checks relationships that JSON Schema cannot express, including globally unique IDs, complete locale maps, media references and cue bounds.

The readable sample is [examples/demo.json](../examples/demo.json). The typed authoring equivalent is [examples/demo.ts](../examples/demo.ts). Both contain the same three-scene film in English and Turkish, with landscape and portrait layouts.

## Identity, localization and time

`schemaVersion: 1` is the format version. `revision` is the project's monotonic edit counter; it is not a format version. Unsupported format versions fail with a readable error. No migration is currently provided because this is the first format release. IDs are stable strings starting with a letter, up to 96 characters, and globally unique across the project, assets, scenes, sentences and nodes. Reordering or editing an element never regenerates its ID.

Every scene contains one or more narration sentences. Each sentence has localized `text` and `duration` maps. Durations are seconds measured for each language, not a single duration copied across translations. Scenes and sentences follow array order. The compiler adds their durations; an English change cannot accidentally retime the Turkish output.

```json
{
  "id": "sentence-intro",
  "text": { "en": "Ideas move.", "tr": "Fikirler hareket eder." },
  "duration": { "en": 2.4, "tr": 3.1 }
}
```

A node's `timing.sentenceId` must reference a sentence in its own scene. Optional `start` and `end` are second offsets from that sentence's start. Omit `end` to follow its current end. A node starting at `0.5` therefore stays half a second after its sentence even when earlier narration gets longer. Explicit ends are fixed offsets: shortening narration past such a cue is rejected, not silently clamped. This release provides sentence timing, not phoneme alignment or automatic word timing.

Optional sentence `audioAssetId` maps a locale to an audio asset. `set-sentence-audio` atomically adds/reuses the selected audio asset, assigns it and changes that locale's duration. Importantly, changing narration text does not synthesize or rewrite an audio file; the transaction describes that distinction and the user must review audio separately.

## Layout and human decisions

`layout` uses canvas percentages: `x` and `y` are the top-left position, `width` and `height` are box dimensions. `rotation` is degrees. Current outputs are `16:9` at 1920×1080 and `9:16` at 1080×1920. Text style `fontSize` is in native canvas pixels. The responsive preview scales the entire canvas, retaining the exact export composition.

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

The compiler overlays only the selected ratio's fields. Human `set-layout` operations protect that ratio by default. A human can explicitly unlock it. AI cannot change protection, move a protected layout, remove a node with a protected layout, or inject manual protection through a newly created node. Text, brand and narration updates remain possible and preserve the override. Protection belongs to layout; it does not claim to freeze every property or the whole scene.

## Supported nodes and components

Version 1 supports `text`, `media`, `card`, `caption`, `cta` and `component` nodes. All nodes have stable identity, localized `content`, layout and sentence timing. Media nodes reference a registered image or video asset; caption nodes are explicit editable text. `set-node-media` replaces an image or video through a human selection, atomically adding or reusing its asset while preserving the node's identity, order, timing, layout and protection. Existing assets remain available; replacement does not delete a file. Components reference a deterministic registry name and plain JSON `props`. A scene can use `theme: "inverted"` to swap the shared brand foreground/background while retaining the accent.

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

The engine supports `set-text`, `set-sentence-text`, `set-layout`, `set-protection`, `set-brand`, `set-sentence-duration`, `set-sentence-audio`, `set-node-media`, `add-asset`, `add-node` and `remove-node`. Audio selection, media replacement, adding assets and protection changes require a human actor. The server forces the actor of model proposals to `ai`; a model cannot promote itself by placing `human` in its response.

A transaction is atomic. Its base revision must equal the current revision. Every operation is checked, then the complete resulting graph is validated. A stale revision, protected property, nonexistent target, invalid node, broken reference or invalid timing rejects the whole batch with explicit `conflicts`; no preceding operation survives. A successful result includes affected locale/ratio lists and a snapshot for undo.

`undoTransaction(current, previous)` restores the snapshot's content and advances revision again. Undo must never rewind the revision counter: a model proposal created before the intervening edits remains stale. An editor can use the same mechanism for redo by saving the state it is leaving. This is an in-memory transaction/history model, not a distributed CRDT or a multi-user database.

## Import and output validation

`parseProject(unknown)` returns a cloned, validated project or throws `ProjectValidationError` with structured `issues`. `validateProject(unknown)` is the non-throwing form. Unknown structural fields, executable values, prototype-bearing keys, cycles, oversized documents, duplicate IDs, unsupported versions and invalid references are rejected. Asset sources must be portable relative paths or HTTP(S) URLs; the server/export layer must independently constrain filesystem access and remote retrieval.

`compileProject(project, locale, ratio)` produces absolute second-based scene, sentence and node intervals plus resolved layout. `validateVariant` reports per-output canvas bounds, entrance timing, estimated text capacity and reading time. These checks are separate from structural validity: an overflowing layout remains editable, while export can reject it. Text capacity is an estimate; actual font loading, media availability and rendered text overflow require the renderer's preflight. Rotation bounds receive a visual-review warning.

The first schema intentionally has finite limits: at most 12 locales, 100 scenes, 100 sentences per scene, 500 nodes per scene and 500 assets; durations of 0.2–120 seconds per sentence; 1–100 operations per transaction. Supported FPS values are 24, 25, 30, 50 and 60. These are current implementation limits, not claims of unlimited editing or automatic layout quality.
