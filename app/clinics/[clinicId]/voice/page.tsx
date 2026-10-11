"use client";

import { use, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import VoiceControlCenter from "@/components/clinic/voice/VoiceControlCenter";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

export default function VoicePage({ params }: PageProps) {
  const { clinicId } = use(params);
  const [clinicName, setClinicName] = useState("klinik");

  useEffect(() => {
    let cancelled = false;
    void getDoc(doc(db, "clinics", clinicId)).then((snap) => {
      if (cancelled || !snap.exists()) return;
      const name = snap.data()?.name;
      if (typeof name === "string" && name.trim()) setClinicName(name.trim());
    });
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  return <VoiceControlCenter clinicId={clinicId} clinicName={clinicName} />;
}
