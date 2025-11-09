// index.js
import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

// ✅ Initialize Firebase Admin securely using .env
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.GOOGLE_PROJECT_ID,
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

console.log("✅ Connected to Firebase project:", admin.app().options.credential.projectId);
console.log("🗄️ Firestore Database URL:", admin.app().options.databaseURL || "Default Firestore");

// ✅ Verify Firestore connection
const verifyConnection = async () => {
  const testSnap = await db.collection("users").get();
  console.log(`📊 Found ${testSnap.size} user(s) in Firestore.`);
  testSnap.forEach((doc) => {
    console.log("👤", doc.id, doc.data());
  });
};
await verifyConnection();

// ✅ Function to fetch all FCM tokens
const getAllTokens = async (excludeUid) => {
  const usersSnap = await db.collection("users").get();
  const tokens = [];
  usersSnap.forEach((doc) => {
    const user = doc.data();
    // ✅ Make sure token exists and exclude the sender
    if (user.token && doc.id !== excludeUid) {
      tokens.push(user.token);
    }
  });
  console.log(`📦 Retrieved ${tokens.length} token(s) from Firestore.`);
  return tokens;
};

// ✅ Function to send push notification (with token cleanup)
const sendNotification = async (data) => {
  const tokens = await getAllTokens(data.uid);

  if (tokens.length === 0) {
    console.log("⚠️ No tokens found in Firestore (users collection)");
    return;
  }

  console.log("📱 Found tokens:", tokens);

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
    tokens: tokens,
  };

  try {
    const res = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Notifications sent: ${res.successCount}`);

    if (res.failureCount > 0) {
      console.log(`⚠️ Failed notifications: ${res.failureCount}`);

      // 🔹 Handle invalid or expired tokens
      res.responses.forEach(async (r, i) => {
        if (!r.success) {
          console.log(`❌ Token error [${tokens[i]}]:`, r.error);

          if (r.error.code === "messaging/registration-token-not-registered") {
            // 🧹 Remove invalid tokens from Firestore
            const usersSnap = await db.collection("users")
              .where("token", "==", tokens[i])
              .get();

            usersSnap.forEach((doc) => {
              console.log(`🗑 Removing invalid token for user: ${doc.id}`);
              doc.ref.update({ token: admin.firestore.FieldValue.delete() });
            });
          }
        }
      });
    }
  } catch (err) {
    console.error("❌ Error sending notifications:", err);
  }
};

// ✅ Listen for new SOS alerts
console.log("👂 Listening for SOS alerts...");
db.collection("sos_alerts").onSnapshot((snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    if (change.type === "added") {
      const data = change.doc.data();
      console.log("🚨 New SOS alert:", data);
      await sendNotification(data);
    }
  });
});
