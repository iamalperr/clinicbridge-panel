/**
 * feelinhealthy.ts
 *
 * FeelinHealthy demo seed data for AI Clinic Matching & Quote Assistant.
 * Call seedFeelinHealthy(agencyId) to populate treatments, clinics, pricing.
 */

import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Treatments ─────────────────────────────────────────────────────────────

const TREATMENTS = [
  { slug: "dental_implant", name: "Dental Implant", category: "dental", avgPriceMin: 400, avgPriceMax: 900, currency: "EUR", priceType: "average", duration: "1-2 hours per implant", recoveryTime: "3-5 days", requiredDocuments: ["Dental X-ray", "Panoramic X-ray"] },
  { slug: "zirconium_crowns", name: "Zirconium Crowns", category: "dental", avgPriceMin: 180, avgPriceMax: 350, currency: "EUR", priceType: "per_unit", duration: "2-3 visits", recoveryTime: "1-2 days" },
  { slug: "hollywood_smile", name: "Hollywood Smile", category: "dental", avgPriceMin: 2500, avgPriceMax: 6000, currency: "EUR", priceType: "package", duration: "5-7 days", recoveryTime: "3-5 days" },
  { slug: "fue_hair_transplant", name: "FUE Hair Transplant", category: "hair_transplant", avgPriceMin: 1500, avgPriceMax: 3500, currency: "EUR", priceType: "package", duration: "6-8 hours", recoveryTime: "7-10 days", requiredDocuments: ["Hair photos"] },
  { slug: "dhi_hair_transplant", name: "DHI Hair Transplant", category: "hair_transplant", avgPriceMin: 1800, avgPriceMax: 4000, currency: "EUR", priceType: "package", duration: "6-10 hours", recoveryTime: "7-10 days", requiredDocuments: ["Hair photos"] },
  { slug: "rhinoplasty", name: "Rhinoplasty", category: "aesthetic_surgery", avgPriceMin: 2500, avgPriceMax: 6000, currency: "EUR", priceType: "package", duration: "2-3 hours", recoveryTime: "10-14 days", requiredDocuments: ["Medical history", "Current photos"] },
  { slug: "ivf_treatment", name: "IVF Treatment", category: "ivf", avgPriceMin: 3000, avgPriceMax: 6000, currency: "EUR", priceType: "package", duration: "2-3 weeks", recoveryTime: "1-2 days", requiredDocuments: ["Hormonal panel", "Ultrasound"] },
  { slug: "health_checkup", name: "Health Check-Up", category: "check_up", avgPriceMin: 300, avgPriceMax: 1200, currency: "EUR", priceType: "package", duration: "1 day", recoveryTime: "None" },
];

// ─── Clinics ────────────────────────────────────────────────────────────────

const CLINICS = [
  {
    clinicId: "hospitadent-pendik",
    clinicName: "Hospitadent Dental Group Pendik",
    clinicType: "external",
    category: "dental",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/hospitadent-dental-group-pendik",
    website: "https://www.hospitadent.com",
    contactEmail: "info@hospitadent.com",
    shortDescription: "One of Turkey's largest dental hospital chains with 150+ dentists and JCI accreditation.",
    location: { city: "Istanbul", country: "Turkey", address: "Pendik" },
    supportedLanguages: ["en", "tr", "de", "ar"],
    treatmentCategories: ["dental"],
    subTreatments: ["Dental Implant", "Zirconium Crowns", "Hollywood Smile", "All-on-4", "All-on-6", "Root Canal", "Teeth Whitening"],
    targetPatientCountries: ["Germany", "UK", "Netherlands", "France"],
    accreditation: ["JCI", "ISO 9001"],
    doctorCount: 150,
    experienceYears: 17,
    priority: 90, responseSLA: 24, leadCapacity: 20, status: "active",
    quoteEnabled: true,
    quoteContactEmail: "quotes@hospitadent.com",
    showInRecommendations: true,
    showPriceRange: true,
    showProfileLink: true,
  },
  {
    clinicId: "hospitadent-alanya",
    clinicName: "Hospitadent Dental Group Alanya",
    clinicType: "external",
    category: "dental",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/hospitadent-dental-group-alanya",
    website: "https://www.hospitadent.com",
    contactEmail: "alanya@hospitadent.com",
    shortDescription: "Modern dental clinic in Alanya offering comprehensive dental treatments.",
    location: { city: "Antalya", country: "Turkey", address: "Alanya" },
    supportedLanguages: ["en", "tr", "de", "ru"],
    treatmentCategories: ["dental"],
    subTreatments: ["Dental Implant", "Zirconium Crowns", "Hollywood Smile", "All-on-4", "All-on-6", "Root Canal", "Teeth Whitening"],
    targetPatientCountries: ["Germany", "UK", "Russia", "Scandinavia"],
    accreditation: ["ISO 9001"],
    doctorCount: 20,
    experienceYears: 10,
    priority: 95, responseSLA: 12, leadCapacity: 30, status: "active",
    quoteEnabled: true,
    quoteContactEmail: "alanya.quotes@hospitadent.com",
    showInRecommendations: true,
    showPriceRange: true,
    showProfileLink: true,
  },
  {
    clinicId: "demo-dental-istanbul",
    clinicName: "Demo Dental Istanbul",
    clinicType: "external",
    category: "dental",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/demo-dental-istanbul",
    location: { city: "Istanbul", country: "Turkey" },
    supportedLanguages: ["en", "tr", "de"],
    treatmentCategories: ["dental"],
    subTreatments: ["Dental Implant", "Zirconium Crowns"],
    priority: 75, responseSLA: 24, leadCapacity: 30, status: "active",
    showInRecommendations: true, showPriceRange: true, showProfileLink: true, quoteEnabled: true,
  },
  {
    clinicId: "demo-hair-istanbul",
    clinicName: "Demo Hair Transplant Istanbul",
    clinicType: "external",
    category: "hair",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/demo-hair-istanbul",
    location: { city: "Istanbul", country: "Turkey" },
    supportedLanguages: ["en", "tr", "de", "fr"],
    treatmentCategories: ["hair_transplant"],
    subTreatments: ["FUE Hair Transplant", "DHI Hair Transplant", "Beard Transplant"],
    priority: 85, responseSLA: 12, leadCapacity: 40, status: "active",
    showInRecommendations: true, showPriceRange: true, showProfileLink: true, quoteEnabled: true,
  },
  {
    clinicId: "demo-aesthetic-istanbul",
    clinicName: "Demo Aesthetic Clinic Istanbul",
    clinicType: "external",
    category: "aesthetic",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/demo-aesthetic-istanbul",
    location: { city: "Istanbul", country: "Turkey" },
    supportedLanguages: ["en", "tr"],
    treatmentCategories: ["aesthetic_surgery"],
    subTreatments: ["Rhinoplasty", "Breast Augmentation", "Liposuction"],
    priority: 80, responseSLA: 24, leadCapacity: 20, status: "active",
    showInRecommendations: true, showPriceRange: true, showProfileLink: true, quoteEnabled: true,
  },
  {
    clinicId: "demo-ivf-istanbul",
    clinicName: "Demo IVF Clinic Istanbul",
    clinicType: "external",
    category: "ivf",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/demo-ivf-istanbul",
    location: { city: "Istanbul", country: "Turkey" },
    supportedLanguages: ["en", "tr"],
    treatmentCategories: ["ivf", "check_up"],
    subTreatments: ["IVF Treatment", "Health Check-Up"],
    priority: 80, responseSLA: 24, leadCapacity: 15, status: "active",
    showInRecommendations: true, showPriceRange: true, showProfileLink: true, quoteEnabled: true,
  },
];

// ─── Pricing (Clinic-specific overrides for Hospitadent) ────────────────────

const CLINIC_PRICING = [
  { treatmentName: "Dental Implant", category: "dental", clinicId: "hospitadent-pendik", clinicName: "Hospitadent Dental Group Pendik", priceMin: 450, priceMax: 850, currency: "EUR", priceType: "average" },
  { treatmentName: "Zirconium Crowns", category: "dental", clinicId: "hospitadent-pendik", clinicName: "Hospitadent Dental Group Pendik", priceMin: 200, priceMax: 320, currency: "EUR", priceType: "per_unit" },
  { treatmentName: "Dental Implant", category: "dental", clinicId: "hospitadent-alanya", clinicName: "Hospitadent Dental Group Alanya", priceMin: 400, priceMax: 800, currency: "EUR", priceType: "average" },
  { treatmentName: "Zirconium Crowns", category: "dental", clinicId: "hospitadent-alanya", clinicName: "Hospitadent Dental Group Alanya", priceMin: 180, priceMax: 300, currency: "EUR", priceType: "per_unit" },
  { treatmentName: "Hollywood Smile", category: "dental", clinicId: "hospitadent-alanya", clinicName: "Hospitadent Dental Group Alanya", priceMin: 2000, priceMax: 5000, currency: "EUR", priceType: "package" },
];

// ─── Demo Leads ─────────────────────────────────────────────────────────────

const LEADS = [
  {
    patientName: "Hans Mueller",
    patientEmail: "hans@example.de",
    country: "Germany",
    language: "de",
    treatmentCategory: "dental",
    treatmentSubcategory: "dental_implant",
    urgency: "medium",
    status: "new",
    source: "widget",
    conversationSummary: "Patient from Germany looking for dental implant treatment in Istanbul. Has recent X-ray. Planning to travel in 2 months.",
    consentStatus: "accepted",
  },
  {
    patientName: "James Wilson",
    patientEmail: "james@example.co.uk",
    country: "United Kingdom",
    language: "en",
    treatmentCategory: "hair_transplant",
    treatmentSubcategory: "fue",
    urgency: "low",
    status: "new",
    source: "widget",
    conversationSummary: "UK patient looking for FUE hair transplant. No previous transplant. Has current photos.",
    consentStatus: "accepted",
  },
  {
    patientName: "Sophie de Vries",
    patientEmail: "sophie@example.nl",
    country: "Netherlands",
    language: "en",
    treatmentCategory: "aesthetic_surgery",
    treatmentSubcategory: "rhinoplasty",
    urgency: "medium",
    status: "pre_qualified",
    source: "widget",
    conversationSummary: "Netherlands patient interested in rhinoplasty. Looking for experienced surgeon in Istanbul.",
    consentStatus: "accepted",
  },
  {
    patientName: "Ayşe Kaya",
    patientEmail: "ayse@example.com.tr",
    country: "Turkey",
    language: "tr",
    treatmentCategory: "check_up",
    urgency: "low",
    status: "new",
    source: "widget",
    conversationSummary: "Turkish patient looking for comprehensive health check-up package in Istanbul.",
    consentStatus: "pending",
  },
];

// ─── Seeder Function ────────────────────────────────────────────────────────

export async function seedFeelinHealthy(agencyId: string): Promise<{
  treatments: number;
  clinics: number;
  pricing: number;
  leads: number;
}> {
  const ts = serverTimestamp();
  let treatmentCount = 0;
  let clinicCount = 0;
  let pricingCount = 0;
  let leadCount = 0;

  // 1. Seed Treatments
  for (const t of TREATMENTS) {
    const docRef = doc(collection(db, "agencies", agencyId, "treatments"));
    await setDoc(docRef, {
      ...t,
      agencyId,
      status: "active",
      requiredDocuments: t.requiredDocuments || [],
      createdAt: ts,
      updatedAt: ts,
    });
    treatmentCount++;
  }

  // 2. Seed Clinics
  const clinicDocIds: Record<string, string> = {};
  for (const c of CLINICS) {
    const docRef = doc(collection(db, "agencies", agencyId, "clinics"));
    await setDoc(docRef, {
      ...c,
      addedAt: ts,
      updatedAt: ts,
    });
    clinicDocIds[c.clinicId] = docRef.id;
    clinicCount++;
  }

  // 2b. Seed Hospitadent clinic-level pricing (subcollection)
  const hospitadentDocId = clinicDocIds["hospitadent-pendik"];
  if (hospitadentDocId) {
    const hospPricing = [
      { treatmentName: "Dental Implant", priceMin: 400, priceMax: 900, currency: "EUR", priceType: "average" },
      { treatmentName: "Zirconium Crown", priceMin: 180, priceMax: 350, currency: "EUR", priceType: "per_unit" },
      { treatmentName: "Hollywood Smile", priceMin: 2500, priceMax: 6000, currency: "EUR", priceType: "package" },
    ];
    for (const hp of hospPricing) {
      const pRef = doc(collection(db, "agencies", agencyId, "clinics", hospitadentDocId, "pricing"));
      await setDoc(pRef, {
        agencyClinicId: hospitadentDocId,
        ...hp,
        notes: undefined,
        status: "active",
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }


  // 2c. Seed Hospitadent Alanya Knowledge Base
  const alanyaDocId = clinicDocIds["hospitadent-alanya"];
  if (alanyaDocId) {
    const kbRecords = [
      {
        title: "Genel Tanıtım",
        category: "Klinik Bilgisi",
        content: "Hospitadent Dental Group Alanya; modern altyapısı, deneyimli diş hekimleri ve tam donanımlı tedavi odaları ile hastalarına uluslararası standartlarda hizmet vermektedir. Kliniğimizde diş implantı, zirkonyum, gülüş tasarımı ve tüm temel diş tedavileri uygulanmaktadır.",
        priority: "Yüksek",
        isActive: true,
      },
      {
        title: "Konum ve Ulaşım",
        category: "Konum ve Tesis",
        content: "Kliniğimiz Antalya'nın Alanya ilçesinde, merkezi bir konumda yer almaktadır. Gazipaşa-Alanya Havalimanı'na (GZP) yaklaşık 45 dakika, Antalya Havalimanı'na (AYT) ise yaklaşık 2 saat mesafededir. Yurtdışından gelen hastalarımız için VIP transfer hizmetimiz bulunmaktadır.",
        priority: "Normal",
        isActive: true,
      },
      {
        title: "Çalışma Saatleri",
        category: "Çalışma Şartları",
        content: "Kliniğimiz Pazartesi - Cumartesi günleri 09:00 - 19:00 saatleri arasında hizmet vermektedir. Pazar günleri kapalıdır.",
        priority: "Normal",
        isActive: true,
      },
      {
        title: "Uluslararası Hasta Hizmetleri",
        category: "Hizmetler",
        content: "Sağlık turizmi yetki belgesine sahip olan kliniğimiz; İngilizce, Almanca ve Rusça dillerinde destek veren uluslararası hasta birimine sahiptir. Tedavi süresince ücretsiz tercümanlık, havaalanı-klinik-otel transferi ve anlaşmalı otellerde konaklama imkanları sunulmaktadır.",
        priority: "Yüksek",
        isActive: true,
      }
    ];

    for (const kb of kbRecords) {
      const kbRef = doc(collection(db, "agencies", agencyId, "clinics", alanyaDocId, "knowledgeBase"));
      await setDoc(kbRef, {
        clinicId: alanyaDocId,
        ...kb,
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }

  // 3. Seed Global Pricing (from treatment averages)
  for (const t of TREATMENTS) {
    const docRef = doc(collection(db, "agencies", agencyId, "pricing"));
    await setDoc(docRef, {
      treatmentId: t.slug,
      treatmentName: t.name,
      category: t.category,
      priceMin: t.avgPriceMin,
      priceMax: t.avgPriceMax,
      currency: t.currency,
      priceType: t.priceType,
      agencyId,
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    });
    pricingCount++;
  }

  // 4. Seed Clinic-specific Pricing
  for (const p of CLINIC_PRICING) {
    const docRef = doc(collection(db, "agencies", agencyId, "pricing"));
    await setDoc(docRef, {
      ...p,
      treatmentId: p.treatmentName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      agencyId,
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    });
    pricingCount++;
  }

  // 5. Seed Leads
  for (const l of LEADS) {
    const docRef = doc(collection(db, "agencies", agencyId, "leads"));
    await setDoc(docRef, {
      ...l,
      agencyId,
      clinicId: null,
      patientPhone: null,
      statusHistory: [{ status: l.status, changedAt: ts }],
      createdAt: ts,
      updatedAt: ts,
    });
    leadCount++;
  }

  // 6. Seed AI Matching Config
  await setDoc(doc(db, "agencies", agencyId, "config", "matching"), {
    routingMode: "manual",
    maxClinicsToShow: 5,
    showPriceRange: true,
    showProfileLinks: true,
    requireConsentBeforeQuote: true,
    treatmentClinicRules: [
      { treatmentCategory: "dental", eligibleClinicIds: ["hospitadent-pendik", "hospitadent-alanya", "demo-dental-istanbul"] },
      { treatmentCategory: "hair_transplant", eligibleClinicIds: ["demo-hair-istanbul"] },
      { treatmentCategory: "aesthetic_surgery", eligibleClinicIds: ["demo-aesthetic-istanbul"] },
      { treatmentCategory: "ivf", eligibleClinicIds: ["demo-ivf-istanbul"] },
      { treatmentCategory: "check_up", eligibleClinicIds: ["demo-ivf-istanbul"] },
    ],
    updatedAt: ts,
  }, { merge: true });

  // 7. Seed Widget Config
  await setDoc(doc(db, "agencies", agencyId, "config", "widget"), {
    mode: "matching_assistant",
    treatmentSelectorVisible: true,
    clinicRecommendationCards: true,
    priceRangeEnabled: true,
    quoteRequestEnabled: true,
    profileLinkEnabled: true,
    consentBeforeQuote: true,
    theme: "light",
    position: "bottom-right",
    updatedAt: ts,
  }, { merge: true });

  return { treatments: treatmentCount, clinics: clinicCount, pricing: pricingCount, leads: leadCount };
}
