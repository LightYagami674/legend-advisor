# Legend Advisor

Real-time draft and item build decision support for Mobile Legends: Bang Bang (MLBB), paired with a post-match loss learning loop that adapts future recommendations to the player's personal failure patterns.

## Language

**Draft Session**:
A live record of a single match's ban and pick phase across all 10 slots (5 Ally, 5 Enemy), advancing through bans, hero picks, and final lock-in.
_Avoid_: Game room, lobby, match state

**Draft Slot**:
One of the 10 positions in a Draft Session (Ally 1–5 or Enemy 1–5), holding its assigned role/lane, banned hero, and picked hero.
_Avoid_: Player seat, position, index

**My Slot**:
The specific Ally Draft Slot occupied by the user in a Draft Session, where the user declares the role they are playing and to which personal Player Profile learnings apply.
_Avoid_: Active player, host slot

**Target Ally Slot**:
Any of the 5 Ally Draft Slots (either My Slot or one of the 4 teammate slots) selected by the user to receive a Pick Recommendation or Build Recommendation.
_Avoid_: Current user slot, selected player

**Candidate Pick**:
One of the top 3 heroes recommended for a Target Ally Slot during a Draft Session, ranked by synergy with allies, counter-value against enemies, role need, patch strength, and—only when advising My Slot—the user's Player Profile.
_Avoid_: Suggested hero, draft prediction, option

**Build Recommendation**:
The complete post-draft loadout recommended for a locked-in Ally hero against the finalized Enemy lineup, consisting of core/situational equipment items, Emblem setup, and Battle Spell (tailored by the Player Profile when advising My Slot).
_Avoid_: Item list, gear set, loadout

**Patch Knowledge Base**:
The structured catalog of current Mobile Legends heroes, roles, counters, synergies, items, emblems, and patch balance changes used as ground-truth context for recommendations.
_Avoid_: Static database, game wiki, meta data

**Post-Match Review**:
A post-defeat diagnostic submission consisting of the final match scoreboard screenshot and the user's free-text reflection on what went wrong, evaluated strictly from the perspective of My Slot.
_Avoid_: Loss report, match upload, feedback form

**Failure Pattern**:
A structured personal learning extracted from a Post-Match Review capturing what the user can improve across four dimensions—pick-wise, action-wise, synergy-wise, and build-wise—never tracking or profiling teammates.
_Avoid_: Loss reason, bug, mistake log

**Player Profile**:
The persistent personal data store of the user's preferred roles, hero comfort pool, and accumulated Failure Patterns (pick-wise, action-wise, synergy-wise, build-wise) used exclusively to sharpen recommendations for My Slot.
_Avoid_: User account, settings, memory blob
