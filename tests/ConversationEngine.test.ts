import { describe, it, expect } from 'vitest';
import {
  IntentRouter,
  SlotExtractor,
  ContextResolver,
  ConversationStateEngine,
  ConversationLogger,
  ConversationSlots,
  ConversationState,
  formatPricingFallback,
  formatContactResponse
} from '../lib/conversation';

describe('Unified Conversation Engine & Hardened Intent Resolution Suite', () => {

  // ── GROUP A: Generalized Pricing & Treatment Extraction ──
  describe('Group A: Generalized Pricing Intent & Entity Extraction', () => {
    it('A1: maps composite filling query to pricing_request + composite_filling', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Kompozit dolgu fiyatı ne kadar?',
        locale: 'tr'
      });
      expect(res.intent).toBe('pricing_request');
      expect(res.entities.treatment).toBe('composite_filling');
      expect(res.requiresPricingData).toBe(true);
    });

    it('A2: maps zirconium crown query to pricing_request + zirconium', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Zirkonyum kaplama ne kadar tutar?',
        locale: 'tr'
      });
      expect(res.intent).toBe('pricing_request');
      expect(res.entities.treatment).toBe('zirconium');
      expect(res.requiresPricingData).toBe(true);
    });

    it('A3: maps root canal query to pricing_request + root_canal', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Kanal tedavisi ücreti nedir?',
        locale: 'tr'
      });
      expect(res.intent).toBe('pricing_request');
      expect(res.entities.treatment).toBe('root_canal');
      expect(res.requiresPricingData).toBe(true);
    });

    it('A4: maps English implant price query with currency to pricing_request + implant + EUR', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'What is the price of dental implant in EUR?',
        locale: 'en'
      });
      expect(res.intent).toBe('pricing_request');
      expect(res.entities.treatment).toBe('implant');
      expect(res.entities.currency).toBe('EUR');
    });

    it('A5: maps teeth whitening cost query to pricing_request + teeth_whitening', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Diş beyazlatma pahalı mı?',
        locale: 'tr'
      });
      expect(res.intent).toBe('pricing_request');
      expect(res.entities.treatment).toBe('teeth_whitening');
    });

    it('A6: provides polite fallback when pricing is unknown without failure messages', () => {
      const trFallback = formatPricingFallback('implant', 'tr');
      expect(trFallback).toContain('net fiyat');
      expect(trFallback).not.toContain('doğrulayamıyorum');

      const enFallback = formatPricingFallback('implant', 'en');
      expect(enFallback).toContain('final price');
      expect(enFallback).not.toContain('cannot verify');
    });
  });

  // ── GROUP B: Contextual Ellipsis & Multi-Turn Resolution ──
  describe('Group B: Contextual Ellipsis & Follow-Up Resolution', () => {
    it('B1: resolves "When?" in active appointment flow to availability_request', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'When?',
        currentState: 'APPOINTMENT_COLLECTION',
        activeTreatment: 'implant',
        locale: 'en'
      });
      expect(res.intent).toBe('availability_request');
      expect(res.entities.treatment).toBe('implant');
    });

    it('B2: prompts clarification with structured options for ambiguous "When?" outside appointment flow', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Ne zaman?',
        currentState: 'INITIAL',
        activeTreatment: 'zirconia_crown',
        locale: 'tr'
      });
      expect(res.clarificationNeeded).toBe(true);
      expect(res.clarificationPrompt).toContain('Kliniği ne zaman ziyaret');
      expect(res.suggestedOptions).toBeDefined();
      expect(res.suggestedOptions?.length).toBeGreaterThan(0);
    });

    it('B3: resolves "How much?" using previous turn active treatment', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'How much?',
        activeTreatment: 'veneers',
        locale: 'en'
      });
      expect(res.intent).toBe('pricing_request');
      expect(res.entities.treatment).toBe('veneers');
      expect(res.entities.informationType).toBe('price');
    });

    it('B4: resolves "Where?" to location_request', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Where?',
        activeClinic: 'Dent Istanbul',
        locale: 'en'
      });
      expect(res.intent).toBe('location_request');
      expect(res.entities.informationType).toBe('location');
    });

    it('B5: resolves "What about recovery?" to treatment_information with recovery type', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'What about recovery?',
        activeTreatment: 'hair_transplant',
        locale: 'en'
      });
      expect(res.intent).toBe('treatment_information');
      expect(res.entities.treatment).toBe('hair_transplant');
      expect(res.entities.informationType).toBe('recovery');
    });
  });

  // ── GROUP C: Contact Inquiries & Flow Interruption ──
  describe('Group C: Contact Inquiries, Live Support & Flow Preservation', () => {
    it('C1: handles "Can I talk to your team?" with contact_request and preserves active flow', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Can I talk to your team?',
        currentState: 'APPOINTMENT_COLLECTION',
        locale: 'en'
      });
      expect(res.intent).toBe('contact_request');
      expect(res.shouldContinueActiveFlow).toBe(true);
      expect(res.isInterruption).toBe(true);
    });

    it('C2: generates polite contact response with clinic phone number', () => {
      const contactMsg = formatContactResponse('+90 212 555 0101', 'clinic_team', 'tr');
      expect(contactMsg).toContain('+90 212 555 0101');
      expect(contactMsg).toContain('Klinik ekibimize');

      const enMsg = formatContactResponse('+90 212 555 0101', 'clinic_team', 'en');
      expect(enMsg).toContain('+90 212 555 0101');
      expect(enMsg).toContain('Our clinic team');
    });

    it('C3: handles "Beni arayın" as live_support_request', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Lütfen beni arayın',
        locale: 'tr'
      });
      expect(res.intent).toBe('live_support_request');
    });
  });

  // ── GROUP D: Slot Extraction, Normalization & Corrections ──
  describe('Group D: Slot Extraction, Normalization & State Corrections', () => {
    it('D1: detects and parses slot correction ("1 Ağustos değil 3 Ağustos olsun")', () => {
      const res = SlotExtractor.extractSlots(
        '1 Ağustos değil 3 Ağustos olsun',
        { preferredDate: '2026-08-01' }
      );
      expect(res.isCorrection).toBe(true);
      expect(res.extracted.preferredDate).toBe('2026-08-03');
    });

    it('D2: normalizes spaced email ("sadia.rashid @ hotmail . com")', () => {
      const parsed = SlotExtractor.parseEmail('sadia.rashid @ hotmail . com');
      expect(parsed).toBe('sadia.rashid@hotmail.com');
    });

    it('D3: normalizes Turkish phone with international prefix', () => {
      const parsed = SlotExtractor.parsePhone('+90 (532) 123 45 67');
      expect(parsed).toBe('+90 532 123 45 67');
    });

    it('D4: extracts date, time and treatment from a single mixed sentence', () => {
      const res = SlotExtractor.extractSlots('3 Ağustos saat 15:00 için implant randevusu almak istiyorum');
      expect(res.extracted.preferredDate).toBe('2026-08-03');
      expect(res.extracted.preferredTime).toBe('15:00');
      expect(res.extracted.treatment).toBe('implant');
    });
  });

  // ── GROUP E: Safety, Emergencies & Dissatisfaction ──
  describe('Group E: Safety, Emergencies & Complaint Handling', () => {
    it('E1: detects acute medical emergency immediately', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Ağzımdan şiddetli kanama geliyor, çok acil yardım!',
        locale: 'tr'
      });
      expect(res.intent).toBe('emergency');
      expect(res.confidence).toBe(1.0);
      expect(res.requiresKnowledgeBase).toBe(false);
    });

    it('E2: detects patient dissatisfaction and complaint', () => {
      const res = IntentRouter.classifyConversationIntent({
        message: 'Dünden beri arıyorum kimse cevap vermiyor, bu nasıl hizmet!',
        locale: 'tr'
      });
      expect(res.intent).toBe('complaint');
      expect(res.requiresKnowledgeBase).toBe(false);
    });
  });

  // ── GROUP F: Observability & Masking ──
  describe('Group F: Structured Observability Logging & PII Masking', () => {
    it('F1: masks sensitive PII correctly', () => {
      const maskedEmail = ConversationLogger.maskEmail('john.smith@gmail.com');
      expect(maskedEmail).toBe('j***h@gmail.com');

      const maskedPhone = ConversationLogger.maskPhone('+90 532 123 45 67');
      expect(maskedPhone).toContain('******');

      const maskedSlots = ConversationLogger.maskSlots({
        fullName: 'Ahmet Yılmaz',
        email: 'ahmet@example.com',
        phone: '+905321234567'
      });
      expect(maskedSlots?.fullName).toBe('A*** Y***');
      expect(maskedSlots?.email).toBe('a***t@example.com');
    });
  });
});
