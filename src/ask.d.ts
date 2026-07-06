/**
 * @egox/contracts — `/ask` request + response wire types.
 *
 * SSE event types for `/ask/stream` live in `stream.d.ts` — they share
 * the request body via `AskStreamRequestBody` declared here.
 */

import type { Intent, JsonSchemaDefinition, ResponseFormat, TokenUsage } from './envelope';

// ============================================================================
// /ask — request
// ============================================================================

/**
 * **Wire** body of `POST /egox/ask` and `POST /egox/ask/stream`.
 *
 * This is exactly what gets serialized into the request body. Consumers
 * (SDK, MCP previews, raw `curl` users) and the backend route handler MUST
 * agree on this shape.
 *
 * Things that look like they should live here but don't:
 *   - `tenantId` is sent via `X-Tenant-Id` header (or derived from API key).
 *   - `authToken` is sent via `Authorization: Bearer …` header.
 *   - `incomingHeaders` is captured from the actual HTTP headers, not the body.
 *   These are intentionally NOT body fields — they live where HTTP puts them.
 */
export interface AskRequestBody {
    /** End-user's message for this turn. Required, non-empty. */
    message: string;

    /**
     * Continue an existing conversation by passing back the EgoX-internal
     * UUID returned in a previous response. The two failure modes the
     * legacy single-`threadId` model silently collapsed are now loud:
     *   - A well-formed UUID with no matching row → 404 NotFound.
     *   - A non-UUID string                       → 400 InvalidInput.
     * If you want to use your own conversation id (e.g. `conv:abc123`),
     * send it as `externalThreadId` instead and EgoX will mint the
     * UUID for you on first call and re-use it on every subsequent call
     * with the same external id.
     *
     * Mutually exclusive with `externalThreadId` in practice — when both
     * are supplied `threadId` wins for back-compat (the backend logs a
     * debug warning).
     */
    threadId?: string;

    /**
     * **Opaque** consumer-supplied conversation identifier (Phase 6).
     * Sent on every call in the same conversation so EgoX can resolve
     * to the same thread row without the caller ever round-tripping
     * the EgoX UUID. Shape is yours to choose (`conv:abc123`,
     * `thread:user42:session99`, hashed ids, …); EgoX persists it
     * verbatim and never parses it.
     *
     * Resolution semantics:
     *   - First call with this id → EgoX creates a new thread with the
     *     id permanently attached. The minted EgoX UUID is also
     *     returned on `AskResponseData.threadId` for debugging.
     *   - Subsequent calls with the same id → same thread row, no
     *     matter what UUID was previously returned.
     *
     * Echoed back unchanged on `AskResponseData.externalThreadId` so
     * the caller can confirm which conversation their request landed in.
     */
    externalThreadId?: string;

    /**
     * **Opaque** end-user identifier from the consumer's POV — used by EgoX
     * for thread association, audit, and pass-through to tools. Any string
     * shape is accepted (UUID, slug, hash, …); EgoX never resolves it
     * against its own admin tables.
     */
    externalUserId?: string;

    /** Override the tenant's default response format for this single call. */
    responseFormat?: ResponseFormat;

    /**
     * Required when `responseFormat === 'json_object'`. Injected into the
     * system prompt so the LLM produces conforming JSON.
     */
    jsonSchema?: JsonSchemaDefinition;

    /**
     * Free-form per-call context forwarded to tool calls and echoed back
     * on the response. Use for tenant/user context your tools need.
     */
    metadata?: Record<string, unknown>;

    /**
     * Per-call override of the tenant's `persist_message_content` default.
     *
     *   - `true`      → metadata-only for THIS call: EgoX does not persist
     *                   the user message or the answer text. The thread/
     *                   message rows still exist (so usage, intent, model,
     *                   tokens, and the thread correlation survive for
     *                   analytics) but `content` is `NULL` and the row is
     *                   flagged `contentRedacted: true`.
     *   - `false`     → persist text for THIS call **only if the tenant
     *                   default already allows it**. The tenant's
     *                   `persist_message_content=false` is a hard floor:
     *                   `noStore:false` CANNOT re-enable storage on a
     *                   no-store tenant. It only matters on a tenant that
     *                   persists by default (where it's a no-op).
     *   - omitted     → use the tenant's `persist_message_content` setting.
     *
     * Net: a per-call flag can only ever *tighten* (force no-store), never
     * loosen a tenant that has opted out of storing conversations.
     *
     * Built for integrations whose policy is "don't store conversations"
     * (e.g. .collab): set the tenant default to no-store, or pass this
     * per call. When no-store is in effect EgoX keeps no transcript, so
     * multi-turn context must be supplied by the caller (e.g. via a
     * `getConversation` tool) rather than reloaded from EgoX history.
     */
    noStore?: boolean;

    /**
     * Per-call header map forwarded to the tool the LLM ends up calling,
     * gated by that tool's `forwardHeaders` allowlist. Use this when the
     * value:
     *   - is per-end-user (so it can't be baked into the tool's static
     *     `headers` config), AND
     *   - shares a name with a header EgoX claims for itself (most
     *     commonly `Authorization` and `X-API-Key` — both used to
     *     authenticate the caller TO EgoX, so they're not free for
     *     forwarding via the inbound-HTTP path).
     *
     * Body-sourced entries skip the inbound-HTTP forward blocklist
     * (you opted in by putting them here), but EgoX-internal namespaces
     * (`x-egox-*`, `x-mcp-*`) are still rejected.
     *
     * Header names are case-insensitive on the wire and normalized to
     * the canonical casing on the tool's `forwardHeaders` allowlist
     * before going out on the outbound tool request. Values must be
     * strings; binary headers are not supported.
     *
     * Source precedence on the outbound tool request (later wins):
     *   1. inbound-HTTP forwarded headers (legacy path, blocklist applied)
     *   2. body `toolHeaders` (this field — body wins on name conflicts)
     *   3. tool's static `headers` config (tool-owner default)
     *   4. `Authorization` injected by `authType: 'FORWARD'`
     */
    toolHeaders?: Record<string, string>;
}

/**
 * **Wire** body of `POST /egox/ask/stream`. Identical to `AskRequestBody`
 * plus an opt-in stream-detail flag.
 *
 * `stream`:
 *   - `true` (default when omitted) → full thinking timeline (intent, rag.*,
 *     tool.*, delta, done).
 *   - `'minimal'`                   → only intent, delta, done, error.
 */
export interface AskStreamRequestBody extends AskRequestBody {
    stream?: true | 'minimal';

    /**
     * Opt-in deep-execution trace for the Console "Your Agent" playground.
     *
     * SECURITY: ignored unless the request is authenticated with a console
     * JWT. API-key and MCP callers cannot enable debug — the route handler
     * silently coerces the flag to `false` for those auth paths.
     *
     * When enabled, the stream additionally emits:
     *   - `llm.debug` after each LLM iteration (messages array, tool-call
     *     choice, finish reason, model, usage)
     *   - `tool.debug` after each tool execution (request method/url/
     *     headers/body, response status/headers/body, attempts)
     *
     * Sensitive header values (Authorization, X-Egox-Signature,
     * X-Egox-Timestamp, and anything matching /token|secret|key|auth/i)
     * are redacted to `***` before transmission.
     *
     * Implies `stream: true` (full detail) — `'minimal'` + `debug` is a
     * 400 InvalidInput.
     */
    debug?: boolean;
}

// ============================================================================
// /ask — response
// ============================================================================

/**
 * **Wire** payload of `POST /egox/ask`, carried inside `EgoxApiResponse.data`.
 *
 * IMPORTANT — the field name is `answer`, not `response`. Both the backend
 * orchestrator's return type and the SDK's decoder reference this interface,
 * which is the structural guard against the two of them ever drifting again.
 */
export interface AskResponseData {
    /** Thread the message was appended to (new or existing). */
    threadId: string;
    /**
     * Echo of `AskRequestBody.externalThreadId` when one was supplied —
     * either the consumer-supplied id used to resolve an existing thread,
     * or the id that was just attached to a freshly-created one. Absent
     * when the caller didn't supply an `externalThreadId` (Phase 6).
     */
    externalThreadId?: string;
    /** The LLM's reply text. Empty string when the model produced no text. */
    answer: string;
    intent: Intent;
    /** Name of the tool the LLM invoked, or `null` if no tool ran. */
    toolUsed: string | null;
    /** How many RAG chunks were injected into context. `0` when RAG was off / unused. */
    ragChunksUsed: number;
    usage: TokenUsage;
    /** Resolved model id, e.g. `gpt-4.1-mini-2025-04-14`. */
    model: string;
    /** Echo of `AskRequestBody.metadata`, unchanged. */
    metadata?: Record<string, unknown>;
    /**
     * Pending high-impact actions awaiting user approval (Path-A, DotCollab #8).
     * Populated (non-empty) when a gated tool returned an `approval_requested`
     * envelope this turn instead of executing — the consumer renders an
     * Approve/Reject card per entry and resolves it out-of-band (e.g. a
     * `.../approvals/:approvalId/resolve` route). Absent/empty otherwise, so
     * consumers that ignore it are unaffected (Path-B native-approvals path).
     */
    pendingActions?: Array<{ approvalId: string; toolName: string; summary: string }>;
}
