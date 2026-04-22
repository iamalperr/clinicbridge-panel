"use client";

import { useState } from "react";
import SectionCard from "@/components/ui/SectionCard";

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
    {children}
  </label>
);

const selectStyle: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
  borderRadius: 10, padding: "10px 14px", fontSize: 14, color: "var(--text-primary)",
  outline: "none", fontFamily: "inherit", cursor: "pointer",
};

export default function VoicePage() {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("elevenlabs");
  const [voice, setVoice] = useState("rachel");
  const [speed, setSpeed] = useState(1.0);
  const [saved, setSaved] = useState(false);

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <>
      <SectionCard
        title="Voice Assistant"
        subtitle="Enable AI voice responses for this clinic's assistant."
        action={
          <button
            onClick={() => setEnabled(!enabled)}
            style={{ padding: "6px 16px", borderRadius: 99, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: enabled ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)", color: enabled ? "#34d399" : "var(--text-secondary)" }}
          >
            {enabled ? "● Enabled" : "○ Disabled"}
          </button>
        }
      >
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
          When enabled, the AI assistant will respond with synthesized voice audio in supported widget configurations.
        </p>
      </SectionCard>

      <SectionCard title="Voice Provider">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <FieldLabel>Provider</FieldLabel>
            <select style={selectStyle} value={provider} onChange={e => setProvider(e.target.value)}>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="openai">OpenAI TTS</option>
              <option value="azure">Azure Cognitive Speech</option>
            </select>
          </div>
          <div>
            <FieldLabel>Voice Model</FieldLabel>
            <select style={selectStyle} value={voice} onChange={e => setVoice(e.target.value)}>
              <option value="rachel">Rachel (Female, EN)</option>
              <option value="adam">Adam (Male, EN)</option>
              <option value="bella">Bella (Female, EN)</option>
              <option value="elli">Elli (Female, TR)</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Voice Behavior">
        <div style={{ maxWidth: 400 }}>
          <FieldLabel>Speed: {speed.toFixed(1)}x</FieldLabel>
          <input type="range" min="0.5" max="2.0" step="0.1" value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--brand)", marginBottom: 4 }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-muted)" }}>
            <span>Slow (0.5×)</span><span>Fast (2.0×)</span>
          </div>
        </div>
      </SectionCard>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={handleSave} style={{ background: saved ? "rgba(16,185,129,0.2)" : "var(--brand)", color: saved ? "#34d399" : "white", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          {saved ? "✓ Saved" : "Save Voice Settings"}
        </button>
      </div>
    </>
  );
}
