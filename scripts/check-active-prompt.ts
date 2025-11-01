import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load environment variables
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

// Initialize Firebase
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

async function checkActivePrompt() {
  try {
    console.log("\n🔍 Checking all prompts in database...\n");

    // Check ALL prompts first
    const allPromptsSnapshot = await db.collection("prompts").get();
    console.log(`📊 Total prompts in database: ${allPromptsSnapshot.size}\n`);

    if (allPromptsSnapshot.size > 0) {
      allPromptsSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        const prompt = data.systemPrompt || data.system_prompt || "";
        const hasNewFormatting = prompt.includes("CRITICAL FORMATTING RULES");
        const hasOldFormatting = prompt.includes("IMPORTANT - Response Structure");

        console.log(`Prompt ${index + 1}:`);
        console.log(`   ID: ${doc.id}`);
        console.log(`   Name: ${data.name}`);
        console.log(`   Active (isActive): ${data.isActive ? "✅ YES" : "❌ NO"}`);
        console.log(`   Has formatting: ${hasNewFormatting ? "✅ NEW" : hasOldFormatting ? "⚠️  OLD" : "❌ NO"}`);
        console.log();
      });
    }

    const promptsSnapshot = await db
      .collection("prompts")
      .where("isActive", "==", true)
      .get();

    if (promptsSnapshot.empty) {
      console.log("⚠️  No active prompt found in database");
      console.log("   The system will use the default prompt from code");
      return;
    }

    const activePrompt = promptsSnapshot.docs[0].data();
    const systemPrompt = activePrompt.systemPrompt || activePrompt.system_prompt;

    console.log("✅ Active Prompt Found:");
    console.log(`   Name: ${activePrompt.name}`);
    console.log(`   Temperature: ${activePrompt.temperature}`);
    console.log(`\n📝 System Prompt (first 500 chars):`);
    console.log("   " + systemPrompt.substring(0, 500).replace(/\n/g, "\n   "));

    if (systemPrompt.length > 500) {
      console.log(`\n   ... (${systemPrompt.length - 500} more characters)`);
    }

    // Check if formatting instructions are present
    const hasOldFormatting = systemPrompt.includes("IMPORTANT - Response Structure");
    const hasNewFormatting = systemPrompt.includes("CRITICAL FORMATTING RULES");

    console.log(`\n🎨 Formatting Instructions:`);
    console.log(`   Old version: ${hasOldFormatting ? "✅ YES" : "❌ NO"}`);
    console.log(`   New version (emphatic): ${hasNewFormatting ? "✅ YES" : "❌ NO"}`);

    if (!hasOldFormatting && !hasNewFormatting) {
      console.log("\n⚠️  WARNING: Active prompt does not contain formatting instructions!");
      console.log("   Go to Admin Panel > Prompts to update the active prompt.");
    } else if (hasNewFormatting) {
      console.log("\n✅ Prompt has the NEW emphatic formatting instructions!");
    }

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

checkActivePrompt().then(() => {
  console.log("\n✨ Done\n");
  process.exit(0);
});
