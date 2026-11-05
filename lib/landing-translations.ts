"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

const tr = {
  nav: {
    solutions: "Çözümler",
    features: "Özellikler",
    howItWorks: "Nasıl Çalışır",
    pricing: "Fiyatlandırma",
    about: "Hakkımızda",
    benefits: "Avantajlar",
    contact: "İletişim",
    requestDemo: "Demo Talep Et",
  },
  hero: {
    badge: "Yapay Zekâ Destekli Hasta İletişim Platformu",
    title: "Hastalarınızla Her Kanaldan İletişim Kurabilen Yapay Zekâ",
    subtitle:
      "ClinicBridge AI, web sitenizden gelen mesajları ve telefon aramalarını yapay zekâ destekli asistanlarla karşılar. Hasta sorularını yanıtlar, randevu taleplerini toplar ve kliniğinizin iletişim süreçlerini 7/24 destekler.",
    ctaPrimary: "Demo Talep Et",
    ctaSecondary: "Çözümleri İncele",
    scanLabel: "Sitenizin adresini girin, botunuzu 2 dakikada görün",
    scanPlaceholder: "https://kliniginiz.com",
    scanSubmit: "Botumu gör",
    scanReading: "Siteniz okunuyor…",
    scanExtracting: "Tedaviler çıkarılıyor…",
    scanInvalid: "Bu adres geçerli görünmüyor. Klinik sitenizin adresini girin, örneğin www.kliniginiz.com.",
    scanUnreachable: "Site açılmadı. Adresi kontrol edip yeniden deneyin.",
    scanTimeout: "Site zamanında yanıt vermedi. Biraz sonra yeniden deneyin.",
    scanLimited: "Bu adresten çok fazla deneme yapıldı. Bir saat sonra yeniden deneyin.",
    scanEmpty: "Siteden okunabilir bir sayfa bulamadık.",
    scanUnavailable: "Tarama şu an tamamlanamadı. Biraz sonra yeniden deneyin.",
    channelWeb: "Web Sitesi Asistanı",
    channelPhone: "Telefon Asistanı",
    phoneStatus: "Görüşme devam ediyor",
    phoneCaller: "Hasta araması",
    chatMessages: [
      "İmplant fiyatları hakkında bilgi alabilir miyim?",
      "En yakın randevu ne zaman?",
      "Diş beyazlatma işlemi ne kadar sürer?",
    ],
    chatResponses: [
      "Tabii! İmplant tedavimiz 15.000₺'den başlayan fiyatlarla sunulmaktadır. Size özel fiyat teklifi için randevu oluşturabilirim.",
      "En yakın müsait randevumuz yarın saat 14:00'te. Randevu oluşturmamı ister misiniz?",
      "Diş beyazlatma işlemi ortalama 45-60 dakika sürmektedir. Detaylı bilgi için randevu alabilirsiniz.",
    ],
    phoneLines: [
      "Merhaba, kliniğimize hoş geldiniz. Size nasıl yardımcı olabilirim?",
      "Randevu talebinizi not aldım. Ekibimiz en kısa sürede sizi arayacak.",
      "Tedavi süreciniz hakkında kısaca bilgi verebilirim.",
    ],
  },
  problem: {
    title: "Klinikler Her Gün Aynı Sorularla Zaman Kaybediyor",
    cards: [
      { icon: "repeat", title: "Tekrarlayan Hasta Soruları", desc: "Aynı soruları defalarca yanıtlamak ekibinizin zamanını ve enerjisini tüketir." },
      { icon: "phone-missed", title: "Cevapsız Telefon Aramaları", desc: "Yoğunlukta veya mesai dışında gelen aramalar yanıtsız kalır; potansiyel hastalar kaybedilir." },
      { icon: "clock", title: "Geç Dönüş Yapılan Mesajlar", desc: "WhatsApp ve web formlarına geç yanıt, hastanın başka bir kliniğe yönelmesine neden olur." },
      { icon: "trending-down", title: "Düşük Dönüşüm Oranı", desc: "Web sitenizi ziyaret eden veya arayan hastaların büyük çoğunluğu bilgi alamadan ayrılır." },
    ],
  },
  products: {
    title: "Kliniğiniz İçin İki Akıllı Asistan, Tek Platform",
    subtitle:
      "ClinicBridge AI, yapay zekâ destekli hasta iletişim platformudur. Web sitesi asistanı ve telefon asistanı aynı ekosistemde, bağımsız ve eşit önemde çalışan iki temel çözümdür.",
    website: {
      title: "Web Sitesi Asistanı",
      headline: "Web Sitenizdeki Her Ziyaretçiyle İlgilenin",
      desc: "Hastalarınızın sorularını anında yanıtlayan, tedavileriniz hakkında bilgi veren ve randevu taleplerini toplayan yapay zekâ destekli web sitesi asistanı.",
      cta: "Web Sitesi Asistanını Keşfet",
    },
    phone: {
      title: "Telefon Asistanı",
      headline: "Her Aramayı Akıllı Bir Karşılamaya Dönüştürün",
      desc: "Kliniğinize gelen telefon aramalarını doğal sesli görüşmelerle karşılayan, hastalarınızın sorularını yanıtlayan ve randevu taleplerini toplayan yapay zekâ destekli telefon asistanı.",
      cta: "Telefon Asistanını Keşfet",
    },
  },
  solution: {
    title: "Tek Platformda Ortak Yetenekler",
    subtitle:
      "Her iki asistan da aynı klinik bilgi tabanı ve hasta iletişim standartlarıyla çalışır; kanal fark etmeksizin tutarlı yanıtlar ve randevu talepleri sunar.",
    features: [
      { icon: "clock-24", title: "7/24 Hasta Karşılama", desc: "Gece gündüz fark etmez, web ve telefon üzerinden her hasta anında karşılanır." },
      { icon: "stethoscope", title: "Tedavi Bazlı Soru-Cevap", desc: "İmplant, ortodonti, estetik gibi tedaviler hakkında detaylı ve doğru bilgi sunar." },
      { icon: "message-circle", title: "WhatsApp / Telegram Yönlendirme", desc: "Hasta hazır olduğunda doğrudan WhatsApp veya Telegram üzerinden iletişime geçirilir." },
      { icon: "calendar-check", title: "Randevu Talebi Toplama", desc: "Asistan, hastadan gerekli bilgileri alarak randevu talebini oluşturur." },
      { icon: "database", title: "Klinik Özelinde Bilgi Tabanı", desc: "Her klinik için özel eğitilmiş bilgi tabanı ile doğru ve tutarlı yanıtlar verir." },
      { icon: "globe", title: "Çok Dilli Kullanım Altyapısı", desc: "Türkçe, İngilizce, Almanca ve daha fazla dilde hasta iletişimi sağlar." },
    ],
  },
  journey: {
    title: "Hasta İletişimini Her Kanalda Akıllı Hale Getirin",
    subtitle:
      "ClinicBridge AI, kliniğinizin tonu, hizmetleri ve hasta karşılama yaklaşımına göre eğitilir. Ziyaretçiler ve arayanlar standart bir bot ile değil, kliniğinize özel dijital asistanlarla iletişim kurar.",
    steps: [
      { title: "İlk Temas", desc: "Hasta web sitenizi ziyaret eder veya kliniğinizi arar; ilk temas noktasına ulaşır." },
      { title: "Kliniğe Özel Asistanla Etkileşim", desc: "Ziyaretçi veya arayan, kliniğinizin iletişim tonuna ve hizmet yapısına göre eğitilmiş yapay zekâ asistanıyla konuşur." },
      { title: "Güven Veren Hizmet Bilgisi", desc: "Asistan; tedaviler, süreçler, sık sorulan sorular ve yönlendirme adımları hakkında anlaşılır bilgiler sunar." },
      { title: "Akıllı Yönlendirme", desc: "Hastanın ihtiyacına göre randevu, WhatsApp veya canlı ekip yönlendirmesi yapılır." },
      { title: "Kayıt Altına Alınan Dönüşüm", desc: "Klinik yeni hasta talebini kaçırmaz; her görüşme takip edilebilir ve aksiyona dönüştürülebilir hale gelir." },
    ],
    highlightCard: {
      title: "Standart bot değil, kliniğinizin dijital hasta danışmanı.",
      desc: "Her klinik için ayrı yapılandırılır. Hizmetlerinizi, hasta karşılama dilinizi ve sık sorulan sorularınızı öğrenerek markanıza uygun yanıtlar verir — web ve telefonda.",
    },
  },
  useCases: {
    title: "En Çok Sorulan Soruları Otomatik Yanıtlayın",
    subtitle: "Hastalarınızın en sık sorduğu sorulara anında, doğru ve tutarlı yanıtlar verin — web sitesinde ve telefonda.",
    categories: [
      { icon: "implant", label: "İmplant Fiyatları" },
      { icon: "sparkle", label: "Diş Beyazlatma Süreci" },
      { icon: "braces", label: "Ortodonti Tedavisi" },
      { icon: "calendar", label: "Randevu Uygunluğu" },
      { icon: "map-pin", label: "Konum ve Ulaşım" },
      { icon: "plane", label: "Sağlık Turizmi / Yabancı Hasta" },
    ],
  },
  clinicTypes: {
    title: "Farklı Klinik Türleri İçin Akıllı Hasta Karşılama",
    subtitle:
      "ClinicBridge AI; diş, estetik, saç ekimi, psikoloji, dermatoloji ve sağlık turizmi odaklı kliniklerde web ve telefon üzerinden hasta sorularını yanıtlamak ve randevu taleplerini yönlendirmek için kullanılabilir.",
    cards: [
      { icon: "tooth", title: "Diş Klinikleri", desc: "İmplant, ortodonti, diş beyazlatma ve randevu sorularını otomatik yanıtlayın." },
      { icon: "sparkles", title: "Estetik & Plastik Cerrahi Klinikleri", desc: "Operasyon süreçleri, ön görüşme talepleri ve fiyat aralığı sorularını profesyonel şekilde yönlendirin." },
      { icon: "scissors", title: "Saç Ekimi Klinikleri", desc: "Yurt içi ve yurt dışı hasta adaylarının paket, süreç ve uygunluk sorularını anında karşılayın." },
      { icon: "sun", title: "Dermatoloji Klinikleri", desc: "Cilt tedavileri, leke tedavisi, akne ve kontrol randevuları için ön bilgilendirme sağlayın." },
      { icon: "brain", title: "Psikoloji & Terapi Merkezleri", desc: "Seans bilgileri, uzman seçimi ve uygun randevu taleplerini hızlıca yönlendirin." },
      { icon: "plane", title: "Sağlık Turizmi Klinikleri", desc: "Çok dilli hasta iletişimi, transfer, konaklama ve ön görüşme taleplerini tek akışta yönetin." },
    ],
  },
  benefits: {
    title: "Kliniğiniz İçin Daha Fazla Dönüşüm, Daha Az Operasyonel Yük",
    items: [
      "Web ve telefonda daha hızlı hasta yanıtı",
      "Daha profesyonel ilk temas",
      "Her kanaldan daha fazla randevu talebi",
      "Personel üzerindeki tekrar eden soru yükünün azalması",
      "Klinik hizmetlerinin daha net anlatılması",
    ],
  },
  demo: {
    title: "ClinicBridge AI'ı Kliniğinizde Deneyin",
    subtitle: "Web sitesi ve telefon asistanlarınızı kliniğinize özel olarak birlikte kurgulayalım.",
    form: {
      name: "Ad Soyad",
      clinic: "Klinik Adı",
      phone: "Telefon",
      email: "E-posta",
      website: "Web Sitesi",
      message: "Mesaj",
      submit: "Demo Talep Et",
      success: "Demo talebiniz başarıyla alındı. En kısa sürede sizinle iletişime geçeceğiz.",
      namePlaceholder: "Adınız ve soyadınız",
      clinicPlaceholder: "Kliniğinizin adı",
      phonePlaceholder: "+90 5XX XXX XX XX",
      emailPlaceholder: "ornek@klinik.com",
      websitePlaceholder: "https://kliniginiz.com",
      messagePlaceholder: "Projeniz hakkında kısaca bilgi verin...",
    },
  },
  pricing: {
    title: "Fiyatlandırma",
    subtitle: "Kliniğinizin ihtiyacına göre aylık bir paket seçin.",
    perMonth: "/ay",
    customPrice: "Özel fiyat",
    popular: "En popüler",
    ctaStart: "Başla",
    ctaBuy: "Satın Al",
    ctaContact: "Bize ulaşın",
    note: "Fiyatlara KDV dahil değildir. Euro fiyatlar ödeme günündeki kurla TL olarak tahsil edilir. Taahhüt yok, dilediğiniz zaman iptal.",
    names: {
      starter: "Başlangıç",
      clinic: "Klinik",
      clinicPhone: "Klinik + Telefon",
      agency: "Ajans / Çok şubeli",
    },
    features: {
      webChat: "Web chat",
      monthlyChats: "Ayda {count} hasta sohbeti",
      panel: "Klinik paneli",
      webChatWhatsapp: "Web chat (WhatsApp yakında)",
      allLanguages: "Tüm diller",
      appointmentDelivery: "Randevu taleplerinin e-posta/WhatsApp ile iletimi",
      weeklyReport: "Haftalık rapor",
      everythingInClinic: "Klinik paketindeki her şey",
      phoneAssistant: "AI telefon asistanı",
      includedMinutes: "Ayda {count} dakika dahil",
      overage: "Aşımda {price}/dk",
      setup: "Kurulum ve numara yönlendirme desteği",
      agencyScope: "Birden fazla şube veya ajans hesabı için",
      agencySetup: "Kurulum ve kullanım hacmine göre teklif",
    },
    faqTitle: "Sık sorulan sorular",
    faq: [
      { q: "Aboneliği iptal edebilir miyim?", a: "Evet. Taahhüt yoktur; aboneliğinizi dilediğiniz zaman iptal edebilirsiniz. İptal, içinde bulunulan dönemin sonunda geçerli olur." },
      { q: "Fatura kesiliyor mu?", a: "Her ödeme için e-Arşiv fatura düzenlenir." },
      { q: "Nasıl ödeme yaparım?", a: "Ödemeler iyzico güvencesiyle kredi kartı veya banka kartı ile alınır. Euro fiyatlar, ödeme günündeki kurla TL olarak tahsil edilir." },
      { q: "Telefon paketinde aşım ücreti var mı?", a: "Klinik + Telefon paketinde ayda {minutes} dakika dahildir. Aşımda {overage}/dk tahsil edilir." },
    ],
  },
  about: {
    title: "Hakkımızda",
    whatTitle: "ClinicBridge AI nedir?",
    what: [
      "ClinicBridge AI, yabancı hasta alan diş, saç ekimi ve estetik klinikleri ile sağlık turizmi ajansları için geliştirilmiş çok dilli bir yapay zekâ hasta iletişim platformudur.",
      "Kliniğin web sitesine eklenen asistan ve AI telefon asistanı, hastaların sorularını kendi dillerinde saniyeler içinde yanıtlar, randevu taleplerini toplar ve klinik ekibine hazır şekilde iletir. Klinik kapalıyken gelen hastalar da cevapsız kalmaz.",
    ],
    whyTitle: "Neden kurduk?",
    why: "Yurt dışından gelen hastaların önemli bir kısmı, Türkiye saatiyle akşam ve gece yazıyor. Bu saatlerde cevap alamayan hasta çoğu zaman başka bir kliniğe yöneliyor. ClinicBridge AI, kliniklerin ekip büyütmeden bu saatleri karşılamasını sağlamak için kuruldu.",
    contactTitle: "İletişim",
    emailLabel: "E-posta",
    phoneLabel: "Telefon",
    sellerNote: "Satıcı bilgileri",
    contract: "Mesafeli Satış Sözleşmesi",
    contractSuffix: "nde yer almaktadır.",
  },
  footer: {
    brand: "ClinicBridge AI",
    tagline: "Yapay zekâ destekli hasta iletişim platformu",
    contact: "İletişim",
    privacy: "Gizlilik Politikası",
    terms: "Kullanım Şartları",
    kvkk: "KVKK",
    delivery: "Teslimat ve İade",
    distanceSales: "Mesafeli Satış Sözleşmesi",
    pricing: "Fiyatlandırma",
    about: "Hakkımızda",
    requestDemo: "Demo Talep Et",
    rights: "Tüm hakları saklıdır.",
  },
  preview: {
    summary: "Sitenizden {treatments} tedavi, {languages} dil, {questions} soru öğrendik.",
    pilot: "İstanbul'daki bir diş kliniğinde hasta sohbetlerinin %43'ü klinik kapalıyken geldi.",
    cta: "Bu botu sitenize ekleyin",
    missing: "Bu önizleme bulunamadı veya süresi doldu.",
    loading: "Önizleme hazırlanıyor…",
  },
};

const en = {
  nav: {
    solutions: "Solutions",
    features: "Features",
    howItWorks: "How It Works",
    pricing: "Pricing",
    about: "About",
    benefits: "Benefits",
    contact: "Contact",
    requestDemo: "Request a Demo",
  },
  hero: {
    badge: "AI-Powered Patient Communication Platform",
    title: "AI That Communicates With Your Patients on Every Channel",
    subtitle:
      "ClinicBridge AI greets website messages and phone calls with AI-powered assistants. It answers patient questions, collects appointment requests, and supports your clinic’s communication around the clock.",
    ctaPrimary: "Request a Demo",
    ctaSecondary: "Explore Solutions",
    scanLabel: "Enter your website and see your bot in 2 minutes",
    scanPlaceholder: "https://yourclinic.com",
    scanSubmit: "Show my bot",
    scanReading: "Reading your website…",
    scanExtracting: "Extracting treatments…",
    scanInvalid: "That address doesn't look valid. Enter your clinic website, for example www.yourclinic.com.",
    scanUnreachable: "The site didn't open. Check the address and try again.",
    scanTimeout: "The site didn't respond in time. Try again shortly.",
    scanLimited: "Too many scans from this network. Try again in an hour.",
    scanEmpty: "We couldn't find a readable page on that site.",
    scanUnavailable: "The scan could not finish just now. Please try again shortly.",
    channelWeb: "Website Assistant",
    channelPhone: "Phone Assistant",
    phoneStatus: "Call in progress",
    phoneCaller: "Patient call",
    chatMessages: [
      "Can I get information about implant prices?",
      "When is the earliest available appointment?",
      "How long does a teeth whitening procedure take?",
    ],
    chatResponses: [
      "Of course! Our implant treatment starts from $1,500. I can schedule a consultation for a personalized quote.",
      "The earliest available slot is tomorrow at 2:00 PM. Would you like me to book it for you?",
      "A teeth whitening session typically takes 45-60 minutes. Would you like to schedule an appointment?",
    ],
    phoneLines: [
      "Hello, welcome to our clinic. How can I help you today?",
      "I’ve noted your appointment request. Our team will call you shortly.",
      "I can briefly explain the treatment process for you.",
    ],
  },
  problem: {
    title: "Clinics Waste Hours Answering the Same Questions Every Day",
    cards: [
      { icon: "repeat", title: "Repetitive Patient Questions", desc: "Answering the same questions over and over drains your team's time and energy." },
      { icon: "phone-missed", title: "Missed Phone Calls", desc: "Calls during busy hours or after hours go unanswered, and potential patients slip away." },
      { icon: "clock", title: "Delayed Message Responses", desc: "Slow replies to WhatsApp and web forms push patients toward competitors." },
      { icon: "trending-down", title: "Low Conversion Rate", desc: "Most website visitors and callers leave without getting the information they need." },
    ],
  },
  products: {
    title: "Two Smart Assistants for Your Clinic, One Platform",
    subtitle:
      "ClinicBridge AI is an AI-powered patient communication platform. The Website Assistant and Phone Assistant are two independent, equally important core solutions in the same ecosystem.",
    website: {
      title: "Website Assistant",
      headline: "Engage Every Visitor on Your Website",
      desc: "An AI-powered website assistant that answers patient questions instantly, explains your treatments, and collects appointment requests.",
      cta: "Explore Website Assistant",
    },
    phone: {
      title: "Phone Assistant",
      headline: "Turn Every Call into a Smart Greeting",
      desc: "An AI-powered phone assistant that answers clinic calls with natural voice conversations, responds to patient questions, and collects appointment requests.",
      cta: "Explore Phone Assistant",
    },
  },
  solution: {
    title: "Shared Capabilities on One Platform",
    subtitle:
      "Both assistants run on the same clinic knowledge base and communication standards — delivering consistent answers and appointment requests across channels.",
    features: [
      { icon: "clock-24", title: "24/7 Patient Reception", desc: "Every patient is greeted and informed instantly, day or night, on web and phone." },
      { icon: "stethoscope", title: "Treatment-Based Q&A", desc: "Provides detailed, accurate information about implants, orthodontics, aesthetics, and more." },
      { icon: "message-circle", title: "WhatsApp / Telegram Routing", desc: "When the patient is ready, they're connected directly via WhatsApp or Telegram." },
      { icon: "calendar-check", title: "Appointment Request Collection", desc: "The assistant gathers necessary details and creates appointment requests automatically." },
      { icon: "database", title: "Clinic-Specific Knowledge Base", desc: "Custom-trained knowledge base for each clinic ensures accurate, consistent responses." },
      { icon: "globe", title: "Multi-Language Support", desc: "Communicate with patients in Turkish, English, German, and more." },
    ],
  },
  journey: {
    title: "Make Patient Communication Intelligent on Every Channel",
    subtitle:
      "ClinicBridge AI is trained on your clinic's tone, services, and patient welcome approach — so visitors and callers interact with dedicated digital assistants, not a generic bot.",
    steps: [
      { title: "First Contact", desc: "The patient visits your website or calls your clinic and reaches the first point of contact." },
      { title: "Clinic-Tailored AI Interaction", desc: "The visitor or caller speaks with an AI assistant trained on your clinic's tone and service structure." },
      { title: "Trustworthy Service Information", desc: "The assistant provides clear guidance on treatments, processes, FAQs, and next steps." },
      { title: "Smart Routing", desc: "Based on the patient's needs, they're directed to book an appointment, WhatsApp, or a live team member." },
      { title: "Captured Conversion", desc: "Your clinic never misses a new patient request — every conversation is trackable and actionable." },
    ],
    highlightCard: {
      title: "Not a standard bot — your clinic's digital patient advisor.",
      desc: "Configured separately for each clinic. It learns your services, patient communication style, and FAQs to deliver responses that match your brand — on web and phone.",
    },
  },
  useCases: {
    title: "Automatically Answer Your Most Common Patient Questions",
    subtitle: "Deliver instant, accurate, and consistent answers to the questions your patients ask most — on your website and by phone.",
    categories: [
      { icon: "implant", label: "Implant Pricing" },
      { icon: "sparkle", label: "Teeth Whitening Process" },
      { icon: "braces", label: "Orthodontic Treatment" },
      { icon: "calendar", label: "Appointment Availability" },
      { icon: "map-pin", label: "Location & Directions" },
      { icon: "plane", label: "Health Tourism / International Patients" },
    ],
  },
  clinicTypes: {
    title: "Built for Different Types of Clinics",
    subtitle:
      "ClinicBridge AI can be used by dental, aesthetic, hair transplant, dermatology, psychology, and medical tourism clinics to answer patient questions and guide appointment requests on web and phone.",
    cards: [
      { icon: "tooth", title: "Dental Clinics", desc: "Automatically answer questions about implants, orthodontics, teeth whitening, and appointment availability." },
      { icon: "sparkles", title: "Aesthetic & Plastic Surgery Clinics", desc: "Guide patients through procedure details, consultation requests, and pricing-related questions professionally." },
      { icon: "scissors", title: "Hair Transplant Clinics", desc: "Instantly support local and international patient candidates with package, process, and eligibility questions." },
      { icon: "sun", title: "Dermatology Clinics", desc: "Provide initial guidance for skin treatments, acne care, pigmentation treatments, and follow-up appointments." },
      { icon: "brain", title: "Psychology & Therapy Centers", desc: "Guide patients about session details, specialist selection, and appointment requests." },
      { icon: "plane", title: "Medical Tourism Clinics", desc: "Manage multilingual patient communication, transfer, accommodation, and consultation requests in a single flow." },
    ],
  },
  benefits: {
    title: "More Conversions, Less Operational Overhead for Your Clinic",
    items: [
      "Faster patient response on web and phone",
      "A more professional first impression",
      "More appointment requests from every channel",
      "Reduced repetitive workload on your staff",
      "Clearer communication of your clinic's services",
    ],
  },
  demo: {
    title: "Try ClinicBridge AI for Your Clinic",
    subtitle: "Let’s configure your website and phone assistants together for your clinic.",
    form: {
      name: "Full Name",
      clinic: "Clinic Name",
      phone: "Phone",
      email: "Email",
      website: "Website",
      message: "Message",
      submit: "Request a Demo",
      success: "Your request has been submitted! We'll be in touch shortly.",
      namePlaceholder: "Your full name",
      clinicPlaceholder: "Your clinic's name",
      phonePlaceholder: "+1 (555) 000-0000",
      emailPlaceholder: "you@clinic.com",
      websitePlaceholder: "https://yourclinic.com",
      messagePlaceholder: "Tell us briefly about your project...",
    },
  },
  pricing: {
    title: "Pricing",
    subtitle: "Choose a monthly plan for your clinic.",
    perMonth: "/mo",
    customPrice: "Custom pricing",
    popular: "Most popular",
    ctaStart: "Get started",
    ctaBuy: "Buy",
    ctaContact: "Contact us",
    note: "Prices exclude VAT. Euro prices are charged in TRY at the exchange rate on the payment date. No commitment, cancel anytime.",
    names: {
      starter: "Starter",
      clinic: "Clinic",
      clinicPhone: "Clinic + Phone",
      agency: "Agency / Multi-site",
    },
    features: {
      webChat: "Web chat",
      monthlyChats: "{count} patient conversations per month",
      panel: "Clinic panel",
      webChatWhatsapp: "Web chat (WhatsApp coming soon)",
      allLanguages: "All languages",
      appointmentDelivery: "Appointment requests delivered by email or WhatsApp",
      weeklyReport: "Weekly report",
      everythingInClinic: "Everything in the Clinic plan",
      phoneAssistant: "AI phone assistant",
      includedMinutes: "{count} minutes included per month",
      overage: "{price}/min overage",
      setup: "Setup and number forwarding support",
      agencyScope: "For multiple branches or an agency account",
      agencySetup: "A quote based on setup and usage",
    },
    faqTitle: "Frequently asked questions",
    faq: [
      { q: "Can I cancel?", a: "Yes. There is no commitment, and you can cancel anytime. Cancellation takes effect at the end of the current period." },
      { q: "Do you issue invoices?", a: "An e-Archive invoice is issued for every payment." },
      { q: "How do I pay?", a: "Payments are taken by credit or debit card through iyzico. Euro prices are charged in TRY at the exchange rate on the payment date." },
      { q: "Is there an overage fee on the phone plan?", a: "The Clinic + Phone plan includes {minutes} minutes per month. Additional minutes are charged at {overage}/min." },
    ],
  },
  about: {
    title: "About",
    whatTitle: "What is ClinicBridge AI?",
    what: [
      "ClinicBridge AI is a multilingual AI patient communication platform for dental, hair transplant, and aesthetic clinics, and for health tourism agencies that receive international patients.",
      "The website assistant and AI phone assistant answer patient questions in their own language within seconds, collect appointment requests, and pass them to the clinic team ready to act. Patients who reach out while the clinic is closed still get an answer.",
    ],
    whyTitle: "Why we built it",
    why: "A large share of international patients write in the evening and at night, Turkey time. A patient who does not get an answer in those hours often goes to another clinic. ClinicBridge AI was built so clinics can cover those hours without growing the team.",
    contactTitle: "Contact",
    emailLabel: "Email",
    phoneLabel: "Phone",
    sellerNote: "Seller details are in the",
    contract: "Distance Sales Agreement",
    contractSuffix: ".",
  },
  footer: {
    brand: "ClinicBridge AI",
    tagline: "AI-powered patient communication platform",
    contact: "Contact",
    privacy: "Privacy Policy",
    terms: "Terms of Use",
    kvkk: "KVKK",
    delivery: "Delivery and Refunds",
    distanceSales: "Distance Sales Agreement",
    pricing: "Pricing",
    about: "About",
    requestDemo: "Request a Demo",
    rights: "All rights reserved.",
  },
  preview: {
    summary: "We learned {treatments} treatments, {languages} languages and {questions} questions from your site.",
    pilot: "At a dental clinic in Istanbul, 43% of patient chats arrived while the clinic was closed.",
    cta: "Add this bot to your website",
    missing: "This preview is missing or has expired.",
    loading: "Preparing your preview…",
  },
};

const translations = { tr, en } as const;

export type LandingLanguage = "tr" | "en";
export type LandingTranslations = typeof tr;

interface LandingLangContextType {
  lang: LandingLanguage;
  setLang: (l: LandingLanguage) => void;
  t: LandingTranslations;
}

const LandingLangContext = createContext<LandingLangContextType | undefined>(undefined);

export function LandingLangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LandingLanguage>("tr");
  const setLang = useCallback((l: LandingLanguage) => {
    setLangState(l);
  }, []);
  const t = translations[lang];
  return React.createElement(LandingLangContext.Provider, { value: { lang, setLang, t } }, children);
}

export function useLandingLang() {
  const ctx = useContext(LandingLangContext);
  if (!ctx) throw new Error("useLandingLang must be used within LandingLangProvider");
  return ctx;
}
