import crypto from 'crypto';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const base64Response = req.body.response;
    const xVerify = req.headers['x-verify'];

    const SALT_KEY = process.env.PHONEPE_SALT_KEY;
    const SALT_INDEX = parseInt(process.env.PHONEPE_SALT_INDEX, 10);

    const stringToHash = base64Response + SALT_KEY;
    const calculatedSha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const calculatedXVerify = calculatedSha256 + '###' + SALT_INDEX;

    if (xVerify !== calculatedXVerify) {
      console.error("Callback signature verification failed.");
      return res.status(400).send({ success: false, message: "Signature verification failed." });
    }

    const decodedResponse = JSON.parse(Buffer.from(base64Response, 'base64').toString('utf8'));
    const { merchantTransactionId, code } = decodedResponse;

    const submissionsRef = db.collection('submissions');
    const query = submissionsRef.where('txnId', '==', merchantTransactionId).limit(1);
    const querySnapshot = await query.get();

    if (querySnapshot.empty) {
      return res.status(404).send({ success: false, message: "Transaction ID not found." });
    }

    const submissionDoc = querySnapshot.docs[0];
    const paymentStatus = (code === 'PAYMENT_SUCCESS') ? 'SUCCESS' : 'FAILED';

    await submissionDoc.ref.update({
      paymentStatus: paymentStatus,
      paymentResponse: decodedResponse
    });
    
    res.status(200).json({ success: true, message: "Callback processed." });

  } catch (error) {
    console.error("Error in /api/callback:", error.message);
    res.status(500).json({ success: false, message: "Error processing callback." });
  }
}
