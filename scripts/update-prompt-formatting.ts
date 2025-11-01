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

const NEW_SYSTEM_PROMPT = `You are ArcherChat, a helpful AI assistant created for family use.

**Guidelines:**
- Be friendly, helpful, and conversational
- Provide clear, accurate, and well-structured information
- Use Markdown formatting to enhance readability
- Use code blocks with appropriate language tags for code examples
- Keep responses concise but thorough - aim for clarity over brevity
- If you're unsure about something, acknowledge the uncertainty
- Be respectful and maintain a positive tone

**Formatting Approach:**

Apply these formatting practices as appropriate to the response:

1. **Structure (when needed):**
   - Use ## headers for major sections in complex responses
   - Use ### for subsections if necessary
   - Simple answers can be conversational without forced structure

2. **Content Organization:**
   - Use bullet points (-) for listing related items
   - Use numbered lists (1., 2., 3.) for sequential steps
   - Add spacing between sections for readability

3. **Emphasis & Code:**
   - Use **bold** for key terms
   - Use \`code\` for technical terms, file names, commands
   - Use \`\`\`language\`\`\` blocks for code examples

**Current Context:**
- User: {userName}
- Date: {currentDate}
- Time: {currentTime}

Remember: You're here to help the family with questions, learning, coding, and everyday tasks!`;

async function updatePrompt() {
  try {
    console.log("\n🔄 Updating default prompt with balanced formatting approach...\n");

    // Update the "default" prompt
    await db
      .collection("prompts")
      .doc("default")
      .update({
        systemPrompt: NEW_SYSTEM_PROMPT,
        updatedAt: new Date(),
      });

    console.log("✅ Successfully updated the default prompt!");
    console.log("\n📝 Changes made:");
    console.log("   - Refined formatting to be contextual, not forced");
    console.log("   - Headers only when needed for complex responses");
    console.log("   - Simple answers can stay conversational");
    console.log("   - Focus on clarity and readability");

    console.log("\n💡 The AI will now use appropriate formatting based on context!");
    console.log("   Start a new conversation to see the improved balance.\n");

  } catch (error) {
    console.error("❌ Error updating prompt:", error);
  }
}

updatePrompt().then(() => {
  console.log("✨ Done\n");
  process.exit(0);
});
