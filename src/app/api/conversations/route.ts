import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { MODEL_NAME } from "@/lib/gemini";
import { NextRequest } from "next/server";

// GET - List user's conversations
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Check for whimId filter
    const { searchParams } = new URL(req.url);
    const whimId = searchParams.get('whimId');

    let query = db
      .collection(COLLECTIONS.CONVERSATIONS)
      .where("user_id", "==", session.user.id);

    if (whimId) {
      // Filter by whimId for whim-specific conversations
      query = query.where("whimId", "==", whimId);
    } else {
      // For regular chat, exclude whim conversations
      // Note: This requires a composite index or we filter client-side
      // For now, we'll filter in memory
    }

    const conversationsSnapshot = await query
      .orderBy("updated_at", "desc")
      .get();

    let conversations = conversationsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        user_id: data.user_id,
        title: data.title,
        model: data.model,
        created_at: data.created_at.toDate().toISOString(),
        updated_at: data.updated_at.toDate().toISOString(),
        type: data.type || 'chat',
        whimId: data.whimId,
        whimContext: data.whimContext,
      };
    });

    // If no whimId filter, exclude whim conversations from regular chat list
    if (!whimId) {
      conversations = conversations.filter(c => c.type !== 'whim');
    }

    return Response.json({ conversations });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// POST - Create new conversation
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { title, type, whimId, whimContext } = await req.json();

    // Build conversation data
    const conversationData: Record<string, unknown> = {
      user_id: session.user.id,
      title: title || (type === 'whim' ? "Whim Assistant" : "New Conversation"),
      model: MODEL_NAME,
      created_at: new Date(),
      updated_at: new Date(),
      type: type || 'chat',
    };

    // Add whim-specific fields if provided
    if (whimId) {
      conversationData.whimId = whimId;
    }
    if (whimContext) {
      conversationData.whimContext = whimContext;
    }

    const conversationRef = await db.collection(COLLECTIONS.CONVERSATIONS).add(conversationData);

    return Response.json({
      id: conversationRef.id,
      message: "Conversation created successfully",
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
