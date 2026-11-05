"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import PageHeader from "@/components/ui/PageHeader";
import { UI_COLORS } from "@/components/ui/ui-shared";
import type { EditablePreview } from "@/lib/preview/adminFacts";

interface PreviewListItem {
  id: string;
  clinicName: string;
  website: string;
  email: string;
  createdAt: string | null;
  status: string;
  source: "direct" | "manual";
  viewCount: number;
  crawlStatus: string | null;
  previewId: string | null;
}

interface PreviewDetail extends PreviewListItem {
  phone: string;
  facts: EditablePreview;
}

const area: CSSProperties = {
  width: "100%",
  minHeight: 72,
  padding: "10px 14px",
  borderRadius: 12,
  border: `1px solid ${UI_COLORS.border}`,
  background: UI_COLORS.bgInput,
  color: UI_COLORS.textPrimary,
  font: "inherit",
};

function emptyFacts(): EditablePreview {
  return {
    clinicName: "",
    treatments: [],
    address: "",
    hours: "",
    phone: "",
    whatsapp: "",
    languages: [],
    faq: [],
    logoUrl: "",
    primaryColor: "",
  };
}

export default function AdminPreviewsPage() {
  const { profile, loading, getToken } = useAuth();
  const [requests, setRequests] = useState<PreviewListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PreviewDetail | null>(null);
  const [facts, setFacts] = useState<EditablePreview>(emptyFacts());
  const [languages, setLanguages] = useState("");
  const [paste, setPaste] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [draft, setDraft] = useState({ clinicName: "", website: "", email: "" });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const authed = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    if (!token) throw new Error("Oturum doğrulanamadı.");
    const response = await fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "İşlem tamamlanamadı.");
    return body;
  }, [getToken]);

  const loadList = useCallback(async () => {
    const body = await authed("/api/admin/previews");
    setRequests(Array.isArray(body.requests) ? body.requests : []);
  }, [authed]);

  const loadDetail = useCallback(async (id: string) => {
    const body = await authed(`/api/admin/previews/${id}`) as PreviewDetail;
    setDetail(body);
    setFacts(body.facts);
    setLanguages(body.facts.languages.join(", "));
    setChat([]);
    setSelectedId(id);
  }, [authed]);

  useEffect(() => {
    if (loading || !isSuperAdmin(profile?.role)) return;
    void loadList().catch((error: Error) => setNotice(error.message));
  }, [loading, profile?.role, loadList]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await task();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  function editedFacts(): EditablePreview {
    return {
      ...facts,
      languages: languages.split(",").map((item) => item.trim()).filter(Boolean),
    };
  }

  if (loading) return null;
  if (!isSuperAdmin(profile?.role)) {
    return <main style={{ padding: 32, color: UI_COLORS.textSecondary }}>Bu ekran yalnız yöneticilere açıktır.</main>;
  }

  return (
    <main style={{ padding: 28, display: "grid", gap: 24 }}>
      <PageHeader title="Önizlemeler" subtitle="Talepleri inceleyin, düzeltin ve linki siz gönderin." />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const body = await authed("/api/admin/previews", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(draft),
            });
            setDraft({ clinicName: "", website: "", email: "" });
            await loadList();
            if (typeof body.id === "string") await loadDetail(body.id);
          });
        }}
        style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 1fr auto", gap: 12, alignItems: "end" }}
      >
        <Input label="Klinik adı" value={draft.clinicName} onChange={(event) => setDraft({ ...draft, clinicName: event.target.value })} required />
        <Input label="Web sitesi" value={draft.website} onChange={(event) => setDraft({ ...draft, website: event.target.value })} required />
        <Input label="E-posta" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
        <Button type="submit" disabled={busy}>Yeni önizleme oluştur</Button>
      </form>
      {notice ? <p style={{ color: UI_COLORS.danger, margin: 0 }}>{notice}</p> : null}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {requests.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => void run(() => loadDetail(item.id))} style={{ width: "100%", textAlign: "left", padding: 12, borderRadius: 12, border: `1px solid ${selectedId === item.id ? UI_COLORS.brand : UI_COLORS.border}`, background: UI_COLORS.bgCard, color: UI_COLORS.textPrimary, cursor: "pointer" }}>
                <strong>{item.clinicName || "Adsız klinik"}</strong>
                <div style={{ fontSize: 12, color: UI_COLORS.textSecondary }}>{item.website}</div>
                <div style={{ fontSize: 12, color: UI_COLORS.textSecondary }}>{item.createdAt ? new Date(item.createdAt).toLocaleString("tr-TR") : "—"} · {item.status} · {item.source} · {item.viewCount} görüntülenme{item.crawlStatus ? ` · ${item.crawlStatus}` : ""}</div>
              </button>
            </li>
          ))}
        </ul>
        {detail ? (
          <section style={{ display: "grid", gap: 12 }}>
            <Input label="Klinik adı" value={facts.clinicName} onChange={(event) => setFacts({ ...facts, clinicName: event.target.value })} />
            <Input label="Adres" value={facts.address} onChange={(event) => setFacts({ ...facts, address: event.target.value })} />
            <Input label="Çalışma saatleri" value={facts.hours} onChange={(event) => setFacts({ ...facts, hours: event.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Telefon" value={facts.phone} onChange={(event) => setFacts({ ...facts, phone: event.target.value })} />
              <Input label="WhatsApp" value={facts.whatsapp} onChange={(event) => setFacts({ ...facts, whatsapp: event.target.value })} />
            </div>
            <Input label="Diller" value={languages} onChange={(event) => setLanguages(event.target.value)} placeholder="tr, en" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
              <Input label="Logo" value={facts.logoUrl} onChange={(event) => setFacts({ ...facts, logoUrl: event.target.value })} />
              <Input label="Ana renk" value={facts.primaryColor} onChange={(event) => setFacts({ ...facts, primaryColor: event.target.value })} placeholder="#0ea5e9" />
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {facts.treatments.map((item, index) => (
                <div key={`t-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
                  <Input aria-label="Tedavi" value={item.name} onChange={(event) => setFacts({ ...facts, treatments: facts.treatments.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row) })} />
                  <Input aria-label="Fiyat aralığı" value={item.priceRange} onChange={(event) => setFacts({ ...facts, treatments: facts.treatments.map((row, rowIndex) => rowIndex === index ? { ...row, priceRange: event.target.value } : row) })} />
                  <Button type="button" variant="secondary" onClick={() => setFacts({ ...facts, treatments: facts.treatments.filter((_, rowIndex) => rowIndex !== index) })}>Sil</Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setFacts({ ...facts, treatments: [...facts.treatments, { name: "", priceRange: "" }] })}>Tedavi ekle</Button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {facts.faq.map((item, index) => (
                <div key={`f-${index}`} style={{ display: "grid", gap: 8 }}>
                  <Input aria-label="Soru" value={item.question} onChange={(event) => setFacts({ ...facts, faq: facts.faq.map((row, rowIndex) => rowIndex === index ? { ...row, question: event.target.value } : row) })} />
                  <textarea aria-label="Yanıt" value={item.answer} onChange={(event) => setFacts({ ...facts, faq: facts.faq.map((row, rowIndex) => rowIndex === index ? { ...row, answer: event.target.value } : row) })} style={area} />
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setFacts({ ...facts, faq: [...facts.faq, { question: "", answer: "" }] })}>Soru ekle</Button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button type="button" disabled={busy} onClick={() => void run(async () => { await authed(`/api/admin/previews/${detail.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", facts: editedFacts() }) }); await loadDetail(detail.id); await loadList(); })}>Kaydet</Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(async () => { await authed(`/api/admin/previews/${detail.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rescan" }) }); await loadDetail(detail.id); await loadList(); })}>Tekrar tara</Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(async () => { await authed(`/api/admin/previews/${detail.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }) }); setNotice("Link gönderildi."); await loadList(); })}>Linki gönder</Button>
            </div>
            <textarea aria-label="Metin yapıştır" value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Site metnini veya kliniğin gönderdiği bilgileri yapıştırın" style={area} />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(async () => { await authed(`/api/admin/previews/${detail.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "extract", text: paste }) }); setPaste(""); await loadDetail(detail.id); })}>Metinden çıkar</Button>
            <label style={{ color: UI_COLORS.textSecondary, fontSize: 13 }}>
              PDF yükle
              <input type="file" accept="application/pdf" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file || !detail) return;
                void run(async () => {
                  const form = new FormData();
                  form.set("file", file);
                  await authed(`/api/admin/previews/${detail.id}`, { method: "POST", body: form });
                  await loadDetail(detail.id);
                });
              }} />
            </label>
            <div style={{ display: "grid", gap: 8 }}>
              {chat.map((turn, index) => <p key={`${turn.role}-${index}`} style={{ margin: 0, color: UI_COLORS.textPrimary }}><strong>{turn.role === "user" ? "Siz" : "Bot"}:</strong> {turn.content}</p>)}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <Input aria-label="Test mesajı" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Önizlemeyi test et" />
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(async () => {
                  const message = chatInput.trim();
                  if (!message) return;
                  const history = chat;
                  const body = await authed(`/api/admin/previews/${detail.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", message, history }) });
                  setChat([...history, { role: "user", content: message }, { role: "assistant", content: typeof body.reply === "string" ? body.reply : "" }]);
                  setChatInput("");
                })}>Gönder</Button>
              </div>
            </div>
          </section>
        ) : <p style={{ color: UI_COLORS.textSecondary }}>Bir talep seçin.</p>}
      </div>
    </main>
  );
}
