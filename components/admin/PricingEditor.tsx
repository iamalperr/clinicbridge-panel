"use client";

import { useState, useEffect, useCallback } from "react";
import SectionCard from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { UI_COLORS } from "@/components/ui/ui-shared";
import type { AIModelPricing } from "@/lib/types/aiUsage";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Plus, Save, AlertCircle } from "lucide-react";

export default function PricingEditor() {
  const { getToken } = useAuth();
  const [prices, setPrices] = useState<AIModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Create a staging array of changes
  const [stagingPrices, setStagingPrices] = useState<Partial<AIModelPricing>[]>([]);

  const loadPrices = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/ai-model-pricing", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPrices(data);
        setStagingPrices(data);
      } else {
        throw new Error("Failed to fetch prices");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadPrices();
  }, [loadPrices]);

  const handleAdd = () => {
    setStagingPrices([{
      model: "",
      inputPricePerMillion: 0,
      cachedInputPricePerMillion: 0,
      outputPricePerMillion: 0,
      effectiveFrom: new Date().toISOString(),
      isActive: true
    }, ...stagingPrices]);
  };

  const handleChange = (idx: number, field: keyof AIModelPricing, value: any) => {
    const updated = [...stagingPrices];
    updated[idx] = { ...updated[idx], [field]: value };
    setStagingPrices(updated);
  };

  const handleSave = async (idx: number) => {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const item = stagingPrices[idx];
      
      const method = item.id ? "PUT" : "POST";
      const res = await fetch("/api/admin/ai-model-pricing", {
        method,
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(item)
      });
      
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to save");
      }
      
      // reload
      await loadPrices();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="animate-spin" /></div>;
  }

  return (
    <SectionCard 
      title="OpenAI Model Fiyatlandırma" 
      subtitle="Yeni bir fiyat girdiğinizde anında geçerli olur. Mevcut modellerin fiyatını değiştirirseniz eski kullanım kayıtlarının maliyeti DEĞİŞMEZ."
      action={
        <Button onClick={handleAdd}>
          <Plus size={16} /> Yeni Ekle
        </Button>
      }
    >
      {error && (
        <div style={{ padding: 12, background: "rgba(239, 68, 68, 0.1)", color: UI_COLORS.danger, borderRadius: 8, marginBottom: 16, display: "flex", gap: 8 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${UI_COLORS.border}` }}>
              <th style={{ padding: "12px 8px", color: UI_COLORS.textSecondary }}>Model ID</th>
              <th style={{ padding: "12px 8px", color: UI_COLORS.textSecondary }}>Input ($/1M)</th>
              <th style={{ padding: "12px 8px", color: UI_COLORS.textSecondary }}>Cached In ($/1M)</th>
              <th style={{ padding: "12px 8px", color: UI_COLORS.textSecondary }}>Output ($/1M)</th>
              <th style={{ padding: "12px 8px", color: UI_COLORS.textSecondary }}>Aktif</th>
              <th style={{ padding: "12px 8px", color: UI_COLORS.textSecondary }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {stagingPrices.map((item, idx) => (
              <tr key={item.id || `new-${idx}`} style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
                <td style={{ padding: "8px" }}>
                  <Input 
                    value={item.model || ""} 
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(idx, "model", e.target.value)}
                    placeholder="gpt-4o-mini"
                    disabled={!!item.id} // Don't change model name after creation
                  />
                </td>
                <td style={{ padding: "8px", width: 120 }}>
                  <Input 
                    type="number"
                    value={item.inputPricePerMillion} 
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(idx, "inputPricePerMillion", parseFloat(e.target.value))}
                    step="0.001"
                  />
                </td>
                <td style={{ padding: "8px", width: 120 }}>
                  <Input 
                    type="number"
                    value={item.cachedInputPricePerMillion} 
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(idx, "cachedInputPricePerMillion", parseFloat(e.target.value))}
                    step="0.001"
                  />
                </td>
                <td style={{ padding: "8px", width: 120 }}>
                  <Input 
                    type="number"
                    value={item.outputPricePerMillion} 
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(idx, "outputPricePerMillion", parseFloat(e.target.value))}
                    step="0.001"
                  />
                </td>
                <td style={{ padding: "8px" }}>
                  <input 
                    type="checkbox" 
                    checked={item.isActive} 
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(idx, "isActive", e.target.checked)}
                  />
                </td>
                <td style={{ padding: "8px" }}>
                  <Button variant="secondary" onClick={() => handleSave(idx)} disabled={saving}>
                    <Save size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
