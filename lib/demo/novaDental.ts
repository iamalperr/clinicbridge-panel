import type { ClinicWeek } from "@/lib/preview/clinicHours";
import type { PreviewKnowledgeItem } from "@/lib/preview/types";
import type { PreviewUiLanguage } from "@/lib/preview/previewLanguage";

export const NOVA_CLINIC_NAME = "Nova Dental";
export const NOVA_PRIMARY_COLOR = "#0f766e";
export const NOVA_ADDRESS = "Teşvikiye Caddesi No: 48, Nişantaşı, Şişli, İstanbul";
export const NOVA_WHATSAPP = "+90 532 100 20 30";
export const NOVA_HOURS_TEXT = "Pazartesi–Cuma 09:00–19:00, Cumartesi 10:00–16:00";

export const NOVA_WEEK: ClinicWeek = {
  1: { start: 9 * 60, end: 19 * 60 },
  2: { start: 9 * 60, end: 19 * 60 },
  3: { start: 9 * 60, end: 19 * 60 },
  4: { start: 9 * 60, end: 19 * 60 },
  5: { start: 9 * 60, end: 19 * 60 },
  6: { start: 10 * 60, end: 16 * 60 },
};

export interface NovaDoctor {
  name: string;
  years: number;
  languages: string[];
  specialty: Record<PreviewUiLanguage, string>;
}

export interface NovaTreatment {
  id: string;
  name: Record<PreviewUiLanguage, string>;
  price: string;
  duration: Record<PreviewUiLanguage, string>;
  trips: Record<PreviewUiLanguage, string>;
  aliases: string[];
}

export const NOVA_DOCTORS: NovaDoctor[] = [
  {
    name: "Dr. Selin Acar",
    years: 14,
    languages: ["TR", "EN", "DE"],
    specialty: {
      tr: "İmplantoloji",
      en: "Implantology",
      de: "Implantologie",
      ar: "زراعة الأسنان",
      ru: "Имплантология",
    },
  },
  {
    name: "Dr. Kerem Yıldız",
    years: 11,
    languages: ["TR", "EN", "RU"],
    specialty: {
      tr: "Estetik diş hekimliği",
      en: "Aesthetic dentistry",
      de: "Ästhetische Zahnmedizin",
      ar: "طب الأسنان التجميلي",
      ru: "Эстетическая стоматология",
    },
  },
  {
    name: "Dr. Maya Hartmann",
    years: 9,
    languages: ["DE", "EN", "TR"],
    specialty: {
      tr: "Protez ve zirkonyum",
      en: "Prosthodontics and zirconia",
      de: "Prothetik und Zirkon",
      ar: "التركيبات والزركون",
      ru: "Ортопедия и цирконий",
    },
  },
];

export const NOVA_TREATMENTS: NovaTreatment[] = [
  {
    id: "implant",
    name: { tr: "İmplant", en: "Implant", de: "Implantat", ar: "زراعة", ru: "Имплант" },
    price: "450–750 €",
    duration: {
      tr: "Cerrahi bir gün sürer. Kalıcı diş için 3–4 ay iyileşme beklenir.",
      en: "Surgery takes one day. The final tooth is fitted after 3–4 months of healing.",
      de: "Die Operation dauert einen Tag. Der endgültige Zahn folgt nach 3–4 Monaten Heilung.",
      ar: "تستغرق الجراحة يوماً واحداً. يُركَّب السن النهائي بعد 3–4 أشهر من الشفاء.",
      ru: "Операция занимает один день. Постоянный зуб устанавливается через 3–4 месяца.",
    },
    trips: {
      tr: "İki seyahat: cerrahi ve kalıcı diş.",
      en: "Two trips: surgery, then the final tooth.",
      de: "Zwei Reisen: Operation und später der endgültige Zahn.",
      ar: "رحلتان: الجراحة ثم السن النهائي.",
      ru: "Две поездки: операция и затем постоянный зуб.",
    },
    aliases: ["implant", "implantat", "имплант", "زراعة"],
  },
  {
    id: "zirconia",
    name: { tr: "Zirkonyum kaplama", en: "Zirconia crown", de: "Zirkonkrone", ar: "تلبيسة زركون", ru: "Циркониевая коронка" },
    price: "180–280 €",
    duration: {
      tr: "Ölçü ve prova ile 5–7 gün.",
      en: "Five to seven days, including try-in.",
      de: "Fünf bis sieben Tage inklusive Anprobe.",
      ar: "من 5 إلى 7 أيام مع جلسة التجربة.",
      ru: "5–7 дней, включая примерку.",
    },
    trips: {
      tr: "Tek seyahat yeterlidir.",
      en: "One trip is enough.",
      de: "Eine Reise genügt.",
      ar: "رحلة واحدة كافية.",
      ru: "Достаточно одной поездки.",
    },
    aliases: ["zirkon", "zirconia", "zircon", "zirkonyum", "crown"],
  },
  {
    id: "veneer",
    name: { tr: "Lamina", en: "Veneer", de: "Veneer", ar: "عدسة تجميلية", ru: "Винир" },
    price: "220–360 €",
    duration: {
      tr: "Hazırlık ve yapıştırma 5–7 gün sürer.",
      en: "Preparation and bonding take 5–7 days.",
      de: "Vorbereitung und Befestigung dauern 5–7 Tage.",
      ar: "يستغرق التحضير والتثبيت 5–7 أيام.",
      ru: "Подготовка и фиксация занимают 5–7 дней.",
    },
    trips: {
      tr: "Tek seyahat yeterlidir.",
      en: "One trip is enough.",
      de: "Eine Reise genügt.",
      ar: "رحلة واحدة كافية.",
      ru: "Достаточно одной поездки.",
    },
    aliases: ["lamina", "veneer", "veneers"],
  },
  {
    id: "hollywood",
    name: { tr: "Hollywood smile paketi", en: "Hollywood smile package", de: "Hollywood-Smile-Paket", ar: "باقة ابتسامة هوليود", ru: "Пакет Hollywood smile" },
    price: "3.200–6.400 €",
    duration: {
      tr: "Tasarım, prova ve yapıştırma 6–8 gün sürer.",
      en: "Design, try-in and bonding take 6–8 days.",
      de: "Design, Anprobe und Befestigung dauern 6–8 Tage.",
      ar: "يستغرق التصميم والتجربة والتثبيت 6–8 أيام.",
      ru: "Дизайн, примерка и фиксация занимают 6–8 дней.",
    },
    trips: {
      tr: "Tek seyahatte tamamlanır.",
      en: "It is completed in one trip.",
      de: "Es wird in einer Reise abgeschlossen.",
      ar: "تُنجز في رحلة واحدة.",
      ru: "Завершается за одну поездку.",
    },
    aliases: ["hollywood", "هوليود", "голливуд"],
  },
  {
    id: "whitening",
    name: { tr: "Diş beyazlatma", en: "Teeth whitening", de: "Zahnaufhellung", ar: "تبييض الأسنان", ru: "Отбеливание зубов" },
    price: "150–250 €",
    duration: {
      tr: "Aynı gün, yaklaşık bir saat.",
      en: "The same day, about one hour.",
      de: "Am selben Tag, etwa eine Stunde.",
      ar: "في اليوم نفسه، حوالي ساعة.",
      ru: "В тот же день, около часа.",
    },
    trips: {
      tr: "Tek seyahat yeterlidir.",
      en: "One trip is enough.",
      de: "Eine Reise genügt.",
      ar: "رحلة واحدة كافية.",
      ru: "Достаточно одной поездки.",
    },
    aliases: ["beyazlat", "whitening", "bleaching", "aufhell", "отбел"],
  },
  {
    id: "allon4",
    name: { tr: "All-on-4", en: "All-on-4", de: "All-on-4", ar: "All-on-4", ru: "All-on-4" },
    price: "4.800–7.200 €",
    duration: {
      tr: "Cerrahi günü geçici diş takılır. Kalıcı protez 3–4 ay sonra hazır olur.",
      en: "A temporary bridge is fitted on surgery day. The final prosthesis is ready after 3–4 months.",
      de: "Am Operationstag wird ein Provisorium eingesetzt. Die endgültige Prothese folgt nach 3–4 Monaten.",
      ar: "يُركَّب جسر مؤقت يوم الجراحة. يصبح التعويض النهائي جاهزاً بعد 3–4 أشهر.",
      ru: "В день операции ставится временный мост. Постоянный протез готов через 3–4 месяца.",
    },
    trips: {
      tr: "İki seyahat gerekir.",
      en: "Two trips are needed.",
      de: "Zwei Reisen sind nötig.",
      ar: "يلزم القيام برحلتين.",
      ru: "Нужны две поездки.",
    },
    aliases: ["all-on-4", "all on 4", "all-on-four"],
  },
];

export const NOVA_FAQS: { question: string; answer: string }[] = [
  { question: "İmplant cerrahisi ağrılı mı?", answer: "İşlem lokal anestezi ile yapılır. İlk 2–3 gün hafif şişlik ve sızı olağandır; ağrı kesici yeterlidir." },
  { question: "İyileşme ne kadar sürer?", answer: "İmplant kemiğe 3–4 ayda bağlanır. Kaplama ve lamina sonrası günlük hayata ertesi gün dönülür." },
  { question: "Uçuştan önce ne yapmalıyım?", answer: "Uzun uçuştan bir gün önce ağır işlem planlanmaz. Kan sulandırıcı kullanıyorsanız bunu konsültasyonda söyleyin." },
  { question: "Uçuştan sonra ne zaman dönebilirim?", answer: "Beyazlatma ve kaplama sonrası ertesi gün uçulabilir. İmplant cerrahisinden 48 saat sonra uçmak uygundur." },
  { question: "Röntgeni nasıl gönderirim?", answer: "Panoramik röntgen veya tomografiyi WhatsApp’tan gönderebilirsiniz. Ücretsiz online konsültasyon bu filme göre yapılır." },
  { question: "Online konsültasyon ücretli mi?", answer: "İlk online konsültasyon ücretsizdir. Film ve fotoğraf yeterlidir; kesin plan muayenede netleşir." },
  { question: "Kaç gün İstanbul’da kalmalıyım?", answer: "Beyazlatma bir gündür. Kaplama ve lamina 5–7, Hollywood smile 6–8 gün sürer. İmplant iki ayrı seyahat ister." },
  { question: "Havalimanı transferi var mı?", answer: "Hollywood smile ve All-on-4 paketlerinde havalimanı transferi vardır. Diğer tedavilerde transfer ayrıca ayarlanır." },
  { question: "Anlaşmalı otel var mı?", answer: "Şişli ve Nişantaşı çevresinde anlaşmalı oteller vardır. Konaklama fiyata dahil değildir." },
  { question: "Tercüman eşlik ediyor mu?", answer: "Tedavi günlerinde İngilizce, Almanca, Arapça ve Rusça tercüman bulunur." },
  { question: "Garanti süresi nedir?", answer: "İmplant gövdesi 10 yıl, kaplama ve lamina 5 yıl garantilidir. Garanti travma ve diş sıkmayı kapsamaz." },
  { question: "Nasıl ödeme yapabilirim?", answer: "Nakit, kredi kartı ve havale kabul edilir. Euro, sterlin ve dolar ile ödeme yapılabilir." },
  { question: "Fiyat neden aralık olarak veriliyor?", answer: "Kemik durumu, diş sayısı ve malzeme seçimi fiyatı değiştirir. Aralık, online film incelemesine göredir." },
  { question: "Sigara iyileşmeyi etkiler mi?", answer: "Sigara implant iyileşmesini yavaşlatır. Cerrahiden bir hafta önce ve sonra ara vermeniz istenir." },
  { question: "All-on-4 aynı gün diş verir mi?", answer: "Evet. Cerrahi günü geçici sabit diş takılır. Kalıcı protez iyileşme bitince yapılır." },
  { question: "Çocuklar için tedavi yapıyor musunuz?", answer: "Nova Dental erişkin estetik ve implant tedavisi yapar. Çocuk ortodontisi bu listede yoktur." },
];

const PACKAGES: Record<PreviewUiLanguage, string> = {
  tr: "Hollywood smile ve All-on-4 paketlerinde havalimanı transferi vardır. Şişli ve Nişantaşı’nda anlaşmalı oteller bulunur. Tedavi günlerinde İngilizce, Almanca, Arapça ve Rusça tercüman eşlik eder.",
  en: "Airport transfer is included with the Hollywood smile and All-on-4 packages. Partner hotels are in Şişli and Nişantaşı. An interpreter for English, German, Arabic and Russian is available on treatment days.",
  de: "Flughafentransfer ist in den Paketen Hollywood Smile und All-on-4 enthalten. Partnerhotels liegen in Şişli und Nişantaşı. An Behandlungstagen gibt es Dolmetscher für Englisch, Deutsch, Arabisch und Russisch.",
  ar: "يشمل نقل المطار باقة ابتسامة هوليود وAll-on-4. توجد فنادق متعاقدة في شيشلي ونيشانتاشي. يتوفر مترجم للإنجليزية والألمانية والعربية والروسية في أيام العلاج.",
  ru: "Трансфер из аэропорта входит в пакеты Hollywood smile и All-on-4. Отели-партнёры находятся в Шишли и Нишанташи. В дни лечения есть переводчик на английский, немецкий, арабский и русский.",
};

const GUARANTEE: Record<PreviewUiLanguage, string> = {
  tr: "İmplant gövdesi 10 yıl, kaplama ve lamina 5 yıl garantilidir.",
  en: "The implant fixture is guaranteed for 10 years. Crowns and veneers are guaranteed for 5 years.",
  de: "Der Implantatkörper hat 10 Jahre Garantie, Kronen und Veneers 5 Jahre.",
  ar: "جسم الزراعة مضمون لمدة 10 سنوات، والتيجان والعدسات لمدة 5 سنوات.",
  ru: "Тело импланта гарантировано 10 лет, коронки и виниры — 5 лет.",
};

const PAYMENT: Record<PreviewUiLanguage, string> = {
  tr: "Nakit, kredi kartı ve havale kabul edilir. Euro, sterlin ve dolar ile ödeme yapılabilir.",
  en: "Cash, card and bank transfer are accepted, in euro, sterling or dollars.",
  de: "Bar, Karte und Überweisung werden akzeptiert, in Euro, Pfund oder Dollar.",
  ar: "يُقبل الدفع نقداً أو بالبطاقة أو بالتحويل، باليورو أو الجنيه أو الدولار.",
  ru: "Принимаются наличные, карта и перевод, в евро, фунтах или долларах.",
};

const HOURS: Record<PreviewUiLanguage, string> = {
  tr: `Çalışma saatleri ${NOVA_HOURS_TEXT}. Pazar kapalıyız. Adres: ${NOVA_ADDRESS}. WhatsApp: ${NOVA_WHATSAPP}.`,
  en: `Opening hours are Monday–Friday 09:00–19:00 and Saturday 10:00–16:00. Closed on Sunday. Address: ${NOVA_ADDRESS}. WhatsApp: ${NOVA_WHATSAPP}.`,
  de: `Öffnungszeiten: Montag–Freitag 09:00–19:00, Samstag 10:00–16:00. Sonntag geschlossen. Adresse: ${NOVA_ADDRESS}. WhatsApp: ${NOVA_WHATSAPP}.`,
  ar: `ساعات العمل من الاثنين إلى الجمعة 09:00–19:00 والسبت 10:00–16:00. الأحد مغلق. العنوان: ${NOVA_ADDRESS}. واتساب: ${NOVA_WHATSAPP}.`,
  ru: `Часы работы: пн–пт 09:00–19:00, сб 10:00–16:00. Воскресенье выходной. Адрес: ${NOVA_ADDRESS}. WhatsApp: ${NOVA_WHATSAPP}.`,
};

export function novaKnowledgeItems(): PreviewKnowledgeItem[] {
  const doctors = NOVA_DOCTORS.map((doctor) => `${doctor.name}, ${doctor.specialty.tr}, ${doctor.years} yıl, ${doctor.languages.join(", ")}`).join("\n");
  const treatments = NOVA_TREATMENTS.map((item) => `${item.name.tr}: ${item.price}. ${item.duration.tr} ${item.trips.tr}`).join("\n");
  return [
    {
      title: NOVA_CLINIC_NAME,
      category: "Klinik Genel Bilgi",
      language: "TR",
      content: [`${NOVA_CLINIC_NAME}, ${NOVA_ADDRESS}.`, `WhatsApp: ${NOVA_WHATSAPP}.`, HOURS.tr, PACKAGES.tr, GUARANTEE.tr, PAYMENT.tr, doctors].join("\n"),
    },
    { title: "Tedaviler", category: "Tedaviler", language: "TR", content: treatments },
    { title: "Çalışma saatleri", category: "Çalışma Saatleri", language: "TR", content: HOURS.tr },
    ...NOVA_FAQS.map((item) => ({
      title: item.question,
      category: "Sık Sorulan Sorular" as const,
      language: "TR" as const,
      content: `${item.question}\n${item.answer}`,
    })),
  ];
}

function mentions(text: string, words: string[]): boolean {
  const folded = text.toLocaleLowerCase("tr-TR");
  return words.some((word) => folded.includes(word));
}

export function novaAnswer(message: string, language: PreviewUiLanguage): string | null {
  const text = message.toLocaleLowerCase("tr-TR");
  const doctors = mentions(text, ["doktor", "doctor", "arzt", "ärzte", "врач", "طبيب", "أطب"]);
  const prices = mentions(text, ["fiyat", "price", "preis", "kosten", "how much", "сколько", "цена", "سعر", "أسعار", "كم"]);
  const duration = mentions(text, ["wie lange", "ne kadar", "how long", "kaç gün", "kaç seyahat", "сколько", "كم يوم", "bleiben"]);
  const hours = mentions(text, ["saat", "hours", "öffnung", "çalışma", "адрес", "address", "adres", "whatsapp", "واتساب"]);
  const packages = mentions(text, ["transfer", "otel", "hotel", "tercüman", "interpreter", "dolmetsch", "مترجم", "перевод"]);
  const guarantee = mentions(text, ["garanti", "guarantee", "garantie", "ضمان", "гарант"]);
  const payment = mentions(text, ["ödeme", "payment", "zahlung", "دفع", "оплат"]);
  const treatment = NOVA_TREATMENTS.find((item) => item.aliases.some((alias) => text.includes(alias)));

  if (doctors) {
    const intro = language === "tr" ? "Hekimlerimiz:" : language === "de" ? "Unsere Ärztinnen und Ärzte:" : language === "ar" ? "أطباؤنا:" : language === "ru" ? "Наши врачи:" : "Our dentists:";
    const lines = NOVA_DOCTORS.map((doctor) => `${doctor.name} — ${doctor.specialty[language]}, ${doctor.years} ${language === "tr" ? "yıl" : language === "de" ? "Jahre" : language === "ar" ? "سنوات" : language === "ru" ? "лет" : "years"} (${doctor.languages.join(", ")})`);
    return [intro, ...lines].join("\n");
  }
  if (treatment && (prices || duration)) {
    return `${treatment.name[language]}: ${treatment.price}. ${treatment.duration[language]} ${treatment.trips[language]}`;
  }
  if (prices) {
    const intro = language === "tr" ? "Fiyat aralıkları:" : language === "de" ? "Preisrahmen:" : language === "ar" ? "نطاقات الأسعار:" : language === "ru" ? "Диапазоны цен:" : "Price ranges:";
    return [intro, ...NOVA_TREATMENTS.map((item) => `${item.name[language]}: ${item.price}`)].join("\n");
  }
  if (treatment && duration) return `${treatment.name[language]}. ${treatment.duration[language]} ${treatment.trips[language]}`;
  if (packages) return PACKAGES[language];
  if (guarantee) return GUARANTEE[language];
  if (payment) return PAYMENT[language];
  if (hours) return HOURS[language];
  const faq = NOVA_FAQS.find((item) => {
    const words = item.question.toLocaleLowerCase("tr-TR").split(/\s+/).filter((word) => word.length > 4);
    return words.filter((word) => text.includes(word)).length >= 2;
  });
  if (faq) return `${faq.answer}`;
  return null;
}
