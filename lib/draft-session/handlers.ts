import type { AppDatabase } from "@/db";
import {
  CreateDraftSessionInputSchema,
  LaneSchema,
  PatchDraftSessionInputSchema,
  PatchDraftSlotsInputSchema,
} from "./schema";
import {
  createDraftSession,
  getDraftSessionById,
  getLatestDraftSession,
  listHeroes,
  updateDraftSession,
  updateDraftSlots,
} from "./service";

function jsonResponse(data: unknown, status: number = 200): Response {
  return Response.json(data, { status });
}

function parseSessionId(rawId: string): number | null {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/**
 * Handles GET /api/draft-sessions — returns the latest Draft Session (creating one if ?ensure=true).
 */
export async function handleGetActiveDraftSession(
  request: Request,
  db: AppDatabase,
): Promise<Response> {
  const url = new URL(request.url);
  const ensure = url.searchParams.get("ensure") === "true";

  let result = getLatestDraftSession(db);
  if (!result && ensure) {
    result = createDraftSession(db);
  }

  if (!result) {
    return jsonResponse({ session: null, slots: [] }, 200);
  }

  return jsonResponse(result, 200);
}

/**
 * Handles POST /api/draft-sessions — creates a new Draft Session with 10 Draft Slots.
 */
export async function handleCreateDraftSession(
  request: Request,
  db: AppDatabase,
): Promise<Response> {
  let rawBody: unknown = {};
  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      rawBody = JSON.parse(text);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
  }

  const parsed = CreateDraftSessionInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid request payload", details: parsed.error.flatten() },
      400,
    );
  }

  const created = createDraftSession(db, parsed.data);
  return jsonResponse(created, 201);
}

/**
 * Handles GET /api/draft-sessions/[id] — fetches a Draft Session and its 10 Draft Slots.
 */
export async function handleGetDraftSession(
  _request: Request,
  rawId: string,
  db: AppDatabase,
): Promise<Response> {
  const sessionId = parseSessionId(rawId);
  if (sessionId === null) {
    return jsonResponse({ error: "Invalid session id" }, 400);
  }

  const found = getDraftSessionById(db, sessionId);
  if (!found) {
    return jsonResponse({ error: "Draft session not found" }, 404);
  }

  return jsonResponse(found, 200);
}

/**
 * Handles PATCH /api/draft-sessions/[id]/slots — updates one or more Draft Slots.
 */
export async function handlePatchDraftSlots(
  request: Request,
  rawId: string,
  db: AppDatabase,
): Promise<Response> {
  const sessionId = parseSessionId(rawId);
  if (sessionId === null) {
    return jsonResponse({ error: "Invalid session id" }, 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const parsed = PatchDraftSlotsInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid slot update payload", details: parsed.error.flatten() },
      400,
    );
  }

  const updates =
    "updates" in parsed.data ? parsed.data.updates : [parsed.data];

  const result = updateDraftSlots(db, sessionId, updates);
  if (!result.ok) {
    const statusMap = {
      not_found: 404,
      bad_request: 400,
      conflict: 409,
    } as const;
    return jsonResponse({ error: result.message }, statusMap[result.code]);
  }

  return jsonResponse(result.data, 200);
}

/**
 * Handles PATCH /api/draft-sessions/[id] — updates Draft Session fields or locks all picks.
 */
export async function handlePatchDraftSession(
  request: Request,
  rawId: string,
  db: AppDatabase,
): Promise<Response> {
  const sessionId = parseSessionId(rawId);
  if (sessionId === null) {
    return jsonResponse({ error: "Invalid session id" }, 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const parsed = PatchDraftSessionInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid session update payload", details: parsed.error.flatten() },
      400,
    );
  }

  const updated = updateDraftSession(db, sessionId, parsed.data);
  if (!updated) {
    return jsonResponse({ error: "Draft session not found" }, 404);
  }

  return jsonResponse(updated, 200);
}

/**
 * Handles GET /api/heroes — returns the Patch KB hero catalog with optional ?q= and ?lane= filters.
 */
export async function handleListHeroes(
  request: Request,
  db: AppDatabase,
): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const rawLane = url.searchParams.get("lane");

  let lane: ReturnType<typeof LaneSchema.parse> | undefined;
  if (rawLane) {
    const parsedLane = LaneSchema.safeParse(rawLane);
    if (!parsedLane.success) {
      return jsonResponse({ error: "Invalid lane filter" }, 400);
    }
    lane = parsedLane.data;
  }

  return jsonResponse(listHeroes(db, { q, lane }), 200);
}
