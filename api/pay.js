import crypto from 'crypto';
import axios from 'axios';

// This is the Vercel Serverless Function handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { amount, mobileNumber, merchantTransactionId } = req.body;

    // Get credentials from environment variables
    const MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID;
    const SALT_KEY = process.env.PHONEPE_SALT_KEY;
    const SALT_INDEX = parseInt(process.env.PHONEPE_SALT_INDEX, 10);
    const PHONEPE_HOST_URL = process.env.PHONEPE_HOST_URL;
    
    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: 'MUID-' + Date.now(),
      amount: amount * 100, // Amount in paisa
      redirectUrl: `https://freshers-8fly.vercel.app/api/redirect?txnId=${merchantTransactionId}`,
      redirectMode: 'POST',
      callbackUrl: `https://freshers-8fly.vercel.app/api/callback`,
      mobileNumber: mobileNumber,
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const stringToHash = base64Payload + '/pg/v1/pay' + SALT_KEY;
    const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const xVerify = sha256 + '###' + SALT_INDEX;

    const response = await axios.post(`${PHONEPE_HOST_URL}/pg/v1/pay`, { request: base64Payload }, {
      headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerify }
    });

    res.status(200).json({
      success: true,
      paymentUrl: response.data.data.instrumentResponse.redirectInfo.url
    });

  } catch (error) {
    console.error("Error in /api/pay:", error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, message: "Payment initiation failed." });
  }
}
