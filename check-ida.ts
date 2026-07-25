import { getAdminDb } from "./lib/firebase-admin";

async function run() {
  const db = getAdminDb();
  if (!db) return;

  const clinics = await db.collection("clinics").get();
  for (const c of clinics.docs) {
    const data = c.data();
    if (data.name && data.name.includes("Akademisi")) {
      console.log("Clinic ID:", c.id, "Name:", data.name);
      const docs = await db.collection("clinics").doc(c.id).collection("doctors").get();
      console.log("Total doctors:", docs.size);
      docs.docs.forEach(d => {
        const dd = d.data();
        console.log(`- ${dd.full_name || dd.doctorName} (Specialist: ${dd.specialist_status}, Active: ${dd.is_active})`);
      });
    }
  }

  const agencies = await db.collection("agencies").get();
  for (const a of agencies.docs) {
    const aClinics = await db.collection("agencies").doc(a.id).collection("clinics").get();
    for (const c of aClinics.docs) {
      const data = c.data();
      if (data.name && data.name.includes("Akademisi")) {
        console.log("Agency Clinic ID:", c.id, "Name:", data.name);
        const docs = await db.collection("agencies").doc(a.id).collection("clinics").doc(c.id).collection("doctors").get();
        console.log("Total doctors:", docs.size);
        docs.docs.forEach(d => {
          const dd = d.data();
          console.log(`- ${dd.full_name || dd.doctorName} (Specialist: ${dd.specialist_status}, Active: ${dd.is_active})`);
        });
      }
    }
  }
}

run();
