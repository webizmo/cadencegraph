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

Transactions contain an ID, expected revision, actor and validated operations. All operations succeed together or none do. An AI request captures a base revision; a late response cannot overwrite subsequent work. Undo restores earlier contents while incrementing the revision, so a proposal cannot become current again accidentally. The editor's history is bounded and is not persisted as a collaboration log.

The localhost Express server owns Claude invocation, file inspection and export jobs. API requests require same-origin JSON; Host checks limit DNS-rebinding exposure. Only one AI call and one export run at a time. Export job metadata is in memory and disappears on restart. Uploaded file names are generated; FFprobe verifies the media stream. Imported files remain local and are not automatically committed or shared.

Claude receives project data, not filesystem capabilities. Its response is a constrained operation proposal; it cannot install a component, run shell commands or change protection. The editor independently validates the operation transaction again. Project JSON is sent to the provider only after a user requests a proposal.

The browser composition is a function of project, variant and time. Built-in component motion is time-based and seekable. Export launches Chromium, prevents third-party network requests, sets exact frame times, waits for media/fonts, checks the actual DOM, and pipes frames to FFmpeg. The encoder is an external installed binary, not a new codec implementation.

Current design tradeoffs: percentages are an explicit layout contract, not a constraint solver; reading-time and text-capacity source checks are estimates; renderer inspection does not judge aesthetic overlap; free-form component code is trusted and can invalidate determinism if it ignores the SDK contract. This alpha is for a trusted local operator, not hostile multi-user input at Internet scale.
