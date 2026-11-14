import { getDb } from "@/db";
import {
  handleGetPostMatchReview,
  handlePatchPostMatchReview,
} from "@/lib/post-match-review/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handleGetPostMatchReview(id, getDb());
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handlePatchPostMatchReview(request, id, getDb());
}
