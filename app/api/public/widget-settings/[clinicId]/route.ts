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
      avatarType:       raw.avatarType       ?? "default",
      customAvatarUrl:  raw.customAvatarUrl  ?? null,
      showOnlineStatus: raw.showOnlineStatus ?? true,
      /** Default language preference — auto | tr | en */
      defaultLanguage:  raw.defaultLanguage  ?? "auto",
      /** Test Mode config */
      testMode:         raw.testMode         ?? false,
      testModeMessage: {
        tr: raw.testModeMessage?.tr ?? "Merhaba, şu anda dijital asistanımızın kurulum süreci devam ediyor. Çok yakında sorularınızı buradan yanıtlayabileceğiz. Randevu ve detaylı bilgi için lütfen kliniğimizle doğrudan iletişime geçiniz.",
        en: raw.testModeMessage?.en ?? "Hello, our digital assistant is currently being prepared. Very soon, we’ll be able to answer your questions here. For appointments or detailed information, please contact the clinic directly.",
      },
      /** Launcher config */
      launcher: (() => {
        let resolvedIcon = raw.launcher?.icon ?? "tooth";
        const iconFallback: Record<string, string> = { "sparkle": "ai_sparkle", "health": "medical_plus" };
        if (iconFallback[resolvedIcon]) resolvedIcon = iconFallback[resolvedIcon];

        return {
          shape:               raw.launcher?.shape               ?? "rounded_square",
          position:            raw.launcher?.position            ?? "bottom_right",
          size:                raw.launcher?.size                ?? "medium",
          icon:                resolvedIcon,
        text:                typeof raw.launcher?.text === "string"
                               ? { tr: raw.launcher.text, en: "Chat with assistant" }
                               : {
                                   tr: raw.launcher?.text?.tr ?? "Asistan ile konuş",
                                   en: raw.launcher?.text?.en ?? "Chat with assistant"
                                 },
        showText:            raw.launcher?.showText            ?? false,
        showOnlineIndicator: raw.launcher?.showOnlineIndicator ?? true,
        showNotificationDot: raw.launcher?.showNotificationDot ?? false,
        tooltipEnabled:      raw.launcher?.tooltipEnabled      ?? true,
        tooltipMessage:      raw.launcher?.tooltipMessage      ?? "Merhaba, size nasıl yardımcı olabiliriz?",
        tooltipDelaySeconds: raw.launcher?.tooltipDelaySeconds ?? 2,
        tooltipAutoHide:     raw.launcher?.tooltipAutoHide     ?? true,
        };
      })(),
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
    avatarType: "default",
    customAvatarUrl: null,
    showOnlineStatus: true,
    defaultLanguage: "auto",
    testMode: false,
    testModeMessage: {
      tr: "Merhaba, şu anda dijital asistanımızın kurulum süreci devam ediyor. Çok yakında sorularınızı buradan yanıtlayabileceğiz. Randevu ve detaylı bilgi için lütfen kliniğimizle doğrudan iletişime geçiniz.",
      en: "Hello, our digital assistant is currently being prepared. Very soon, we’ll be able to answer your questions here. For appointments or detailed information, please contact the clinic directly.",
    },
    launcher: {
      shape: "rounded_square",
      position: "bottom_right",
      size: "medium",
      icon: "tooth",
      text: {
        tr: "Asistan ile konuş",
        en: "Chat with assistant"
      },
      showText: false,
      showOnlineIndicator: true,
      showNotificationDot: false,
      tooltipEnabled: true,
      tooltipMessage: "Merhaba, size nasıl yardımcı olabiliriz?",
      tooltipDelaySeconds: 2,
      tooltipAutoHide: true,
    },
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
