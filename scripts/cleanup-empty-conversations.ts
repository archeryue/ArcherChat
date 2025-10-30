/**
 * Script to delete all empty conversations (conversations with no messages)
 * Run with: npx ts-node scripts/cleanup-empty-conversations.ts
 */

import { db, COLLECTIONS } from "../src/lib/firebase-admin";

async function deleteEmptyConversations() {
  console.log("Starting cleanup of empty conversations...");

  try {
    // Get all conversations
    const conversationsSnapshot = await db
      .collection(COLLECTIONS.CONVERSATIONS)
      .get();

    console.log(`Found ${conversationsSnapshot.size} total conversations`);

    let deletedCount = 0;

    // Check each conversation for messages
    for (const conversationDoc of conversationsSnapshot.docs) {
      const conversationId = conversationDoc.id;
      const conversationData = conversationDoc.data();

      // Check if conversation has any messages
      const messagesSnapshot = await db
        .collection(COLLECTIONS.CONVERSATIONS)
        .doc(conversationId)
        .collection(COLLECTIONS.MESSAGES)
        .limit(1)
        .get();

      if (messagesSnapshot.empty) {
        // No messages found, delete this conversation
        console.log(
          `Deleting empty conversation: ${conversationId} (${conversationData.title})`
        );

        // Delete the conversation
        await db.collection(COLLECTIONS.CONVERSATIONS).doc(conversationId).delete();
        deletedCount++;
      }
    }

    console.log(`\nCleanup complete!`);
    console.log(`Total conversations: ${conversationsSnapshot.size}`);
    console.log(`Deleted empty conversations: ${deletedCount}`);
    console.log(`Remaining conversations: ${conversationsSnapshot.size - deletedCount}`);
  } catch (error) {
    console.error("Error during cleanup:", error);
    process.exit(1);
  }

  process.exit(0);
}

deleteEmptyConversations();
