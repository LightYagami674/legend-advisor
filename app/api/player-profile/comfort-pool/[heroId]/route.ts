import { getDb } from "@/db";
import {
  handleDeleteHeroComfort,
  handlePatchHeroComfort,
} from "@/lib/player-profile/service";

interface RouteContext {
  params: Promise<{ heroId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { heroId } = await context.params;
  return handlePatchHeroComfort(request, heroId, getDb());
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { heroId } = await context.params;
  return handleDeleteHeroComfort(heroId, getDb());
}
