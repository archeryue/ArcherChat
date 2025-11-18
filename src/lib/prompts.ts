import { db, COLLECTIONS } from "./firebase-admin";
import { PromptConfig, PromptTemplate, PromptConfigFirestore } from "@/types/prompts";

// Default prompt templates
export const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: "default",
    name: "Helpful Assistant",
    description: "Balanced, helpful assistant for general use",
    temperature: 0.7,
    systemPrompt: `You are WhimCraft, a helpful AI agent created for family use.

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

Remember: You're here to help the family with questions, learning, coding, and everyday tasks!`,
  },
  {
    id: "creative",
    name: "Creative Assistant",
    description: "More creative and imaginative responses",
    temperature: 0.9,
    systemPrompt: `You are WhimCraft, a creative and imaginative AI agent.

**Your Personality:**
- Be creative, playful, and think outside the box
- Use vivid descriptions and engaging language
- Feel free to use analogies, metaphors, and storytelling
- Encourage creative thinking and exploration
- Still maintain accuracy and helpfulness

**Guidelines:**
- Use Markdown for beautiful formatting
- Be enthusiastic and inspiring
- Provide multiple perspectives or ideas when relevant
- Use examples and scenarios to illustrate points
- Make learning fun and engaging

**Current Context:**
- User: {userName}
- Date: {currentDate}

Let's explore ideas together and make this conversation interesting!`,
  },
  {
    id: "professional",
    name: "Professional Assistant",
    description: "Formal, concise, and professional tone",
    temperature: 0.5,
    systemPrompt: `You are WhimCraft, a professional AI agent.

**Professional Standards:**
- Maintain a formal, professional tone
- Provide concise, well-organized responses
- Focus on accuracy and precision
- Use proper technical terminology
- Structure information logically

**Response Format:**
- Begin with a direct answer
- Provide supporting details as needed
- Use bullet points for clarity
- Include relevant examples when helpful
- Conclude with actionable next steps if applicable

**Technical Communication:**
- Use Markdown formatting
- Code blocks with syntax highlighting
- Clear headings and sections
- Professional language throughout

**Context:**
- User: {userName}
- Date: {currentDate}

Providing professional assistance for your queries.`,
  },
  {
    id: "coding",
    name: "Coding Expert",
    description: "Specialized for programming and technical questions",
    temperature: 0.6,
    systemPrompt: `You are WhimCraft, a coding expert and technical agent.

**Expertise:**
- Programming languages and frameworks
- Software architecture and design patterns
- Debugging and problem-solving
- Best practices and code optimization
- DevOps and deployment

**Code Response Guidelines:**
- Always use proper syntax highlighting in code blocks
- Include comments in code for clarity
- Explain the logic and approach
- Suggest alternatives when appropriate
- Point out potential issues or edge cases
- Follow language-specific conventions

**Format:**
\`\`\`language
// Well-commented code here
\`\`\`

**Technical Communication:**
- Be precise with technical terms
- Provide working examples
- Explain why, not just how
- Reference documentation when relevant
- Suggest testing approaches

**Current Context:**
- User: {userName}
- Date: {currentDate}

Ready to help with your coding challenges!`,
  },
  {
    id: "teacher",
    name: "Patient Teacher",
    description: "Educational, patient, and thorough explanations",
    temperature: 0.7,
    systemPrompt: `You are WhimCraft, a patient and encouraging teacher.

**Teaching Philosophy:**
- Break down complex topics into simple concepts
- Use analogies and real-world examples
- Encourage questions and curiosity
- Build on existing knowledge
- Celebrate understanding and progress

**Teaching Methods:**
- Start with the basics and build up
- Use the Socratic method when helpful
- Provide step-by-step explanations
- Include practice examples
- Check for understanding
- Adapt to the learner's pace

**Communication Style:**
- Patient and encouraging
- Clear and simple language
- Use visuals through Markdown when helpful
- Provide multiple explanations if needed
- Make learning enjoyable

**Structure:**
1. **Concept**: What are we learning?
2. **Explanation**: Simple, clear breakdown
3. **Example**: Real-world illustration
4. **Practice**: Apply the knowledge
5. **Summary**: Key takeaways

**Current Context:**
- Student: {userName}
- Date: {currentDate}

Let's learn together! No question is too simple or too complex.`,
  },
];

// Replace variables in system prompt
export function processPromptVariables(
  prompt: string,
  variables: {
    userName?: string;
    currentDate?: string;
    currentTime?: string;
    [key: string]: string | undefined;
  }
): string {
  let processed = prompt;

  // Replace each variable
  Object.keys(variables).forEach((key) => {
    const value = variables[key] || "";
    processed = processed.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  });

  return processed;
}

// Get active prompt from Firestore or use default
export async function getActivePrompt(): Promise<PromptConfig> {
  try {
    const promptsSnapshot = await db
      .collection(COLLECTIONS.PROMPTS)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (!promptsSnapshot.empty) {
      const doc = promptsSnapshot.docs[0];
      const data = doc.data() as PromptConfigFirestore;

      return {
        id: data.id,
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        isActive: data.isActive,
        isDefault: data.isDefault,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      };
    }

    // No active prompt in DB, use default
    return getDefaultPrompt();
  } catch (error) {
    console.error("Error getting active prompt:", error);
    return getDefaultPrompt();
  }
}

// Get default prompt as PromptConfig
function getDefaultPrompt(): PromptConfig {
  const defaultTemplate = DEFAULT_PROMPTS[0];
  return {
    id: defaultTemplate.id,
    name: defaultTemplate.name,
    description: defaultTemplate.description,
    systemPrompt: defaultTemplate.systemPrompt,
    temperature: defaultTemplate.temperature,
    isActive: true,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Get all prompts from Firestore
export async function getAllPrompts(): Promise<PromptConfig[]> {
  try {
    const promptsSnapshot = await db
      .collection(COLLECTIONS.PROMPTS)
      .orderBy("updatedAt", "desc")
      .get();

    return promptsSnapshot.docs.map((doc) => {
      const data = doc.data() as PromptConfigFirestore;
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        isActive: data.isActive,
        isDefault: data.isDefault,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      };
    });
  } catch (error) {
    console.error("Error getting all prompts:", error);
    return [];
  }
}

// Save or update prompt
export async function savePrompt(
  prompt: Omit<PromptConfig, "createdAt" | "updatedAt">
): Promise<void> {
  try {
    const promptRef = db.collection(COLLECTIONS.PROMPTS).doc(prompt.id);
    const doc = await promptRef.get();

    const now = new Date();

    if (doc.exists) {
      // Update existing
      await promptRef.update({
        ...prompt,
        updatedAt: now,
      });
    } else {
      // Create new
      await promptRef.set({
        ...prompt,
        createdAt: now,
        updatedAt: now,
      });
    }

    // If setting this as active, deactivate others
    if (prompt.isActive) {
      const otherPrompts = await db
        .collection(COLLECTIONS.PROMPTS)
        .where("isActive", "==", true)
        .get();

      const batch = db.batch();
      otherPrompts.docs.forEach((doc) => {
        if (doc.id !== prompt.id) {
          batch.update(doc.ref, { isActive: false });
        }
      });
      await batch.commit();
    }
  } catch (error) {
    console.error("Error saving prompt:", error);
    throw error;
  }
}

// Delete prompt
export async function deletePrompt(promptId: string): Promise<void> {
  try {
    const promptRef = db.collection(COLLECTIONS.PROMPTS).doc(promptId);
    const doc = await promptRef.get();

    if (!doc.exists) {
      throw new Error("Prompt not found");
    }

    const data = doc.data() as PromptConfigFirestore;

    // Don't allow deleting default prompts
    if (data.isDefault) {
      throw new Error("Cannot delete default prompts");
    }

    await promptRef.delete();
  } catch (error) {
    console.error("Error deleting prompt:", error);
    throw error;
  }
}

// Reset to default prompts
export async function resetToDefaultPrompts(): Promise<void> {
  try {
    // Delete all non-default prompts
    const prompts = await db.collection(COLLECTIONS.PROMPTS).get();
    const batch = db.batch();

    prompts.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    // Add default prompts
    const now = new Date();
    const addBatch = db.batch();

    DEFAULT_PROMPTS.forEach((template, index) => {
      const promptRef = db.collection(COLLECTIONS.PROMPTS).doc(template.id);
      addBatch.set(promptRef, {
        id: template.id,
        name: template.name,
        description: template.description,
        systemPrompt: template.systemPrompt,
        temperature: template.temperature,
        isActive: index === 0, // First one is active
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    await addBatch.commit();
  } catch (error) {
    console.error("Error resetting to default prompts:", error);
    throw error;
  }
}
