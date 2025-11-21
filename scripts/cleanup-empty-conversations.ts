/**
 * Cleanup script to delete empty conversations (conversations with no messages)
 *
 * Run with: npx tsx scripts/cleanup-empty-conversations.ts
 */

import { db, COLLECTIONS } from '../src/lib/firebase-admin';

async function cleanupEmptyConversations() {
  console.log('🧹 Starting cleanup of empty conversations...\n');

  try {
    // Get all conversations
    const conversationsSnapshot = await db.collection(COLLECTIONS.CONVERSATIONS).get();

    console.log(`📊 Found ${conversationsSnapshot.size} total conversations\n`);

    let deletedCount = 0;
    let keptCount = 0;

    // Check each conversation for messages
    for (const conversationDoc of conversationsSnapshot.docs) {
      const conversationId = conversationDoc.id;
      const conversationData = conversationDoc.data();

      // Check if this conversation has any messages
      const messagesSnapshot = await conversationDoc.ref
        .collection(COLLECTIONS.MESSAGES)
        .limit(1)
        .get();

      if (messagesSnapshot.empty) {
        // No messages - delete this conversation
        console.log(`🗑️  Deleting empty conversation: ${conversationId}`);
        console.log(`   - Type: ${conversationData.type || 'chat'}`);
        console.log(`   - Title: ${conversationData.title || 'Untitled'}`);
        console.log(`   - Created: ${conversationData.created_at?.toDate?.().toLocaleString() || 'Unknown'}`);

        await conversationDoc.ref.delete();
        deletedCount++;
      } else {
        // Has messages - keep it
        keptCount++;
      }
    }

    console.log('\n✅ Cleanup complete!');
    console.log(`   - Deleted: ${deletedCount} empty conversations`);
    console.log(`   - Kept: ${keptCount} conversations with messages`);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupEmptyConversations()
  .then(() => {
    console.log('\n✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
