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
    const { txnId } = req.query;

    if (!txnId) {
        return res.status(400).send("Transaction ID is missing.");
    }
    
    // Fetch final status from Firestore to be sure
    let finalStatus = 'PENDING';
    let responseData = null;
    try {
        const query = db.collection('submissions').where('txnId', '==', txnId).limit(1);
        const snapshot = await query.get();
        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            finalStatus = data.paymentStatus || 'PENDING';
            responseData = data.paymentResponse;
        }
    } catch (e) {
        console.error("Error fetching from Firestore in redirect:", e);
    }

    const statusHtml = `
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
            <div id="loadingState" class="${finalStatus !== 'PENDING' ? 'hidden' : ''}">
                <div class="spinner animate-spin w-16 h-16 border-4 rounded-full mx-auto"></div>
                <h2 class="text-2xl font-bold text-gray-800 mt-6">Verifying Payment...</h2>
                <p class="text-gray-600 mt-2">Please wait, do not close this window.</p>
            </div>
            <!-- Success State -->
            <div id="successState" class="${finalStatus !== 'SUCCESS' ? 'hidden' : ''}">
                <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                    <svg class="icon-success w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h2 class="text-2xl font-bold text-gray-800 mt-6">Payment Successful!</h2>
                <p class="text-gray-600 mt-2">Your registration is complete. A confirmation email has been sent.</p>
                <a href="/home.html" class="btn-primary text-white font-semibold py-2 px-6 rounded-lg mt-8 inline-block">Go to Homepage</a>
            </div>
            <!-- Failure State -->
            <div id="failureState" class="${finalStatus !== 'FAILED' ? 'hidden' : ''}">
                <div class="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                    <svg class="icon-fail w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </div>
                <h2 class="text-2xl font-bold text-gray-800 mt-6">Payment Failed</h2>
                <p class="text-gray-600 mt-2" id="failureMessage">Your transaction could not be processed. Please try again.</p>
                <a href="/register.html" class="btn-primary text-white font-semibold py-2 px-6 rounded-lg mt-8 inline-block">Try Again</a>
            </div>
        </div>
    </body>
    </html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(statusHtml);
}
