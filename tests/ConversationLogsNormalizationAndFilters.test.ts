import { describe, it, expect } from "vitest";
import tr from "../locales/tr.json";
import en from "../locales/en.json";
import de from "../locales/de.json";
import ar from "../locales/ar.json";
import es from "../locales/es.json";
import {
  normalizeConversationStatus,
  getConversationStatusLabel,
  getConversationStatusVariant,
  isConversationConverted,
  isConversationManuallyConverted,
  isConversationSystemConverted,
  getConversionSource,
  exportConversationLogsToCSV,
  escapeCSV,
  CANONICAL_CONVERSATION_STATUSES,
  type CSVLogRecord,
} from "../lib/services/conversations/conversationStatusResolver";

describe("Conversation Status Normalization, Manual Conversion & Localization", () => {
  describe("1. Localization Dictionaries Integrity", () => {
    it("should contain all required common keys in Turkish and English", () => {
      expect(tr.common.all).toBe("Tümü");
      expect(tr.common.allTimes).toBe("Tüm Zamanlar");
      expect(tr.common.noLabel).toBe("Etiket Yok");
      expect(tr.common.systemStatus).toBe("Sistem Durumu");
      expect(tr.common.customLabel).toBe("Özel Etiket");
      expect(tr.common.exportCsv).toBe("CSV İndir");

      expect(en.common.all).toBe("All");
      expect(en.common.allTimes).toBe("All Time");
      expect(en.common.noLabel).toBe("No Label");
      expect(en.common.systemStatus).toBe("System Status");
      expect(en.common.customLabel).toBe("Custom Label");
      expect(en.common.exportCsv).toBe("Export CSV");
    });

    it("should contain all canonical status labels in Turkish and English without raw keys", () => {
      expect(tr.logs.status.successfully_answered).toBe("Başarılı Yanıtlandı");
      expect(tr.logs.status.collecting_appointment_information).toBe("Randevu Bilgisi Toplanıyor");
      expect(tr.logs.status.converted_to_appointment).toBe("Randevuya Dönüştü");
      expect(tr.logs.status.live_support_required).toBe("Canlı Destek Gerekli");
      expect(tr.logs.status.unanswered).toBe("Yanıtlanamadı");
      expect(tr.logs.status.answered).toBe("Başarılı Yanıtlandı");
      expect(tr.logs.status.appointment).toBe("Randevuya Dönüştü");
      expect(tr.logs.status.collecting).toBe("Randevu Bilgisi Toplanıyor");
      expect(tr.logs.status.liveSupport).toBe("Canlı Destek Gerekli");

      expect(en.logs.status.successfully_answered).toBe("Successfully Answered");
      expect(en.logs.status.collecting_appointment_information).toBe("Collecting Appointment Information");
      expect(en.logs.status.converted_to_appointment).toBe("Converted to Appointment");
      expect(en.logs.status.live_support_required).toBe("Live Support Required");
      expect(en.logs.status.unanswered).toBe("Unanswered");
      expect(en.logs.status.answered).toBe("Successfully Answered");
      expect(en.logs.status.appointment).toBe("Converted to Appointment");
      expect(en.logs.status.collecting).toBe("Collecting Appointment Information");
      expect(en.logs.status.liveSupport).toBe("Live Support Required");
    });

    it("should provide valid keys in DE, AR, ES without throwing or returning undefined", () => {
      expect(de.logs.status.successfully_answered).toBeDefined();
      expect(ar.logs.status.successfully_answered).toBeDefined();
      expect(es.logs.status.successfully_answered).toBeDefined();
    });
  });

  describe("2. normalizeConversationStatus() Backward-Compatibility & Accuracy", () => {
    it("should normalize legacy collecting status strings", () => {
      expect(normalizeConversationStatus("logs.status.collecting")).toBe("collecting_appointment_information");
      expect(normalizeConversationStatus("collecting")).toBe("collecting_appointment_information");
      expect(normalizeConversationStatus("appointment_collecting")).toBe("collecting_appointment_information");
      expect(normalizeConversationStatus("collecting_info")).toBe("collecting_appointment_information");
      expect(normalizeConversationStatus("Randevu Bilgisi Toplanıyor")).toBe("collecting_appointment_information");
      expect(normalizeConversationStatus("bilgi toplanıyor")).toBe("collecting_appointment_information");
    });

    it("should normalize appointment conversion status strings and context", () => {
      expect(normalizeConversationStatus("logs.status.appointment")).toBe("converted_to_appointment");
      expect(normalizeConversationStatus("appointment")).toBe("converted_to_appointment");
      expect(normalizeConversationStatus("appointment_converted")).toBe("converted_to_appointment");
      expect(normalizeConversationStatus("Randevuya Dönüştü")).toBe("converted_to_appointment");

      // Context with appointment ID or converted flag
      expect(normalizeConversationStatus("answered", { convertedToAppointment: true })).toBe("converted_to_appointment");
      expect(normalizeConversationStatus("collecting", { appointmentId: "apt-9988" })).toBe("converted_to_appointment");
      expect(normalizeConversationStatus(null, { appointmentStatus: "created" })).toBe("converted_to_appointment");
    });

    it("should normalize live support status strings", () => {
      expect(normalizeConversationStatus("logs.status.livesupport")).toBe("live_support_required");
      expect(normalizeConversationStatus("liveSupport")).toBe("live_support_required");
      expect(normalizeConversationStatus("live_support")).toBe("live_support_required");
      expect(normalizeConversationStatus("Canlı Destek Gerekli")).toBe("live_support_required");
    });

    it("should normalize unanswered status strings", () => {
      expect(normalizeConversationStatus("logs.status.unanswered")).toBe("unanswered");
      expect(normalizeConversationStatus("unanswered")).toBe("unanswered");
      expect(normalizeConversationStatus("failed")).toBe("unanswered");
      expect(normalizeConversationStatus("Yanıtlanamadı")).toBe("unanswered");
    });

    it("should normalize answered and default fallback status strings", () => {
      expect(normalizeConversationStatus("logs.status.answered")).toBe("successfully_answered");
      expect(normalizeConversationStatus("answered")).toBe("successfully_answered");
      expect(normalizeConversationStatus("successful")).toBe("successfully_answered");
      expect(normalizeConversationStatus("Başarılı Yanıtlandı")).toBe("successfully_answered");
      expect(normalizeConversationStatus("open")).toBe("successfully_answered");
      expect(normalizeConversationStatus(undefined)).toBe("successfully_answered");
      expect(normalizeConversationStatus("unknown_weird_status")).toBe("successfully_answered");
    });
  });

  describe("3. Conversion Resolution & Double Counting Prevention", () => {
    it("should identify system conversions correctly", () => {
      const chatbotConvertedLog = {
        status: "appointment",
        convertedToAppointment: true,
        appointmentId: "apt-123",
      };
      expect(isConversationSystemConverted(chatbotConvertedLog)).toBe(true);
      expect(isConversationManuallyConverted(chatbotConvertedLog)).toBe(false);
      expect(isConversationConverted(chatbotConvertedLog)).toBe(true);
      expect(getConversionSource(chatbotConvertedLog, "tr")).toBe("Chatbot");
      expect(getConversionSource(chatbotConvertedLog, "en")).toBe("Chatbot");
    });

    it("should identify manual conversions correctly via custom label or manual flag", () => {
      const manualConvertedLog = {
        status: "answered",
        convertedToAppointment: false,
        appointmentId: null,
        customLabelId: "converted_to_appointment",
        customLabelName: "Randevuya Dönüştü",
        manualConversionStatus: "converted_to_appointment",
      };
      expect(isConversationSystemConverted(manualConvertedLog)).toBe(false);
      expect(isConversationManuallyConverted(manualConvertedLog)).toBe(true);
      expect(isConversationConverted(manualConvertedLog)).toBe(true);
      expect(getConversionSource(manualConvertedLog, "tr")).toBe("Manuel");
      expect(getConversionSource(manualConvertedLog, "en")).toBe("Manual");
    });

    it("should prevent double counting when a log is both system and manually converted", () => {
      const doubleFlaggedLog = {
        status: "converted_to_appointment",
        convertedToAppointment: true,
        appointmentId: "apt-999",
        customLabelId: "converted_to_appointment",
        customLabelName: "Randevuya Dönüştü",
        manualConversionStatus: "converted_to_appointment",
      };

      expect(isConversationSystemConverted(doubleFlaggedLog)).toBe(true);
      expect(isConversationManuallyConverted(doubleFlaggedLog)).toBe(true);
      // isConversationConverted returns a single boolean (true)
      expect(isConversationConverted(doubleFlaggedLog)).toBe(true);
      expect(getConversionSource(doubleFlaggedLog, "tr")).toBe("Chatbot + Manuel");
      expect(getConversionSource(doubleFlaggedLog, "en")).toBe("Chatbot + Manual");

      // Aggregate conversion count must only increment once
      const logs = [doubleFlaggedLog, { status: "unanswered" }];
      let conversionCount = 0;
      logs.forEach((l) => {
        if (isConversationConverted(l)) conversionCount++;
      });
      expect(conversionCount).toBe(1);
    });

    it("should report uncoverted logs correctly", () => {
      const unconvertedLog = {
        status: "successfully_answered",
        convertedToAppointment: false,
        appointmentId: null,
        customLabelId: null,
      };
      expect(isConversationSystemConverted(unconvertedLog)).toBe(false);
      expect(isConversationManuallyConverted(unconvertedLog)).toBe(false);
      expect(isConversationConverted(unconvertedLog)).toBe(false);
      expect(getConversionSource(unconvertedLog, "tr")).toBe("Dönüşmedi");
      expect(getConversionSource(unconvertedLog, "en")).toBe("Not Converted");
    });
  });

  describe("4. Filter & Badge Consistency", () => {
    const mockLogs: Array<{
      id: string;
      patientName: string;
      status: string;
      convertedToAppointment?: boolean;
      appointmentId?: string | null;
      language: string;
      createdAt: string;
      customLabelId?: string | null;
      customLabelName?: string | null;
      manualConversionStatus?: string | null;
      lastMessagePreview: string;
    }> = [
      {
        id: "log-1",
        patientName: "Ahmet Yılmaz",
        status: "logs.status.collecting",
        language: "tr",
        createdAt: new Date().toISOString(),
        customLabelId: null,
        customLabelName: null,
        lastMessagePreview: "Fiyat bilgisi alabilir miyim?",
      },
      {
        id: "log-2",
        patientName: "John Doe",
        status: "answered",
        language: "en",
        createdAt: new Date().toISOString(),
        customLabelId: null,
        customLabelName: null,
        lastMessagePreview: "What are your opening hours?",
      },
      {
        id: "log-3",
        patientName: "Ayşe Kaya",
        status: "liveSupport",
        language: "tr",
        createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
        customLabelId: null,
        customLabelName: null,
        lastMessagePreview: "Yetkili biriyle görüşmek istiyorum",
      },
      {
        id: "log-4",
        patientName: "Fatma Demir",
        status: "answered",
        convertedToAppointment: true,
        appointmentId: "apt-123",
        language: "tr",
        createdAt: new Date().toISOString(),
        customLabelId: null,
        customLabelName: null,
        lastMessagePreview: "Yarın saat 14:00 için randevu onaylandı",
      },
      {
        id: "log-5",
        patientName: "Kemal Sunal",
        status: "answered",
        convertedToAppointment: false,
        appointmentId: null,
        customLabelId: "converted_to_appointment",
        customLabelName: "Randevuya Dönüştü",
        manualConversionStatus: "converted_to_appointment",
        language: "tr",
        createdAt: new Date().toISOString(),
        lastMessagePreview: "Telefonda randevu oluşturduk",
      },
    ];

    it("should filter converted appointments including both chatbot and manual conversions", () => {
      const convertedLogs = mockLogs.filter((l) => isConversationConverted(l));
      expect(convertedLogs).toHaveLength(2);
      expect(convertedLogs.map((l) => l.id)).toEqual(["log-4", "log-5"]);
    });

    it("should filter manual conversions specifically with label:converted_to_appointment", () => {
      const manualConvertedLogs = mockLogs.filter((l) => isConversationManuallyConverted(l));
      expect(manualConvertedLogs).toHaveLength(1);
      expect(manualConvertedLogs[0].id).toBe("log-5");
    });

    it("should match TR filter option labels with row badge labels exactly", () => {
      const statuses = [
        { code: "answered", expected: "Başarılı Yanıtlandı" },
        { code: "appointment", expected: "Randevuya Dönüştü" },
        { code: "collecting", expected: "Randevu Bilgisi Toplanıyor" },
        { code: "liveSupport", expected: "Canlı Destek Gerekli" },
        { code: "unanswered", expected: "Yanıtlanamadı" },
      ];

      for (const item of statuses) {
        const normalized = normalizeConversationStatus(item.code);
        const label = getConversationStatusLabel(normalized, "tr");
        expect(label).toBe(item.expected);
      }
    });

    it("should match EN filter option labels with row badge labels exactly", () => {
      const statuses = [
        { code: "answered", expected: "Successfully Answered" },
        { code: "appointment", expected: "Converted to Appointment" },
        { code: "collecting", expected: "Collecting Appointment Information" },
        { code: "liveSupport", expected: "Live Support Required" },
        { code: "unanswered", expected: "Unanswered" },
      ];

      for (const item of statuses) {
        const normalized = normalizeConversationStatus(item.code);
        const label = getConversationStatusLabel(normalized, "en");
        expect(label).toBe(item.expected);
      }
    });
  });

  describe("5. CSV Export Generation", () => {
    it("should properly escape CSV strings", () => {
      expect(escapeCSV("Simple")).toBe('"Simple"');
      expect(escapeCSV('With "Quotes"')).toBe('"With ""Quotes"""');
      expect(escapeCSV("With, Comma")).toBe('"With, Comma"');
      expect(escapeCSV("Line\nBreak")).toBe('"Line\nBreak"');
      expect(escapeCSV(null)).toBe('""');
    });

    it("should generate CSV with separated columns, conversion source, and clean headers without raw translation keys", () => {
      const records: CSVLogRecord[] = [
        {
          id: "conv-101",
          patientName: "Mehmet Öz",
          patientPhone: "+905551234567",
          language: "tr",
          status: "logs.status.collecting",
          convertedToAppointment: false,
          appointmentId: null,
          customLabelId: null,
          customLabelName: null,
          totalMessages: 5,
          createdAt: "2026-08-01T10:30:00Z",
          lastMessagePreview: "Tedavi fiyatını öğrenmek istiyorum",
        },
        {
          id: "conv-102",
          patientName: "Jane Smith",
          patientPhone: "+447911123456",
          language: "en",
          status: "answered",
          convertedToAppointment: true,
          appointmentId: "apt-550",
          customLabelId: null,
          customLabelName: null,
          totalMessages: 12,
          createdAt: "2026-08-02T14:15:00Z",
          lastMessagePreview: "Thank you for the confirmation",
        },
        {
          id: "conv-103",
          patientName: "Ali Veli",
          patientPhone: "+905321112233",
          language: "tr",
          status: "answered",
          convertedToAppointment: false,
          appointmentId: null,
          customLabelId: "converted_to_appointment",
          customLabelName: "Randevuya Dönüştü",
          manualConversionStatus: "converted_to_appointment",
          totalMessages: 8,
          createdAt: "2026-08-03T09:00:00Z",
          lastMessagePreview: "WhatsApp üzerinden randevu oluşturuldu",
        },
      ];

      // Export in Turkish
      const csvTr = exportConversationLogsToCSV(records, "tr");
      expect(csvTr.startsWith("\uFEFF")).toBe(true);
      expect(csvTr).toContain("Görüşme ID,Hasta Adı,Telefon,Dil,Görüşme Durumu,Özel Etiket,Dönüşüm Kaynağı,Randevuya Dönüştü,Randevu ID");
      expect(csvTr).toContain("Randevu Bilgisi Toplanıyor");
      expect(csvTr).toContain("Randevuya Dönüştü");
      expect(csvTr).toContain("Chatbot");
      expect(csvTr).toContain("Manuel");
      expect(csvTr).toContain("apt-550");
      expect(csvTr).toContain("Evet");
      expect(csvTr).toContain("Hayır");
      expect(csvTr).not.toContain("logs.status");

      // Export in English
      const csvEn = exportConversationLogsToCSV(records, "en");
      expect(csvEn.startsWith("\uFEFF")).toBe(true);
      expect(csvEn).toContain("Conversation ID,Patient Name,Phone,Language,Conversation Status,Custom Label,Conversion Source,Converted to Appointment,Appointment ID");
      expect(csvEn).toContain("Collecting Appointment Information");
      expect(csvEn).toContain("Converted to Appointment");
      expect(csvEn).toContain("Chatbot");
      expect(csvEn).toContain("Manual");
      expect(csvEn).toContain("Yes");
      expect(csvEn).toContain("No");
      expect(csvEn).toContain("No Label");
    });
  });
});
