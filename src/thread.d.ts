/**
 * @egox/contracts — `/egox/threads/*` and
 * `/egox/tenants/:tenantId/threads/*` wire types.
 *
 * The conversation memory surface. `Thread` rows are produced by every
 * `/ask` turn (via `ThreadService.getOrCreateThread`) and read back
 * via the admin threads list / detail routes.
 *
 * Phase 6's `externalThreadId` already lives in `AskRequestBody` /
 * `AskResponseData` / `AskStreamDoneEvent` (in `ask.d.ts` /
 * `stream.d.ts`). This file lifts the FULL `Thread` and `Message`
 * row shapes — what the threads-admin endpoints return — into the
 * contracts package so the console mirror can't drift.
 *
 * Drift cleaned up:
 *   - Backend `Thread` and `Message` used `Date` for `createdAt` /
 *     `updatedAt`; wire and console already used ISO strings.
 *     `formatThread` and `formatMessage` now emit ISO to match.
 */

import type { Intent } from './envelope';

// ============================================================================
// Locked vocabularies
// ============================================================================

/** Role of a message in the conversation turn. */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Why a turn was stamped with `failedRecovery: true` by the
 * orchestrator. Mirrors the CHECK constraint on
 * `egox_messages.failure_reason` (migration 014, Phase 5 / Layer 5).
 * Adding a new entry requires a migration + orchestrator change in
 * lockstep — the audit field exists to be queryable, not free-form.
 */
export type MessageFailureReason =
    | 'tool_retry_storm'
    | 'iteration_cap'
    | 'max_calls_per_turn'
    | 'unrecoverable_error';

// ============================================================================
// Supporting shapes
// ============================================================================

/**
 * Tool-call request emitted by an `assistant` message. Shape matches
 * the OpenAI Chat Completions tool-call envelope verbatim — that's
 * what the orchestrator persists. `arguments` is a JSON string the
 * caller must `JSON.parse` if they want the structured value;
 * EgoX doesn't decode it on the wire because it's already
 * round-tripped through the LLM as text.
 */
export interface ToolCallWire {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

// ============================================================================
// ThreadWire — the canonical row shape
// ============================================================================

/**
 * Wire-format thread row. Returned by every threads-admin response and
 * embedded in `ThreadWithMessagesWire`.
 *
 * `externalThreadId` is populated when the caller supplied one on the
 * `/ask` that minted the row (Phase 6); `null` for legacy threads and
 * for any caller that uses only the EgoX UUID path.
 */
export interface ThreadWire {
    id: string;
    tenantId: string;
    externalUserId: string | null;
    /**
     * Consumer-supplied conversation identifier (Phase 6). `null` for
     * threads created before the column existed and for any caller
     * that didn't supply one. Uniqueness is enforced per
     * `(tenantId, externalThreadId)` among non-NULL rows by the
     * `idx_egox_threads_tenant_ext` partial unique index — see
     * migration 017.
     */
    externalThreadId: string | null;
    title: string | null;
    metadata: Record<string, unknown>;
    isActive: boolean;
    /** ISO 8601 timestamp. */
    createdAt: string;
    /** ISO 8601 timestamp. */
    updatedAt: string;
}

/**
 * Thread row plus aggregate stats. Returned by the admin threads list
 * endpoint so the operator-facing table can sort by activity without
 * an N+1 fetch.
 */
export interface ThreadWithStatsWire extends ThreadWire {
    messageCount: number;
    totalTokens: number;
}

// ============================================================================
// MessageWire — the canonical message-row shape
// ============================================================================

/**
 * Wire-format message row. Carries the full per-turn audit trail —
 * the LLM iteration's prompt/completion token split, the model id,
 * the intent classification, the RAG context that was injected, and
 * the Phase 5 failure-recovery flags.
 *
 * `toolCalls` is populated only on `role: 'assistant'` rows that
 * requested a tool. `toolCallId` + `toolName` are populated only on
 * `role: 'tool'` result rows.
 */
export interface MessageWire {
    id: string;
    threadId: string;
    tenantId: string;
    role: MessageRole;
    content: string | null;
    toolCalls: ToolCallWire[] | null;
    toolCallId: string | null;
    toolName: string | null;
    intent: Intent | null;
    ragContext: Record<string, unknown> | null;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    model: string | null;
    /** Echo of `AskRequestBody.metadata` for audit. */
    metadata: Record<string, unknown> | null;
    /**
     * `true` when this row's `content` was deliberately dropped under
     * no-store (metadata-only) persistence — see
     * `AskRequestBody.noStore` and the tenant's `persistMessageContent`
     * setting (#5). Distinguishes an intentional NULL (the conversation
     * text was never stored) from an incidental empty turn. Always
     * `false` for tenants that persist content normally.
     */
    contentRedacted: boolean;
    /**
     * `true` when this turn triggered a Phase 5 tool-retry-storm
     * backstop (dedup ≥ MAX_DUPLICATE_CALLS_BEFORE_FLAG / per-tool
     * cap / outer iteration cap) or ended on an unrecoverable error
     * class. Always `false` for non-assistant rows. Phase 5 /
     * Layer 5 — drives the Tool Health "bad turns" filter.
     */
    failedRecovery: boolean;
    /**
     * Dominant cause when `failedRecovery === true`. `null`
     * otherwise. See `MessageFailureReason` for the locked
     * vocabulary.
     */
    failureReason: MessageFailureReason | null;
    /** ISO 8601 timestamp. */
    createdAt: string;
}

/**
 * Returned by the thread-detail endpoint. The full conversation —
 * row + every message in chronological order.
 */
export interface ThreadWithMessagesWire {
    thread: ThreadWire;
    messages: MessageWire[];
}

// ============================================================================
// Response data shapes (carried inside `EgoxApiResponse.data`)
// ============================================================================

export interface ThreadListResponseData {
    threads: ThreadWithStatsWire[];
}

export interface ThreadGetResponseData extends ThreadWithMessagesWire {}
