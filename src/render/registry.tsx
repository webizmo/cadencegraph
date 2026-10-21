import type { CSSProperties, ComponentType } from "react";
import { clamp, easeOut, stagger } from "./motion";

export interface MotionComponentProps {
  time: number;
  duration: number;
  locale: string;
  ratio: string;
  accent: string;
  foreground: string;
  props: Record<string, unknown>;
}
export interface ComponentDefinition {
  name: string;
  description: string;
  Component: ComponentType<MotionComponentProps>;
}
const definitions = new Map<string, ComponentDefinition>();
/** Register before mounting: components must be pure, seekable, local and network-free. */
export function registerComponent(
  name: string,
  definition: Omit<ComponentDefinition, "name">,
) {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new Error("Component names use lowercase letters and hyphens.");
  if (definitions.has(name))
    throw new Error(`Component already registered: ${name}`);
  definitions.set(name, { name, ...definition });
}
export const getComponent = (name: string) => definitions.get(name);
export const listComponents = () =>
  [...definitions.values()].map(({ name, description }) => ({
    name,
    description,
  }));
const full: CSSProperties = {
  width: "100%",
  height: "100%",
  position: "relative",
};
const svgText = { fontFamily: "Manrope, sans-serif", fill: "#14291f" };

function SignalOrbit({ time, accent, locale }: MotionComponentProps) {
  const tr = locale === "tr";
  const a = easeOut(time / 1.25);
  const cards = [
    {
      x: 28,
      y: 80,
      w: 235,
      h: 132,
      label: tr ? "ANLAM" : "MEANING",
      big: tr ? "Bir fikir." : "One idea.",
      icon: "Aa",
    },
    {
      x: 490,
      y: 45,
      w: 230,
      h: 150,
      label: tr ? "ZAMAN" : "TIMING",
      big: "00:04.20",
      icon: "↗",
    },
    {
      x: 468,
      y: 335,
      w: 250,
      h: 150,
      label: tr ? "YERLEŞİM" : "LAYOUT",
      big: "16:9 → 9:16",
      icon: "▥",
    },
  ];
  return (
    <svg
      viewBox="0 0 760 550"
      width="100%"
      height="100%"
      style={{ overflow: "visible" }}
      aria-label={
        tr
          ? "Anlam, zaman ve yerleşim bağlantıları"
          : "Connected meaning, timing and layout"
      }
    >
      <defs>
        <pattern
          id="orbit-grid"
          width="26"
          height="26"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" fill="#14291f" opacity=".16" />
        </pattern>
        <linearGradient id="orbit-paint" x2="1" y2="1">
          <stop stopColor={accent} />
          <stop offset="1" stopColor="#77bc8e" />
        </linearGradient>
        <linearGradient id="glass-ribbon" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#efffef" stopOpacity=".9" />
          <stop offset=".2" stopColor="#95edb5" stopOpacity=".12" />
          <stop offset=".48" stopColor="#dcffe7" stopOpacity=".8" />
          <stop offset=".7" stopColor="#75d49d" stopOpacity=".12" />
          <stop offset="1" stopColor="#e0ffeb" stopOpacity=".8" />
        </linearGradient>
        <linearGradient id="glass-card" x2="1" y2="1">
          <stop stopColor="#73dca5" stopOpacity=".65" />
          <stop offset=".5" stopColor="#1e4437" stopOpacity=".95" />
          <stop offset="1" stopColor="#102d24" stopOpacity=".98" />
        </linearGradient>
      </defs>
      <g transform={`translate(380 275) rotate(${time * 4})`} opacity={a}>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`rotate(${i * 58})`}>
            <ellipse
              rx={244 - i * 9}
              ry={87 + i * 8}
              fill="none"
              stroke="url(#glass-ribbon)"
              strokeWidth={21 - i * 3}
            />
            <ellipse
              rx={254 - i * 9}
              ry={97 + i * 8}
              fill="none"
              stroke="#c4f5d2"
              strokeOpacity=".5"
              strokeWidth="1"
            />
          </g>
        ))}
        <circle
          cx={242 * Math.cos(time * 0.55)}
          cy={242 * Math.sin(time * 0.55) * 0.7}
          r="16"
          fill="url(#glass-ribbon)"
          stroke="#ceffe0"
          strokeWidth="1"
        />
        <circle
          cx={-220 * Math.cos(time * 0.45)}
          cy={-200 * Math.sin(time * 0.45) * 0.8}
          r="9"
          fill={accent}
        />
      </g>
      <g fill="none" stroke="#85968b" strokeWidth="2">
        <path
          d="M245 154 C350 154 290 272 378 272 S440 120 505 120"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - a}
        />
        <path
          d="M380 272 C490 272 380 408 490 408"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - a}
        />
      </g>
      <g
        transform={`translate(380 272) rotate(${(1 - a) * -45 + Math.sin(time * 0.6) * 3}) scale(${0.7 + 0.3 * a})`}
        opacity={a}
      >
        <rect
          x="-79"
          y="-79"
          width="158"
          height="158"
          rx="37"
          fill="url(#orbit-paint)"
          transform="rotate(-8)"
        />
        <path
          d="M-43 10C-35-30-27 45-14-5S3-25 10 12S27 30 35-6S42 10 45-3"
          fill="none"
          stroke="#14291f"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        <circle cx="54" cy="-53" r="9" fill="#fff" />
      </g>
      {cards.map((c, i) => {
        const p = stagger(time - 0.15, i, 0.23);
        const bob = Math.sin(time * 0.8 + i * 1.8) * 6;
        return (
          <g
            key={c.label}
            transform={`translate(${c.x} ${c.y + (1 - p) * 30 + bob}) rotate(${i === 0 ? -4 : i === 1 ? 5 : -3} ${c.w / 2} ${c.h / 2})`}
            opacity={p}
          >
            <rect
              x="4"
              y="8"
              width={c.w}
              height={c.h}
              rx="18"
              fill="#14291f"
              opacity=".06"
            />
            <rect
              width={c.w}
              height={c.h}
              rx="18"
              fill="url(#glass-card)"
              stroke="#deffeb"
              strokeOpacity=".5"
            />
            <text
              x="20"
              y="30"
              fontSize="11"
              letterSpacing="2"
              {...svgText}
              fill="#c4ebd4"
            >
              {c.label}
            </text>
            <text
              x="20"
              y="80"
              fontSize={i === 2 ? "27" : "29"}
              fontWeight="700"
              {...svgText}
              fill="#fffefa"
            >
              {c.big}
            </text>
            {i === 1 ? (
              <g transform="translate(20 105)">
                {[
                  18, 27, 12, 33, 22, 38, 17, 27, 36, 13, 25, 17, 34, 28, 18,
                  30, 15, 36, 22,
                ].map((h, j) => (
                  <rect
                    key={j}
                    x={j * 10}
                    y={-h / 2}
                    width="4"
                    height={h * (0.6 + 0.4 * Math.sin(time * 2 + j))}
                    rx="2"
                    fill="#c7f36c"
                  />
                ))}
              </g>
            ) : (
              <path
                d={`M20 ${c.h - 25}H${20 + (c.w - 40) * p}`}
                stroke={accent}
                strokeWidth="6"
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}
      <g
        opacity={stagger(time, 5)}
        transform={`translate(112 ${390 + Math.sin(time) * 5})`}
      >
        <rect width="246" height="46" rx="23" fill="#14291f" />
        <circle cx="24" cy="23" r="5" fill={accent} />
        <text
          x="40"
          y="29"
          fontSize="13"
          fontWeight="600"
          fill="#fffefa"
          fontFamily="Manrope"
        >
          {tr
            ? "İnsan + yapay zekâ, aynı proje"
            : "Human + AI. One shared project."}
        </text>
      </g>
    </svg>
  );
}
function RevisionBoard({ time, locale, accent }: MotionComponentProps) {
  const tr = locale === "tr",
    p = easeOut(time / 0.9),
    revision = clamp((time - 1.3) / 2.1),
    protectedProgress = stagger(time, 5);
  return (
    <svg
      viewBox="0 0 900 480"
      width="100%"
      height="100%"
      aria-label={
        tr
          ? "Korunan düzenlemeler ve bağlı zaman çizelgesi"
          : "Protected edits and linked timeline"
      }
    >
      <g
        transform={`translate(450 240) scale(${0.92 + 0.08 * p}) translate(-450 -240)`}
        opacity={p}
      >
        <rect x="5" y="5" width="890" height="470" rx="25" fill="#14291f" />
        <path d="M5 53H895" stroke="#405245" />
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={27 + i * 17}
            cy="29"
            r="4"
            fill={i === 0 ? accent : "#53695a"}
          />
        ))}
        <text x="92" y="34" fontSize="13" fill="#b3c6b6" fontFamily="Manrope">
          cadencegraph / {tr ? "yeni-fikir" : "new-idea"}.motion.json
        </text>
        <rect x="26" y="75" width="262" height="271" rx="13" fill="#243d2e" />
        <text x="45" y="103" fontSize="12" fill="#b3c6b6" fontFamily="Manrope">
          {tr ? "REVİZYON" : "REVISION"} 03
        </text>
        {[
          tr ? "Başlığı değiştir" : "Update the headline",
          tr ? "Sesi uzat" : "Extend the voiceover",
          tr ? "Dikey sürümü üret" : "Build the vertical cut",
        ].map((s, i) => (
          <g key={i} opacity={stagger(time - 0.4, i, 0.35)}>
            <circle cx="48" cy={142 + i * 61} r="10" fill={accent} />
            <path
              d={`M44 ${142 + i * 61}l3 3 5-6`}
              fill="none"
              stroke="#14291f"
              strokeWidth="2"
            />
            <text
              x="67"
              y={147 + i * 61}
              fill="#fffefa"
              fontSize="14"
              fontFamily="Manrope"
            >
              {s}
            </text>
          </g>
        ))}
        <rect x="310" y="75" width="557" height="271" rx="13" fill="#f3f1e7" />
        <g transform={`translate(${341 + revision * 12} 105)`}>
          <text
            x="0"
            y="25"
            fontSize="23"
            fontWeight="800"
            fill="#14291f"
            fontFamily="Manrope"
          >
            {tr ? "Fikrini harekete geçir." : "Give your idea motion."}
          </text>
          <rect
            y="43"
            width={210 + revision * 90}
            height="7"
            rx="3"
            fill="#b5c4b3"
          />
          <rect y="60" width="178" height="7" rx="3" fill="#d3d9c9" />
        </g>
        <g transform={`translate(650 166) rotate(-5)`}>
          <rect width="167" height="125" rx="12" fill={accent} />
          <path
            d="M30 85L60 58L90 69L129 27"
            stroke="#14291f"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="129" cy="27" r="7" fill="#14291f" />
        </g>
        <g opacity={protectedProgress}>
          <rect
            x="638"
            y="151"
            width="187"
            height="141"
            rx="13"
            fill="none"
            stroke="#55a469"
            strokeDasharray="6 5"
            strokeWidth="2"
          />
          <rect
            x="632"
            y="309"
            width="206"
            height="25"
            rx="12"
            fill="#14291f"
          />
          <text
            x="648"
            y="326"
            fontSize="11"
            fill={accent}
            fontFamily="Manrope"
          >
            {tr
              ? "✓ Elle düzenlenen konum korundu"
              : "✓ Human placement preserved"}
          </text>
        </g>
        <path d="M26 366H867" stroke="#405245" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <text
              x="27"
              y={393 + i * 24}
              fill="#b3c6b6"
              fontSize="10"
              fontFamily="Manrope"
            >
              {["VOICE", "TYPE", "LAYOUT"][i]}
            </text>
            <rect
              x="94"
              y={381 + i * 24}
              width={420 + i * 80 + revision * 90}
              height="14"
              rx="4"
              fill={[accent, "#739b80", "#54745e"][i]}
            />
          </g>
        ))}
        <line
          x1={100 + ((time * 0.18) % 1) * 730}
          x2={100 + ((time * 0.18) % 1) * 730}
          y1="374"
          y2="457"
          stroke="#fffefa"
          strokeWidth="2"
        />
      </g>
    </svg>
  );
}
function VariantFan({ time, locale, accent }: MotionComponentProps) {
  const tr = locale === "tr";
  const variants = [
    { x: 70, y: 100, w: 290, h: 164, r: -9, label: "EN · 16:9" },
    { x: 450, y: 78, w: 166, h: 290, r: 7, label: "TR · 9:16" },
    { x: 130, y: 294, w: 290, h: 164, r: 4, label: "TR · 16:9" },
    { x: 612, y: 182, w: 166, h: 290, r: -6, label: "EN · 9:16" },
  ];
  return (
    <svg
      viewBox="0 0 850 540"
      width="100%"
      height="100%"
      aria-label={
        tr ? "Dört dil ve oran varyantı" : "Four language and aspect variants"
      }
    >
      <circle
        cx="426"
        cy="270"
        r={185 + Math.sin(time) * 7}
        fill="none"
        stroke="#b6c6b3"
        strokeWidth="1"
      />
      <circle
        cx="426"
        cy="270"
        r="255"
        fill="none"
        stroke="#cbd4c4"
        strokeWidth="1"
        strokeDasharray="4 10"
      />
      {variants.map((v, i) => {
        const p = stagger(time, i, 0.18);
        return (
          <g
            key={v.label}
            opacity={p}
            transform={`translate(${v.x} ${v.y + (1 - p) * 80 + Math.sin(time * 0.7 + i) * 4}) rotate(${v.r * p} ${v.w / 2} ${v.h / 2})`}
          >
            <rect
              x="6"
              y="10"
              width={v.w}
              height={v.h}
              rx="15"
              fill="#14291f"
              opacity=".1"
            />
            <rect
              width={v.w}
              height={v.h}
              rx="15"
              fill={i % 2 ? "#14291f" : "#fffefa"}
              stroke="#14291f"
              strokeOpacity=".12"
            />
            <text
              x="18"
              y="28"
              fontSize="11"
              fontWeight="600"
              fill={i % 2 ? accent : "#637869"}
              fontFamily="Manrope"
            >
              {v.label}
            </text>
            <text
              x="18"
              y={v.w < 200 ? 69 : 65}
              fontSize={v.w < 200 ? 22 : 25}
              fontWeight="800"
              fill={i % 2 ? "#fffefa" : "#14291f"}
              fontFamily="Manrope"
            >
              {i === 1 || i === 2 ? "Bir fikir." : "One idea."}
            </text>
            <text
              x="18"
              y={v.w < 200 ? 96 : 93}
              fontSize={v.w < 200 ? 22 : 25}
              fontWeight="800"
              fill={i % 2 ? "#fffefa" : "#14291f"}
              fontFamily="Manrope"
            >
              {i === 1 || i === 2 ? "Her format." : "Every format."}
            </text>
            <g
              transform={`translate(${v.w < 200 ? 83 : 226} ${v.w < 200 ? 187 : 80}) rotate(${time * 7 + i * 12})`}
            >
              <rect
                x="-30"
                y="-30"
                width="60"
                height="60"
                rx="15"
                fill={accent}
              />
              <path
                d="M-21 5C-17-15-13 23-7-3S2-13 5 6S14 15 18-3S21 5 23-2"
                fill="none"
                stroke="#14291f"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </g>
            <rect
              x="18"
              y={v.h - 30}
              width={v.w - 36}
              height="5"
              rx="2"
              fill={i % 2 ? "#426049" : "#dce3d5"}
            />
            <rect
              x="18"
              y={v.h - 30}
              width={(v.w - 36) * p * 0.8}
              height="5"
              rx="2"
              fill={i % 2 ? accent : "#77a383"}
            />
          </g>
        );
      })}
    </svg>
  );
}
function MetricBars({ time, accent }: MotionComponentProps) {
  return (
    <svg
      viewBox="0 0 500 260"
      width="100%"
      height="100%"
      aria-label="Animated metric chart"
    >
      {[0.32, 0.53, 0.45, 0.72, 0.62, 0.92].map((v, i) => (
        <g key={i}>
          <rect
            x={24 + i * 79}
            y="12"
            width="50"
            height="220"
            rx="10"
            fill="#14291f"
            opacity=".06"
          />
          <rect
            x={24 + i * 79}
            y={232 - 220 * v * stagger(time, i)}
            width="50"
            height={220 * v * stagger(time, i)}
            rx="10"
            fill={i === 5 ? accent : "#739b80"}
          />
        </g>
      ))}
    </svg>
  );
}
registerComponent("signal-orbit", {
  description: "Connected meaning, timing and layout cards",
  Component: SignalOrbit,
});
registerComponent("revision-board", {
  description: "Seekable revision and protected-layout diagram",
  Component: RevisionBoard,
});
registerComponent("variant-fan", {
  description: "Four animated format and language variants",
  Component: VariantFan,
});
registerComponent("metric-bars", {
  description: "Example developer component: deterministic bars",
  Component: MetricBars,
});
export const componentContainerStyle = full;
