import { getDb } from "@/db";
import {
  handleGetBuildRecommendation,
  handlePostBuildRecommendation,
} from "@/lib/recommendations/build-recommendation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handleGetBuildRecommendation(request, id, getDb());
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handlePostBuildRecommendation(request, id, getDb());
}
