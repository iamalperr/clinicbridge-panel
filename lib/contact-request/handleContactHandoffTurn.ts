/**
 * Deterministic Contact Request turn handler for Agent Core.
 * Returns null when the turn is not a contact-handoff concern.
 */

import { PendingActionManager, SlotExtractor } from "@/lib/conversation";
import type { AgentChannel, AgentTurnResult, AppointmentData, AppointmentState } from "@/lib/agent/types";
import { respondWithVisibleReply, saveAppointmentState } from "@/lib/agent/persistence";
import {
  buildContactRequestIdempotencyKey,
  cancelUnresolvedContactRequest,
  createContactRequestAndNotify,
  detectContactHandoff,
  findUnresolvedContactRequest,
  formatAskForEmail,
  formatAskForPhone,
  formatContactRequestAlreadyPending,
  formatContactRequestCancelled,
  formatContactRequestConfirmationPrompt,
  formatContactRequestFailure,
  formatContactRequestHandoffDisabled,
  formatContactRequestSuccess,
  formatContactRequestUpdated,
  isExplicitContactDetailCorrection,
  requiredContactDetail,
  updateContactRequestPreference,
  type ContactRequestChannel,
  type PreferredContactMethod,
} from "@/lib/contact-request";

type PersistFn = (
  extra?: Partial<Parameters<typeof respondWithVisibleReply>[1]>
) => Parameters<typeof respondWithVisibleReply>[1];

export interface ContactHandoffTurnParams {
  message: string;
  intent: string;
  entities?: Partial<{
    phone?: string;
    email?: string;
    fullName?: string;
    preferredContactMethod?: PreferredContactMethod;
  }>;
  locale: string;
  clinicId: string;
  conversationId: string;
  channel: AgentChannel;
  clinicData: any;
  appointmentDraft: Partial<AppointmentData>;
  appointmentState: AppointmentState;
  appointmentVersion: number;
  history: Array<{ role?: string; content?: string }>;
  loadedPendingAction: any;
  loadedConversationLogData: any;
  adminDb: any;
  basePersist: PersistFn;
  /** When IntentRouter / pending confirmation already affirmed handoff. */
  confirmationAffirmed?: boolean;
}

function mapChannel(channel: AgentChannel): ContactRequestChannel {
  if (channel === "web_widget") return "web_widget";
  if (channel === "voice") return "voice";
  if (channel === "api") return "api";
  return "other";
}

function extractPhoneFromContext(params: {
  message: string;
  entitiesPhone?: string;
  draftPhone?: string;
  logPhone?: string;
  history: Array<{ role?: string; content?: string }>;
}): string | undefined {
  const candidates = [
    params.entitiesPhone,
    SlotExtractor.parsePhone(params.message || ""),
    params.draftPhone,
    params.logPhone,
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    const parsed = SlotExtractor.parsePhone(String(c)) || String(c).trim();
    if (parsed) return parsed;
  }

  // Scan recent user history (newest first)
  for (let i = params.history.length - 1; i >= 0; i--) {
    const turn = params.history[i];
    if (turn?.role !== "user" && turn?.role !== "patient") continue;
    const phone = SlotExtractor.parsePhone(String(turn.content || ""));
    if (phone) return phone;
  }
  return undefined;
}

function extractEmailFromContext(params: {
  message: string;
  entitiesEmail?: string;
  draftEmail?: string;
  logEmail?: string;
  history: Array<{ role?: string; content?: string }>;
}): string | undefined {
  const candidates = [
    params.entitiesEmail,
    SlotExtractor.parseEmail(params.message || ""),
    params.draftEmail,
    params.logEmail,
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    const parsed = SlotExtractor.parseEmail(String(c)) || String(c).trim();
    if (parsed && parsed.includes("@")) return parsed.toLowerCase();
  }

  for (let i = params.history.length - 1; i >= 0; i--) {
    const turn = params.history[i];
    if (turn?.role !== "user" && turn?.role !== "patient") continue;
    const email = SlotExtractor.parseEmail(String(turn.content || ""));
    if (email) return email;
  }
  return undefined;
}

async function persistPending(
  params: ContactHandoffTurnParams,
  pendingAction: any,
  draftPatch?: Partial<AppointmentData>
): Promise<void> {
  if (!params.adminDb) return;
  const draft = { ...params.appointmentDraft, ...(draftPatch || {}) };
  await saveAppointmentState(
    params.adminDb,
    params.clinicId,
    params.conversationId,
    params.appointmentVersion,
    params.appointmentState,
    draft,
    {
      conversationLocale: params.locale,
      pendingAction: pendingAction || null,
    }
  );
}

/**
 * Attempt to handle contact handoff / cancel / preference amendment.
 * Returns AgentTurnResult when handled; null to continue normal agent flow.
 */
export async function tryHandleContactHandoffTurn(
  params: ContactHandoffTurnParams
): Promise<AgentTurnResult | null> {
  const detection = detectContactHandoff(params.message);
  const pending = params.loadedPendingAction;
  const pendingType = pending?.status === "pending" ? pending?.type : null;

  const pendingContactConfirm =
    pendingType === "create_contact_request" || pendingType === "request_phone_contact";

  const awaitingContactDetail =
    pendingType === "collect_contact_phone" || pendingType === "collect_contact_email";

  const isHandoffIntent =
    params.intent === "contact_handoff_request" ||
    detection.isHandoffIntent ||
    (pendingContactConfirm &&
      (params.confirmationAffirmed || PendingActionManager.isConfirmation(params.message))) ||
    awaitingContactDetail;

  const isCancel =
    detection.isCancel ||
    ((pendingContactConfirm || awaitingContactDetail) &&
      PendingActionManager.isRejection(params.message));

  // ── Cancel ────────────────────────────────────────────────────────────
  if (
    isCancel &&
    (isHandoffIntent ||
      pendingContactConfirm ||
      awaitingContactDetail ||
      params.loadedConversationLogData?.contactRequestId)
  ) {
    if (pendingContactConfirm || awaitingContactDetail) {
      await persistPending(params, PendingActionManager.cancelPendingAction(pending));
    }
    const cancelResult = await cancelUnresolvedContactRequest({
      clinicId: params.clinicId,
      conversationId: params.conversationId,
    });

    if (params.adminDb) {
      await saveAppointmentState(
        params.adminDb,
        params.clinicId,
        params.conversationId,
        params.appointmentVersion,
        params.appointmentState,
        params.appointmentDraft,
        {
          conversationLocale: params.locale,
          pendingAction: null,
          contactRequestStatus: cancelResult.cancelled ? "cancelled" : params.loadedConversationLogData?.contactRequestStatus,
        }
      );
    }

    return respondWithVisibleReply(
      {
        responseType: "CHAT_REPLY",
        reply: formatContactRequestCancelled(params.locale),
        pendingAppointmentData: params.appointmentDraft,
        contactRequestCancelled: cancelResult.cancelled,
      },
      params.basePersist({
        appointmentState: params.appointmentState,
        apptData: params.appointmentDraft as AppointmentData,
        contactRequestId: cancelResult.contactRequestId || params.loadedConversationLogData?.contactRequestId,
        contactRequestStatus: cancelResult.cancelled ? "cancelled" : undefined,
      })
    );
  }

  // Preference amendment on open request without new create
  if (
    detection.isPreferenceAmendment &&
    detection.preferredMethod !== "unspecified" &&
    !detection.isCancel
  ) {
    const existing = await findUnresolvedContactRequest({
      clinicId: params.clinicId,
      conversationId: params.conversationId,
    });
    if (existing) {
      const phone = extractPhoneFromContext({
        message: params.message,
        entitiesPhone: params.entities?.phone,
        draftPhone: params.appointmentDraft.patientPhone,
        logPhone: params.loadedConversationLogData?.patientPhone,
        history: params.history,
      });
      const email = extractEmailFromContext({
        message: params.message,
        entitiesEmail: params.entities?.email,
        draftEmail: params.appointmentDraft.patientEmail,
        logEmail: params.loadedConversationLogData?.patientEmail,
        history: params.history,
      });

      await updateContactRequestPreference({
        clinicId: params.clinicId,
        contactRequestId: existing.id,
        preferredContactMethod: detection.preferredMethod,
        patientNote: params.message.slice(0, 500),
        patientPhone: phone,
        patientEmail: email,
      });

      return respondWithVisibleReply(
        {
          responseType: "CHAT_REPLY",
          reply: formatContactRequestUpdated({
            preferredMethod: detection.preferredMethod,
            locale: params.locale,
          }),
          pendingAppointmentData: params.appointmentDraft,
          contactRequestId: existing.id,
        },
        params.basePersist({
          appointmentState: params.appointmentState,
          contactRequestId: existing.id,
          contactRequestStatus: existing.status,
          preferredContactMethod: detection.preferredMethod,
        })
      );
    }
  }

  // Explicit phone/email correction while an unresolved Contact Request exists
  if (!detection.isCancel && isExplicitContactDetailCorrection(params.message)) {
    const existing = await findUnresolvedContactRequest({
      clinicId: params.clinicId,
      conversationId: params.conversationId,
    });
    if (existing) {
      const phoneFromMessage =
        params.entities?.phone || SlotExtractor.parsePhone(params.message || "");
      const emailFromMessage =
        params.entities?.email || SlotExtractor.parseEmail(params.message || "");

      // Only apply when this turn itself supplies a new detail (avoid unrelated history digits)
      if (phoneFromMessage || emailFromMessage) {
        const nextPhone = phoneFromMessage || existing.patientPhone;
        const nextEmail = emailFromMessage || existing.patientEmail;
        const updateResult = await createContactRequestAndNotify({
          clinicId: params.clinicId,
          conversationId: params.conversationId,
          patientName: existing.patientName,
          patientPhone: nextPhone,
          patientEmail: nextEmail,
          preferredContactMethod: existing.preferredContactMethod,
          patientNote: params.message.slice(0, 500),
          language: params.locale,
          channel: mapChannel(params.channel),
          source: "AI Assistant",
          idempotencyKey: buildContactRequestIdempotencyKey({
            conversationId: params.conversationId,
            preferredContactMethod: existing.preferredContactMethod,
            patientPhone: nextPhone,
            patientEmail: nextEmail,
          }),
        });

        if (!updateResult.success) {
          return respondWithVisibleReply(
            {
              responseType: "CHAT_REPLY",
              reply: formatContactRequestFailure(params.locale),
              pendingAppointmentData: params.appointmentDraft,
              contactRequestCreated: false,
            },
            params.basePersist({
              appointmentState: params.appointmentState,
              contactRequestId: existing.id,
              contactRequestStatus: existing.status,
            })
          );
        }

        const locale = params.locale || "en";
        const reply = (locale || "en").toLowerCase().startsWith("tr")
          ? "Teşekkürler — iletişim bilgilerinizi güncelledim. Açık iletişim talebiniz klinik ekibinde bu bilgilerle görünecek."
          : "Thanks — I've updated your contact details on the open contact request for the clinic team.";

        return respondWithVisibleReply(
          {
            responseType: "CHAT_REPLY",
            reply,
            pendingAppointmentData: {
              ...params.appointmentDraft,
              ...(phoneFromMessage ? { patientPhone: phoneFromMessage } : {}),
              ...(emailFromMessage ? { patientEmail: emailFromMessage } : {}),
            },
            contactRequestId: existing.id,
          },
          params.basePersist({
            appointmentState: params.appointmentState,
            contactRequestId: existing.id,
            contactRequestStatus: existing.status,
            preferredContactMethod: existing.preferredContactMethod,
          })
        );
      }
    }
  }

  if (!isHandoffIntent && !awaitingContactDetail) {
    return null;
  }

  const preferredMethod: PreferredContactMethod =
    params.entities?.preferredContactMethod ||
    detection.preferredMethod ||
    pending?.payload?.preferredContactMethod ||
    "unspecified";

  // Confirmation gate for ambiguous intents
  const affirmed =
    params.confirmationAffirmed ||
    (pendingContactConfirm && PendingActionManager.isConfirmation(params.message)) ||
    awaitingContactDetail ||
    (detection.isHandoffIntent && !detection.needsConfirmation) ||
    (params.intent === "contact_handoff_request" && !detection.needsConfirmation);

  if (detection.needsConfirmation && !affirmed && !pendingContactConfirm && !awaitingContactDetail) {
    const knownPhone = extractPhoneFromContext({
      message: params.message,
      entitiesPhone: params.entities?.phone,
      draftPhone: params.appointmentDraft.patientPhone,
      logPhone: params.loadedConversationLogData?.patientPhone,
      history: params.history,
    });
    const knownEmail = extractEmailFromContext({
      message: params.message,
      entitiesEmail: params.entities?.email,
      draftEmail: params.appointmentDraft.patientEmail,
      logEmail: params.loadedConversationLogData?.patientEmail,
      history: params.history,
    });
    const action = PendingActionManager.createPendingAction(
      "create_contact_request",
      {
        preferredContactMethod: preferredMethod,
        patientPhone: knownPhone,
        patientEmail: knownEmail,
        patientName:
          params.entities?.fullName ||
          params.appointmentDraft.patientName ||
          params.loadedConversationLogData?.patientName,
        language: params.locale,
        clinicId: params.clinicId,
        conversationId: params.conversationId,
      },
      undefined,
      "Confirm contact request forwarding"
    );
    await persistPending(params, action);
    return respondWithVisibleReply(
      {
        responseType: "CHAT_REPLY",
        reply: formatContactRequestConfirmationPrompt(preferredMethod, params.locale),
        pendingAppointmentData: params.appointmentDraft,
        pendingAction: action,
      },
      params.basePersist({ appointmentState: params.appointmentState })
    );
  }

  // Resolve contact details from this turn, draft, log, and earlier user messages
  const phone = extractPhoneFromContext({
    message: params.message,
    entitiesPhone: params.entities?.phone,
    draftPhone: params.appointmentDraft.patientPhone || pending?.payload?.patientPhone,
    logPhone: params.loadedConversationLogData?.patientPhone,
    history: params.history,
  });
  const email = extractEmailFromContext({
    message: params.message,
    entitiesEmail: params.entities?.email,
    draftEmail: params.appointmentDraft.patientEmail || pending?.payload?.patientEmail,
    logEmail: params.loadedConversationLogData?.patientEmail,
    history: params.history,
  });

  const patientName =
    params.entities?.fullName ||
    params.appointmentDraft.patientName ||
    params.loadedConversationLogData?.patientName ||
    pending?.payload?.patientName;

  const needed = requiredContactDetail(preferredMethod);

  if (needed === "phone" && !phone) {
    const action = PendingActionManager.createPendingAction(
      "collect_contact_phone",
      { preferredContactMethod: preferredMethod, patientName, patientEmail: email },
      undefined,
      "Collect phone for contact request"
    );
    await persistPending(params, action);
    return respondWithVisibleReply(
      {
        responseType: "CHAT_REPLY",
        reply: formatAskForPhone(params.locale),
        pendingAppointmentData: params.appointmentDraft,
        pendingAction: action,
      },
      params.basePersist({ appointmentState: params.appointmentState })
    );
  }

  if (needed === "email" && !email) {
    const action = PendingActionManager.createPendingAction(
      "collect_contact_email",
      { preferredContactMethod: preferredMethod, patientName, patientPhone: phone },
      undefined,
      "Collect email for contact request"
    );
    await persistPending(params, action);
    return respondWithVisibleReply(
      {
        responseType: "CHAT_REPLY",
        reply: formatAskForEmail(params.locale),
        pendingAppointmentData: params.appointmentDraft,
        pendingAction: action,
      },
      params.basePersist({ appointmentState: params.appointmentState })
    );
  }

  // Human handoff setting
  const handoffEnabled = params.clinicData?.enableHumanHandoff !== false;
  // Default true when unset (product: handoff available unless explicitly disabled)
  if (params.clinicData?.enableHumanHandoff === false) {
    const clinicPhone =
      params.clinicData?.turkishContactNumber ||
      params.clinicData?.internationalContactNumber ||
      params.clinicData?.phone ||
      "";
    await persistPending(params, null);
    return respondWithVisibleReply(
      {
        responseType: "CHAT_REPLY",
        reply: formatContactRequestHandoffDisabled({
          clinicPhone,
          locale: params.locale,
        }),
        pendingAppointmentData: params.appointmentDraft,
      },
      params.basePersist({ appointmentState: params.appointmentState })
    );
  }

  void handoffEnabled;

  const idempotencyKey = buildContactRequestIdempotencyKey({
    conversationId: params.conversationId,
    preferredContactMethod: preferredMethod,
    patientPhone: phone,
    patientEmail: email,
  });

  const result = await createContactRequestAndNotify({
    clinicId: params.clinicId,
    conversationId: params.conversationId,
    patientName: patientName || undefined,
    patientPhone: phone,
    patientEmail: email,
    preferredContactMethod: preferredMethod,
    patientNote: String(params.message || "").slice(0, 500),
    language: params.locale,
    channel: mapChannel(params.channel),
    source: "AI Assistant",
    idempotencyKey,
  });

  await persistPending(params, null, {
    ...(phone ? { patientPhone: phone } : {}),
    ...(email ? { patientEmail: email } : {}),
    ...(patientName ? { patientName } : {}),
  });

  if (!result.success) {
    return respondWithVisibleReply(
      {
        responseType: "CHAT_REPLY",
        reply: formatContactRequestFailure(params.locale),
        pendingAppointmentData: {
          ...params.appointmentDraft,
          ...(phone ? { patientPhone: phone } : {}),
          ...(email ? { patientEmail: email } : {}),
        },
        contactRequestCreated: false,
      },
      params.basePersist({
        appointmentState: params.appointmentState,
        contactRequestId: result.contactRequestId,
        contactRequestStatus: result.record?.status,
        preferredContactMethod: preferredMethod,
      })
    );
  }

  const finalReply =
    result.isDuplicate && result.clinicNotificationStatus === "SKIPPED_DUPLICATE"
      ? formatContactRequestAlreadyPending({
          preferredMethod: result.record?.preferredContactMethod || preferredMethod,
          locale: params.locale,
        })
      : formatContactRequestSuccess({
          preferredMethod: result.record?.preferredContactMethod || preferredMethod,
          locale: params.locale,
        });

  if (params.adminDb) {
    await saveAppointmentState(
      params.adminDb,
      params.clinicId,
      params.conversationId,
      params.appointmentVersion,
      params.appointmentState,
      {
        ...params.appointmentDraft,
        ...(phone ? { patientPhone: phone } : {}),
        ...(email ? { patientEmail: email } : {}),
        ...(patientName ? { patientName } : {}),
      },
      {
        conversationLocale: params.locale,
        pendingAction: null,
        contactRequestId: result.contactRequestId,
        contactRequestStatus: result.record?.status || "pending",
        preferredContactMethod: result.record?.preferredContactMethod || preferredMethod,
        preferredContactChannel: result.record?.preferredContactMethod || preferredMethod,
        patientPhone: phone || params.loadedConversationLogData?.patientPhone,
        patientEmail: email || params.loadedConversationLogData?.patientEmail,
        patientName: patientName || params.loadedConversationLogData?.patientName,
      }
    );
  }

  return respondWithVisibleReply(
    {
      responseType: "CHAT_REPLY",
      reply: finalReply,
      pendingAppointmentData: {
        ...params.appointmentDraft,
        ...(phone ? { patientPhone: phone } : {}),
        ...(email ? { patientEmail: email } : {}),
      },
      contactRequestCreated: true,
      contactRequestId: result.contactRequestId,
      contactRequestStatus: result.record?.status || "pending",
    },
    params.basePersist({
      appointmentState: params.appointmentState,
      isContactRequest: true,
      contactRequestId: result.contactRequestId,
      contactRequestStatus: result.record?.status || "pending",
      preferredContactMethod: result.record?.preferredContactMethod || preferredMethod,
      apptData: {
        ...params.appointmentDraft,
        ...(phone ? { patientPhone: phone } : {}),
        ...(email ? { patientEmail: email } : {}),
        ...(patientName ? { patientName } : {}),
      } as AppointmentData,
    })
  );
}
