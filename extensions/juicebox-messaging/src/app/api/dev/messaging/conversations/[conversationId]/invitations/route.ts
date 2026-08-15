import { invitationsHandler } from "@/server/dev-messaging/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const { conversationId } = await context.params;
  return invitationsHandler(request, conversationId);
}
