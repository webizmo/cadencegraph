# Architecture

CadenceGraph separates an inspectable project from edit proposals and rendering. Neither a provider nor a renderer is the source of truth.

```text
Project JSON ── parseProject ── validated Project
                                  │
                human edit / Claude operation proposal
                                  │
                        applyTransaction (atomic)
                   revision check + protected layout
                                  │
                    compileProject(locale, ratio)
                                  │
                    React Composition(project,time)
                         /                  \
                  Studio preview      Chromium frame seek
                                            │
                                 DOM/media/font inspection
                                            │
                                    FFmpeg MP4 + report
```

`src/core` has no UI/provider dependencies. Node identity survives edits and serialization. Sentence durations are stored by locale; compilation accumulates absolute times. Node timing is relative to a sentence, so later scenes follow duration changes. Ratio overrides are merged over base layout. Protection belongs to each override and can only be controlled by a human operation.

`src/core/authoring.ts` creates blank projects, ordinary version-1 scene designs and layer defaults. It does not embed a mandatory film sequence. The studio's scene/layer controls, inspector and timeline all submit core operations. Scenes can be added, duplicated, removed and reordered; layers can be created, styled, timed and ordered inside a scene. Duplication generates deterministic nested identities with rewritten sentence links and shared asset references. A project retains at least one scene and every scene at least one sentence, while a blank scene can contain zero nodes. Alpha.5 leaves `schemaVersion: 1` unchanged; the transaction schema expands to cover the new edits.

Transactions contain an ID, expected revision, actor and validated operations. All operations succeed together or none do. An AI request captures a base revision; a late response cannot overwrite subsequent work. Undo restores earlier contents while incrementing the revision, so a proposal cannot become current again accidentally. The editor's history is bounded and is not persisted as a collaboration log.

Structural edits use the same conflict rules: AI cannot remove or duplicate a scene containing protected layers, or remove, duplicate or reorder a protected layer. Layer style, entrance and timing changes replace their corresponding objects; layout changes continue to merge a ratio-specific override. Timeline dragging/trimming edits sentence-relative node timing rather than a second independent timeline format. Explicit offsets are shared across languages and must fit all locale durations.

The localhost Express server owns Claude invocation, file inspection and export jobs. API requests require same-origin JSON; Host checks limit DNS-rebinding exposure. Only one AI call and one export run at a time. Export job metadata is in memory and disappears on restart. Uploaded file names are generated; FFprobe verifies the media stream. Imported files remain local and are not automatically committed or shared.

Claude receives project data, not filesystem capabilities. Its response is a constrained operation proposal covering supported scene creation/removal/order and layer content/layout/style/motion/timing edits; the provider schema is intentionally a subset of the core operation set. It cannot install a component, upload media, run shell commands or change protection. The editor independently validates the operation transaction again. Project JSON is sent to the provider only after a user requests a proposal. Existing local assets can be referenced by ID, but this integration does not generate images, video, speech or transcription.

The browser composition is a function of project, variant and time. Built-in component motion is time-based and seekable. Export launches Chromium, prevents third-party network requests, sets exact frame times, waits for media/fonts, checks the actual DOM, and pipes frames to FFmpeg. The encoder is an external installed binary, not a new codec implementation.

The composition renders new scenes without the old demo's injected logo/count, atmosphere or progress decoration. That treatment remains keyed only to legacy `intro`, `features` and `outro` kinds. Standard text, cards, captions and CTAs honor the shared style model. Scene presets and brand presets stay editable data; custom component renderers remain registered trusted code.

The [authoring acceptance record](verification/authoring-acceptance.json) separates alpha.5 browser/render/provider evidence from the historical alpha.4 records. Fixture provider responses, automated narrow-view Chromium checks and actual local MP4 encoding are different kinds of evidence; none should be relabeled as real-provider, physical-device or production acceptance.

Current design tradeoffs: percentages are an explicit layout contract, not a constraint solver; reading-time and text-capacity source checks are estimates; renderer inspection does not judge aesthetic overlap; free-form component code is trusted and can invalidate determinism if it ignores the SDK contract. This alpha is for a trusted local operator, not hostile multi-user input at Internet scale.
