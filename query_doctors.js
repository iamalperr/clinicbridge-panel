const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Might not exist, let's use the default initialization if possible, or just skip if we don't have creds.
// Wait, I can just use grep on the whole project to see if these names are in JSON files or seeder scripts.
