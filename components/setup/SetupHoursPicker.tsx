"use client";

import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  WEEKDAY_LABELS_TR,
  WEEKDAY_ORDER,
  type WeekdayKey,
  type WeeklyHoursState,
} from "@/lib/setup/workingHours";

const TIMES = Array.from({ length: 28 }, (_, index) => {
  const hour = 7 + Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
});

export default function SetupHoursPicker({
  value,
  onChange,
  onApplyWeekdays,
}: {
  value: WeeklyHoursState;
  onChange: (next: WeeklyHoursState) => void;
  onApplyWeekdays: () => void;
}) {
  function update(key: WeekdayKey, patch: Partial<WeeklyHoursState[WeekdayKey]>) {
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button type="button" variant="secondary" onClick={onApplyWeekdays}>
          Hafta içi hepsine uygula
        </Button>
      </div>
      {WEEKDAY_ORDER.map((key) => {
        const day = value[key];
        return (
          <div
            key={key}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 10,
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${UI_COLORS.border}`,
              background: UI_COLORS.bgInput,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontWeight: 700, color: UI_COLORS.textPrimary, fontSize: 14 }}>{WEEKDAY_LABELS_TR[key]}</span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: UI_COLORS.textSecondary }}>
                <input
                  type="checkbox"
                  checked={day.open}
                  onChange={(event) => update(key, { open: event.target.checked })}
                  style={{ width: 16, height: 16, accentColor: UI_COLORS.brand }}
                />
                {day.open ? "Açık" : "Kapalı"}
              </label>
            </div>
            {day.open ? (
              <div style={{ display: "flex", gap: 8, gridColumn: "1 / -1" }}>
                <select
                  aria-label={`${WEEKDAY_LABELS_TR[key]} başlangıç`}
                  value={day.start}
                  onChange={(event) => update(key, { start: event.target.value })}
                  style={timeSelect}
                >
                  {TIMES.map((time) => (
                    <option key={`${key}-s-${time}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
                <span style={{ alignSelf: "center", color: UI_COLORS.textMuted }}>—</span>
                <select
                  aria-label={`${WEEKDAY_LABELS_TR[key]} bitiş`}
                  value={day.end}
                  onChange={(event) => update(key, { end: event.target.value })}
                  style={timeSelect}
                >
                  {TIMES.map((time) => (
                    <option key={`${key}-e-${time}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const timeSelect = {
  flex: 1,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${UI_COLORS.border}`,
  background: UI_COLORS.bgCard,
  color: UI_COLORS.textPrimary,
  font: "inherit",
} as const;
