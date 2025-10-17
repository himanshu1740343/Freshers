require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// --- Get credentials from .env file ---
const MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID;
const SALT_KEY = process.env.PHONEPE_SALT_KEY;
const SALT_INDEX = process.env.PHONEPE_SALT_INDEX;
const PHONEPE_HOST_URL = process.env.PHONEPE_HOST_URL;
const PORT = process.env.PORT || 3000;

// --- Initialize Firebase Admin SDK ---
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.error('Firebase Admin Initialization Error:', error.message);
  process.exit(1); // Exit if Firebase can't be initialized
}

const db = admin.firestore();

// =================================================================================
// Endpoint 1: Generate Payment Request (/pay)
// Called by your frontend after saving user data to Firestore.
// =================================================================================
app.post('/pay', async (req, res) => {
    try {
        const { amount, mobileNumber, merchantTransactionId } = req.body;
        if (!amount || !mobileNumber || !merchantTransactionId) {
            return res.status(400).send({ success: false, message: "Amount, mobileNumber, and merchantTransactionId are required." });
        }
        
        const userId = 'MUID123'; // Static user ID for this example

        const payload = {
            merchantId: MERCHANT_ID,
            merchantTransactionId: merchantTransactionId,
            merchantUserId: userId,
            amount: amount * 100, // Amount in paisa
            redirectUrl: `http://localhost:${PORT}/redirect-url/${merchantTransactionId}`,
            redirectMode: 'POST',
            callbackUrl: `http://localhost:${PORT}/callback`,
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

        console.log(`Payment request created for ${merchantTransactionId}. Redirecting user...`);
        
        res.send({
            success: true,
            message: "Payment request created successfully.",
            paymentUrl: response.data.data.instrumentResponse.redirectInfo.url,
            merchantTransactionId: merchantTransactionId
        });

    } catch (error) {
        console.error("Error in /pay endpoint:", error.response ? error.response.data : error.message);
        res.status(500).send({ success: false, message: "An error occurred while creating the payment request." });
    }
});

// =================================================================================
// Endpoint 2: Handle S2S Callback (/callback)
// PhonePe server sends the payment status to this endpoint.
// =================================================================================
app.post('/callback', async (req, res) => {
    try {
        const base64Response = req.body.response;
        const xVerify = req.headers['x-verify'];

        const stringToHash = base64Response + SALT_KEY;
        const calculatedSha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
        const calculatedXVerify = calculatedSha256 + '###' + SALT_INDEX;

        if (xVerify !== calculatedXVerify) {
            console.error("Callback signature verification failed.");
            return res.status(400).send({ success: false, message: "Signature verification failed." });
        }

        const decodedResponse = JSON.parse(Buffer.from(base64Response, 'base64').toString('utf8'));
        const { merchantTransactionId, code } = decodedResponse;

        console.log(`Received callback for ${merchantTransactionId}. Status: ${code}`);

        // --- Find the corresponding document in Firestore using txnId ---
        const submissionsRef = db.collection('submissions');
        const query = submissionsRef.where('txnId', '==', merchantTransactionId).limit(1);
        const querySnapshot = await query.get();

        if (querySnapshot.empty) {
            console.error(`No submission found with txnId: ${merchantTransactionId}`);
            return res.status(404).send({ success: false, message: "Transaction ID not found." });
        }

        const submissionDoc = querySnapshot.docs[0];
        const paymentStatus = (code === 'PAYMENT_SUCCESS') ? 'SUCCESS' : 'FAILED';

        // --- Update the document with the payment status and full response ---
        await submissionDoc.ref.update({
            paymentStatus: paymentStatus,
            paymentResponse: decodedResponse
        });
        
        console.log(`Firestore updated for ${merchantTransactionId}. Status set to ${paymentStatus}.`);
        
        res.status(200).send({ success: true, message: "Callback received and processed." });

    } catch (error) {
        console.error("Error in /callback endpoint:", error.message);
        res.status(500).send({ success: false, message: "An error occurred while processing the callback." });
    }
});

// =================================================================================
// Endpoint 3: Check Payment Status (/check-status)
// Called by the frontend redirect page to get the final status.
// =================================================================================
app.get('/check-status/:merchantTransactionId', async (req, res) => {
    const { merchantTransactionId } = req.params;
    
    try {
        const submissionsRef = db.collection('submissions');
        const query = submissionsRef.where('txnId', '==', merchantTransactionId).limit(1);
        const querySnapshot = await query.get();

        if (querySnapshot.empty) {
            return res.status(404).send({ success: false, message: "Transaction not found." });
        }

        const submissionData = querySnapshot.docs[0].data();

        res.send({ 
            success: true, 
            status: submissionData.paymentStatus || 'PENDING', // Default to PENDING if not set
            data: submissionData.paymentResponse 
        });
    } catch (error) {
        console.error("Error in /check-status:", error.message);
        res.status(500).send({ success: false, message: "Error fetching status from database." });
    }
});

// =================================================================================
// Endpoint 4: Themed Redirect URL handler
// Provides a themed status page for the user after payment attempt.
// =================================================================================
app.all('/redirect-url/:merchantTransactionId', (req, res) => {
    const { merchantTransactionId } = req.params;
    
    // This sends a full HTML page with embedded CSS and JS to the user's browser.
    res.setHeader('Content-Type', 'text/html');
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Status | Imperial Fiesta</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        body { background: linear-gradient(135deg, #6d28d9, #2563eb); font-family: "Poppins", sans-serif; }
        .card { background-color: rgba(255, 255, 255, 0.98); backdrop-filter: blur(10px); border-radius: 1rem; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2); }
        .spinner { border-top-color: #6d28d9; }
        .icon-success { color: #10b981; }
        .icon-fail { color: #ef4444; }
        .btn-primary { background: linear-gradient(to right, #8b5cf6, #3b82f6); transition: all 0.3s ease; }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-4">
    <div id="statusCard" class="card w-full max-w-md p-8 text-center">
        <!-- Initial Loading State -->
        <div id="loadingState">
            <div class="spinner animate-spin w-16 h-16 border-4 rounded-full mx-auto"></div>
            <h2 class="text-2xl font-bold text-gray-800 mt-6">Verifying Payment...</h2>
            <p class="text-gray-600 mt-2">Please wait, do not close this window.</p>
        </div>
        <!-- Success State -->
        <div id="successState" class="hidden">
            <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg class="icon-success w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h2 class="text-2xl font-bold text-gray-800 mt-6">Payment Successful!</h2>
            <p class="text-gray-600 mt-2">Your registration is complete. A confirmation email has been sent.</p>
            <a href="/home.html" class="btn-primary text-white font-semibold py-2 px-6 rounded-lg mt-8 inline-block">Go to Homepage</a>
        </div>
        <!-- Failure State -->
        <div id="failureState" class="hidden">
            <div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <svg class="icon-fail w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </div>
            <h2 class="text-2xl font-bold text-gray-800 mt-6">Payment Failed</h2>
            <p class="text-gray-600 mt-2" id="failureMessage">Your transaction could not be processed. Please try again.</p>
            <a href="/register.html" class="btn-primary text-white font-semibold py-2 px-6 rounded-lg mt-8 inline-block">Try Again</a>
        </div>
    </div>
    <script>
        const merchantTransactionId = '${merchantTransactionId}';
        
        const loadingState = document.getElementById('loadingState');
        const successState = document.getElementById('successState');
        const failureState = document.getElementById('failureState');
        const failureMessage = document.getElementById('failureMessage');
        
        async function checkStatus() {
            try {
                const response = await fetch(\`/check-status/\${merchantTransactionId}\`);
                const result = await response.json();
                
                loadingState.classList.add('hidden');
                
                if (result.success && result.status === 'SUCCESS') {
                    successState.classList.remove('hidden');
                } else {
                    if (result.data && result.data.message) {
                        failureMessage.textContent = \`Reason: \${result.data.message}. Please try again.\`;
                    }
                    failureState.classList.remove('hidden');
                }
            } catch (error) {
                console.error("Error checking status:", error);
                loadingState.classList.add('hidden');
                failureMessage.textContent = 'Could not verify status due to a network error. Please check your registrations or contact support.';
                failureState.classList.remove('hidden');
            }
        }
        // Poll for status a few times, as the S2S callback might have a slight delay.
        setTimeout(checkStatus, 3000); // Check after 3 seconds
    </script>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

