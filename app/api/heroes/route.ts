import { getDb } from "@/db";
import { handleListHeroes } from "@/lib/draft-session/handlers";

export async function GET(request: Request) {
  return handleListHeroes(request, getDb());
}
