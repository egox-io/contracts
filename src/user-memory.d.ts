/**
 * @egox/contracts — `/egox/tenants/:tenantId/learning/*` wire types
 * (Phase 15 / exURM — per-end-user learning).
 *
 * The Console calls this surface **Learning**; the backend domain is
 * `user-memory` (table `egox_user_memory`). One HYBRID row shape covers both
 * kinds via a `kind` discriminator:
 *   - `profile` — a structured attribute (`attrKey` = `content`, e.g.
 *     `size` = `38`). Always injected when approved.
 *   - `memory`  — a free-text snippet (`attrKey` null), embedded server-side
 *     and similarity-retrieved. The `embedding` itself NEVER crosses the wire.
 *
 * GOVERNANCE (locked): review-before-use. Rows land `status: 'pending'`; only
 * `'approved'` rows are ever injected into an `/ask` prompt. Opt-in per tenant
 * (`learning_enabled`, default false); no capture under no-store.
 *
 * ── Admin routes (all guarded by tenant-owner auth) ─────────────────────────
 *   GET    /egox/tenants/:tenantId/learning/users
 *            → LearningUsersResponseData   (roster + pending badge total + flag)
 *   GET    /egox/tenants/:tenantId/learning/users/:externalUserId?status=
 *            → LearningUserFactsResponseData  (profile + memories, one flat list)
 *   PATCH  /egox/tenants/:tenantId/learning/facts/:factId
 *            body UpdateUserMemoryFactBody  → UserMemoryFactResponseData
 *   POST   /egox/tenants/:tenantId/learning/facts/:factId/approve
 *            → UserMemoryFactResponseData
 *   POST   /egox/tenants/:tenantId/learning/facts/:factId/reject
 *            → UserMemoryFactResponseData
 *   DELETE /egox/tenants/:tenantId/learning/facts/:factId
 *            → UserMemoryFactResponseData   (the deleted row, for optimistic UI)
 *   DELETE /egox/tenants/:tenantId/learning/users/:externalUserId
 *            → ForgetUserResponseData       (right-to-be-forgotten)
 *   (the on/off toggle reuses the existing tenant-config update with
 *    `learningEnabled` — no dedicated route here.)
 *
 * **Versioning.** Additive new family → minor bump (0.5.3 → 0.6.0).
 */

// ============================================================================
// Locked vocabularies (mirror DB CHECK constraints — migration 042)
// ============================================================================

/**
 * Hybrid discriminator (mirrors `egox_user_memory.kind` CHECK, migration 042).
 *   - `profile` — structured attribute, always injected when approved.
 *   - `memory`  — free-text snippet, embedded + similarity-retrieved.
 * Adding a value requires a migration + this type in lockstep.
 */
export type UserMemoryKind = 'profile' | 'memory';

/**
 * Review lifecycle (mirrors `egox_user_memory.status` CHECK, migration 042).
 * Only `'approved'` is ever read on the `/ask` path.
 */
export type UserMemoryStatus = 'pending' | 'approved' | 'rejected';

/**
 * Provenance (mirrors `egox_user_memory.source` CHECK, migration 042).
 * `'agent_tool'` = proposed by the built-in `remember_fact` tool (MVP; the
 * only source until a manual-add path lands).
 */
export type UserMemorySource = 'agent_tool';

/**
 * A distinct PII/PHI entity type flagged by the Presidio pass on a proposed
 * fact at propose time (Phase 15 / exURM, Phase C), with the highest confidence
 * seen for that type. `type` is Presidio's entity label (e.g. `'PERSON'`,
 * `'EMAIL_ADDRESS'`, `'US_SSN'`). Never carries the matched text — types only.
 */
export interface PiiEntitySummary {
    type: string;
    /** Highest analyzer confidence for this type, in `[0, 1]`. */
    score: number;
}

// ============================================================================
// UserMemoryWire — the canonical row shape
// ============================================================================

/**
 * Wire-format learned-fact row. Returned by the learning detail + mutation
 * endpoints. The `embedding` column is intentionally omitted — it never
 * crosses the wire.
 */
export interface UserMemoryWire {
    id: string;
    tenantId: string;
    /** The opaque end-user scope key from `/ask` (`externalUserId`). */
    externalUserId: string;
    kind: UserMemoryKind;
    /**
     * The attribute name for `kind: 'profile'` (e.g. `'size'`); `null` for
     * `kind: 'memory'`.
     */
    attrKey: string | null;
    /** The attribute value (`profile`) or the memory snippet (`memory`). */
    content: string;
    status: UserMemoryStatus;
    source: UserMemorySource;
    /** Thread that produced this fact (audit); `null` when unknown / no-store. */
    originThreadId: string | null;
    /** Message that produced this fact (audit); `null` when unknown / no-store. */
    originMessageId: string | null;
    /** Optional model-reported confidence in `[0, 1]`; `null` when not given. */
    confidence: number | null;
    /** ISO 8601 timestamp. */
    createdAt: string;
    /** ISO 8601 timestamp. */
    updatedAt: string;
    /** ISO 8601 timestamp; `null` until reviewed (approved/rejected/edited). */
    reviewedAt: string | null;
    /** User id who reviewed; `null` while pending. */
    reviewedBy: string | null;
    /**
     * PII/PHI entity types the Presidio pass flagged in this fact's text at
     * propose time (Phase C). Empty/absent when none were found or Presidio
     * isn't configured. The review UI surfaces a "possible PII" chip so the
     * owner can scrutinise before approving. Never includes the matched text.
     * Additive — older consumers ignore it.
     */
    piiEntities?: PiiEntitySummary[];
}

// ============================================================================
// Roster summary — one row per external user
// ============================================================================

/**
 * Per-end-user roster entry for the Learning list screen. Aggregated over that
 * user's `egox_user_memory` rows — no per-fact fetch needed for the table.
 */
export interface UserMemoryUserSummaryWire {
    externalUserId: string;
    /** Count of `status: 'approved'` facts (profile + memory). */
    approvedCount: number;
    /** Count of `status: 'pending'` facts — drives the review badge. */
    pendingCount: number;
    /**
     * Most recent learning activity for this user (max `created_at` across
     * their facts), ISO 8601; `null` if somehow empty. Labelled "Last activity"
     * in the UI — it is fact activity, not a true last-seen from threads.
     */
    lastActivityAt: string | null;
}

// ============================================================================
// Request bodies (what the client SENDS)
// ============================================================================

/**
 * Body of `PATCH …/learning/facts/:factId`. Owner edits a proposed/approved
 * fact before or after approving it. Both fields optional (partial update);
 * `attrKey` only meaningful for `kind: 'profile'`.
 */
export interface UpdateUserMemoryFactBody {
    content?: string;
    attrKey?: string | null;
}

// ============================================================================
// Response data shapes (carried inside `EgoxApiResponse.data`)
// ============================================================================

/**
 * `GET …/learning/users`. The roster plus the flag state (so the list screen
 * can render the on/off Switch without a second call) and the tenant-wide
 * pending total for the sidebar badge.
 */
export interface LearningUsersResponseData {
    /** Current per-tenant opt-in state (`egox_tenant_configs.learning_enabled`). */
    learningEnabled: boolean;
    /** Sum of `pendingCount` across all users — the sidebar/nav badge. */
    totalPending: number;
    users: UserMemoryUserSummaryWire[];
}

/**
 * `GET …/learning/users/:externalUserId`. All of the user's facts as one flat
 * list — partition client-side: review queue = `status === 'pending'`;
 * approved profile = `kind === 'profile' && status === 'approved'`; approved
 * memories = `kind === 'memory' && status === 'approved'`. When the request
 * carried `?status=`, `facts` is pre-filtered to that status.
 */
export interface LearningUserFactsResponseData {
    externalUserId: string;
    facts: UserMemoryWire[];
}

/**
 * Returned by every single-fact mutation (`PATCH`, `approve`, `reject`,
 * `DELETE …/facts/:factId`) — the affected row for optimistic UI reconciliation.
 * On delete this is the row as it was just before removal.
 */
export interface UserMemoryFactResponseData {
    fact: UserMemoryWire;
}

/**
 * `DELETE …/learning/users/:externalUserId` (right-to-be-forgotten). Reports
 * how many facts were purged so the UI can confirm.
 */
export interface ForgetUserResponseData {
    externalUserId: string;
    deletedCount: number;
}
