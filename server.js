const express = require("express");
const axios = require("axios");
const cors = require("cors");
const admin = require("firebase-admin");

// 🔥 LOAD SERVICE ACCOUNT
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY.replace(/\\n/g, '\n'));

// 🔥 INIT FIREBASE ADMIN
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
app.use(express.json());
app.use(cors());

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY; // 🔴 YOUR SECRET KEY

// ==========================
// 💳 VERIFY PAYMENT
// ==========================
app.post("/verify-payment", async (req, res) => {
  const { reference, userId } = req.body;

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const data = response.data.data;

    if (data.status === "success") {

      // 🔥 UPDATE FIREBASE SECURELY
      await db.collection("users").doc(userId).set({
        premium: true
      }, { merge: true });

      return res.json({ success: true });

    } else {
      return res.json({ success: false });
    }

  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false });
  }
});

app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});
