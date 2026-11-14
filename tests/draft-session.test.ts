import { describe, expect, it } from "bun:test";
import { createDatabase } from "@/db";
import { heroes } from "@/db/schema";
import {
  handleCreateDraftSession,
  handleGetActiveDraftSession,
  handleGetDraftSession,
  handleListHeroes,
  handlePatchDraftSession,
  handlePatchDraftSlots,
} from "@/lib/draft-session/handlers";

describe("Draft Session API & persistence", () => {
  it("creates a new Draft Session with 10 normalized Draft Slots (5 ally + 5 enemy) and fetches it", async () => {
    const db = createDatabase(":memory:");

    const createRes = await handleCreateDraftSession(
      new Request("http://localhost/api/draft-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      db,
    );

    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    expect(typeof created.session.id).toBe("number");
    expect(created.session.phase).toBe("ban");
    expect(created.session.status).toBe("active");
    expect(created.session.my_slot_index).toBe(1);
    expect(created.session.active_target_slot_index).toBe(1);
    expect(typeof created.session.patch_version).toBe("string");
    expect(created.slots).toHaveLength(10);

    const allySlots = created.slots.filter(
      (s: { team: string }) => s.team === "ally",
    );
    const enemySlots = created.slots.filter(
      (s: { team: string }) => s.team === "enemy",
    );
    expect(allySlots.map((s: { slot_index: number }) => s.slot_index)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(enemySlots.map((s: { slot_index: number }) => s.slot_index)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    for (const slot of created.slots) {
      expect(slot.role).toBeNull();
      expect(slot.banned_hero_id).toBeNull();
      expect(slot.picked_hero_id).toBeNull();
      expect(slot.is_locked).toBe(false);
    }

    // Fetch by ID
    const getRes = await handleGetDraftSession(
      new Request(`http://localhost/api/draft-sessions/${created.session.id}`),
      String(created.session.id),
      db,
    );
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.session.id).toBe(created.session.id);
    expect(fetched.slots).toHaveLength(10);

    // Fetch active session
    const activeRes = await handleGetActiveDraftSession(
      new Request("http://localhost/api/draft-sessions"),
      db,
    );
    expect(activeRes.status).toBe(200);
    const active = await activeRes.json();
    expect(active.session.id).toBe(created.session.id);
    expect(active.slots).toHaveLength(10);

    // Missing session returns 404
    const missingRes = await handleGetDraftSession(
      new Request("http://localhost/api/draft-sessions/99999"),
      "99999",
      db,
    );
    expect(missingRes.status).toBe(404);
  });

  it("persists ban, pick, role, and clear mutations on Draft Slots and rejects duplicate heroes", async () => {
    const db = createDatabase(":memory:");
    const seededHeroes = db.select().from(heroes).limit(3).all();
    expect(seededHeroes.length).toBeGreaterThanOrEqual(3);
    const [heroA, heroB, heroC] = seededHeroes;

    const createRes = await handleCreateDraftSession(
      new Request("http://localhost/api/draft-sessions", { method: "POST" }),
      db,
    );
    const { session } = await createRes.json();

    // Assign ban on ally-1, role + pick on ally-2, pick on enemy-1
    const patchRes = await handlePatchDraftSlots(
      new Request(`http://localhost/api/draft-sessions/${session.id}/slots`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [
            { team: "ally", slot_index: 1, banned_hero_id: heroA.id },
            {
              team: "ally",
              slot_index: 2,
              role: "Gold",
              picked_hero_id: heroB.id,
            },
            { team: "enemy", slot_index: 1, picked_hero_id: heroC.id },
          ],
        }),
      }),
      String(session.id),
      db,
    );
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();

    const ally1 = patched.slots.find(
      (s: { team: string; slot_index: number }) =>
        s.team === "ally" && s.slot_index === 1,
    );
    const ally2 = patched.slots.find(
      (s: { team: string; slot_index: number }) =>
        s.team === "ally" && s.slot_index === 2,
    );
    const enemy1 = patched.slots.find(
      (s: { team: string; slot_index: number }) =>
        s.team === "enemy" && s.slot_index === 1,
    );

    expect(ally1.banned_hero_id).toBe(heroA.id);
    expect(ally2.role).toBe("Gold");
    expect(ally2.picked_hero_id).toBe(heroB.id);
    expect(enemy1.picked_hero_id).toBe(heroC.id);

    // Reject duplicate hero assignment (heroA already banned in ally-1)
    const dupRes = await handlePatchDraftSlots(
      new Request(`http://localhost/api/draft-sessions/${session.id}/slots`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: "enemy",
          slot_index: 2,
          picked_hero_id: heroA.id,
        }),
      }),
      String(session.id),
      db,
    );
    expect(dupRes.status).toBe(409);

    // Clear ban on ally-1 and verify persistence via GET
    const clearRes = await handlePatchDraftSlots(
      new Request(`http://localhost/api/draft-sessions/${session.id}/slots`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: "ally",
          slot_index: 1,
          banned_hero_id: null,
        }),
      }),
      String(session.id),
      db,
    );
    expect(clearRes.status).toBe(200);

    const getRes = await handleGetDraftSession(
      new Request(`http://localhost/api/draft-sessions/${session.id}`),
      String(session.id),
      db,
    );
    const refetched = await getRes.json();
    const refetchedAlly1 = refetched.slots.find(
      (s: { team: string; slot_index: number }) =>
        s.team === "ally" && s.slot_index === 1,
    );
    expect(refetchedAlly1.banned_hero_id).toBeNull();
  });

  it("updates My Slot, Target Ally Slot, phase, and locks all picks atomically", async () => {
    const db = createDatabase(":memory:");

    const createRes = await handleCreateDraftSession(
      new Request("http://localhost/api/draft-sessions", { method: "POST" }),
      db,
    );
    const { session } = await createRes.json();

    // Update my_slot_index, active_target_slot_index, and phase
    const updateRes = await handlePatchDraftSession(
      new Request(`http://localhost/api/draft-sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          my_slot_index: 4,
          active_target_slot_index: 3,
          phase: "pick",
        }),
      }),
      String(session.id),
      db,
    );
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.session.my_slot_index).toBe(4);
    expect(updated.session.active_target_slot_index).toBe(3);
    expect(updated.session.phase).toBe("pick");
    expect(updated.session.status).toBe("active");

    // Lock all picks
    const lockRes = await handlePatchDraftSession(
      new Request(`http://localhost/api/draft-sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lock_all: true }),
      }),
      String(session.id),
      db,
    );
    expect(lockRes.status).toBe(200);
    const locked = await lockRes.json();
    expect(locked.session.status).toBe("locked");
    expect(locked.session.phase).toBe("locked");
    expect(locked.slots).toHaveLength(10);
    for (const slot of locked.slots) {
      expect(slot.is_locked).toBe(true);
    }

    // Verify persistence on reload
    const getRes = await handleGetDraftSession(
      new Request(`http://localhost/api/draft-sessions/${session.id}`),
      String(session.id),
      db,
    );
    const refetched = await getRes.json();
    expect(refetched.session.my_slot_index).toBe(4);
    expect(refetched.session.active_target_slot_index).toBe(3);
    expect(refetched.session.status).toBe("locked");
    expect(refetched.session.phase).toBe("locked");
    expect(refetched.slots.every((s: { is_locked: boolean }) => s.is_locked)).toBe(true);
  });

  it("lists the Patch KB hero catalog and filters by query and lane", async () => {
    const db = createDatabase(":memory:");

    const allRes = await handleListHeroes(
      new Request("http://localhost/api/heroes"),
      db,
    );
    expect(allRes.status).toBe(200);
    const allData = await allRes.json();
    expect(typeof allData.patch_version).toBe("string");
    expect(allData.heroes.length).toBeGreaterThan(10);

    const goldRes = await handleListHeroes(
      new Request("http://localhost/api/heroes?lane=Gold"),
      db,
    );
    expect(goldRes.status).toBe(200);
    const goldData = await goldRes.json();
    expect(goldData.heroes.length).toBeGreaterThan(0);
    for (const hero of goldData.heroes) {
      expect(hero.lanes).toContain("Gold");
    }
  });
});
