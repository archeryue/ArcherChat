import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

export const dynamic = 'force-dynamic';

// GET - List all users with stats
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.isAdmin) {
      return new Response("Unauthorized", { status: 401 });
    }

    const usersSnapshot = await db
      .collection(COLLECTIONS.USERS)
      .orderBy("last_login", "desc")
      .get();

    // Get all conversations in one query
    const allConversationsSnapshot = await db
      .collection(COLLECTIONS.CONVERSATIONS)
      .get();

    // Group conversations by user_id
    const conversationsByUser = new Map<string, string[]>();
    for (const convDoc of allConversationsSnapshot.docs) {
      const userId = convDoc.data().user_id;
      if (!conversationsByUser.has(userId)) {
        conversationsByUser.set(userId, []);
      }
      conversationsByUser.get(userId)!.push(convDoc.id);
    }

    // Count messages for each user using aggregation queries in parallel
    const userStats = await Promise.all(
      usersSnapshot.docs.map(async (userDoc) => {
        const userData = userDoc.data();
        const userConvIds = conversationsByUser.get(userDoc.id) || [];

        let totalMessages = 0;

        // Use Promise.all to count messages in parallel (batched)
        if (userConvIds.length > 0) {
          const messageCounts = await Promise.all(
            userConvIds.map(async (convId) => {
              const countSnapshot = await db
                .collection(COLLECTIONS.CONVERSATIONS)
                .doc(convId)
                .collection(COLLECTIONS.MESSAGES)
                .where("role", "==", "user")
                .count()
                .get();
              return countSnapshot.data().count;
            })
          );
          totalMessages = messageCounts.reduce((sum, count) => sum + count, 0);
        }

        return {
          email: userData.email,
          name: userData.name,
          message_count: totalMessages,
          last_active: userData.last_login.toDate().toISOString(),
        };
      })
    );

    return Response.json(userStats);
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
