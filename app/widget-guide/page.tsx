"use client";

import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, ExternalLink, Code2, Send, Shield, Zap, Smartphone, Settings, HelpCircle, ArrowRight, Globe } from "lucide-react";

/* ─── Marka renkleri ─── */
const C = {
  bg:           "#0d0f17",
  surface:      "#151823",
  surfaceHigh:  "#1e2235",
  border:       "rgba(255,255,255,0.07)",
  brand:        "#6366f1",
  brandLight:   "rgba(99,102,241,0.15)",
  text:         "#f1f5f9",
  textSub:      "#8b97b8",
  green:        "#22c55e",
  greenBg:      "rgba(34,197,94,0.1)",
  amber:        "#f59e0b",
  amberBg:      "rgba(245,158,11,0.1)",
  blue:         "#3b82f6",
  blueBg:       "rgba(59,130,246,0.1)",
};

/* ─── Yardımcı bileşenler ─── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handle} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
      borderRadius: 8, border: `1px solid ${C.border}`, background: C.surfaceHigh,
      color: copied ? C.green : C.textSub, fontSize: 12, cursor: "pointer",
      transition: "all 0.2s", fontFamily: "inherit",
    }}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Kopyalandı" : "Kopyala"}
    </button>
  );
}

function CodeBlock({ code, language = "html" }: { code: string; language?: string }) {
  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: C.surfaceHigh, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 12, color: C.textSub, fontFamily: "monospace" }}>{language}</span>
        <CopyButton text={code} />
      </div>
      <pre style={{ margin: 0, padding: "20px 16px", background: "#0a0c14", overflowX: "auto", fontSize: 13.5, lineHeight: 1.7, color: "#e2e8f0", fontFamily: "'Fira Code', 'Cascadia Code', 'Courier New', monospace" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InfoCard({ type = "info", children }: { type?: "info" | "warning" | "success"; children: React.ReactNode }) {
  const conf = type === "info"
    ? { color: "#3b82f6", bg: "rgba(59,130,246,0.1)", icon: "ℹ️" }
    : type === "warning"
    ? { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: "⚠️" }
    : { color: "#22c55e", bg: "rgba(34,197,94,0.1)", icon: "✅" };
  return (
    <div style={{ padding: "14px 18px", borderRadius: 10, background: conf.bg, border: `1px solid ${conf.color}30`, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ fontSize: 16, lineHeight: 1.5, flexShrink: 0 }}>{conf.icon}</span>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: C.text }}>{children}</div>
    </div>
  );
}

function Section({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: C.brandLight, display: "flex", alignItems: "center", justifyContent: "center", color: C.brand, flexShrink: 0 }}>
          {icon}
        </div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 20px", background: C.surface, border: "none", cursor: "pointer",
        color: C.text, fontSize: 15, fontWeight: 600, textAlign: "left", gap: 12, fontFamily: "inherit",
      }}>
        {q}
        {open ? <ChevronUp size={18} color={C.textSub} /> : <ChevronDown size={18} color={C.textSub} />}
      </button>
      {open && (
        <div style={{ padding: "0 20px 18px", fontSize: 14, lineHeight: 1.7, color: C.textSub, background: C.surface }}>
          {a}
        </div>
      )}
    </div>
  );
}

const EMBED_CODE = `<script
  src="https://app.clinicbridge-ai.com/widget.js"
  data-clinic-id="YOUR_CLINIC_ID"
  async>
</script>`;

const EMBED_FULL_CODE = `<!DOCTYPE html>
<html>
  <head>...</head>
  <body>
    <!-- Sitenizin içerikleri buraya -->

    <!-- ClinicBridge AI Widget — </body> öncesine ekleyin -->
    <script
      src="https://app.clinicbridge-ai.com/widget.js"
      data-clinic-id="YOUR_CLINIC_ID"
      async>
    </script>
  </body>
</html>`;

const CSP_CODE = `script-src 'self' https://app.clinicbridge-ai.com;
connect-src 'self' https://app.clinicbridge-ai.com https://api.clinicbridge-ai.com;`;

const EMAIL_TEXT = `Merhaba,

ClinicBridge AI web widget entegrasyonu için aşağıdaki küçük JavaScript embed kodunun web sitemizin global footer alanına veya </body> kapanış etiketi öncesine eklenmesi yeterlidir.

<script
  src="https://app.clinicbridge-ai.com/widget.js"
  data-clinic-id="YOUR_CLINIC_ID"
  async>
</script>

Script async/defer mantığıyla çalıştığı için web sitesinin ana yüklenmesini bloklamaz. Widget yalnızca kendi chat arayüzünü çalıştırır; sitenin mevcut formlarına, admin alanına veya ödeme altyapısına müdahale etmez.

Gerekli olması halinde ClinicBridge AI domainleri CSP/firewall tarafında allowlist'e eklenebilir.

Entegrasyon rehberi:
https://clinicbridge-ai.com/widget-guide

Teşekkürler.`;

const PLATFORMS = [
  { name: "WordPress", icon: "🔵" },
  { name: "Webflow", icon: "🟢" },
  { name: "Özel yazılım", icon: "⚙️" },
  { name: "React / Next.js", icon: "⚛️" },
  { name: "PHP / Laravel", icon: "🐘" },
  { name: "Statik HTML", icon: "📄" },
  { name: "Google Tag Manager", icon: "🏷️" },
];

const CUSTOMIZATIONS = [
  "Widget ana rengi", "Widget başlığı", "Asistan adı",
  "Karşılama mesajı", "Avatar seçimi", "Widget buton şekli",
  "Widget konumu", "Açılış mesaj balonu", "Dil seçenekleri",
];

const STEPS = [
  "Klinik için ClinicBridge AI panelinden widget ayarları hazırlanır.",
  "Web sağlayıcısına embed kodu iletilir.",
  "Kod staging veya test sayfasına eklenir.",
  "Masaüstü ve mobil görünüm kontrol edilir.",
  "Test mesajı gönderilir.",
  "Admin panelde görüşmenin düştüğü kontrol edilir.",
  "Onay sonrası tüm siteye yayına alınır.",
];

const FAQS = [
  { q: "Widget siteyi yavaşlatır mı?", a: "Hayır, async/defer mantığıyla çalıştığı için ana sayfa yüklenmesini bloklamaz. Site içerikleriniz tam hızda yüklenmeye devam eder." },
  { q: "WordPress ile uyumlu mu?", a: "Evet, global footer script alanına veya uygun bir custom code alanına eklenebilir." },
  { q: "Google Tag Manager ile eklenebilir mi?", a: "Evet, ancak doğrudan siteye eklemek daha stabil olabilir. GTM üzerinden de çalışır." },
  { q: "Tasarımı değiştirebilir miyiz?", a: "Evet, renk, konum, avatar, buton şekli ve karşılama mesajı klinik bazlı özelleştirilebilir." },
  { q: "ClinicBridge AI tarafında sorun olursa site etkilenir mi?", a: "Hayır, site çalışmaya devam eder. Yalnızca widget geçici olarak görünmeyebilir." },
  { q: "KVKK metni özelleştirilebilir mi?", a: "Evet, klinik kendi KVKK/gizlilik metnine göre bilgilendirme alanını özelleştirebilir." },
];

const NAV_ITEMS = [
  { id: "overview",     label: "Genel Bakış" },
  { id: "integration", label: "Entegrasyon" },
  { id: "placement",   label: "Kod Yeri" },
  { id: "platforms",   label: "Altyapılar" },
  { id: "performance", label: "Performans" },
  { id: "security",    label: "Güvenlik" },
  { id: "kvkk",        label: "KVKK" },
  { id: "csp",         label: "CSP / Firewall" },
  { id: "mobile",      label: "Mobil" },
  { id: "custom",      label: "Özelleştirme" },
  { id: "golive",      label: "Canlıya Alma" },
  { id: "faq",         label: "SSS" },
];

export default function WidgetGuidePage() {
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const copyEmail = () => {
    navigator.clipboard.writeText(EMAIL_TEXT);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2500);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        @media (max-width: 768px) {
          .guide-sidebar { display: none !important; }
          .guide-main { padding-top: 32px !important; }
        }
        @media (max-width: 900px) {
          .guide-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Top Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(13,15,23,0.92)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}`, padding: "0 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: C.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>ClinicBridge AI</span>
            <span style={{ color: C.textSub, fontSize: 12 }}>/ Entegrasyon Rehberi</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              onClick={() => { const el = document.getElementById("integration"); el?.scrollIntoView({ behavior: "smooth" }); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: C.brandLight, border: `1px solid ${C.brand}40`, color: C.brand, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              <Code2 size={14} /> Kodu Gör
            </button>
            <button
              onClick={() => setShowEmailModal(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: C.brand, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              <Send size={14} /> Web Ekibine Gönder
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header style={{ background: `linear-gradient(135deg, ${C.surface} 0%, ${C.bg} 100%)`, borderBottom: `1px solid ${C.border}`, padding: "60px 24px 48px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 999, background: C.brandLight, border: `1px solid ${C.brand}40`, color: C.brand, fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            <Globe size={14} /> Public Entegrasyon Rehberi
          </div>
          <h1 style={{ margin: "0 0 16px", fontSize: "clamp(24px, 5vw, 40px)", fontWeight: 800, lineHeight: 1.2, background: "linear-gradient(135deg, #f1f5f9 30%, #6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ClinicBridge AI Web Widget<br />Entegrasyon Rehberi
          </h1>
          <p style={{ margin: "0 auto", fontSize: 16, lineHeight: 1.7, color: C.textSub, maxWidth: 580 }}>
            ClinicBridge AI web widget&apos;ını kliniğinizin web sitesine hızlı, güvenli ve performans dostu şekilde entegre etmek için teknik rehber.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
            {[
              { icon: <Zap size={13} color={C.brand} />, label: "Async / Non-blocking" },
              { icon: <Shield size={13} color={C.green} />, label: "Güvenli" },
              { icon: <Smartphone size={13} color={C.blue} />, label: "Mobil Uyumlu" },
              { icon: <Settings size={13} color={C.amber} />, label: "Özelleştirilebilir" },
            ].map(b => (
              <span key={b.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999, background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontWeight: 500 }}>
                {b.icon} {b.label}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="guide-grid" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 220px", gap: 40, alignItems: "start" }}>

        {/* Main */}
        <main className="guide-main" style={{ display: "flex", flexDirection: "column", gap: 52, padding: "48px 0" }}>

          <Section id="overview" icon={<Globe size={18} />} title="Genel Bakış">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: C.textSub }}>
              <strong style={{ color: C.text }}>ClinicBridge AI Web Widget</strong>, klinik web sitelerine eklenen yapay zeka destekli hasta iletişim asistanıdır. Web sitesine küçük bir JavaScript embed kodu eklenerek çalışır. Ziyaretçiler widget üzerinden klinik hakkında bilgi alabilir, sorularını iletebilir ve randevu talebi oluşturabilir.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              {[
                { icon: "🤖", title: "Yapay Zeka Destekli", desc: "Klinik bilgilerine göre eğitilmiş asistan" },
                { icon: "⚡", title: "Kolay Entegrasyon", desc: "Tek satır script ile kurulum" },
                { icon: "🔒", title: "İzole Çalışır", desc: "Mevcut site kodunu etkilemez" },
              ].map(c => (
                <div key={c.title} style={{ padding: 20, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 24, marginBottom: 10 }}>{c.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 4 }}>{c.title}</div>
                  <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="integration" icon={<Code2 size={18} />} title="Entegrasyon Nasıl Yapılır?">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: C.textSub }}>
              Aşağıdaki embed kodunu web sitenizin HTML&apos;ine eklemek yeterlidir. <code style={{ background: C.surfaceHigh, padding: "2px 6px", borderRadius: 5, fontSize: 13, color: C.brand }}>YOUR_CLINIC_ID</code> alanı ClinicBridge AI panelinden kliniğe özel oluşturulan ID ile değiştirilmelidir.
            </p>
            <CodeBlock code={EMBED_CODE} language="html" />
            <InfoCard type="info">
              <strong>YOUR_CLINIC_ID</strong> değerini ClinicBridge AI admin panelindeki <em>Klinik Detay → Web Widget</em> sekmesinden edinebilirsiniz.
            </InfoCard>
          </Section>

          <Section id="placement" icon={<ArrowRight size={18} />} title="Kod Nereye Eklenmeli?">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: C.textSub }}>
              Embed kodu tercihen web sitesinin <code style={{ background: C.surfaceHigh, padding: "2px 6px", borderRadius: 5, fontSize: 13, color: C.brand }}>&lt;/body&gt;</code> kapanış etiketinden hemen önce eklenmelidir. WordPress, Webflow veya özel yazılım altyapılarında global footer/script alanına eklenmesi önerilir.
            </p>
            <CodeBlock code={EMBED_FULL_CODE} language="html" />
          </Section>

          <Section id="platforms" icon={<Globe size={18} />} title="Desteklenen Altyapılar">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {PLATFORMS.map(p => (
                <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, fontSize: 14, color: C.text, fontWeight: 500 }}>
                  <span style={{ fontSize: 18 }}>{p.icon}</span> {p.name}
                </div>
              ))}
            </div>
            <InfoCard type="success">
              Herhangi bir altyapıda <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>&lt;script&gt;</code> etiketi eklenebiliyorsa widget entegrasyonu mümkündür.
            </InfoCard>
          </Section>

          <Section id="performance" icon={<Zap size={18} />} title="Performans">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: C.textSub }}>
              Widget <strong style={{ color: C.text }}>async/defer</strong> mantığıyla çalışacak şekilde kurgulanır. Bu nedenle web sitesinin ana yüklenmesini bloklamaz. Site içerikleri yüklenmeye devam ederken ClinicBridge AI widget arka planda yüklenir.
            </p>
            <InfoCard type="success">
              <strong>ClinicBridge AI tarafında geçici erişim problemi yaşansa bile web sitesinin ana içeriği etkilenmez.</strong> En kötü senaryoda yalnızca widget görünmez.
            </InfoCard>
          </Section>

          <Section id="security" icon={<Shield size={18} />} title="Güvenlik">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: C.textSub }}>
              Widget yalnızca kendi chat arayüzünü çalıştırır. Web sitesinin admin paneline, formlarına, ödeme alanlarına veya kullanıcı oturumlarına erişmez. Mevcut site kodlarını değiştirmez.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {["❌ Admin panele erişmez", "❌ Formlara müdahale etmez", "❌ Ödeme verisi okumaz", "❌ Kullanıcı oturumu almaz", "✅ Yalnızca chat çalışır", "✅ İzole ortamda çalışır"].map(t => (
                <div key={t} style={{ padding: "10px 14px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, color: C.text }}>{t}</div>
              ))}
            </div>
          </Section>

          <Section id="kvkk" icon={<Shield size={18} />} title="KVKK ve Gizlilik">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: C.textSub }}>
              Widget üzerinde KVKK ve gizlilik bilgilendirmesi gösterilebilir. Klinik, kendi KVKK metnine göre bilgilendirme alanını özelleştirebilir. Hasta onayı alınmadan görüşme başlatılmaması için onay ekranı kurgulanabilir.
            </p>
            <InfoCard type="info">
              KVKK onay ekranını ve metnini kliniğe özel özelleştirmek için ClinicBridge AI destek ekibiyle iletişime geçebilirsiniz.
            </InfoCard>
          </Section>

          <Section id="csp" icon={<Settings size={18} />} title="CSP / Firewall Ayarları">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: C.textSub }}>
              Web sitesinde Content Security Policy veya firewall kısıtlamaları varsa aşağıdaki domainlere izin verilmesi gerekebilir:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["https://app.clinicbridge-ai.com", "https://clinicbridge-ai.com", "https://api.clinicbridge-ai.com"].map(d => (
                <div key={d} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
                  <ExternalLink size={14} color={C.brand} />
                  <code style={{ fontSize: 13, color: C.brand, fontFamily: "monospace" }}>{d}</code>
                </div>
              ))}
            </div>
            <CodeBlock code={CSP_CODE} language="CSP Header" />
          </Section>

          <Section id="mobile" icon={<Smartphone size={18} />} title="Mobil Uyumluluk">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: C.textSub }}>
              ClinicBridge AI widget masaüstü, tablet ve mobil ekranlara uyumlu çalışacak şekilde tasarlanır. Mobilde buton ekran dışına taşmayacak ve sohbet penceresi mobil kullanıma uygun şekilde açılacaktır.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {["📱 iPhone / Android", "💻 Masaüstü", "📟 Tablet"].map(d => (
                <div key={d} style={{ padding: "10px 16px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, fontSize: 14, color: C.text }}>{d}</div>
              ))}
            </div>
          </Section>

          <Section id="custom" icon={<Settings size={18} />} title="Özelleştirme Seçenekleri">
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: C.textSub }}>
              ClinicBridge AI admin panelinden aşağıdaki öğeler klinik bazlı özelleştirilebilir:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {CUSTOMIZATIONS.map(c => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, color: C.text }}>
                  <Check size={13} color="#22c55e" /> {c}
                </div>
              ))}
            </div>
          </Section>

          <Section id="golive" icon={<ArrowRight size={18} />} title="Test ve Canlıya Alma">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {STEPS.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.brandLight, border: `1px solid ${C.brand}40`, color: C.brand, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: C.textSub, paddingTop: 4 }}>{s}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="faq" icon={<HelpCircle size={18} />} title="Sık Sorulan Sorular">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {FAQS.map(f => <FAQItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </Section>

        </main>

        {/* Sidebar */}
        <aside className="guide-sidebar" style={{ position: "sticky", top: 80, padding: "48px 0" }}>
          <div style={{ padding: "18px 16px", borderRadius: 14, background: C.surface, border: `1px solid ${C.border}` }}>
            <p style={{ margin: "0 0 14px", fontSize: 12, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em" }}>İçindekiler</p>
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {NAV_ITEMS.map(n => (
                <a key={n.id} href={`#${n.id}`} style={{ padding: "7px 10px", borderRadius: 8, fontSize: 13, color: C.textSub, textDecoration: "none" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = C.surfaceHigh; (e.currentTarget as HTMLAnchorElement).style.color = C.text; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = C.textSub; }}
                >
                  {n.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "32px 24px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 13, color: C.textSub }}>
          © {new Date().getFullYear()} ClinicBridge AI — Tüm hakları saklıdır.
          <span style={{ margin: "0 12px", opacity: 0.3 }}>|</span>
          <a href="https://clinicbridge-ai.com" target="_blank" rel="noopener noreferrer" style={{ color: C.brand, textDecoration: "none" }}>clinicbridge-ai.com</a>
        </p>
      </footer>

      {/* E-posta Modal */}
      {showEmailModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }} onClick={() => setShowEmailModal(false)} />
          <div style={{ position: "relative", width: "100%", maxWidth: 600, background: C.surface, borderRadius: 18, border: `1px solid ${C.border}`, boxShadow: "0 32px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Web Ekibine Gönderilecek Kısa Metin</h3>
              <button onClick={() => setShowEmailModal(false)} style={{ background: "none", border: "none", color: C.textSub, cursor: "pointer", padding: 4, display: "flex", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: 24, maxHeight: "60vh", overflowY: "auto" }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.75, color: C.textSub, fontFamily: "inherit", userSelect: "text" }}>{EMAIL_TEXT}</pre>
            </div>
            <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowEmailModal(false)} style={{ padding: "8px 18px", borderRadius: 8, background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.textSub, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Kapat</button>
              <button onClick={copyEmail} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, background: emailCopied ? "#22c55e" : C.brand, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 0.2s" }}>
                {emailCopied ? <><Check size={14} /> Kopyalandı!</> : <><Copy size={14} /> Metni Kopyala</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
