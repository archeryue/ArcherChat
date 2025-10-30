import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

// POST /api/admin/cleanup-conversations - Delete all empty conversations
export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Starting cleanup of empty conversations...");

    // Get all conversations
    const conversationsSnapshot = await db
      .collection(COLLECTIONS.CONVERSATIONS)
      .get();

    console.log(`Found ${conversationsSnapshot.size} total conversations`);

    let deletedCount = 0;
    const deletedConversations = [];

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

        deletedConversations.push({
          id: conversationId,
          title: conversationData.title,
          user_id: conversationData.user_id,
        });

        // Delete the conversation
        await db
          .collection(COLLECTIONS.CONVERSATIONS)
          .doc(conversationId)
          .delete();
        deletedCount++;
      }
    }

    console.log(`\nCleanup complete!`);
    console.log(`Total conversations: ${conversationsSnapshot.size}`);
    console.log(`Deleted empty conversations: ${deletedCount}`);
    console.log(
      `Remaining conversations: ${conversationsSnapshot.size - deletedCount}`
    );

    return NextResponse.json({
      success: true,
      totalConversations: conversationsSnapshot.size,
      deletedCount,
      remainingCount: conversationsSnapshot.size - deletedCount,
      deletedConversations,
    });
  } catch (error: any) {
    console.error("Error cleaning up conversations:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
