import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, COLLECTIONS } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

// GET - List all whitelisted emails
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.isAdmin) {
      return new Response("Unauthorized", { status: 401 });
    }

    const whitelistSnapshot = await db
      .collection(COLLECTIONS.WHITELIST)
      .orderBy("added_at", "desc")
      .get();

    const whitelist = whitelistSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        email: doc.id,
        added_by: data.added_by,
        added_at: data.added_at.toDate().toISOString(),
        notes: data.notes || "",
      };
    });

    return Response.json(whitelist);
  } catch (error) {
    console.error("Error fetching whitelist:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// POST - Add email to whitelist
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.isAdmin) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { email, notes } = await req.json();

    if (!email || !email.includes("@")) {
      return new Response("Invalid email", { status: 400 });
    }

    // Check if already whitelisted
    const existingDoc = await db
      .collection(COLLECTIONS.WHITELIST)
      .doc(email)
      .get();

    if (existingDoc.exists) {
      return new Response("Email already whitelisted", { status: 409 });
    }

    await db
      .collection(COLLECTIONS.WHITELIST)
      .doc(email)
      .set({
        added_by: session.user.id,
        added_at: new Date(),
        notes: notes || "",
      });

    return Response.json({ message: "Email added to whitelist" });
  } catch (error) {
    console.error("Error adding to whitelist:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// DELETE - Remove email from whitelist
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.isAdmin) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { email } = await req.json();

    if (!email) {
      return new Response("Email required", { status: 400 });
    }

    // Don't allow removing admin email
    if (email === process.env.ADMIN_EMAIL) {
      return new Response("Cannot remove admin email", { status: 403 });
    }

    await db.collection(COLLECTIONS.WHITELIST).doc(email).delete();

    return Response.json({ message: "Email removed from whitelist" });
  } catch (error) {
    console.error("Error removing from whitelist:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
