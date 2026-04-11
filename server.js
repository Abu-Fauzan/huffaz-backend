const express = require("express");
const axios = require("axios");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();

// ==========================
// 🔐 FIREBASE (BASE64 SAFE)
// ==========================
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_KEY_BASE64, "base64").toString("utf-8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ==========================
// 🔧 MIDDLEWARE
// ==========================
app.use(cors());
app.use(express.json());

// 🔥 Webhook needs RAW body
app.use("/webhook", express.raw({ type: "*/*" }));

// ==========================
// 🔑 ENV VARIABLES
// ==========================
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

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

      await db.collection("users").doc(userId).set({
        email: data.customer.email, // 🔥 IMPORTANT
        premium: true,
        subscription: "active",
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }, { merge: true });

      console.log("✅ Payment verified & premium activated");

      return res.json({ success: true });

    } else {
      return res.json({ success: false });
    }

  } catch (error) {
    console.log("❌ Verify Error:", error.message);
    return res.status(500).json({ success: false });
  }
});

// ==========================
// 🔁 PAYSTACK WEBHOOK (AUTO RENEW)
// ==========================
app.post("/webhook", async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    console.log("📩 Webhook event:", event.event);

    // ✅ SUBSCRIPTION CREATED / RENEWED
    if (
      event.event === "subscription.create" ||
      event.event === "invoice.payment_success"
    ) {
      const email = event.data.customer.email;

      const snapshot = await db.collection("users")
        .where("email", "==", email)
        .get();

      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];

        await db.collection("users").doc(userDoc.id).set({
          premium: true,
          subscription: "active",
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }, { merge: true });

        console.log("👑 Subscription renewed:", email);
      }
    }

    // ❌ PAYMENT FAILED
    if (event.event === "invoice.payment_failed") {
      const email = event.data.customer.email;

      const snapshot = await db.collection("users")
        .where("email", "==", email)
        .get();

      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];

        await db.collection("users").doc(userDoc.id).set({
          premium: false,
          subscription: "inactive"
        }, { merge: true });

        console.log("❌ Subscription failed:", email);
      }
    }

    res.sendStatus(200);

  } catch (error) {
    console.log("❌ Webhook Error:", error.message);
    res.sendStatus(500);
  }
});

// ==========================
// 🚀 START SERVER
// ==========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
