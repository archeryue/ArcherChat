import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { getUserMemory, clearUserMemory } from "@/lib/memory";

export const dynamic = 'force-dynamic';

// GET /api/memory - Get user's memory
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const memory = await getUserMemory(session.user.id);

    // Convert to client-safe format
    const clientMemory = {
      user_id: memory.user_id,
      facts: memory.facts.map((fact) => ({
        ...fact,
        created_at: fact.created_at.toISOString(),
        last_used_at: fact.last_used_at.toISOString(),
        expires_at: fact.expires_at?.toISOString() || null,
      })),
      stats: {
        ...memory.stats,
        last_cleanup: memory.stats.last_cleanup.toISOString(),
      },
      updated_at: memory.updated_at.toISOString(),
    };

    return Response.json(clientMemory);
  } catch (error) {
    console.error("Error fetching memory:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

// DELETE /api/memory - Clear all memory
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    await clearUserMemory(session.user.id);

    return Response.json({ message: "Memory cleared successfully" });
  } catch (error) {
    console.error("Error clearing memory:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
