/**
 * Verification script to check whim migration status
 *
 * This script:
 * 1. Checks how many whims have blocks field
 * 2. Checks how many whims only have content field
 * 3. Reports any inconsistencies
 *
 * Usage:
 *   npx tsx scripts/verify-whim-migration.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { db } from '../src/lib/firebase-admin';

async function verifyMigration() {
  console.log('🔍 Verifying whim migration status...\n');

  try {
    // Fetch all whims
    const whimsSnapshot = await db.collection('whims').get();
    const totalWhims = whimsSnapshot.size;

    let withBlocks = 0;
    let withContentOnly = 0;
    let withBoth = 0;
    let withNeither = 0;
    const problematicWhims: string[] = [];

    // Check each whim
    for (const doc of whimsSnapshot.docs) {
      const whimId = doc.id;
      const data = doc.data();

      const hasBlocks = !!data.blocks;
      const hasContent = !!data.content;

      if (hasBlocks && hasContent) {
        withBoth++;
      } else if (hasBlocks && !hasContent) {
        withBlocks++;
      } else if (!hasBlocks && hasContent) {
        withContentOnly++;
        problematicWhims.push(`${whimId} - "${data.title}"`);
      } else {
        withNeither++;
        problematicWhims.push(`${whimId} - "${data.title}" (NO DATA!)`);
      }
    }

    // Report results
    console.log('='.repeat(60));
    console.log('📊 Migration Verification Results:');
    console.log('='.repeat(60));
    console.log(`Total whims:                    ${totalWhims}`);
    console.log(`✅ With blocks + content:        ${withBoth} (migrated, safe)`);
    console.log(`✅ With blocks only:             ${withBlocks} (new whims)`);
    console.log(`⚠️  With content only:           ${withContentOnly} (NOT MIGRATED)`);
    console.log(`❌ With neither:                 ${withNeither} (BROKEN!)`);
    console.log('='.repeat(60));

    // Show problematic whims
    if (problematicWhims.length > 0) {
      console.log('\n⚠️  Whims that need attention:');
      console.log('-'.repeat(60));
      problematicWhims.forEach(whim => console.log(`  - ${whim}`));
      console.log('-'.repeat(60));
    }

    // Final verdict
    console.log('\n📋 Verdict:');
    if (withContentOnly === 0 && withNeither === 0) {
      console.log('✨ All whims successfully migrated! Ready to deploy.');
    } else if (withContentOnly > 0) {
      console.log(`⚠️  ${withContentOnly} whim(s) still need migration. Run migration script again.`);
    } else if (withNeither > 0) {
      console.log(`❌ ${withNeither} whim(s) have no data! Manual investigation needed.`);
    }

  } catch (error) {
    console.error('💥 Error during verification:', error);
    process.exit(1);
  }
}

// Run the verification
verifyMigration()
  .then(() => {
    console.log('\n👋 Verification complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
