/**
 * Test script for Image Prompt Enhancer
 *
 * Run with: npx tsx scripts/test-prompt-enhancer.ts
 */

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { promptEnhancer } from '../src/lib/image/prompt-enhancer';

async function testPromptEnhancer() {
  console.log('🧪 Testing Image Prompt Enhancer\n');

  const testPrompts = [
    "a cat playing piano",
    "sunset over mountains",
    "futuristic city",
    "portrait of a scientist",
  ];

  for (const prompt of testPrompts) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📝 Original Prompt: "${prompt}"`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      const result = await promptEnhancer.enhance(prompt);

      console.log(`✨ Enhanced Prompt:\n"${result.enhancedPrompt}"\n`);

      console.log('🔧 Enhancements Applied:');
      result.enhancements.forEach((enhancement, idx) => {
        console.log(`   ${idx + 1}. ${enhancement}`);
      });

      console.log(`\n✅ Enhancement successful for: "${prompt}"`);
    } catch (error) {
      console.error(`\n❌ Enhancement failed for: "${prompt}"`);
      console.error('Error:', error);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('✨ All tests completed!');
  console.log(`${'='.repeat(80)}\n`);
}

// Run the test
testPromptEnhancer()
  .then(() => {
    console.log('\n✅ Test script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test script failed:', error);
    process.exit(1);
  });
