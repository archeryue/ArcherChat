/**
 * One-time script to fix language preference for a user
 * This manually cleans up old language facts and sets the correct preference
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load environment variables from .env.local
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const envFile = readFileSync(envPath, "utf-8");
  const envVars = envFile.split("\n");
  envVars.forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      process.env[key.trim()] = value.trim().replace(/^['"]|['"]$/g, "");
    }
  });
} catch (error) {
  console.error("Error loading .env.local:", error);
  process.exit(1);
}

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

const db = getFirestore();
const COLLECTIONS = {
  USERS: "users",
};
const MEMORY_COLLECTION = "memory";

async function fixLanguagePreference(userEmail: string) {
  try {
    console.log(`\n🔍 Looking for user: ${userEmail}...`);

    // Find user by email
    const usersSnapshot = await db
      .collection(COLLECTIONS.USERS)
      .where("email", "==", userEmail)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      console.log("❌ User not found with that email");
      console.log("\n📝 Listing all users:");
      const allUsers = await db.collection(COLLECTIONS.USERS).get();
      allUsers.docs.forEach((doc) => {
        const data = doc.data();
        console.log(`   - ${data.email || 'no email'} (ID: ${doc.id})`);
      });
      return;
    }

    const userId = usersSnapshot.docs[0].id;
    console.log(`✅ Found user ID: ${userId}`);

    // Get user's memory - correct path: users/{userId}/memory/data
    const memoryDoc = await db
      .collection(COLLECTIONS.USERS)
      .doc(userId)
      .collection(MEMORY_COLLECTION)
      .doc("data")
      .get();

    if (!memoryDoc.exists) {
      console.log("⚠️  No memory document found, creating one...");
      await db
        .collection(COLLECTIONS.USERS)
        .doc(userId)
        .collection(MEMORY_COLLECTION)
        .doc("data")
        .set({
          user_id: userId,
          facts: [],
          language_preference: "english",
          stats: {
            total_facts: 0,
            token_usage: 0,
            last_cleanup: new Date(),
          },
          created_at: new Date(),
          updated_at: new Date(),
        });
      console.log("✅ Created memory document with language_preference: english");
      return;
    }

    const memoryData = memoryDoc.data()!;
    const currentFacts = memoryData.facts || [];

    console.log(`\n📊 Current memory status:`);
    console.log(`   Total facts: ${currentFacts.length}`);
    console.log(`   Language preference: ${memoryData.language_preference || "not set"}`);

    // Remove old language preference facts
    const languageKeywords = [
      "language",
      "english",
      "chinese",
      "communicate",
      "语言",
      "英文",
      "中文",
      "沟通",
    ];

    const cleanedFacts = currentFacts.filter((fact: any) => {
      const lowerContent = fact.content.toLowerCase();
      const hasLanguageKeyword = languageKeywords.some((keyword) =>
        lowerContent.includes(keyword.toLowerCase())
      );
      return !hasLanguageKeyword;
    });

    const removedCount = currentFacts.length - cleanedFacts.length;

    console.log(`\n🧹 Cleanup results:`);
    console.log(`   Removed ${removedCount} language-related facts`);
    console.log(`   Remaining facts: ${cleanedFacts.length}`);

    if (removedCount > 0) {
      console.log(`\n   Removed facts:`);
      currentFacts
        .filter((fact: any) => {
          const lowerContent = fact.content.toLowerCase();
          return languageKeywords.some((keyword) =>
            lowerContent.includes(keyword.toLowerCase())
          );
        })
        .forEach((fact: any) => {
          console.log(`   - "${fact.content}"`);
        });
    }

    // Update memory with cleaned facts and language preference
    await db
      .collection(COLLECTIONS.USERS)
      .doc(userId)
      .collection(MEMORY_COLLECTION)
      .doc("data")
      .update({
        facts: cleanedFacts,
        language_preference: "english",
        updated_at: new Date(),
      });

    console.log(`\n✅ Memory updated successfully!`);
    console.log(`   Language preference set to: english`);
    console.log(`\n🎉 Done! Refresh your memory profile page to see the changes.`);
  } catch (error) {
    console.error("❌ Error fixing language preference:", error);
  }
}

// Get user email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.error("❌ Please provide user email as argument");
  console.log("\nUsage: npx ts-node scripts/fix-language-preference.ts <user-email>");
  process.exit(1);
}

fixLanguagePreference(userEmail).then(() => {
  console.log("\n✨ Script completed");
  process.exit(0);
});
