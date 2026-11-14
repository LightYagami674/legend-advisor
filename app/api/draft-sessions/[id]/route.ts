import { getDb } from "@/db";
import {
  handleGetDraftSession,
  handlePatchDraftSession,
} from "@/lib/draft-session/handlers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handleGetDraftSession(request, id, getDb());
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handlePatchDraftSession(request, id, getDb());
}
