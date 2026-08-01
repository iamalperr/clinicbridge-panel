import { describe, it, expect } from 'vitest';
import {
  buildAppointmentReviewMessage,
  resolveConversationLocale,
  formatLocalizedDate,
  formatLocalizedTime,
  formatLocalizedTreatment,
  formatMultilingualSummary,
  formatMultilingualPrompt
} from '../lib/conversation';

describe('Localized Appointment Summary & Locale Resolution Suite', () => {

  // ── GROUP 1: Locale Resolution Priority Hierarchy ──
  describe('Group 1: Locale Resolution Priority Hierarchy', () => {
    it('1.1: Request language parameter takes highest precedence', () => {
      const resolved = resolveConversationLocale({
        requestLanguage: 'en',
        persistedLocale: 'tr',
        currentMessage: 'Merhaba randevu almak istiyorum',
        history: [],
        clinicDefaultLocale: 'tr'
      });
      expect(resolved).toBe('en');
    });

    it('1.2: Persisted conversation locale takes precedence over detected language or clinic default', () => {
      const resolved = resolveConversationLocale({
        requestLanguage: undefined,
        persistedLocale: 'en',
        currentMessage: 'Evet', // Short affirmative in TR, but session is EN
        history: [],
        clinicDefaultLocale: 'tr'
      });
      expect(resolved).toBe('en');
    });

    it('1.3: Message content language detection when request and persisted are empty', () => {
      const enResolved = resolveConversationLocale({
        requestLanguage: undefined,
        persistedLocale: null,
        currentMessage: 'I would like to book an appointment for dental implants please',
        history: [],
        clinicDefaultLocale: 'tr'
      });
      expect(enResolved).toBe('en');

      const trResolved = resolveConversationLocale({
        requestLanguage: undefined,
        persistedLocale: null,
        currentMessage: 'Diş implantı için randevu almak istiyorum',
        history: [],
        clinicDefaultLocale: 'en'
      });
      expect(trResolved).toBe('tr');
    });

    it('1.4: Conversation history fallback detection', () => {
      const resolved = resolveConversationLocale({
        requestLanguage: undefined,
        persistedLocale: null,
        currentMessage: '05551234567', // Just phone number, no words
        history: [
          { role: 'user', content: 'Hello, what are your opening hours?' },
          { role: 'assistant', content: 'We are open from 9 AM to 6 PM.' }
        ],
        clinicDefaultLocale: 'tr'
      });
      expect(resolved).toBe('en');
    });

    it('1.5: Clinic default locale fallback when no other signals are present', () => {
      const resolved = resolveConversationLocale({
        requestLanguage: undefined,
        persistedLocale: null,
        currentMessage: '12345',
        history: [],
        clinicDefaultLocale: 'tr'
      });
      expect(resolved).toBe('tr');
    });
  });

  // ── GROUP 2: Localized Date, Weekday, and Time Formatting ──
  describe('Group 2: Localized Date, Weekday, and Time Formatting', () => {
    it('2.1: formats English date as "Wednesday, August 5, 2026"', () => {
      const formatted = formatLocalizedDate('2026-08-05', 'en');
      expect(formatted).toBe('Wednesday, August 5, 2026');
    });

    it('2.2: formats Turkish date as "5 Ağustos 2026 Çarşamba"', () => {
      const formatted = formatLocalizedDate('2026-08-05', 'tr');
      expect(formatted).toBe('5 Ağustos 2026 Çarşamba');
    });

    it('2.3: formats German date as "Mittwoch, 5. August 2026"', () => {
      const formatted = formatLocalizedDate('2026-08-05', 'de');
      expect(formatted).toBe('Mittwoch, 5. August 2026');
    });

    it('2.4: formats English time with 12-hour AM/PM format', () => {
      expect(formatLocalizedTime('14:30', 'en')).toBe('2:30 PM');
      expect(formatLocalizedTime('09:15', 'en')).toBe('9:15 AM');
      expect(formatLocalizedTime('12:00', 'en')).toBe('12:00 PM');
      expect(formatLocalizedTime('00:30', 'en')).toBe('12:30 AM');
    });

    it('2.5: formats Turkish time with standard 24-hour format', () => {
      expect(formatLocalizedTime('14:30', 'tr')).toBe('14:30');
      expect(formatLocalizedTime('09:15', 'tr')).toBe('09:15');
    });

    it('2.6: translates treatments according to locale', () => {
      expect(formatLocalizedTreatment('implant', 'en')).toBe('Dental Implant');
      expect(formatLocalizedTreatment('implant', 'tr')).toBe('Diş İmplantı');
      expect(formatLocalizedTreatment('teeth_whitening', 'en')).toBe('Teeth Whitening');
      expect(formatLocalizedTreatment('teeth_whitening', 'tr')).toBe('Diş Beyazlatma');
      expect(formatLocalizedTreatment('zirconium', 'en')).toBe('Zirconium Crown');
      expect(formatLocalizedTreatment('zirconium', 'tr')).toBe('Zirkonyum Kaplama');
    });
  });

  // ── GROUP 3: Centralized buildAppointmentReviewMessage Output Validation ──
  describe('Group 3: Centralized buildAppointmentReviewMessage Validation', () => {
    it('3.1: Generates a completely English appointment review message with all required labels and date format', () => {
      const summary = buildAppointmentReviewMessage({
        locale: 'en',
        appointmentData: {
          patientName: 'John Doe',
          patientPhone: '+1 555 019 2834',
          patientEmail: 'john.doe@example.com',
          requestedService: 'implant',
          requestedDate: '2026-08-05',
          requestedWeekday: 'Wednesday',
          requestedTime: '14:30'
        },
        clinicName: 'Smile Dental Clinic'
      });

      // Verify header and intro
      expect(summary).toContain('Preliminary appointment request summary:');
      
      // Verify labels
      expect(summary).toContain('Full name: John Doe');
      expect(summary).toContain('Phone: +1 555 019 2834');
      expect(summary).toContain('Email: john.doe@example.com');
      expect(summary).toContain('Treatment: Dental Implant');
      expect(summary).toContain('Preferred date: Wednesday, August 5, 2026');
      expect(summary).toContain('Preferred time: 2:30 PM');

      // Verify confirmation question
      expect(summary).toContain('Would you like me to submit this preliminary appointment request to the clinic for review?');

      // Ensure NO Turkish strings leak into English summary
      expect(summary).not.toContain('Ön randevu');
      expect(summary).not.toContain('Ad Soyad');
      expect(summary).not.toContain('Telefon');
      expect(summary).not.toContain('Hizmet');
      expect(summary).not.toContain('Tercih Edilen');
      expect(summary).not.toContain('onaylıyor musunuz');
    });

    it('3.2: Generates a completely Turkish appointment review message with all required labels and date format', () => {
      const summary = buildAppointmentReviewMessage({
        locale: 'tr',
        appointmentData: {
          patientName: 'Ahmet Yılmaz',
          patientPhone: '05551234567',
          patientEmail: 'ahmet@example.com',
          requestedService: 'implant',
          requestedDate: '2026-08-05',
          requestedWeekday: 'Çarşamba',
          requestedTime: '14:30'
        },
        clinicName: 'DentArt Klinik'
      });

      // Verify header and intro
      expect(summary).toContain('Ön randevu talebinizin özeti:');
      
      // Verify labels
      expect(summary).toContain('Ad Soyad: Ahmet Yılmaz');
      expect(summary).toContain('Telefon: +90 555 123 45 67');
      expect(summary).toContain('E-posta: ahmet@example.com');
      expect(summary).toContain('Hizmet: Diş İmplantı');
      expect(summary).toContain('Tercih Edilen Tarih: 5 Ağustos 2026 Çarşamba');
      expect(summary).toContain('Tercih Edilen Saat: 14:30');

      // Verify confirmation question
      expect(summary).toContain('Bu bilgilerle ön randevu talebinizi kliniğin değerlendirmesine iletmemi onaylıyor musunuz?');

      // Ensure NO English strings leak into Turkish summary
      expect(summary).not.toContain('Preliminary appointment');
      expect(summary).not.toContain('Full name');
      expect(summary).not.toContain('Preferred date');
      expect(summary).not.toContain('Would you like me');
    });

    it('3.3: Handles missing optional fields gracefully in English', () => {
      const summary = buildAppointmentReviewMessage({
        locale: 'en',
        appointmentData: {
          patientName: 'Jane Smith',
          patientPhone: '+44 7700 900077',
          patientEmail: undefined,
          requestedService: 'General Consultation',
          requestedDate: '2026-09-10',
          requestedWeekday: 'Thursday',
          requestedTime: undefined
        }
      });

      expect(summary).toContain('Full name: Jane Smith');
      expect(summary).toContain('Email: -');
      expect(summary).toContain('Preferred date: Thursday, September 10, 2026');
      expect(summary).toContain('Preferred time: -');
    });

    it('3.4: formatMultilingualSummary backwards-compatibility delegate works identically', () => {
      const draft = {
        patientName: 'Sarah Connor',
        patientPhone: '+1 555 333 4444',
        patientEmail: 'sarah@skynet.com',
        requestedService: 'teeth_whitening',
        requestedDate: '2026-08-05',
        requestedWeekday: 'Wednesday',
        requestedTime: '10:00'
      };

      const resultEn = formatMultilingualSummary(draft, 'en');
      expect(resultEn).toContain('Full name: Sarah Connor');
      expect(resultEn).toContain('Treatment: Teeth Whitening');
      expect(resultEn).toContain('Wednesday, August 5, 2026');
      expect(resultEn).toContain('10:00 AM');

      const resultTr = formatMultilingualSummary(draft, 'tr');
      expect(resultTr).toContain('Ad Soyad: Sarah Connor');
      expect(resultTr).toContain('Hizmet: Diş Beyazlatma');
      expect(resultTr).toContain('5 Ağustos 2026 Çarşamba');
      expect(resultTr).toContain('10:00');
    });
  });

  // ── GROUP 4: formatMultilingualPrompt Validation ──
  describe('Group 4: formatMultilingualPrompt Localized Strings', () => {
    it('4.1: formats prompts correctly in English', () => {
      expect(formatMultilingualPrompt('ASK_NAME', 'en')).toBe(
        'Thank you. Could you please share your full name so we can record your appointment request?'
      );
      expect(formatMultilingualPrompt('ASK_PHONE', 'en', 'John')).toBe(
        'Thank you, John. Could you please provide your phone number so the clinic team can confirm your appointment?'
      );
      expect(formatMultilingualPrompt('ASK_EMAIL', 'en')).toBe(
        'Thank you for sharing your phone number. Could you please provide your email address so we can finalize your appointment request?'
      );
      expect(formatMultilingualPrompt('INVALID_PHONE', 'en')).toBe(
        'Could you please check your phone number? We need a valid contact number so our clinic team can reach you.'
      );
      expect(formatMultilingualPrompt('CANCELLED', 'en')).toBe(
        'Your appointment request has been cancelled. How else may I assist you?'
      );
    });

    it('4.2: formats prompts correctly in Turkish', () => {
      expect(formatMultilingualPrompt('ASK_NAME', 'tr')).toBe(
        'Teşekkürler. Ön randevu talebinizi oluşturabilmem için adınızı ve soyadınızı öğrenebilir miyim?'
      );
      expect(formatMultilingualPrompt('ASK_PHONE', 'tr', 'Ahmet')).toBe(
        'Teşekkür ederim, Ahmet Bey/Hanım. Kliniğimizin ön randevu talebinizle ilgili sizinle iletişime geçebilmesi için telefon numaranızı paylaşabilir misiniz?'
      );
      expect(formatMultilingualPrompt('CANCELLED', 'tr')).toBe(
        'Randevu talebiniz iptal edildi. Size başka nasıl yardımcı olabilirim?'
      );
    });
  });
});
