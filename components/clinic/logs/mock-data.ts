import { ConversationLog, ConversationMessage } from "./types";

export const MOCK_CONVERSATIONS: ConversationLog[] = [
  {
    id: "log-1",
    clinicId: "demo-clinic",
    patientName: "Ahmet Yılmaz",
    patientPhone: "+905551234567",
    language: "tr",
    status: "converted_to_appointment",
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    totalMessages: 6,
    lastMessagePreview: "Tamamdır, yarın 14:00 için randevunuzu oluşturdum.",
    needsTraining: false,
    convertedToAppointment: true,
  },
  {
    id: "log-2",
    clinicId: "demo-clinic",
    patientName: "Sarah Connor",
    language: "en",
    status: "unanswered",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 1.8).toISOString(),
    totalMessages: 4,
    lastMessagePreview: "I can't answer questions about specific advanced sinus lift procedures. I will connect you to an agent.",
    needsTraining: true,
    trainingTopic: "Advanced Sinus Lift Procedure Details",
    convertedToAppointment: false,
  },
  {
    id: "log-3",
    clinicId: "demo-clinic",
    language: "tr",
    status: "needs_live_support",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 4.5).toISOString(),
    totalMessages: 5,
    lastMessagePreview: "Fiyat konusunda özel bir durumunuz var, sizi insan temsilciye aktarıyorum.",
    needsTraining: false,
    convertedToAppointment: false,
  },
  {
    id: "log-4",
    clinicId: "demo-clinic",
    patientName: "Ayşe K.",
    language: "tr",
    status: "answered",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 23.9).toISOString(),
    totalMessages: 3,
    lastMessagePreview: "Diş beyazlatma işlemi yaklaşık 45 dakika sürmektedir.",
    needsTraining: false,
    convertedToAppointment: false,
  }
];

export const MOCK_MESSAGES: Record<string, ConversationMessage[]> = {
  "log-1": [
    { id: "m1", sender: "patient", content: "Merhaba, implant fiyatları ne kadar?", createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m2", sender: "assistant", content: "Merhaba! İmplant fiyatlarımız 5.000 TL'den başlamaktadır. Ancak net bir fiyat için ön muayene gereklidir. Randevu almak ister misiniz?", createdAt: new Date(Date.now() - 1000 * 60 * 29).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m3", sender: "patient", content: "Evet, yarın öğleden sonra uygunum.", createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m4", sender: "assistant", content: "Yarın saat 14:00 uygun mu?", createdAt: new Date(Date.now() - 1000 * 60 * 19).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m5", sender: "patient", content: "Uygun, ismim Ahmet Yılmaz.", createdAt: new Date(Date.now() - 1000 * 60 * 16).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m6", sender: "assistant", content: "Tamamdır, yarın 14:00 için randevunuzu oluşturdum.", createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), wasAnswered: true, needsTraining: false }
  ],
  "log-2": [
    { id: "m1", sender: "patient", content: "Hi, I need a full mouth restoration.", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m2", sender: "assistant", content: "Hello! We offer full mouth restoration packages. Would you like to schedule a free consultation?", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 1.95).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m3", sender: "patient", content: "I have severe bone loss. Can you do an advanced sinus lift with lateral approach on the same day as extraction?", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 1.85).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m4", sender: "assistant", content: "I can't answer questions about specific advanced sinus lift procedures. I will connect you to an agent.", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 1.8).toISOString(), confidenceScore: 0.2, wasAnswered: false, needsTraining: true }
  ],
  "log-3": [
    { id: "m1", sender: "patient", content: "Merhaba, zirkonyum kaplama yaptırmak istiyorum ama 20 dişim yapılacak indirim olur mu?", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m2", sender: "assistant", content: "Merhaba! Zirkonyum kaplama için toplu işlemlerde indirim seçeneklerimiz mevcuttur. Size fiyat hesaplaması yapabilmem için iletişim numaranızı alabilir miyim?", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4.9).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m3", sender: "patient", content: "Hayır numara vermek istemiyorum, bana ortalama bir fiyat verin.", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4.6).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m4", sender: "assistant", content: "Fiyat konusunda özel bir durumunuz var, sizi insan temsilciye aktarıyorum.", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4.5).toISOString(), intent: "live_support", wasAnswered: true, needsTraining: false },
    { id: "m5", sender: "system", content: "Canlı destek talebi oluşturuldu.", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4.5).toISOString(), wasAnswered: true, needsTraining: false }
  ],
  "log-4": [
    { id: "m1", sender: "patient", content: "Diş beyazlatma ne kadar sürüyor?", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m2", sender: "assistant", content: "Diş beyazlatma işlemi yaklaşık 45 dakika sürmektedir.", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 23.9).toISOString(), wasAnswered: true, needsTraining: false },
    { id: "m3", sender: "patient", content: "Teşekkürler", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 23.8).toISOString(), wasAnswered: true, needsTraining: false }
  ]
};
