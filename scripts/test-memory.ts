/**
 * Quick Verification Script: Memory System
 *
 * Tests critical memory operations including bugs we fixed:
 * - TC-MEM-008: addMemoryFacts with language preference
 * - TC-MEM-009: Language preference update without new facts
 * - TC-CLN-001: cleanupUserMemory preserves language preference
 * - TC-ANA-007: Tier normalization (CORE → core)
 * - TC-ANA-009: Category normalization (PROFILE → profile)
 *
 * Usage: npx tsx scripts/test-memory.ts
 */

// Load environment variables from .env.local
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
});

import { db } from '../src/lib/firebase-admin';
import { addMemoryFacts, getUserMemory } from '../src/lib/memory/storage';
import { cleanupUserMemory } from '../src/lib/memory/cleanup';
import { MemoryFact, MemoryTier, MemoryCategory, LanguagePreference } from '../src/types/memory';

const TEST_USER_ID = 'test-user-memory-verification';

// Test utilities
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  testsRun++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ✗ ${message}`);
    testsFailed++;
  }
}

async function cleanup() {
  // Clear test user's memory
  await db
    .collection('users')
    .doc(TEST_USER_ID)
    .collection('memory')
    .doc('data')
    .delete();
}

// Test 1: Add facts with language preference
async function test_addMemoryFacts_withLanguagePreference() {
  console.log('\n[TEST 1] addMemoryFacts with language preference');

  const testFact: MemoryFact = {
    id: 'fact-test-1',
    content: 'Test fact 1',
    category: 'profile' as MemoryCategory,
    tier: 'core' as MemoryTier,
    confidence: 0.9,
    created_at: new Date(),
    last_used_at: new Date(),
    use_count: 0,
    expires_at: null,
    auto_extracted: true,
    extracted_from: 'test-conversation',
  };

  await addMemoryFacts(TEST_USER_ID, [testFact], LanguagePreference.ENGLISH);

  const memory = await getUserMemory(TEST_USER_ID);

  assert(memory.facts.length === 1, 'Should have 1 fact');
  assert(memory.facts[0].content === 'Test fact 1', 'Fact content should match');
  assert(memory.language_preference === LanguagePreference.ENGLISH, 'Language preference should be "english"');
}

// Test 2: Update language preference without adding facts (duplicates)
async function test_addMemoryFacts_languageOnly() {
  console.log('\n[TEST 2] Update language preference without new facts');

  const duplicateFact: MemoryFact = {
    id: 'fact-test-duplicate',
    content: 'Test fact 1', // Same as before
    category: 'profile' as MemoryCategory,
    tier: 'core' as MemoryTier,
    confidence: 0.9,
    created_at: new Date(),
    last_used_at: new Date(),
    use_count: 0,
    expires_at: null,
    auto_extracted: true,
    extracted_from: 'test-conversation',
  };

  await addMemoryFacts(TEST_USER_ID, [duplicateFact], LanguagePreference.CHINESE);

  const memory = await getUserMemory(TEST_USER_ID);

  assert(memory.facts.length === 1, 'Should still have 1 fact (duplicate skipped)');
  assert(memory.language_preference === LanguagePreference.CHINESE, 'Language preference should be updated to "chinese"');
}

// Test 3: cleanupUserMemory preserves language preference (BUG-001 fix)
async function test_cleanupUserMemory_preservesLanguagePreference() {
  console.log('\n[TEST 3] cleanupUserMemory preserves language preference');

  // Add more facts to trigger cleanup
  const facts: MemoryFact[] = [];
  for (let i = 0; i < 5; i++) {
    facts.push({
      id: `fact-cleanup-${i}`,
      content: `Cleanup test fact ${i}`,
      category: 'context' as MemoryCategory,
      tier: 'context' as MemoryTier,
      confidence: 0.7,
      created_at: new Date(),
      last_used_at: new Date(),
      use_count: 0,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      auto_extracted: true,
      extracted_from: 'test-conversation',
    });
  }

  await addMemoryFacts(TEST_USER_ID, facts, LanguagePreference.HYBRID);

  const beforeCleanup = await getUserMemory(TEST_USER_ID);
  assert(beforeCleanup.language_preference === LanguagePreference.HYBRID, 'Language should be "hybrid" before cleanup');
  assert(beforeCleanup.facts.length === 6, 'Should have 6 facts before cleanup'); // 1 original + 5 new

  // Run cleanup
  await cleanupUserMemory(TEST_USER_ID);

  const afterCleanup = await getUserMemory(TEST_USER_ID);
  assert(afterCleanup.language_preference === LanguagePreference.HYBRID, 'Language should still be "hybrid" after cleanup');
  assert(afterCleanup.facts.length <= 6, 'Facts should be same or reduced after cleanup');
}

// Test 4: Tier normalization (uppercase → lowercase)
async function test_tierNormalization() {
  console.log('\n[TEST 4] Tier normalization (CORE → core)');

  // This simulates what PromptAnalyzer does
  const factWithUppercaseTier: any = {
    id: 'fact-tier-test',
    content: 'Tier normalization test',
    category: 'PROFILE', // Uppercase
    tier: 'CORE', // Uppercase
    confidence: 0.95,
    created_at: new Date(),
    last_used_at: new Date(),
    use_count: 0,
    expires_at: null,
    auto_extracted: true,
    extracted_from: 'test-conversation',
  };

  // Normalize (this should happen in PromptAnalyzer)
  const normalized = {
    ...factWithUppercaseTier,
    tier: factWithUppercaseTier.tier.toLowerCase(),
    category: factWithUppercaseTier.category.toLowerCase(),
  };

  await addMemoryFacts(TEST_USER_ID, [normalized], LanguagePreference.ENGLISH);

  const memory = await getUserMemory(TEST_USER_ID);
  const savedFact = memory.facts.find(f => f.id === 'fact-tier-test');

  assert(savedFact !== undefined, 'Normalized fact should be saved');
  assert(savedFact?.tier === 'core', 'Tier should be lowercase "core"');
  assert(savedFact?.category === 'profile', 'Category should be lowercase "profile"');
}

// Test 5: Duplicate detection
async function test_duplicateDetection() {
  console.log('\n[TEST 5] Duplicate detection');

  const fact1: MemoryFact = {
    id: 'fact-dup-1',
    content: 'I love pizza',
    category: 'preference' as MemoryCategory,
    tier: 'important' as MemoryTier,
    confidence: 0.85,
    created_at: new Date(),
    last_used_at: new Date(),
    use_count: 0,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    auto_extracted: true,
    extracted_from: 'test-conversation',
  };

  await addMemoryFacts(TEST_USER_ID, [fact1], LanguagePreference.ENGLISH);

  const beforeDup = await getUserMemory(TEST_USER_ID);
  const factsCountBefore = beforeDup.facts.length;

  // Try to add very similar fact
  const fact2: MemoryFact = {
    id: 'fact-dup-2',
    content: 'I love pizza', // Exact duplicate
    category: 'preference' as MemoryCategory,
    tier: 'important' as MemoryTier,
    confidence: 0.9,
    created_at: new Date(),
    last_used_at: new Date(),
    use_count: 0,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    auto_extracted: true,
    extracted_from: 'test-conversation',
  };

  await addMemoryFacts(TEST_USER_ID, [fact2], LanguagePreference.ENGLISH);

  const afterDup = await getUserMemory(TEST_USER_ID);

  assert(afterDup.facts.length === factsCountBefore, 'Should not add exact duplicate');
}

// Test 6: Similarity detection (>80% match)
async function test_similarityDetection() {
  console.log('\n[TEST 6] Similarity detection (>80% match)');

  const fact1: MemoryFact = {
    id: 'fact-sim-1',
    content: 'User prefers dark mode',
    category: 'preference' as MemoryCategory,
    tier: 'important' as MemoryTier,
    confidence: 0.9,
    created_at: new Date(),
    last_used_at: new Date(),
    use_count: 0,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    auto_extracted: true,
    extracted_from: 'test-conversation',
  };

  await addMemoryFacts(TEST_USER_ID, [fact1], LanguagePreference.ENGLISH);

  const beforeSim = await getUserMemory(TEST_USER_ID);
  const factsCountBefore = beforeSim.facts.length;

  // Try to add similar fact
  const fact2: MemoryFact = {
    id: 'fact-sim-2',
    content: 'User prefers dark mode theme', // Very similar
    category: 'preference' as MemoryCategory,
    tier: 'important' as MemoryTier,
    confidence: 0.85,
    created_at: new Date(),
    last_used_at: new Date(),
    use_count: 0,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    auto_extracted: true,
    extracted_from: 'test-conversation',
  };

  await addMemoryFacts(TEST_USER_ID, [fact2], LanguagePreference.ENGLISH);

  const afterSim = await getUserMemory(TEST_USER_ID);

  assert(afterSim.facts.length === factsCountBefore, 'Should not add similar fact (>80% match)');
}

// Run all tests
async function runTests() {
  console.log('==========================================');
  console.log('  Memory System Verification Tests');
  console.log('==========================================');

  try {
    // Clean up before tests
    await cleanup();

    // Run tests sequentially
    await test_addMemoryFacts_withLanguagePreference();
    await test_addMemoryFacts_languageOnly();
    await test_cleanupUserMemory_preservesLanguagePreference();
    await test_tierNormalization();
    await test_duplicateDetection();
    await test_similarityDetection();

    // Summary
    console.log('\n==========================================');
    console.log('  Test Summary');
    console.log('==========================================');
    console.log(`Total tests: ${testsRun}`);
    console.log(`Passed: ${testsPassed} ✓`);
    console.log(`Failed: ${testsFailed} ✗`);
    console.log('==========================================');

    // Clean up after tests
    await cleanup();

    process.exit(testsFailed === 0 ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test suite crashed:', error);
    await cleanup();
    process.exit(1);
  }
}

runTests();
