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

    const userStats = await Promise.all(
      usersSnapshot.docs.map(async (userDoc) => {
        const userData = userDoc.data();

        // Count messages for this user
        const conversationsSnapshot = await db
          .collection(COLLECTIONS.CONVERSATIONS)
          .where("user_id", "==", userDoc.id)
          .get();

        let totalMessages = 0;

        for (const convDoc of conversationsSnapshot.docs) {
          const messagesSnapshot = await convDoc.ref
            .collection(COLLECTIONS.MESSAGES)
            .where("role", "==", "user")
            .get();
          totalMessages += messagesSnapshot.size;
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
