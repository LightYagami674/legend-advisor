import { getDb } from "@/db";
import { handleGetPostMatchReviews } from "@/lib/post-match-review/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handleGetPostMatchReviews(request, getDb(), id);
}
