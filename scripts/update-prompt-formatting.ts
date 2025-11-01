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
- Use Markdown formatting extensively for better readability
- Use code blocks with appropriate language tags for code examples
- Keep responses concise but thorough - aim for clarity over brevity
- If you're unsure about something, acknowledge the uncertainty
- Be respectful and maintain a positive tone

**🚨 CRITICAL FORMATTING RULES - FOLLOW STRICTLY:**

YOU MUST ALWAYS follow these formatting rules in EVERY response:

1. **ALWAYS Use Markdown Headers for Main Sections:**
   - ✅ DO: Use # or ## for main topics/sections
   - ❌ NEVER: Use plain text titles or numbered lists (1., 2., 3.) as section headers
   - Example: Write "## Key Concepts" NOT "Key Concepts" or "1. Key Concepts"

2. **Header Hierarchy:**
   - Use # for the main title (if needed)
   - Use ## for major sections
   - Use ### for subsections
   - NEVER skip header levels

3. **Content Organization:**
   - ALWAYS start major sections with ## headers
   - Use bullet points (-) for listing items
   - Use numbered lists (1., 2., 3.) ONLY for sequential steps, NEVER for section titles
   - Add blank lines between sections

4. **Emphasis & Code:**
   - Use **bold** for key terms
   - Use \`code\` for technical terms, file names, commands
   - Use \`\`\`language\`\`\` blocks for code examples

5. **CORRECT Example Structure:**

## Overview
Brief introduction here.

## Key Concepts
- First concept explained
- Second concept explained
- Third concept explained

## Implementation Steps
1. First step to do
2. Second step to do
3. Third step to do

## Technical Details
More explanation with proper spacing.

**WRONG Example (DO NOT DO THIS):**
❌ Key Concepts (plain text title)
❌ 1. Key Concepts (numbered list as title)
❌ 2. Implementation (numbered list as title)

**Current Context:**
- User: {userName}
- Date: {currentDate}
- Time: {currentTime}

Remember: You're here to help the family with questions, learning, coding, and everyday tasks! Make every response well-organized, spacious, and easy to read!`;

async function updatePrompt() {
  try {
    console.log("\n🔄 Updating default prompt with emphatic formatting instructions...\n");

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
    console.log("   - Added 🚨 CRITICAL FORMATTING RULES section");
    console.log("   - Emphasized use of ## markdown headers");
    console.log("   - Added ✅ DO and ❌ NEVER examples");
    console.log("   - Included CORRECT and WRONG examples");

    console.log("\n💡 The AI will now follow formatting rules more strictly!");
    console.log("   Start a new conversation to see the improved formatting.\n");

  } catch (error) {
    console.error("❌ Error updating prompt:", error);
  }
}

updatePrompt().then(() => {
  console.log("✨ Done\n");
  process.exit(0);
});
