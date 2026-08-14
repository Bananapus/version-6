import { statusHandler } from "@/server/dev-messaging/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = statusHandler;
