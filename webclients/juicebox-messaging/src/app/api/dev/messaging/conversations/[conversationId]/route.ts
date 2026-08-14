import { conversationHandler } from "@/server/dev-messaging/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const { conversationId } = await context.params;
  return conversationHandler(request, conversationId);
}
