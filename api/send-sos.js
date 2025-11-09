import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

// ✅ Initialize Firebase only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.GOOGLE_PROJECT_ID,
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
      privateKey: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const data = req.body;

  try {
    // Get tokens from Firestore
    const usersSnap = await db.collection("users").get();
    const tokens = [];
    usersSnap.forEach((doc) => {
      const user = doc.data();
      if (user.token && doc.id !== data.uid) {
        tokens.push(user.token);
      }
    });

    if (tokens.length === 0) {
      return res.status(200).json({ message: "No tokens found" });
    }

    const message = {
      notification: {
        title: "🚨 SOS Alert!",
        body: `${data.email || "Someone"} needs help at (${data.latitude}, ${data.longitude})`,
      },
      data: {
        uid: data.uid?.toString() || "",
        lat: data.latitude?.toString() || "",
        lng: data.longitude?.toString() || "",
      },
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    res.status(200).json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
    });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
}
