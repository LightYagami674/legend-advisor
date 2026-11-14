import { getDb } from "@/db";
import {
  handleCreateDraftSession,
  handleGetActiveDraftSession,
} from "@/lib/draft-session/handlers";

export async function GET(request: Request) {
  return handleGetActiveDraftSession(request, getDb());
}

export async function POST(request: Request) {
  return handleCreateDraftSession(request, getDb());
}
