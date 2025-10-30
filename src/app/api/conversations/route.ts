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

    const conversationsSnapshot = await db
      .collection(COLLECTIONS.CONVERSATIONS)
      .where("user_id", "==", session.user.id)
      .orderBy("updated_at", "desc")
      .get();

    const conversations = conversationsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        user_id: data.user_id,
        title: data.title,
        model: data.model,
        created_at: data.created_at.toDate().toISOString(),
        updated_at: data.updated_at.toDate().toISOString(),
      };
    });

    return Response.json(conversations);
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

    const { title } = await req.json();

    const conversationRef = await db.collection(COLLECTIONS.CONVERSATIONS).add({
      user_id: session.user.id,
      title: title || "New Conversation",
      model: MODEL_NAME,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return Response.json({
      id: conversationRef.id,
      message: "Conversation created successfully",
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
