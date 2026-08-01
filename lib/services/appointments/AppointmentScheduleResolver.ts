/**
 * AppointmentScheduleResolver
 * 
 * Centralized deterministic schedule resolver for appointments.
 * Handles fallback between requested dates/times and confirmed dates/times.
 * Ensures zero regression for patient emails, UI listings, and notification retries.
 */

export interface ResolvedSchedule {
  displayDate: string;
  displayTime: string;
  requestedDate: string;
  requestedTime: string;
  confirmedDate: string | null;
  confirmedTime: string | null;
  confirmedTimeRange: string | null;
  isConfirmed: boolean;
  isRescheduled: boolean;
  hasDifferentConfirmedSchedule: boolean;
}

export function resolveRequestedTime(appointment: any): string {
  if (!appointment) return "";
  
  if (appointment.preferredTimeText && 
      appointment.preferredTimeText.toLowerCase() !== "belirtilmedi" && 
      appointment.preferredTimeText.toLowerCase() !== "belirtilmemiş") {
    return appointment.preferredTimeText;
  }
  
  if (appointment.preferredTimePeriod) {
    const periodMap: Record<string, string> = {
      morning: "Sabah",
      afternoon: "Öğleden sonra",
      evening: "Akşam",
      earliest_available: "En erken uygun saat"
    };
    return periodMap[appointment.preferredTimePeriod] || appointment.preferredTimePeriod;
  }
  
  if (appointment.preferredTimeStart && appointment.preferredTimeEnd) {
    return `${appointment.preferredTimeStart} - ${appointment.preferredTimeEnd}`;
  }
  
  return (
    appointment.preferredTime || 
    appointment.requestedTime || 
    appointment.appointmentDateTime || 
    appointment.appointmentTime || 
    (appointment.scheduledAt ? new Date(appointment.scheduledAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : "") || 
    appointment.startTime || 
    ""
  );
}

export function resolveRequestedDate(appointment: any): string {
  if (!appointment) return "";
  return (
    appointment.preferredDate || 
    appointment.requestedDate || 
    appointment.preferredDateDisplay || 
    appointment.proposedDate || 
    ""
  );
}

export function resolveAppointmentDisplaySchedule(appointment: any): ResolvedSchedule {
  if (!appointment) {
    return {
      displayDate: "Bildirilecek",
      displayTime: "Bildirilecek",
      requestedDate: "",
      requestedTime: "",
      confirmedDate: null,
      confirmedTime: null,
      confirmedTimeRange: null,
      isConfirmed: false,
      isRescheduled: false,
      hasDifferentConfirmedSchedule: false
    };
  }

  const requestedDate = resolveRequestedDate(appointment);
  const requestedTime = resolveRequestedTime(appointment);

  const confirmedDate = appointment.confirmedDate ? String(appointment.confirmedDate).trim() : null;
  const confirmedTime = appointment.confirmedTime ? String(appointment.confirmedTime).trim() : null;
  const confirmedTimeRange = appointment.confirmedTimeRange ? String(appointment.confirmedTimeRange).trim() : null;

  const rawStatus = (appointment.status || "").toLowerCase().trim();
  const isConfirmed = rawStatus === "confirmed";
  const isRescheduled = !!(appointment.rescheduledAt || (appointment.rescheduleCount && appointment.rescheduleCount > 0));

  // Determine display values
  let displayDate = requestedDate;
  let displayTime = requestedTime;

  if (confirmedDate) {
    displayDate = confirmedDate;
  }

  if (confirmedTime || confirmedTimeRange) {
    displayTime = confirmedTime || confirmedTimeRange!;
  }

  const hasDifferentConfirmedSchedule = !!(
    (confirmedDate && confirmedDate !== requestedDate) ||
    (confirmedTime && confirmedTime !== requestedTime)
  );

  return {
    displayDate: displayDate || "Bildirilecek",
    displayTime: displayTime || "Saat belirtilmedi",
    requestedDate: requestedDate || "Bildirilecek",
    requestedTime: requestedTime || "Saat belirtilmedi",
    confirmedDate,
    confirmedTime,
    confirmedTimeRange,
    isConfirmed,
    isRescheduled,
    hasDifferentConfirmedSchedule
  };
}
