/**
 * Add test user to Firestore whitelist
 * Run with: npx tsx scripts/add-test-user-to-whitelist.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.development.local
config({ path: resolve(__dirname, '../.env.development.local') });

import { db, COLLECTIONS } from '../src/lib/firebase-admin';

async function addTestUserToWhitelist() {
  const testUserEmail = process.env.TEST_USER_EMAIL || 'test@example.com';

  try {
    console.log('[Add Test User] Adding to whitelist:', testUserEmail);

    // Add to whitelist collection
    await db.collection(COLLECTIONS.WHITELIST).doc(testUserEmail).set({
      email: testUserEmail,
      added_at: new Date(),
      added_by: 'automated-setup',
      is_test_user: true,
    });

    console.log('[Add Test User] ✅ Successfully added to whitelist');
    process.exit(0);
  } catch (error) {
    console.error('[Add Test User] ❌ Error:', error);
    process.exit(1);
  }
}

addTestUserToWhitelist();
