import { getDb } from "@/db";
import {
  handleGetComfortPool,
  handleUpsertHeroComfort,
} from "@/lib/player-profile/service";

export async function GET() {
  return handleGetComfortPool(getDb());
}

export async function POST(request: Request) {
  return handleUpsertHeroComfort(request, getDb());
}

export async function PUT(request: Request) {
  return handleUpsertHeroComfort(request, getDb());
}
