import type { GovernanceAuditReader } from "@line_bot_v1/identity-access/contracts/audit";
import type { VerifiedLineActor } from "@line_bot_v1/identity-access/contracts/governance";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { type AuditResult, parseAuditCursor } from "../../contracts/dto/governance-audit.js";

export function createAuditQuery(reader: GovernanceAuditReader) {
  return {
    async list(
      actor: VerifiedLineActor,
      input: {
        scopeKind: string;
        scopeId: string;
        before?: string;
        limit?: number;
      },
    ): Promise<AuditResult> {
      const limit = input.limit ?? 50;
      if (
        (input.scopeKind !== "enterprise" && input.scopeKind !== "organization") ||
        !input.scopeId.trim() ||
        input.scopeId.length > 256 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      ) {
        return { ok: false, error: "invalid-input" };
      }
      let before: { at: number; id: string } | undefined;
      if (input.before !== undefined) {
        const cursor = parseAuditCursor(input.before);
        if (cursor === null) {
          return { ok: false, error: "invalid-input" };
        }
        before = cursor;
      }
      try {
        const rows = await reader.read(actor, {
          scopeKind: input.scopeKind,
          scopeId: input.scopeId,
          before,
          limit: limit + 1,
        });
        const events = rows.slice(0, limit);
        const last = events.at(-1);
        return {
          ok: true,
          events,
          next: rows.length > limit && last ? `${last.occurredAt}:${last.id}` : null,
        };
      } catch (error) {
        if (error instanceof GovernanceAccessError && error.status === 403) {
          return { ok: false, error: "forbidden" };
        }
        throw error;
      }
    },
  };
}
