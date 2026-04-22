import type { Clinic, ConversationLog, TrainingEntry } from "./types";

export const MOCK_CLINICS: Clinic[] = [
  {
    id: "clinic-001",
    name: "Smile Dental Clinic",
    plan: "pro",
    status: "active",
    language: "tr",
    domain: "smiledental.com",
    email: "info@smiledental.com",
    messages: 1840,
    conversations: 214,
    lastActive: "2026-04-07",
    modules: { ai: true, widget: true, voice: false },
  },
  {
    id: "clinic-002",
    name: "LifeCare Medical Center",
    plan: "enterprise",
    status: "active",
    language: "en",
    domain: "lifecare.com",
    email: "admin@lifecare.com",
    messages: 4210,
    conversations: 502,
    lastActive: "2026-04-06",
    modules: { ai: true, widget: true, voice: true },
  },
  {
    id: "clinic-003",
    name: "Nova Psychology Clinic",
    plan: "starter",
    status: "trial",
    language: "tr",
    domain: "novapsi.com",
    email: "info@novapsi.com",
    messages: 243,
    conversations: 28,
    lastActive: "2026-04-05",
    modules: { ai: true, widget: false, voice: false },
  },
  {
    id: "clinic-004",
    name: "Peak Sports Medicine",
    plan: "pro",
    status: "inactive",
    language: "en",
    domain: "peaksportsmed.com",
    email: "hello@peaksportsmed.com",
    messages: 920,
    conversations: 105,
    lastActive: "2026-03-20",
    modules: { ai: false, widget: false, voice: false },
  },
];

export const MOCK_STATS = {
  totalMessages: 7213,
  totalConversations: 849,
  resolvedRate: 91,
  avgResponseTime: 1.3,
  activeConversations: 12,
};

export const MOCK_CONVERSATIONS: ConversationLog[] = [
  { id: "c1", userName: "Ahmet Y.", firstMessage: "Randevu almak istiyorum", messageCount: 6, status: "resolved", timestamp: "2026-04-07T08:23:00Z", durationSec: 142 },
  { id: "c2", userName: "Fatma K.", firstMessage: "Çalışma saatleriniz nedir?", messageCount: 3, status: "resolved", timestamp: "2026-04-07T09:10:00Z", durationSec: 55 },
  { id: "c3", userName: "Anonymous", firstMessage: "Do you accept insurance?", messageCount: 8, status: "escalated", timestamp: "2026-04-07T09:45:00Z", durationSec: 310 },
  { id: "c4", userName: "Mehmet A.", firstMessage: "Fiyatlar hakkında bilgi alabilir miyim?", messageCount: 5, status: "resolved", timestamp: "2026-04-07T10:00:00Z", durationSec: 98 },
  { id: "c5", userName: "Sara M.", firstMessage: "I want to cancel my appointment", messageCount: 4, status: "open", timestamp: "2026-04-07T10:30:00Z", durationSec: 72 },
];

export const MOCK_TRAINING: TrainingEntry[] = [
  { id: "t1", type: "url", title: "Home Page", source: "https://smiledental.com", status: "indexed", createdAt: "2026-04-01" },
  { id: "t2", type: "url", title: "Services Page", source: "https://smiledental.com/services", status: "indexed", createdAt: "2026-04-01" },
  { id: "t3", type: "file", title: "Price List 2026.pdf", source: "price-list-2026.pdf", status: "indexed", createdAt: "2026-04-03" },
  { id: "t4", type: "text", title: "Opening Hours Info", source: "custom text block", status: "indexed", createdAt: "2026-04-04" },
  { id: "t5", type: "url", title: "FAQ Page", source: "https://smiledental.com/faq", status: "pending", createdAt: "2026-04-07" },
];
