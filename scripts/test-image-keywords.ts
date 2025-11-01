import { IMAGE_GENERATION_KEYWORDS, containsKeywords } from "../src/config/keywords";

const testPrompts = [
  "generate an image of a cat",  // English - should match
  "draw a picture of sunset",    // English - should match
  "画一张春丽大战不知火舞的图片",  // Chinese - should match
  "生成一张城市夜景图片",         // Chinese - should match
  "画一个卡通人物",               // Chinese - should match
  "What is the weather today?",  // English - should NOT match
  "今天天气怎么样",               // Chinese - should NOT match
];

console.log("Testing Image Generation Keyword Detection\n");
console.log("==========================================\n");

testPrompts.forEach(prompt => {
  const isImage = containsKeywords(prompt, IMAGE_GENERATION_KEYWORDS);
  console.log(`Prompt: "${prompt}"`);
  console.log(`Detected as image generation: ${isImage ? "✅ YES" : "❌ NO"}`);
  console.log();
});

// Test specific keywords
console.log("\nTesting specific Chinese keyword matching:");
console.log("==========================================\n");

const chinesePrompt = "画一张春丽大战不知火舞的图片";
const lowerPrompt = chinesePrompt.toLowerCase();

IMAGE_GENERATION_KEYWORDS.chinese.forEach(keyword => {
  if (lowerPrompt.includes(keyword.toLowerCase())) {
    console.log(`✅ Matched keyword: "${keyword}"`);
  }
});

console.log("\n\nDirect test of isImageGenerationRequest from provider:");
console.log("========================================================\n");

// Simulate the exact function from gemini.provider.ts
function isImageGenerationRequest(content: string): boolean {
  return containsKeywords(content, IMAGE_GENERATION_KEYWORDS);
}

const userPrompt = "画一张春丽大战不知火舞的图片";
const result = isImageGenerationRequest(userPrompt);
console.log(`User prompt: "${userPrompt}"`);
console.log(`Result: ${result ? "✅ DETECTED as image generation" : "❌ NOT DETECTED"}`);