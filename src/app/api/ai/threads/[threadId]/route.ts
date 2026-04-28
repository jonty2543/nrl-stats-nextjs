import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deleteAiThreadForUser } from "@/lib/ai/persistence";

export const dynamic = "force-dynamic";

interface AiThreadRouteContext {
  params: Promise<{
    threadId?: string;
  }>;
}

export async function DELETE(_request: Request, { params }: AiThreadRouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to delete chats." }, { status: 401 });
  }

  const { threadId } = await params;
  const trimmedThreadId = typeof threadId === "string" ? threadId.trim() : "";
  if (!trimmedThreadId) {
    return NextResponse.json({ error: "Missing thread id." }, { status: 400 });
  }

  const deleted = await deleteAiThreadForUser(userId, trimmedThreadId);
  if (!deleted) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
