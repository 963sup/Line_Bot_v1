import type { FileReclamation } from "../../contracts/output/files.js";
import type { FileObjectRemoval } from "../../contracts/output/object-store.js";
import { uploadRecoveryPolicy } from "../../domain/file.js";
import { integer } from "../../domain/values.js";

/** One explicit operator command. No new queue, Storage manifest or scheduling policy. */
export function createFileReclaimer(deps: {
  maintenance: FileReclamation;
  objects: () => FileObjectRemoval;
  beforeMutation(): Promise<void>;
}) {
  function cutoff(value: number) {
    return integer(value, 0, Number.MAX_SAFE_INTEGER);
  }
  return {
    async plan(beforeAt: number) {
      const candidates = await deps.maintenance.candidates(
        cutoff(beforeAt),
        uploadRecoveryPolicy.quietMillis,
      );
      return { eligible: candidates.length, pageFull: candidates.length === 20 };
    },
    async reclaim(beforeAt: number) {
      const candidates = await deps.maintenance.candidates(
        cutoff(beforeAt),
        uploadRecoveryPolicy.quietMillis,
      );
      let reclaimed = 0;
      let skipped = 0;
      for (const intent of candidates) {
        const actor = intent.revision.actorUserId;
        await deps.beforeMutation();
        // Durable quarantine takes the original request/File locks and fences late Finalize.
        const revision = await deps.maintenance.quarantine(
          actor,
          intent.requestId,
          beforeAt,
          uploadRecoveryPolicy.quietMillis,
        );
        if (!revision) {
          skipped++;
          continue;
        }
        await deps.beforeMutation();
        await deps.objects().removeVerified(revision);
        await deps.beforeMutation();
        await deps.maintenance.markReclaimed(actor, intent.requestId, revision.id);
        reclaimed++;
      }
      return {
        examined: candidates.length,
        reclaimed,
        skipped,
        pageFull: candidates.length === 20,
      };
    },
  };
}
