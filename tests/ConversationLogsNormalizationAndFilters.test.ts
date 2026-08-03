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
  exportConversationLogsToCSV,
  escapeCSV,
  CANONICAL_CONVERSATION_STATUSES,
  type CSVLogRecord,
} from "../lib/services/conversations/conversationStatusResolver";

describe("Conversation Status Normalization and Localization", () => {
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

  describe("3. Localized Labels and Badge Variants", () => {
    it("should return accurate localized labels for all canonical statuses in TR and EN", () => {
      for (const status of CANONICAL_CONVERSATION_STATUSES) {
        const labelTr = getConversationStatusLabel(status, "tr");
        const labelEn = getConversationStatusLabel(status, "en");

        expect(labelTr).toBeTruthy();
        expect(labelEn).toBeTruthy();
        expect(labelTr).not.toContain("logs.status");
        expect(labelEn).not.toContain("logs.status");
      }

      expect(getConversationStatusLabel("collecting_appointment_information", "tr")).toBe("Randevu Bilgisi Toplanıyor");
      expect(getConversationStatusLabel("collecting_appointment_information", "en")).toBe("Collecting Appointment Information");
      expect(getConversationStatusLabel("converted_to_appointment", "tr")).toBe("Randevuya Dönüştü");
      expect(getConversationStatusLabel("converted_to_appointment", "en")).toBe("Converted to Appointment");
    });

    it("should return correct badge variants for each status", () => {
      expect(getConversationStatusVariant("successfully_answered")).toBe("resolved");
      expect(getConversationStatusVariant("collecting_appointment_information")).toBe("warning");
      expect(getConversationStatusVariant("converted_to_appointment")).toBe("pro");
      expect(getConversationStatusVariant("live_support_required")).toBe("open");
      expect(getConversationStatusVariant("unanswered")).toBe("failed");
    });
  });

  describe("4. Multi-Criteria Filtering Logic and Filter Options Match", () => {
    const mockLogs: Array<{
      id: string;
      patientName: string;
      status: string;
      language: string;
      createdAt: string;
      customLabelId?: string | null;
      customLabelName?: string | null;
      convertedToAppointment?: boolean;
      appointmentId?: string;
      lastMessagePreview: string;
    }> = [
      {
        id: "log-1",
        patientName: "Ahmet Yılmaz",
        status: "logs.status.collecting",
        language: "tr",
        createdAt: new Date().toISOString(),
        customLabelId: "lbl-vip",
        customLabelName: "VIP Patient",
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
        customLabelId: "lbl-urgent",
        customLabelName: "Acil Takip",
        lastMessagePreview: "Yarın saat 14:00 için randevu onaylandı",
      },
    ];

    it("should filter by canonical conversation status", () => {
      const collectingLogs = mockLogs.filter(
        (l) =>
          normalizeConversationStatus(l.status, {
            convertedToAppointment: l.convertedToAppointment,
            appointmentId: l.appointmentId,
          }) === "collecting_appointment_information"
      );
      expect(collectingLogs).toHaveLength(1);
      expect(collectingLogs[0].id).toBe("log-1");

      const convertedLogs = mockLogs.filter(
        (l) =>
          normalizeConversationStatus(l.status, {
            convertedToAppointment: l.convertedToAppointment,
            appointmentId: l.appointmentId,
          }) === "converted_to_appointment"
      );
      expect(convertedLogs).toHaveLength(1);
      expect(convertedLogs[0].id).toBe("log-4");
    });

    it("should filter by custom label correctly (None vs Specific ID)", () => {
      // Filter "No Label"
      const noLabelLogs = mockLogs.filter((l) => !l.customLabelId);
      expect(noLabelLogs).toHaveLength(2);
      expect(noLabelLogs.map((l) => l.id)).toEqual(["log-2", "log-3"]);

      // Filter "VIP Patient"
      const vipLogs = mockLogs.filter((l) => l.customLabelId === "lbl-vip");
      expect(vipLogs).toHaveLength(1);
      expect(vipLogs[0].id).toBe("log-1");
    });

    it("should perform multi-criteria filtering simultaneously", () => {
      const filtered = mockLogs.filter((log) => {
        // Status filter: converted_to_appointment
        const norm = normalizeConversationStatus(log.status, log);
        if (norm !== "converted_to_appointment") return false;

        // Custom label filter: lbl-urgent
        if (log.customLabelId !== "lbl-urgent") return false;

        // Language filter: tr
        if (log.language !== "tr") return false;

        // Search: Fatma
        if (!log.patientName.toLowerCase().includes("fatma")) return false;

        return true;
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("log-4");
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

    it("should generate CSV with separated columns and clean headers without raw translation keys", () => {
      const records: CSVLogRecord[] = [
        {
          id: "conv-101",
          patientName: "Mehmet Öz",
          patientPhone: "+905551234567",
          language: "tr",
          status: "logs.status.collecting",
          convertedToAppointment: false,
          appointmentId: null,
          customLabelId: "lbl-lead",
          customLabelName: "Potansiyel Hasta",
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
      ];

      // Export in Turkish
      const csvTr = exportConversationLogsToCSV(records, "tr");
      expect(csvTr.startsWith("\uFEFF")).toBe(true);
      expect(csvTr).toContain("Görüşme ID,Hasta Adı,Telefon,Dil,Görüşme Durumu,Özel Etiket,Randevuya Dönüştü,Randevu ID");
      expect(csvTr).toContain("Randevu Bilgisi Toplanıyor");
      expect(csvTr).toContain("Potansiyel Hasta");
      expect(csvTr).toContain("Randevuya Dönüştü");
      expect(csvTr).toContain("apt-550");
      expect(csvTr).toContain("Evet");
      expect(csvTr).toContain("Hayır");
      expect(csvTr).not.toContain("logs.status");

      // Export in English
      const csvEn = exportConversationLogsToCSV(records, "en");
      expect(csvEn.startsWith("\uFEFF")).toBe(true);
      expect(csvEn).toContain("Conversation ID,Patient Name,Phone,Language,Conversation Status,Custom Label,Converted to Appointment,Appointment ID");
      expect(csvEn).toContain("Collecting Appointment Information");
      expect(csvEn).toContain("Converted to Appointment");
      expect(csvEn).toContain("Yes");
      expect(csvEn).toContain("No");
      expect(csvEn).toContain("No Label");
    });
  });
});
