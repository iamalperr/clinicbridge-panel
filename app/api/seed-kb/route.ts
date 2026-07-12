import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: "No admin DB" }, { status: 500 });
    }

    const agencySnap = await db.collection("agencies").where("slug", "==", "feelinhealthy").limit(1).get();
    if (agencySnap.empty) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }
    const agencyId = agencySnap.docs[0].id;

    let clinicId = "";
    const clinicSnap = await db.collection("agencies").doc(agencyId).collection("clinics").where("clinicSlug", "==", "hospitadent-dental-group-alanya").limit(1).get();
    
    if (!clinicSnap.empty) {
      clinicId = clinicSnap.docs[0].id;
    } else {
      const fallbackSnap = await db.collection("agencies").doc(agencyId).collection("clinics").doc("hospitadent-dental-group-alanya").get();
      if (fallbackSnap.exists) {
        clinicId = fallbackSnap.id;
      } else {
        return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
      }
    }

    const colRef = db.collection("agencies").doc(agencyId).collection("clinics").doc(clinicId).collection("knowledgeBase");

    const existing = await colRef.get();
    for (const doc of existing.docs) {
      await doc.ref.delete();
    }

    const records = [
      {
        title: "Hospitadent Alanya Klinik Özeti",
        category: "Klinik Genel Bilgi",
        language: "TR",
        content: "Hospitadent Dental Group Alanya, 2021 yılında Dental Group Hospitadent’in 11. şubesi olarak Alanya’da açılmış bir diş kliniğidir. Alanya’nın merkezi konumunda, modern ve konforlu bir klinik ortamında ağız ve diş sağlığı hizmetleri sunar. Klinik; dental implant, zirkonyum kaplama, dijital gülüş tasarımı, laminate veneer, bonding, diş beyazlatma, panoramik röntgen ve dental tomografi gibi tedavi ve tanı hizmetleriyle öne çıkar.",
        isActive: true,
        priority: "Normal"
      },
      {
        title: "Hospitadent Alanya Sağlık Turizmi Desteği",
        category: "Hasta Destek Hizmetleri",
        language: "TR",
        content: "Hospitadent Alanya, yerel ve uluslararası hastalara hizmet verebilecek şekilde konumlandırılmıştır. Klinik Gazipaşa Havalimanı’na yakın konumdadır ve çevredeki turistik bölgelere erişim kolaydır. Sistem kayıtlarında ücretsiz panoramik röntgen ve dental tomografi, VIP havalimanı transfer desteği ve çok dilli hasta desteği bilgileri yer almaktadır.",
        isActive: true,
        priority: "Normal"
      },
      {
        title: "Hospitadent Alanya Tedavileri",
        category: "Tedaviler",
        language: "TR",
        content: "Klinikte dental implant, All-on-4, All-on-6, zirkonyum kaplama, Hollywood Smile, laminate veneer, bonding uygulamaları, diş beyazlatma, panoramik röntgen ve dental tomografi gibi diş tedavileri sunulmaktadır. Kesin tedavi planı doktor muayenesi ve klinik değerlendirme sonrası oluşturulmalıdır.",
        isActive: true,
        priority: "Normal"
      },
      {
        title: "Hospitadent Alanya Yanıt Kuralları",
        category: "Yanıt Kuralları",
        language: "TR",
        content: "AI asistan, Hospitadent Alanya hakkında cevap verirken kesin teşhis koymamalı, tedavi garantisi vermemeli ve nihai fiyatı kesin ifade etmemelidir. Fiyatlar tahmini olarak aktarılmalı ve kesin fiyatın klinik değerlendirme sonrası netleşeceği belirtilmelidir. Hasta röntgen, teşhis veya muayene bilgisi paylaşmadıysa ön değerlendirme için ek bilgi istenmelidir.",
        isActive: true,
        priority: "Yüksek"
      },
      {
        title: "Hospitadent Alanya Söylenmemesi Gerekenler",
        category: "Söylenmemesi Gerekenler",
        language: "TR",
        content: "Kesin tedavi garantisi verme. Kesin teşhis koyma. Fiyatların değişmeyeceğini söyleme. Doktor muayenesi olmadan tedavi süresi veya başarı oranı hakkında kesin ifade kullanma. Klinik adına hukuki, medikal veya finansal taahhüt verme.",
        isActive: true,
        priority: "Yüksek"
      }
    ];

    for (const rec of records) {
      await colRef.add({
        ...rec,
        agencyId,
        clinicId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    return NextResponse.json({ success: true, count: records.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
