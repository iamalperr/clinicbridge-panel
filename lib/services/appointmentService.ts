import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ChatAppointmentData {
  patient: {
    fullName: string;
    phone: string;
    email?: string;
  };
  appointment: {
    service: string;
    preferredDate: string;
    preferredTime: string;
    notes?: string;
  };
}

export const processChatAppointment = async (clinicId: string, data: ChatAppointmentData) => {
  try {
    const patientsRef = collection(db, "patients");
    const q = query(
      patientsRef, 
      where("clinicId", "==", clinicId),
      where("phone", "==", data.patient.phone)
    );
    
    const querySnapshot = await getDocs(q);
    let patientId = "";
    
    if (querySnapshot.empty) {
      // Create new patient
      const newPatientRef = await addDoc(patientsRef, {
        clinicId,
        fullName: data.patient.fullName,
        phone: data.patient.phone,
        email: data.patient.email || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      patientId = newPatientRef.id;
    } else {
      // Use existing patient
      patientId = querySnapshot.docs[0].id;
    }

    // Create appointment
    const appointmentsRef = collection(db, "appointments");
    const newAppointmentRef = await addDoc(appointmentsRef, {
      clinicId,
      patientId,
      patientName: data.patient.fullName,
      service: data.appointment.service,
      preferredDate: data.appointment.preferredDate,
      preferredTime: data.appointment.preferredTime,
      status: "pending",
      source: "ai-chat",
      notes: data.appointment.notes || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { success: true, patientId, appointmentId: newAppointmentRef.id };
  } catch (error) {
    console.error("Error processing chat appointment:", error);
    return { success: false, error };
  }
};
