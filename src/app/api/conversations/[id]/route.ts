import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

// GET - Get conversation with messages
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const conversationRef = db.collection(COLLECTIONS.CONVERSATIONS).doc(params.id);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return new Response("Conversation not found", { status: 404 });
    }

    const conversationData = conversationDoc.data();

    if (conversationData?.user_id !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    // Get messages
    const messagesSnapshot = await conversationRef
      .collection(COLLECTIONS.MESSAGES)
      .orderBy("created_at", "asc")
      .get();

    const messages = messagesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        role: data.role,
        content: data.content,
        created_at: data.created_at.toDate().toISOString(),
      };
    });

    return Response.json({
      id: conversationDoc.id,
      user_id: conversationData.user_id,
      title: conversationData.title,
      model: conversationData.model,
      created_at: conversationData.created_at.toDate().toISOString(),
      updated_at: conversationData.updated_at.toDate().toISOString(),
      messages,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// DELETE - Delete conversation
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const conversationRef = db.collection(COLLECTIONS.CONVERSATIONS).doc(params.id);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return new Response("Conversation not found", { status: 404 });
    }

    const conversationData = conversationDoc.data();

    if (conversationData?.user_id !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    // Delete all messages in the conversation
    const messagesSnapshot = await conversationRef
      .collection(COLLECTIONS.MESSAGES)
      .get();

    const batch = db.batch();
    messagesSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Delete the conversation
    await conversationRef.delete();

    return Response.json({ message: "Conversation deleted successfully" });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
