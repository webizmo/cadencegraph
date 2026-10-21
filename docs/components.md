# Component SDK

A component is a deterministic React visual that receives a node's **local time**. It can draw SVG, HTML or CSS, but it must derive every moving property from the supplied time. Components are trusted application code. The `.cadence.json` project format stores only a registered name and JSON props; it cannot evaluate JavaScript, import arbitrary URLs, or add code to the registry.

The built-in examples live in `src/render/registry.tsx`:

| Name | Example technique |
| --- | --- |
| `signal-orbit` | Original animated glass ribbons, connected cards and waveform |
| `revision-board` | Timed revisions, a protected-layout diagram and linked tracks |
| `variant-fan` | Four aspect/language cards, staggered entrances and orbit |
| `metric-bars` | Minimal deterministic data graphic to extend |

## Add a component

Create a file under `src/render/` and import it once from the application before the first composition mounts. Register it with a stable lowercase name. Do not re-register inside a React render or effect.

```tsx
import { registerComponent, type MotionComponentProps } from './registry';
import { easeOut } from './motion';

function ProgressBadge({ time, accent, props }: MotionComponentProps) {
  const progress = easeOut(time / 0.8);
  const value = typeof props.value === 'number' ? props.value : 100;
  return (
    <div style={{
      height: '100%', display: 'grid', placeItems: 'center',
      background: accent, color: '#14291f', borderRadius: '1em',
      transform: `scale(${0.85 + progress * 0.15})`,
      font: '700 3cqw Manrope',
    }}>
      {Math.round(value * progress)}%
    </div>
  );
}

registerComponent('progress-badge', {
  description: 'A seekable animated progress number',
  Component: ProgressBadge,
});
```

Reference it from an ordinary versioned node:

```json
{
  "id": "campaign-progress",
  "type": "component",
  "content": { "en": "", "tr": "" },
  "component": "progress-badge",
  "props": { "value": 92 },
  "layout": { "x": 60, "y": 30, "width": 25, "height": 25 },
  "timing": { "sentenceId": "sentence-intro" },
  "animation": { "enter": "scale" }
}
```

`sentenceId` must already exist in that scene and all project locales must appear in `content`. Add a portrait override using the same node ID if the layout needs different proportions. Set `protected: true` on a manual override to make AI layout changes conflict rather than silently move it. Nodes are added through core transactions (`add-node`) so schema checks, revision tracking and undo remain active.

## Contract

- `time`: seconds elapsed since this node's compiled start; safe for backward or repeated seeks.
- `duration`: the node's compiled visible duration.
- `locale`, `ratio`: the exact active output variant.
- `accent`, `foreground`: resolved brand/scene colors.
- `props`: validated JSON values. Validate any stricter component-specific expectations yourself.

Use the size of the containing node. SVG `viewBox` makes aspect-aware graphics straightforward; percent positioning and container query units adapt HTML. Avoid `Date.now`, `Math.random`, `setInterval`, CSS transitions, wall-clock animation, asynchronous layout, web fonts, and external fetches. These make frame seeking diverge from interactive preview.

Components must not mount their own video or audio tags: use project media nodes and sentence audio so the shared media clock owns seeking, playback and export. An unknown component name is visible as a missing-component tile and blocks export. Registration rejects duplicate names.

Run `npm run check`, inspect both aspect ratios, and use a real render to validate a new component. Core schema checks and rendered text measurements cannot guarantee that internal SVG labels are legible or that a custom visual is artistically balanced. Review the exported frames at delivery size.
