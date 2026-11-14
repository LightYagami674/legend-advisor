import { getDb } from "@/db";
import {
  handleGetPlayerProfile,
  handlePutPlayerProfile,
} from "@/lib/player-profile/service";

export async function GET() {
  return handleGetPlayerProfile(getDb());
}

export async function PUT(request: Request) {
  return handlePutPlayerProfile(request, getDb());
}

export async function PATCH(request: Request) {
  return handlePutPlayerProfile(request, getDb());
}
