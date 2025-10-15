// /api/submit-form.js

import admin from 'firebase-admin';

// --- Initialize Firebase Admin (no changes here) ---
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) {
    console.error('Firebase admin initialization error', error.stack);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  // --- START: ADD THESE HEADERS ---
  // This allows your local development server to make requests
  res.setHeader('Access-Control-Allow-Origin', 'http://172.21.0.138:5500');
  // You can also use a wildcard '*' for public APIs, but being specific is more secure.
  // res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // --- END: ADD THESE HEADERS ---


  // --- START: HANDLE PREFLIGHT REQUEST ---
  // The browser sends an OPTIONS request first to check permissions.
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  // --- END: HANDLE PREFLIGHT REQUEST ---

  // --- Check for POST request (no changes here) ---
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // --- The rest of your code to process the form and save to Firestore ---
    const { name, email, branch, mobile, hobbies, game, participate, txnId } = req.body;
    
    const submissionRef = await db.collection('submissions').add({
      name, email, branch, mobile, hobbies, game, participate, txnId,
      submittedAt: new Date().toISOString(),
    });

    res.status(200).json({ success: true, message: `Submission successful with ID: ${submissionRef.id}` });

  } catch (error) {
    console.error('Error writing to Firestore:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}