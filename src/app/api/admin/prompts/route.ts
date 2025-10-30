import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getAllPrompts,
  savePrompt,
  deletePrompt,
  DEFAULT_PROMPTS,
} from "@/lib/prompts";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/prompts - Get all prompts
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prompts = await getAllPrompts();

    return NextResponse.json({
      prompts,
      defaultTemplates: DEFAULT_PROMPTS,
    });
  } catch (error) {
    console.error("Error fetching prompts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/prompts - Create or update prompt
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { prompt } = body;

    if (!prompt || !prompt.id || !prompt.name || !prompt.systemPrompt) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await savePrompt(prompt);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving prompt:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/prompts - Delete prompt
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const promptId = searchParams.get("id");

    if (!promptId) {
      return NextResponse.json(
        { error: "Prompt ID required" },
        { status: 400 }
      );
    }

    await deletePrompt(promptId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting prompt:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
