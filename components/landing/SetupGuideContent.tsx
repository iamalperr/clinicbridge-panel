"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import SetupGuideVideo from "@/components/landing/SetupGuideVideo";

/** Real signup page used after preview CTAs and post-auth continue → /kurulum. */
export const SETUP_SIGNUP_URL = "https://app.clinicbridge-ai.com/kayit";

/** Pass a YouTube or .mp4 URL when ready; empty keeps the hero placeholder. */
export const SETUP_GUIDE_VIDEO_SRC = "https://www.youtube.com/watch?v=cOXqqOgulNo";

const EMBED_EXAMPLE = `<script
  src="https://widget.clinicbridge-ai.com/widget.js"
  data-clinic-id="KLINIK_ID"
  async>
</script>`;

const PREP_ITEMS = [
  "Kliniğinizin web sitesine erişim (WordPress, Wix, Webflow paneli ya da sitenizi yöneten ajansın iletişim bilgisi)",
  "Tedavi listeniz ve varsa fiyat aralıklarınız",
  "Hastaların sık sorduğu 5–10 soru ve cevabı",
  "Canlı destek için WhatsApp numaranız ya da Telegram kullanıcı adınız (isteğe bağlı)",
  "Bildirimlerin gideceği e-posta adresleri ve ekip WhatsApp numaraları",
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Kurulum için yazılımcı gerekir mi?",
    a: "Hayır. Tek satırlık kodu sitenize eklemeniz yeterli. Siteniz ajans tarafından yönetiliyorsa kodu onlara iletebilirsiniz; kurulum sihirbazından ajans e-postasına da gönderebilirsiniz.",
  },
  {
    q: "Asistan hangi dillerde konuşuyor?",
    a: "Çok dilli çalışır; hasta hangi dilde yazarsa o dilde cevap verir.",
  },
  {
    q: "Asistan yanlış bilgi verir mi?",
    a: "Asistan Eğitim sekmesine ve kurulumda verdiğiniz bilgilere dayanır. Bilmediği bir konuda hastayı ekibinize yönlendirir. Tıbbi teşhis koymaz.",
  },
  {
    q: "Hasta acil bir durum yazarsa ne olur?",
    a: "Asistan sohbeti durdurur ve hastayı önce 112'ye (yurt dışındaysa bulunduğu ülkenin acil numarasına) yönlendirir. Bu kural kapatılamaz.",
  },
  {
    q: "Hasta verileri güvende mi?",
    a: (
      <>
        Veriler KVKK&apos;ya uygun şekilde saklanır. WhatsApp ekip bildirimlerinde sağlık bilgisi, hasta telefonu veya e-postası yer almaz.{" "}
        <Link href="/kvkk">KVKK aydınlatma metni</Link>
      </>
    ),
  },
  {
    q: "14 günlük deneme bitince ne olur?",
    a: "Deneme bitince sizden otomatik ücret alınmaz; asistan kapanır. Devam etmek için paket seçersiniz. Deneme sırasında istediğiniz zaman iptal edebilirsiniz.",
  },
  {
    q: "Telefon asistanı da var mı?",
    a: "Evet. Panelde Sesli Yanıt sekmesinden telefon asistanını yapılandırabilirsiniz. Telefon paketlerinde numara yönlendirme desteği sunulur.",
  },
  {
    q: "Takıldığım bir adım olursa?",
    a: (
      <>
        <a href="mailto:info@clinicbridge-ai.com">info@clinicbridge-ai.com</a> adresine yazın ya da sitedeki asistana &quot;kurulum desteği&quot; yazın.
      </>
    ),
  },
];

export default function SetupGuideContent() {
  const [copied, setCopied] = useState(false);

  async function copyEmbed() {
    try {
      await navigator.clipboard.writeText(EMBED_EXAMPLE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <section className="lp-hero lp-setup-hero" id="hero">
        <div className="lp-container">
          <h1>ClinicBridge AI&apos;ı kendiniz kurun, bugün yayına alın</h1>
          <p className="lp-hero-subtitle">
            Yabancı hastalarınıza 7/24, kendi dillerinde yanıt veren asistanı birkaç adımda kurun. Kod bilgisi gerekmez, ilk 14 gün ücretsiz.
          </p>
          <SetupGuideVideo src={SETUP_GUIDE_VIDEO_SRC} />
          <div className="lp-hero-ctas">
            <a className="lp-btn lp-btn-primary" href={SETUP_SIGNUP_URL}>
              14 gün ücretsiz başla
            </a>
            <a className="lp-btn lp-btn-secondary" href="#adim-1">
              Adım adım rehber ↓
            </a>
          </div>
          <p className="lp-setup-trust">Kredi kartı gerekmez · KVKK uyumlu · İstediğiniz zaman iptal</p>
        </div>
      </section>

      <section className="lp-section lp-section-alt" id="hazirlik">
        <div className="lp-container lp-setup-narrow">
          <h2 className="lp-section-title">Başlamadan önce hazırlayın</h2>
          <p className="lp-section-subtitle">Yaklaşık 2 dakika. Bunlar elinizdeyken kurulum daha hızlı biter.</p>
          <ul className="lp-setup-checklist">
            {PREP_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lp-section" id="adimlar">
        <div className="lp-container lp-setup-narrow">
          <h2 className="lp-section-title">Adım adım kurulum</h2>
          <p className="lp-section-subtitle">
            Kayıttan sonra paneldeki kurulum sihirbazı (Bilgiler → Randevu → Kurulum) sizi karşılar. Aşağıdaki adımlar sihirbazı ve panel sekmelerini birlikte anlatır.
          </p>

          <article className="lp-setup-step" id="adim-1">
            <h3>Adım 1: Hesabınızı açın</h3>
            <ol>
              <li>
                <a href={SETUP_SIGNUP_URL}>Kayıt sayfasında</a> hesabınızı oluşturun.
              </li>
              <li>
                Ad soyad, klinik adı, e-posta, şifre ve telefon girin; Kullanım Şartları, Mesafeli Satış Sözleşmesi ve KVKK onaylarını işaretleyin.
              </li>
              <li>
                Hesap oluşunca 14 günlük deneme başlar (ödeme şimdi alınmaz). &quot;Kuruluma geç&quot; ile kurulum sihirbazına ilerlersiniz.
              </li>
            </ol>
          </article>

          <article className="lp-setup-step" id="adim-2">
            <h3>Adım 2: Bilgileri girin (kurulum sihirbazı)</h3>
            <p>Sihirbazın <strong>1. Bilgiler</strong> adımında:</p>
            <ul>
              <li>Tedaviler ve varsa fiyat aralıkları</li>
              <li>Çalışma saatleri</li>
              <li>Sık sorulan sorular ve cevapları</li>
              <li>Botun söylememesi gerekenler (ör. fiyat uydurma, teşhis, indirim sözü)</li>
            </ul>
            <p>
              İpucu: Sitenizdeki tedavi sayfalarının metnini kopyalamanız yeterli. Asistan yalnızca verdiğiniz bilgilere dayanarak cevap verir.
            </p>
            <p>
              Sihirbazdan sonra panelde <strong>Ayarlar</strong> sekmesinden klinik adı, Klinik Domain ve Asistan Durumu&apos;nu (Aktif) yönetebilirsiniz. Devam eden bilgi eklemek için <strong>Eğitim</strong> sekmesini kullanın.
            </p>
          </article>

          <article className="lp-setup-step" id="adim-3">
            <h3>Adım 3: Üslup ve kurallar</h3>
            <ul>
              <li>
                <strong>Prompt Studio:</strong> Sistem talimatı, karşılama mesajı, yedek mesaj ve kalite kriterleri.
              </li>
              <li>
                <strong>AI Kuralları:</strong> Guardrail&apos;ler (teşhis koymama, acil yönlendirme, gizlilik) ve beceriler. Acil durum yönlendirmesi kapatılamaz.
              </li>
              <li>
                Asistan görünen adı <strong>Web Widget</strong> ayarlarından düzenlenir.
              </li>
            </ul>
            <p className="lp-setup-note">
              Güvenlik: Hasta acil bir durum yazdığında asistan önce 112&apos;ye (yurt dışındaysa bulunduğu ülkenin acil numarasına) yönlendirir.
            </p>
          </article>

          <article className="lp-setup-step" id="adim-4">
            <h3>Adım 4: Canlı destek ve bildirimler</h3>
            <p>
              Sihirbazın <strong>2. Randevu</strong> adımında randevu taleplerinin gideceği e-posta veya WhatsApp numarasını girin (en az biri zorunlu).
            </p>
            <p>
              <strong>Ayarlar → İletişim Kanalları:</strong> Hasta canlı destek düğmeleri için WhatsApp numarası ve/veya Telegram kullanıcı adı.
            </p>
            <p>
              <strong>Ayarlar → Canlı Destek &amp; İletişim:</strong> &quot;Canlı Desteğe Aktarım (Human Handoff)&quot; ayarını açın. Hasta canlı destek istediğinde asistan WhatsApp/Telegram düğmeleri gösterir.
            </p>
            <p>
              <strong>Ayarlar → Bildirimler</strong> (Hasta Bildirimleri):
            </p>
            <ul>
              <li>
                <strong>Klinik Ekibi Bildirimleri:</strong> Yeni randevu e-posta alıcılarını ekleyin; test e-postası gönderebilirsiniz.
              </li>
              <li>
                <strong>WhatsApp Bildirimleri (Klinik Ekibi):</strong> Ekip numaralarını ekleyin, onay kutusunu işaretleyin ve kaydedin. Mesajlar &quot;Clinic Bridge AI&quot; adıyla gider; sağlık bilgisi, hasta telefonu veya e-postası içermez.
              </li>
            </ul>
          </article>

          <article className="lp-setup-step" id="adim-5">
            <h3>Adım 5: Asistanı sitenize ekleyin</h3>
            <p>
              Sihirbazın <strong>3. Kurulum</strong> adımından veya panel <strong>Web Widget</strong> sekmesinden size özel kodu kopyalayın. Kod şuna benzer:
            </p>
            <div className="lp-setup-embed">
              <pre>{EMBED_EXAMPLE}</pre>
              <button type="button" className="lp-btn lp-btn-secondary" onClick={() => void copyEmbed()}>
                {copied ? "Kopyalandı" : "Kodu kopyala"}
              </button>
            </div>
            <p>Bu kodu sitenizin tüm sayfalarında, <code>&lt;/body&gt;</code> etiketinden hemen önce ekleyin:</p>
            <div className="lp-setup-table-wrap">
              <table className="lp-setup-table">
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Nereye eklenir</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>WordPress</td>
                    <td>
                      Ayarlar → Tema Dosya Düzenleyici veya bir üst bilgi / footer kod eklentisi. Örneğin WPCode gibi bir &quot;Header &amp; Footer&quot; eklentisiyle Footer alanına yapıştırın. Kodu kapanış <code>&lt;/body&gt;</code> öncesine ekleyin.
                    </td>
                  </tr>
                  <tr>
                    <td>Wix</td>
                    <td>
                      Ayarlar → Gelişmiş → Özel Kod → Body – end → tüm sayfalar. Wix&apos;te özel kod eklemek ücretli plan ve bağlı alan adı gerektirir.
                    </td>
                  </tr>
                  <tr>
                    <td>Webflow</td>
                    <td>Site settings → Custom code → Footer code → Save → Publish.</td>
                  </tr>
                  <tr>
                    <td>Özel site / ajans</td>
                    <td>
                      Sihirbazdaki &quot;Web ajansıma gönder&quot; ile kodu e-posta ile iletin veya: &quot;Tüm sayfalarda <code>&lt;/body&gt;</code> öncesine eklenecek.&quot;
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article className="lp-setup-step" id="adim-6">
            <h3>Adım 6: Test edin</h3>
            <ol>
              <li>Sitenizi gizli pencerede açın. Sağ altta asistan düğmesi görünmeli.</li>
              <li>
                Şunları deneyin:
                <ul>
                  <li>Türkçe: &quot;İmplant tedavisi ne kadar sürüyor?&quot;</li>
                  <li>Başka bir dilde: &quot;Wie lange dauert eine Implantatbehandlung?&quot;</li>
                  <li>&quot;canlı destek&quot; yazın → WhatsApp/Telegram düğmeleri çıkmalı (kanalları açtıysanız).</li>
                  <li>Bir randevu talebi oluşturun → e-postanıza (ve açtıysanız ekip WhatsApp&apos;ına) bildirim gelmeli.</li>
                </ul>
              </li>
              <li>
                Panelde <strong>Görüşme Kayıtları</strong> ve <strong>Randevular</strong> sekmelerinde testinizi görün.
              </li>
            </ol>
            <p>Bitti. Asistanınız artık 7/24 yayında.</p>
          </article>
        </div>
      </section>

      <section className="lp-section lp-section-alt" id="sss">
        <div className="lp-container lp-faq">
          <h2 className="lp-section-title">Sık sorulan sorular</h2>
          <div className="lp-faq-list">
            {FAQ.map((item) => (
              <div key={item.q}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="son-cagri">
        <div className="lp-container" style={{ textAlign: "center" }}>
          <h2 className="lp-section-title">Bu gece gelen yabancı hasta mesajı cevapsız kalmasın</h2>
          <a className="lp-btn lp-btn-primary" href={SETUP_SIGNUP_URL}>
            14 gün ücretsiz başla
          </a>
        </div>
      </section>
    </>
  );
}
