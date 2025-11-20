/**
 * One-time migration script to convert all existing whims from markdown to JSON blocks
 *
 * This script:
 * 1. Fetches all whims that have 'content' but no 'blocks' field
 * 2. Converts markdown content to TipTap JSON blocks
 * 3. Updates each whim to add 'blocks' field (keeps 'content' for rollback safety)
 *
 * Usage:
 *   npx tsx scripts/migrate-whims-to-blocks.ts
 *
 * Safety:
 * - Preserves original 'content' field (no data loss)
 * - Logs all operations
 * - Can be run multiple times (idempotent)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { db } from '../src/lib/firebase-admin';
import { conversationToBlocks } from '../src/lib/whim/converter';
import { marked } from 'marked';
import { generateJSON } from '@tiptap/html/server';
import StarterKit from '@tiptap/starter-kit';

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Convert markdown content to TipTap JSON blocks
 */
function markdownToBlocks(markdown: string) {
  // Convert markdown to HTML
  const html = marked.parse(markdown) as string;

  // Parse HTML to TipTap JSON using StarterKit extensions
  const json = generateJSON(html, [StarterKit]);

  return json;
}

async function migrateWhims() {
  console.log('🚀 Starting whim migration to JSON blocks...\n');

  try {
    // Fetch all whims
    const whimsSnapshot = await db.collection('whims').get();

    const totalWhims = whimsSnapshot.size;
    console.log(`📊 Found ${totalWhims} total whims\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each whim
    for (const doc of whimsSnapshot.docs) {
      const whimId = doc.id;
      const data = doc.data();

      // Skip if already has blocks field
      if (data.blocks) {
        console.log(`⏭️  Skipping ${whimId} - already has blocks`);
        skippedCount++;
        continue;
      }

      // Skip if no content field
      if (!data.content) {
        console.log(`⚠️  Skipping ${whimId} - no content field`);
        skippedCount++;
        continue;
      }

      try {
        console.log(`🔄 Migrating ${whimId} (${data.title})...`);

        // Convert markdown to JSON blocks
        const blocks = markdownToBlocks(data.content);

        // Update the whim with blocks field (keep content)
        await db.collection('whims').doc(whimId).update({
          blocks,
          // Note: We're NOT removing the content field for safety
        });

        console.log(`✅ Migrated ${whimId}`);
        migratedCount++;
      } catch (error) {
        console.error(`❌ Error migrating ${whimId}:`, error);
        errorCount++;
      }

      // Add a small delay to avoid overwhelming Firestore
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`Total whims:     ${totalWhims}`);
    console.log(`✅ Migrated:      ${migratedCount}`);
    console.log(`⏭️  Skipped:       ${skippedCount}`);
    console.log(`❌ Errors:        ${errorCount}`);
    console.log('='.repeat(60));

    if (errorCount === 0) {
      console.log('\n✨ Migration completed successfully!');
    } else {
      console.log(`\n⚠️  Migration completed with ${errorCount} errors. Please review the logs above.`);
    }

  } catch (error) {
    console.error('💥 Fatal error during migration:', error);
    process.exit(1);
  }
}

// Run the migration
migrateWhims()
  .then(() => {
    console.log('\n👋 Migration script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
