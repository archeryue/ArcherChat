import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resetToDefaultPrompts } from "@/lib/prompts";
import { NextResponse } from "next/server";

// PUT /api/admin/prompts/reset - Reset to default prompts
export async function PUT() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await resetToDefaultPrompts();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error resetting prompts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
