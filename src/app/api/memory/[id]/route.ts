import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { deleteMemoryFact } from "@/lib/memory";

export const dynamic = 'force-dynamic';

// DELETE /api/memory/[id] - Delete specific fact
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    await deleteMemoryFact(session.user.id, params.id);

    return Response.json({ message: "Memory fact deleted successfully" });
  } catch (error) {
    console.error("Error deleting memory fact:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
