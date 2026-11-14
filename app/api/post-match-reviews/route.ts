import { getDb } from "@/db";
import {
  handleGetPostMatchReviews,
  handlePostPostMatchReview,
} from "@/lib/post-match-review/service";

export async function GET(request: Request) {
  return handleGetPostMatchReviews(request, getDb());
}

export async function POST(request: Request) {
  return handlePostPostMatchReview(request, getDb());
}
