// /api/submit-form.js

import admin from 'firebase-admin';

// --- Initialize Firebase Admin ---
// This checks if the app is already initialized to avoid errors.
if (!admin.apps.length) {
  try {
    // Get the credentials from the Vercel environment variable
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error.stack);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  // --- Check for POST request ---
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // --- Get data from the request body ---
    const { name, email, branch, mobile, hobbies, game, participate, txnId } = req.body;

    // Optional: Add some basic validation
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    // --- Create a new document in the "submissions" collection ---
    const submissionRef = await db.collection('submissions').add({
      name,
      email,
      branch,
      mobile,
      hobbies,
      game,
      participate,
      txnId,
      submittedAt: new Date().toISOString(), // Add a server-side timestamp
    });

    // --- Send a success response ---
    res.status(200).json({ success: true, message: `Submission successful with ID: ${submissionRef.id}` });

  } catch (error) {
    console.error('Error writing to Firestore:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}