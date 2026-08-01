import { describe, it, expect } from 'vitest';
import {
  IntentRouter,
  SlotExtractor,
  ConversationStateEngine,
  ConversationLogger,
  ConversationSlots,
  ConversationState
} from '../lib/conversation';

describe('Unified Conversation Engine & Intent Router Test Suite', () => {

  // ── SCENARIO A: Date Formats ──
  describe('Scenario A: Date Format Parsing & Resolution', () => {
    it('parses D/M/YYYY numeric format (1/8/2026)', () => {
      const res = SlotExtractor.extractSlots('1/8/2026');
      expect(res.extracted.preferredDate).toBe('2026-08-01');
      expect(res.extracted.preferredWeekday).toBe('Cumartesi');
    });

    it('parses DD.MM.YYYY dot format (01.08.2026)', () => {
      const res = SlotExtractor.extractSlots('01.08.2026');
      expect(res.extracted.preferredDate).toBe('2026-08-01');
      expect(res.extracted.preferredWeekday).toBe('Cumartesi');
    });

    it('parses Turkish full text date (1 Ağustos 2026)', () => {
      const res = SlotExtractor.extractSlots('1 Ağustos 2026');
      expect(res.extracted.preferredDate).toBe('2026-08-01');
      expect(res.extracted.preferredWeekday).toBe('Cumartesi');
    });

    it('parses Turkish month-first text date (Ağustos 1)', () => {
      const res = SlotExtractor.extractSlots('Ağustos 1');
      expect(res.extracted.preferredDate).toContain('-08-01');
    });

    it('parses English ordinal text date (August 3rd)', () => {
      const res = SlotExtractor.extractSlots('August 3rd', {}, 'en');
      expect(res.extracted.preferredDate).toContain('-08-03');
    });
  });

  // ── SCENARIO B: Time Preferences ──
  describe('Scenario B: Time Preferences & Clock Formats', () => {
    it('parses exact 24h clock time (14:00)', () => {
      const res = SlotExtractor.extractSlots('Saat 14:00 uygun');
      expect(res.extracted.preferredTime).toBe('14:00');
    });

    it('parses Turkish fuzzy time (Sabah)', () => {
      const res = SlotExtractor.extractSlots('Sabah saatleri benim için daha iyi');
      expect(res.extracted.preferredTime).toBe('sabah');
    });

    it('parses Turkish fuzzy time (Öğleden sonra)', () => {
      const res = SlotExtractor.extractSlots('Öğleden sonra gelebilirim');
      expect(res.extracted.preferredTime).toBe('öğleden_sonra');
    });

    it('parses English fuzzy time (Morning)', () => {
      const res = SlotExtractor.extractSlots('In the morning please', {}, 'en');
      expect(res.extracted.preferredTime).toBe('morning');
    });
  });

  // ── SCENARIO C: Multi-Intent Handling ──
  describe('Scenario C: Multi-Intent & Mixed Queries', () => {
    it('extracts slots while routing knowledge query to pricing', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: '1 Ağustos saat 14:00 uygun, peki implant fiyatı nedir?',
        currentState: 'APPOINTMENT_COLLECTION'
      });

      expect(res.intent).toBe('pricing_request');
      expect(res.requiresKnowledgeBase).toBe(true);
      expect(res.shouldContinueActiveFlow).toBe(true);
      expect(res.entities.preferredDate).toBe('2026-08-01');
      expect(res.entities.preferredTime).toBe('14:00');
      expect(res.entities.treatment).toBe('implant');
    });
  });

  // ── SCENARIO D: Topic Interruption & Recovery ──
  describe('Scenario D: Interruption Handling in Active Appointment Flow', () => {
    it('detects interruption when user asks for clinic location', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Kliniğiniz tam olarak nerede bulunuyor?',
        currentState: 'APPOINTMENT_COLLECTION'
      });

      expect(res.intent).toBe('clinic_location');
      expect(res.requiresKnowledgeBase).toBe(true);
      expect(res.isInterruption).toBe(true);
      expect(res.shouldContinueActiveFlow).toBe(true);
    });

    it('generates prompt for next missing slot without losing previous slots', () => {
      const existingSlots: Partial<ConversationSlots> = {
        preferredDate: '2026-08-01',
        preferredTime: '14:00'
      };
      const missing = ConversationStateEngine.getMissingSlots(existingSlots);
      expect(missing).toEqual(['fullName', 'phone']);

      const prompt = ConversationStateEngine.generateNextSlotPrompt(existingSlots, missing, 'tr');
      expect(prompt).toContain('adınızı ve soyadınızı');
    });
  });

  // ── SCENARIO E: Complaint & Live Support ──
  describe('Scenario E: Complaint & Live Support Escalation', () => {
    it('classifies dissatisfaction / lack of response as complaint', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Klinik dünden beri cevap vermiyor, acil yetkili biri baksın',
        currentState: 'APPOINTMENT_COLLECTION'
      });

      expect(res.intent === 'complaint' || res.intent === 'live_support_request').toBe(true);
      expect(res.requiresKnowledgeBase).toBe(false);
    });

    it('classifies explicit live support request', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Canlı destek ile görüşmek istiyorum'
      });

      expect(res.intent).toBe('live_support_request');
      expect(res.requiresKnowledgeBase).toBe(false);
    });
  });

  // ── SCENARIO F: Slot Corrections ──
  describe('Scenario F: Slot Corrections Handling', () => {
    it('detects and extracts date correction ("1 Ağustos değil, 3 Ağustos olsun")', () => {
      const existingSlots: Partial<ConversationSlots> = {
        preferredDate: '2026-08-01',
        preferredTime: '14:00',
        fullName: 'Ahmet Yılmaz',
        phone: '05321234567'
      };

      const res = SlotExtractor.extractSlots(
        'Aslında 1 Ağustos değil, 3 Ağustos olsun',
        existingSlots
      );

      expect(res.isCorrection).toBe(true);
      expect(res.correctedSlotKey).toBe('preferredDate');
      expect(res.extracted.preferredDate).toBe('2026-08-03');
      expect(res.extracted.preferredWeekday).toBe('Pazartesi');
    });
  });

  // ── SCENARIO G: Visit Type Extraction ──
  describe('Scenario G: Visit Type Recognition', () => {
    it('recognizes first visit intent ("ilk gelişimiz")', () => {
      const res = SlotExtractor.extractSlots('Kliniğe ilk gelişimiz olacak');
      expect(res.extracted.visitType).toBe('first_visit');
    });

    it('recognizes follow-up checkup intent ("kontrole geleceğim")', () => {
      const res = SlotExtractor.extractSlots('Tedavi sonrası kontrole geleceğim');
      expect(res.extracted.visitType).toBe('control');
    });
  });

  // ── SCENARIO H: English Locale Support ──
  describe('Scenario H: English Locale Flows', () => {
    it('generates English prompts and review text', () => {
      const slots: Partial<ConversationSlots> = {
        preferredDate: '2026-08-03',
        preferredTime: '14:00',
        fullName: 'John Doe',
        phone: '+44 7911 123456',
        treatment: 'implant'
      };

      const missing = ConversationStateEngine.getMissingSlots(slots);
      expect(missing.length).toBe(0);

      const reviewPrompt = ConversationStateEngine.generateNextSlotPrompt(slots, missing, 'en');
      expect(reviewPrompt).toContain('Thank you!');
      expect(reviewPrompt).toContain('Date: 2026-08-03');
      expect(reviewPrompt).toContain('Name: John Doe');
      expect(reviewPrompt).toContain('feelinhealthy.com/kvkk');
    });
  });

  // ── SCENARIO I: Full State Machine Progression ──
  describe('Scenario I: State Transitions & Completeness', () => {
    it('transitions through full appointment lifecycle', () => {
      // 1. Initial appointment request
      let context = {
        conversationId: 'test_conv_1',
        channel: 'admin' as const,
        locale: 'tr',
        currentState: 'INITIAL' as ConversationState,
        slots: {}
      };

      const step1Intent = IntentRouter.classifyConversationIntent({
        message: 'Randevu almak istiyorum',
        currentState: context.currentState
      });
      expect(step1Intent.intent).toBe('appointment_start');

      const trans1 = ConversationStateEngine.processTransition(context, step1Intent);
      expect(trans1.nextState).toBe('APPOINTMENT_COLLECTION');
      context.currentState = trans1.nextState;
      context.slots = trans1.updatedSlots;

      // 2. Date input
      const step2Intent = IntentRouter.classifyConversationIntent({
        message: '1 Ağustos 2026',
        currentState: context.currentState,
        collectedSlots: context.slots
      });
      const trans2 = ConversationStateEngine.processTransition(context, step2Intent);
      expect(trans2.updatedSlots.preferredDate).toBe('2026-08-01');
      context.slots = trans2.updatedSlots;

      // 3. Time input
      const step3Intent = IntentRouter.classifyConversationIntent({
        message: '14:00',
        currentState: context.currentState,
        collectedSlots: context.slots
      });
      const trans3 = ConversationStateEngine.processTransition(context, step3Intent);
      expect(trans3.updatedSlots.preferredTime).toBe('14:00');
      context.slots = trans3.updatedSlots;

      // 4. Name input
      const step4Intent = IntentRouter.classifyConversationIntent({
        message: 'Ahmet Yılmaz',
        currentState: context.currentState,
        collectedSlots: context.slots
      });
      const trans4 = ConversationStateEngine.processTransition(context, step4Intent);
      expect(trans4.updatedSlots.fullName).toBe('Ahmet Yılmaz');
      context.slots = trans4.updatedSlots;

      // 5. Phone input -> Completes required slots -> Reaches APPOINTMENT_REVIEW
      const step5Intent = IntentRouter.classifyConversationIntent({
        message: '0532 123 45 67',
        currentState: context.currentState,
        collectedSlots: context.slots
      });
      const trans5 = ConversationStateEngine.processTransition(context, step5Intent);
      expect(trans5.nextState).toBe('APPOINTMENT_REVIEW');
      expect(trans5.missingRequiredSlots.length).toBe(0);
      context.currentState = trans5.nextState;
      context.slots = trans5.updatedSlots;

      // 6. Confirmation -> APPOINTMENT_SUBMITTED
      const step6Intent = IntentRouter.classifyConversationIntent({
        message: 'Evet, onaylıyorum',
        currentState: context.currentState,
        collectedSlots: context.slots
      });
      const trans6 = ConversationStateEngine.processTransition(context, step6Intent);
      expect(trans6.nextState).toBe('APPOINTMENT_SUBMITTED');
    });
  });

  // ── SCENARIO K: Multilingual Email, Phone & Formatters ──
  describe('Scenario K: Multilingual Slot Extraction & Sequential Prompts', () => {
    it('extracts emails with numbers, dots and hyphens correctly', () => {
      const email1 = SlotExtractor.parseEmail('sadiahammad1@hotmail.com');
      expect(email1).toBe('sadiahammad1@hotmail.com');

      const email2 = SlotExtractor.parseEmail('My email is john.doe-99@sub.domain.co.uk please use it');
      expect(email2).toBe('john.doe-99@sub.domain.co.uk');

      const res = SlotExtractor.extractSlots('sadiahammad1@hotmail.com', { expectedSlot: 'email' }, 'en');
      expect(res.extracted.email).toBe('sadiahammad1@hotmail.com');
    });

    it('classifies email intent correctly when expectedSlot is email', () => {
      const result = IntentRouter.classifyConversationIntent({
        message: 'sadiahammad1@hotmail.com',
        currentState: 'APPOINTMENT_COLLECTION',
        expectedSlot: 'email',
        collectedSlots: {
          preferredDate: '2026-08-03',
          preferredTime: '10:00',
          fullName: 'Sadia Hammad',
          phone: '+905321234567'
        },
        locale: 'en'
      });

      expect(result.intent).toBe('appointment_continuation');
      expect(result.entities.email).toBe('sadiahammad1@hotmail.com');
      expect(result.requiresKnowledgeBase).toBe(false);
      expect(result.shouldContinueActiveFlow).toBe(true);
    });

    it('extracts international phone numbers accurately', () => {
      const ukPhone = SlotExtractor.parsePhone('+44 7911 123456');
      expect(ukPhone).toBe('+44 7911 123456');

      const dePhone = SlotExtractor.parsePhone('+49 151 23456789');
      expect(dePhone).toBe('+49 151 23456789');

      const trPhone = SlotExtractor.parsePhone('0532 123 45 67');
      expect(trPhone).toBe('0532 123 45 67');
    });

    it('generates accurate multilingual appointment summaries', async () => {
      const { formatMultilingualSummary } = await import('../lib/conversation');

      const draft = {
        patientName: 'Sadia Hammad',
        patientPhone: '+44 7911 123456',
        patientEmail: 'sadiahammad1@hotmail.com',
        requestedService: 'Dental Checkup',
        requestedDate: '2026-08-03',
        requestedTime: '10:00'
      };

      const enSummary = formatMultilingualSummary(draft, 'en');
      expect(enSummary).toContain('Summary of your appointment request:');
      expect(enSummary).toContain('Sadia Hammad');
      expect(enSummary).toContain('sadiahammad1@hotmail.com');
      expect(enSummary).toContain('Would you like me to submit this appointment request');

      const deSummary = formatMultilingualSummary(draft, 'de');
      expect(deSummary).toContain('Zusammenfassung Ihrer Terminanfrage:');
      expect(deSummary).toContain('Ja oder Nein');

      const frSummary = formatMultilingualSummary(draft, 'fr');
      expect(frSummary).toContain('Récapitulatif de votre demande de rendez-vous:');

      const trSummary = formatMultilingualSummary(draft, 'tr');
      expect(trSummary).toContain('Ön randevu talebinizin özeti:');
      expect(trSummary).toContain('Evet veya Hayır');
    });

    it('generates accurate multilingual sequential prompts', async () => {
      const { formatMultilingualPrompt } = await import('../lib/conversation');

      const enNamePrompt = formatMultilingualPrompt('ASK_NAME', 'en');
      expect(enNamePrompt).toContain('Could you please share your full name');

      const enEmailPrompt = formatMultilingualPrompt('ASK_EMAIL', 'en');
      expect(enEmailPrompt).toContain('Could you please provide your email address');

      const enInvalidEmail = formatMultilingualPrompt('INVALID_EMAIL', 'en');
      expect(enInvalidEmail).toContain('That email address appears to be incomplete');

      const enCancelled = formatMultilingualPrompt('CANCELLED', 'en');
      expect(enCancelled).toContain('Your appointment request has been cancelled');
    });
  });

  // ── SCENARIO J: PII Logging & Safety ──
  describe('Scenario J: Observability & Masking', () => {
    it('masks emails and phone numbers correctly', () => {
      const maskedEmail = ConversationLogger.maskEmail('patient.test@clinicbridge.com');
      expect(maskedEmail).toBe('p***t@clinicbridge.com');

      const maskedPhone = ConversationLogger.maskPhone('05321234567');
      expect(maskedPhone).toBe('0532******67');

      const maskedSlots = ConversationLogger.maskSlots({
        fullName: 'Ahmet Yılmaz',
        email: 'ahmet@example.com',
        phone: '05321234567',
        preferredDate: '2026-08-01'
      });

      expect(maskedSlots?.fullName).toBe('A*** Y***');
      expect(maskedSlots?.email).toBe('a***t@example.com');
      expect(maskedSlots?.phone).toBe('0532******67');
      expect(maskedSlots?.preferredDate).toBe('2026-08-01');
    });
  });
});
