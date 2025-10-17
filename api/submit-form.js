import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) {
    console.error('Firebase admin initialization error', error.stack);
  }
}

const db = admin.firestore();

// This is the Vercel Serverless Function handler
export default async function handler(req, res) {
  // Set CORS headers to allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle the browser's preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Ensure the request is a POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Extract form data from the request body
    const { name, email, branch, mobile, hobbies, game, participate, txnId } = req.body;
    
    // Add the new submission to the 'submissions' collection in Firestore
    const submissionRef = await db.collection('submissions').add({
      name, email, branch, mobile, hobbies, game, participate, txnId,
      submittedAt: new Date().toISOString(),
      paymentStatus: 'PENDING', // Set initial payment status
    });

    res.status(200).json({ success: true, message: `Submission successful with ID: ${submissionRef.id}` });

  } catch (error) {
    console.error('Error writing to Firestore:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
