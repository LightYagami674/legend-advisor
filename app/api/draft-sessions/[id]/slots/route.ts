import { getDb } from "@/db";
import { handlePatchDraftSlots } from "@/lib/draft-session/handlers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handlePatchDraftSlots(request, id, getDb());
}
