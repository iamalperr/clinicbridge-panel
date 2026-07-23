const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Since I don't have credentials, I will just modify the migration script to READ the doctors and return them!
