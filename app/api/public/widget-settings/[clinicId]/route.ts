import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

// Public CORS headers — widget.js on external sites must be able to call this
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const { clinicId } = await params;

  if (!clinicId) {
    return NextResponse.json({ error: "clinicId required" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const adminDb = getAdminDb();

    if (!adminDb) {
      // Firebase Admin not available — return safe defaults
      return NextResponse.json(buildDefaults(clinicId), { headers: CORS_HEADERS });
    }

    const snap = await adminDb.collection("widgetSettings").doc(clinicId).get();

    if (!snap.exists) {
      return NextResponse.json(buildDefaults(clinicId), { headers: CORS_HEADERS });
    }

    const raw = snap.data()!;

    // Return ONLY public-safe fields — no private/admin data
    const publicSettings = {
      clinicId,
      title:            raw.title            ?? "Clinic Assistant",
      welcomeMessage:   raw.welcomeMessage   ?? "Merhaba! Size nasıl yardımcı olabilirim?",
      placeholder:      raw.placeholder      ?? "Bir mesaj yazın...",
      primaryColor:     raw.primaryColor     ?? "#6366f1",
      position:         raw.position         ?? "bottom-right",
      showAvatar:       raw.showAvatar       ?? true,
      showOnlineStatus: raw.showOnlineStatus ?? true,
      /** Default language preference — auto | tr | en */
      defaultLanguage:  raw.defaultLanguage  ?? "auto",
      /** Per-language message config (greeting, placeholder, tooltip, quickActions) */
      messages: {
        tr: {
          greetingMessage:  raw.messages?.tr?.greetingMessage  ?? raw.welcomeMessage ?? "Merhaba! Size nasıl yardımcı olabiliriz?",
          inputPlaceholder: raw.messages?.tr?.inputPlaceholder ?? raw.placeholder    ?? "Bir mesaj yazın...",
          tooltipMessage:   raw.messages?.tr?.tooltipMessage   ?? "Merhaba, size nasıl yardımcı olabiliriz?",
          quickActions:     raw.messages?.tr?.quickActions     ?? [
            "Randevu almak istiyorum",
            "Hizmetleriniz nelerdir?",
            "Kliniğiniz nerede?",
          ],
        },
        en: {
          greetingMessage:  raw.messages?.en?.greetingMessage  ?? "Hello! How can we help you?",
          inputPlaceholder: raw.messages?.en?.inputPlaceholder ?? "Type your message...",
          tooltipMessage:   raw.messages?.en?.tooltipMessage   ?? "Hello, how can we help you?",
          quickActions:     raw.messages?.en?.quickActions     ?? [
            "Book an appointment",
            "What services do you offer?",
            "Where is your clinic?",
          ],
        },
      },
      showBubbles: {
        enabled:     raw.showBubbles?.enabled     ?? true,
        displayMode: raw.showBubbles?.displayMode ?? "rotate",
        messages: {
          tr: raw.showBubbles?.messages?.tr ?? [
            "Hangi tedavinin size uygun olduğunu merak mı ediyorsunuz?",
            "Randevu almak ister misiniz?",
          ],
          en: raw.showBubbles?.messages?.en ?? [
            "Need help choosing a treatment?",
            "Want to book an appointment?",
          ],
        },
        timing: {
          initialDelaySeconds:    raw.showBubbles?.timing?.initialDelaySeconds    ?? 3,
          rotationIntervalSeconds: raw.showBubbles?.timing?.rotationIntervalSeconds ?? 6,
          autoHideSeconds:         raw.showBubbles?.timing?.autoHideSeconds         ?? 12,
        },
        behavior: {
          hideAfterOpen:      raw.showBubbles?.behavior?.hideAfterOpen      ?? true,
          showOncePerSession: raw.showBubbles?.behavior?.showOncePerSession ?? false,
          disableOnMobile:    raw.showBubbles?.behavior?.disableOnMobile    ?? false,
        },
      },
    };

    return NextResponse.json(publicSettings, { headers: CORS_HEADERS });

  } catch (err) {
    console.error("[widget-settings API] Error:", err);
    // On error return safe defaults so the widget still loads
    return NextResponse.json(buildDefaults(clinicId), { headers: CORS_HEADERS });
  }
}

function buildDefaults(clinicId: string) {
  return {
    clinicId,
    title: "Clinic Assistant",
    welcomeMessage: "Merhaba! Size nasıl yardımcı olabilirim?",
    placeholder: "Bir mesaj yazın...",
    primaryColor: "#6366f1",
    position: "bottom-right",
    showAvatar: true,
    showOnlineStatus: true,
    defaultLanguage: "auto",
    messages: {
      tr: {
        greetingMessage:  "Merhaba! Size nasıl yardımcı olabiliriz?",
        inputPlaceholder: "Bir mesaj yazın...",
        tooltipMessage:   "Merhaba, size nasıl yardımcı olabiliriz?",
        quickActions:     ["Randevu almak istiyorum", "Hizmetleriniz nelerdir?", "Kliniğiniz nerede?"],
      },
      en: {
        greetingMessage:  "Hello! How can we help you?",
        inputPlaceholder: "Type your message...",
        tooltipMessage:   "Hello, how can we help you?",
        quickActions:     ["Book an appointment", "What services do you offer?", "Where is your clinic?"],
      },
    },
    showBubbles: {
      enabled: true,
      displayMode: "rotate",
      messages: {
        tr: ["Hangi tedavinin size uygun olduğunu merak mı ediyorsunuz?", "Randevu almak ister misiniz?"],
        en: ["Need help choosing a treatment?", "Want to book an appointment?"],
      },
      timing: { initialDelaySeconds: 3, rotationIntervalSeconds: 6, autoHideSeconds: 12 },
      behavior: { hideAfterOpen: true, showOncePerSession: false, disableOnMobile: false },
    },
  };
}
