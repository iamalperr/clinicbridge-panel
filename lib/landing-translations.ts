"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

const tr = {
  nav: {
    features: "Özellikler",
    howItWorks: "Nasıl Çalışır",
    benefits: "Avantajlar",
    contact: "İletişim",
    requestDemo: "Demo Talep Et",
  },
  hero: {
    title: "Klinik Web Sitenizi 7/24 Hasta Karşılayan Akıllı Bir Asistana Dönüştürün",
    subtitle: "ClinicBridge AI, kliniğinizin web sitesine entegre edilen yapay zekâ destekli asistan ile hasta sorularını anında yanıtlar, hizmetlerinizi açıklar ve randevu taleplerini doğru şekilde yönlendirir.",
    ctaPrimary: "Demo Talep Et",
    ctaSecondary: "Nasıl Çalışır?",
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
  },
  problem: {
    title: "Klinikler Her Gün Aynı Sorularla Zaman Kaybediyor",
    cards: [
      { icon: "repeat", title: "Tekrarlayan Hasta Soruları", desc: "Aynı soruları defalarca yanıtlamak ekibinizin zamanını ve enerjisini tüketir." },
      { icon: "calendar-x", title: "Kaçan Randevu Talepleri", desc: "Mesai saatleri dışında gelen talepler yanıtsız kalır ve potansiyel hastalar kaybedilir." },
      { icon: "clock", title: "Geç Dönüş Yapılan Mesajlar", desc: "WhatsApp ve web formlarına geç yanıt, hastanın başka bir kliniğe yönelmesine neden olur." },
      { icon: "trending-down", title: "Düşük Dönüşüm Oranı", desc: "Web sitenizi ziyaret eden hastaların büyük çoğunluğu bilgi alamadan ayrılır." },
    ],
  },
  solution: {
    title: "ClinicBridge AI Bu Süreci Otomatikleştirir",
    subtitle: "Yapay zekâ asistanınız, hastaların en çok sorduğu soruları yanıtlar, tedavi süreçlerini sade şekilde açıklar ve uygun noktada hastayı randevuya yönlendirir.",
    features: [
      { icon: "clock-24", title: "7/24 Hasta Karşılama", desc: "Gece gündüz fark etmez, her ziyaretçi anında karşılanır ve bilgilendirilir." },
      { icon: "stethoscope", title: "Tedavi Bazlı Soru-Cevap", desc: "İmplant, ortodonti, estetik gibi tedaviler hakkında detaylı ve doğru bilgi sunar." },
      { icon: "message-circle", title: "WhatsApp / Telegram Yönlendirme", desc: "Hasta hazır olduğunda doğrudan WhatsApp veya Telegram üzerinden iletişime geçirilir." },
      { icon: "calendar-check", title: "Randevu Talebi Toplama", desc: "Asistan, hastadan gerekli bilgileri alarak randevu talebini oluşturur." },
      { icon: "database", title: "Klinik Özelinde Bilgi Tabanı", desc: "Her klinik için özel eğitilmiş bilgi tabanı ile doğru ve tutarlı yanıtlar verir." },
      { icon: "globe", title: "Çok Dilli Kullanım Altyapısı", desc: "Türkçe, İngilizce, Almanca ve daha fazla dilde hasta iletişimi sağlar." },
    ],
  },
  journey: {
    title: "Hastanın Web Sitesindeki Yolculuğunu Akıllı Hale Getirin",
    steps: [
      { title: "Web Sitesine Giriş", desc: "Hasta kliniğinizin web sitesini ziyaret eder." },
      { title: "Asistanla Etkileşim", desc: "Sorularını yapay zekâ asistana sorar ve anında yanıt alır." },
      { title: "Hizmet Bilgisi", desc: "Klinik hizmetleri hakkında detaylı ve anlaşılır bilgi edinir." },
      { title: "Yönlendirme", desc: "Randevu veya WhatsApp yönlendirmesi ile bir sonraki adıma geçer." },
      { title: "Dönüşüm", desc: "Klinik yeni hasta talebini kaçırmaz, her talep kayıt altına alınır." },
    ],
  },
  useCases: {
    title: "En Çok Sorulan Soruları Otomatik Yanıtlayın",
    subtitle: "Hastalarınızın en sık sorduğu sorulara anında, doğru ve tutarlı yanıtlar verin.",
    categories: [
      { icon: "implant", label: "İmplant Fiyatları" },
      { icon: "sparkle", label: "Diş Beyazlatma Süreci" },
      { icon: "braces", label: "Ortodonti Tedavisi" },
      { icon: "calendar", label: "Randevu Uygunluğu" },
      { icon: "map-pin", label: "Konum ve Ulaşım" },
      { icon: "plane", label: "Sağlık Turizmi / Yabancı Hasta" },
    ],
  },
  benefits: {
    title: "Kliniğiniz İçin Daha Fazla Dönüşüm, Daha Az Operasyonel Yük",
    items: [
      "Daha hızlı hasta yanıtı",
      "Daha profesyonel ilk temas",
      "Web sitesinden daha fazla randevu talebi",
      "Personel üzerindeki tekrar eden soru yükünün azalması",
      "Klinik hizmetlerinin daha net anlatılması",
    ],
  },
  demo: {
    title: "ClinicBridge AI'ı Kliniğinizde Deneyin",
    subtitle: "Web sitenize özel yapay zekâ asistanınızı birlikte kurgulayalım.",
    form: {
      name: "Ad Soyad", clinic: "Klinik Adı", phone: "Telefon", email: "E-posta",
      website: "Web Sitesi", message: "Mesaj", submit: "Demo Talep Et",
      success: "Talebiniz başarıyla iletildi! En kısa sürede sizinle iletişime geçeceğiz.",
      namePlaceholder: "Adınız ve soyadınız", clinicPlaceholder: "Kliniğinizin adı",
      phonePlaceholder: "+90 5XX XXX XX XX", emailPlaceholder: "ornek@klinik.com",
      websitePlaceholder: "https://kliniginiz.com", messagePlaceholder: "Projeniz hakkında kısaca bilgi verin...",
    },
  },
  footer: {
    brand: "ClinicBridge AI", tagline: "Yapay zekâ destekli klinik asistanı",
    contact: "İletişim", privacy: "Gizlilik Politikası", requestDemo: "Demo Talep Et",
    rights: "Tüm hakları saklıdır.",
  },
};

const en = {
  nav: {
    features: "Features",
    howItWorks: "How It Works",
    benefits: "Benefits",
    contact: "Contact",
    requestDemo: "Request a Demo",
  },
  hero: {
    title: "Turn Your Clinic Website into a 24/7 AI Patient Assistant",
    subtitle: "ClinicBridge AI helps clinics answer patient questions instantly, explain treatments clearly, and guide visitors toward appointments through an AI-powered assistant integrated into your website.",
    ctaPrimary: "Request a Demo",
    ctaSecondary: "How It Works",
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
  },
  problem: {
    title: "Clinics Waste Hours Answering the Same Questions Every Day",
    cards: [
      { icon: "repeat", title: "Repetitive Patient Questions", desc: "Answering the same questions over and over drains your team's time and energy." },
      { icon: "calendar-x", title: "Missed Appointment Requests", desc: "After-hours inquiries go unanswered, and potential patients slip away." },
      { icon: "clock", title: "Delayed Message Responses", desc: "Slow replies to WhatsApp and web forms push patients toward competitors." },
      { icon: "trending-down", title: "Low Website Conversion", desc: "Most website visitors leave without getting the information they need." },
    ],
  },
  solution: {
    title: "ClinicBridge AI Automates This Entire Process",
    subtitle: "Your AI assistant answers frequently asked patient questions, explains treatment procedures clearly, and guides patients toward booking an appointment at the right moment.",
    features: [
      { icon: "clock-24", title: "24/7 Patient Reception", desc: "Every visitor is greeted and informed instantly, day or night." },
      { icon: "stethoscope", title: "Treatment-Based Q&A", desc: "Provides detailed, accurate information about implants, orthodontics, aesthetics, and more." },
      { icon: "message-circle", title: "WhatsApp / Telegram Routing", desc: "When the patient is ready, they're connected directly via WhatsApp or Telegram." },
      { icon: "calendar-check", title: "Appointment Request Collection", desc: "The assistant gathers necessary details and creates appointment requests automatically." },
      { icon: "database", title: "Clinic-Specific Knowledge Base", desc: "Custom-trained knowledge base for each clinic ensures accurate, consistent responses." },
      { icon: "globe", title: "Multi-Language Support", desc: "Communicate with patients in Turkish, English, German, and more." },
    ],
  },
  journey: {
    title: "Make Every Patient's Website Journey Intelligent",
    steps: [
      { title: "Website Visit", desc: "A patient lands on your clinic's website." },
      { title: "AI Interaction", desc: "They ask questions and receive instant, helpful responses from the AI assistant." },
      { title: "Service Information", desc: "They learn about your clinic's services with clear, detailed explanations." },
      { title: "Smart Routing", desc: "They're guided to book an appointment or connect via WhatsApp." },
      { title: "Conversion", desc: "Your clinic never misses a lead — every inquiry is captured and tracked." },
    ],
  },
  useCases: {
    title: "Automatically Answer Your Most Common Patient Questions",
    subtitle: "Deliver instant, accurate, and consistent answers to the questions your patients ask most.",
    categories: [
      { icon: "implant", label: "Implant Pricing" },
      { icon: "sparkle", label: "Teeth Whitening Process" },
      { icon: "braces", label: "Orthodontic Treatment" },
      { icon: "calendar", label: "Appointment Availability" },
      { icon: "map-pin", label: "Location & Directions" },
      { icon: "plane", label: "Health Tourism / International Patients" },
    ],
  },
  benefits: {
    title: "More Conversions, Less Operational Overhead for Your Clinic",
    items: [
      "Faster patient response times",
      "A more professional first impression",
      "More appointment requests from your website",
      "Reduced repetitive workload on your staff",
      "Clearer communication of your clinic's services",
    ],
  },
  demo: {
    title: "Try ClinicBridge AI for Your Clinic",
    subtitle: "Let's build your custom AI assistant together.",
    form: {
      name: "Full Name", clinic: "Clinic Name", phone: "Phone", email: "Email",
      website: "Website", message: "Message", submit: "Request a Demo",
      success: "Your request has been submitted! We'll be in touch shortly.",
      namePlaceholder: "Your full name", clinicPlaceholder: "Your clinic's name",
      phonePlaceholder: "+1 (555) 000-0000", emailPlaceholder: "you@clinic.com",
      websitePlaceholder: "https://yourclinic.com", messagePlaceholder: "Tell us briefly about your project...",
    },
  },
  footer: {
    brand: "ClinicBridge AI", tagline: "AI-powered clinic assistant",
    contact: "Contact", privacy: "Privacy Policy", requestDemo: "Request a Demo",
    rights: "All rights reserved.",
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
  const setLang = useCallback((l: LandingLanguage) => { setLangState(l); }, []);
  const t = translations[lang];
  return React.createElement(LandingLangContext.Provider, { value: { lang, setLang, t } }, children);
}

export function useLandingLang() {
  const ctx = useContext(LandingLangContext);
  if (!ctx) throw new Error("useLandingLang must be used within LandingLangProvider");
  return ctx;
}
