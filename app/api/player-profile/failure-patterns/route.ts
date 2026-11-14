import { getDb } from "@/db";
import {
  handleGetFailurePatterns,
  handlePostFailurePattern,
} from "@/lib/player-profile/service";

export async function GET(request: Request) {
  return handleGetFailurePatterns(request, getDb());
}

export async function POST(request: Request) {
  return handlePostFailurePattern(request, getDb());
}
