import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

/**
 * DELETE - Cleanup empty conversations (admin only)
 *
 * Deletes all conversations that have no messages
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    console.log('🧹 Starting cleanup of empty conversations...');

    // Get all conversations for this user
    const conversationsSnapshot = await db
      .collection(COLLECTIONS.CONVERSATIONS)
      .where('user_id', '==', session.user.id)
      .get();

    console.log(`📊 Found ${conversationsSnapshot.size} total conversations for user`);

    let deletedCount = 0;
    let keptCount = 0;
    const deletedConversations: any[] = [];

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

        deletedConversations.push({
          id: conversationId,
          type: conversationData.type || 'chat',
          title: conversationData.title || 'Untitled',
          created_at: conversationData.created_at?.toDate?.().toISOString() || 'Unknown',
        });

        await conversationDoc.ref.delete();
        deletedCount++;
      } else {
        // Has messages - keep it
        keptCount++;
      }
    }

    console.log('✅ Cleanup complete!');
    console.log(`   - Deleted: ${deletedCount} empty conversations`);
    console.log(`   - Kept: ${keptCount} conversations with messages`);

    return Response.json({
      success: true,
      deletedCount,
      keptCount,
      deletedConversations,
    });
  } catch (error) {
    console.error("Error during cleanup:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
