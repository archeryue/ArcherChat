import { getUserMemory, markMemoryUsed } from "./storage";
import { MemoryCategory, LanguagePreference } from "@/types/memory";

/**
 * Load user's memory and format for chat context
 */
export async function loadMemoryForChat(userId: string): Promise<string> {
  const memory = await getUserMemory(userId);

  // Build language preference instruction
  let languageInstruction = "";
  if (memory.language_preference) {
    switch (memory.language_preference) {
      case LanguagePreference.ENGLISH:
        languageInstruction = "**Language Preference:** User prefers English. Respond in English.\n\n";
        break;
      case LanguagePreference.CHINESE:
        languageInstruction = "**Language Preference:** User prefers Chinese (中文). Respond in Chinese.\n\n";
        break;
      case LanguagePreference.HYBRID:
        languageInstruction = "**Language Preference:** User is comfortable with both English and Chinese. You may use either language or mix them as appropriate.\n\n";
        break;
    }
  }

  if (memory.facts.length === 0 && !languageInstruction) {
    return "";
  }

  if (memory.facts.length === 0 && languageInstruction) {
    return `## User Memory\n\n${languageInstruction}`;
  }

  // Sort by tier priority (core first)
  const facts = memory.facts.sort((a, b) => {
    const tierOrder = { core: 0, important: 1, context: 2 };
    return tierOrder[a.tier] - tierOrder[b.tier];
  });

  // Group by category
  const sections: Record<string, string[]> = {
    profile: [],
    preference: [],
    technical: [],
    project: [],
  };

  facts.forEach((fact) => {
    sections[fact.category].push(fact.content);
  });

  // Build memory context
  let context = "## User Memory\n\n";

  // Add language preference at the top
  context += languageInstruction;

  if (sections.profile.length > 0) {
    context += "**About the user:**\n" + sections.profile.map((f) => `- ${f}`).join("\n") + "\n\n";
  }

  if (sections.preference.length > 0) {
    context += "**Preferences:**\n" + sections.preference.map((f) => `- ${f}`).join("\n") + "\n\n";
  }

  if (sections.technical.length > 0) {
    context += "**Technical Context:**\n" + sections.technical.map((f) => `- ${f}`).join("\n") + "\n\n";
  }

  if (sections.project.length > 0) {
    context += "**Current Work:**\n" + sections.project.map((f) => `- ${f}`).join("\n") + "\n\n";
  }

  context += "Use this information to personalize responses, but don't constantly reference it unless relevant.\n";

  // Track usage
  await markMemoryUsed(
    userId,
    facts.map((f) => f.id)
  );

  return context;
}
