import { useRef, useState } from "react";
import { AudioLines, Upload, LoaderCircle } from "lucide-react";
import type { Asset, Operation, Sentence } from "../core";
import { uploadMedia } from "./api";

export function SentenceControls({
  sentence,
  assets,
  locale,
  transact,
}: {
  sentence: Sentence;
  assets: Asset[];
  locale: string;
  transact: (ops: Operation[]) => unknown;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const asset = assets.find((a) => a.id === sentence.audioAssetId?.[locale]);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const result = await uploadMedia(file);
      if (result.asset.type !== "audio" || !result.duration)
        throw new Error("Choose an audio file with a readable duration.");
      transact([
        {
          type: "set-sentence-audio",
          sentenceId: sentence.id,
          locale,
          asset: result.asset,
          duration: result.duration,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio import failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <section className="property-section">
      <div className="section-label">
        <span>SEMANTIC TIMING</span>
        <span className="mini-badge">{locale.toUpperCase()}</span>
      </div>
      <div className="anchor-label">
        <span className="anchor-dot" />
        <span>{sentence.id}</span>
      </div>
      <label>
        Narration script
        <textarea
          aria-label="Narration script"
          key={`${sentence.id}-${locale}-${sentence.text[locale]}`}
          defaultValue={sentence.text[locale]}
          rows={3}
          onBlur={(e) => {
            if (e.target.value !== sentence.text[locale])
              transact([
                {
                  type: "set-sentence-text",
                  sentenceId: sentence.id,
                  locale,
                  text: e.target.value,
                },
              ]);
          }}
        />
      </label>
      <label className="duration-field">
        <span>Sentence duration</span>
        <div>
          <input
            aria-label="Sentence duration"
            type="number"
            min="0.2"
            max="120"
            step="0.1"
            key={`${sentence.id}-${locale}-${sentence.duration[locale]}`}
            defaultValue={sentence.duration[locale]}
            onBlur={(e) => {
              const duration = Number(e.target.value);
              if (duration !== sentence.duration[locale])
                transact([
                  {
                    type: "set-sentence-duration",
                    sentenceId: sentence.id,
                    locale,
                    duration,
                  },
                ]);
            }}
          />
          <span>s</span>
        </div>
      </label>
      <p className="field-hint">
        Attached layers follow this sentence. Script edits do not synthesize
        speech or rewrite captions. Imported audio sets this language's
        duration.
      </p>
      <button
        className="button full"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? (
          <LoaderCircle size={14} className="spin" />
        ) : (
          <Upload size={14} />
        )}{" "}
        {busy
          ? "Importing audio…"
          : asset
            ? "Replace narration"
            : "Import narration"}
      </button>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a"
        aria-label="Import narration audio"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      {asset ? (
        <div className="narration-upload">
          <span className="narration-name">
            <AudioLines size={12} />
            {asset.name || asset.id}
          </span>
          <audio
            controls
            src={asset.src}
            preload="metadata"
            aria-label="Narration audio preview"
          />
          <button
            className="button full"
            onClick={() =>
              transact([
                {
                  type: "remove-sentence-audio",
                  sentenceId: sentence.id,
                  locale,
                },
              ])
            }
          >
            Remove narration
          </button>
        </div>
      ) : null}
      <p className="field-hint">WAV, MP3, OGG or M4A · up to 20 MB.</p>
      {error ? (
        <div className="message error" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
