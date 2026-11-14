import { getDb } from "@/db";
import {
  handleDeleteFailurePattern,
  handlePatchFailurePattern,
} from "@/lib/player-profile/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handlePatchFailurePattern(request, id, getDb());
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handleDeleteFailurePattern(id, getDb());
}
