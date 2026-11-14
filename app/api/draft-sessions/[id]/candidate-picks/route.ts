import { getDb } from "@/db";
import { handleGenerateCandidatePicks } from "@/lib/recommendations/candidate-pick";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handleGenerateCandidatePicks(request, id, getDb());
}
