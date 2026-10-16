import { runAgent } from "../src/agent/loop.ts";
import { prisma } from "../src/db.ts";
import { profileFor } from "../src/lib/auth.ts";
import { bootQloo, stopQloo } from "../src/qloo/bridge.ts";

// pnpm --filter @tp/api agent:try "Funny, under 2 hours" "Like Severance"
// Runs the real agent locally (live Qloo, Nebius, TMDB, database) for a few requests and prints
// the picks with the facts needed to judge them. A throwaway guest profile is deleted after.
await bootQloo();
const requests = process.argv.slice(2);
const profile = await profileFor(`agent-test-${Date.now()}-local-check`);
for (const message of requests) {
  const t0 = Date.now();
  const out = await runAgent({ profileId: profile.id, message, channel: "web", ephemeral: true });
  const a = out.answer;
  console.log(`\n=== "${message}"  ${Math.round((Date.now() - t0) / 1000)}s | fallback=${out.usedFallbackPlanner} rejected=${out.rejectedFinal} tools=${out.toolCallCount}`);
  if (a.question) console.log("  QUESTION:", a.question.text, a.question.options);
  if (a.note) console.log("  note:", a.note);
  for (const p of a.picks)
    console.log(`  PICK ${p.name} (${p.year}) ${p.type} ${p.runtimeMin ?? "?"}min | ${p.scorePending ? "pending" : `${p.score.likedPct}%/${p.score.countedN}`} | ${p.rentOnly ? "rent" : "stream"} ${p.providers.slice(0, 2).join(", ") || "-"} | ${p.whyItFits.slice(0, 80)}`);
  for (const p of a.backups) console.log(`  backup ${p.name} (${p.year})`);
}
await prisma.profile.delete({ where: { id: profile.id } }).catch(() => {});
await stopQloo();
process.exit(0);
