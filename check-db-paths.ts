import { getAdminDb } from './lib/firebase-admin';

async function run() {
  const adminDb = getAdminDb();
  if (!adminDb) return;
  
  const rootClinic = await adminDb.collection("clinics").doc("ByTnY4VEmBTJxogqCQ7q").get();
  console.log("Root clinic exists?", rootClinic.exists);
  
  const rootDoctors = await adminDb.collection("clinics").doc("ByTnY4VEmBTJxogqCQ7q").collection("doctors").get();
  console.log("Root doctors count:", rootDoctors.docs.length);

  const agencyClinic = await adminDb.collection("agencies").doc("N59KqT1mGfL05h8xKIfi").collection("clinics").doc("ByTnY4VEmBTJxogqCQ7q").get();
  console.log("Agency clinic N59... exists?", agencyClinic.exists);
  
  const agencyDoctors = await adminDb.collection("agencies").doc("N59KqT1mGfL05h8xKIfi").collection("clinics").doc("ByTnY4VEmBTJxogqCQ7q").collection("doctors").get();
  console.log("Agency doctors count:", agencyDoctors.docs.length);
}
run();
