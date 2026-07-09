/**
 * @egox/contracts — `/ask/stream` SSE event union.
 *
 * Each event is JSON-serialized and framed as a single `data: …\n\n`
 * Server-Sent Event. Backend writes these; SDK + Console parse them.
 * The discriminated union is the single source of truth for both sides
 * so adding a new event variant is a single-edit, type-checked change
 * across the stack.
 *
 * `AskStreamRequestBody` (the wire request shape) lives in `ask.d.ts`
 * because it inherits from `AskRequestBody`.
 */

import type { Intent, TokenUsage } from './envelope';

/**
 * Discriminated union of every event the streaming `/ask` endpoint emits.
 *
 * Notes on subset behaviour:
 *   - `stream: 'minimal'` requests omit `rag.*` and `tool.*` events.
 *   - `done` is always the terminal success frame.
 *   - `error` may appear at any point and is also terminal.
 */
export type AskStreamEvent =
    | AskStreamIntentEvent
    | AskStreamRagSearchingEvent
    | AskStreamRagRetrievedEvent
    | AskStreamDeltaEvent
    | AskStreamToolCallingEvent
    | AskStreamToolResultEvent
    | AskStreamLLMDebugEvent
    | AskStreamToolDebugEvent
    | AskStreamDoneEvent
    | AskStreamErrorEvent;

export interface AskStreamIntentEvent {
    type: 'intent';
    intent: Intent;
}

export interface AskStreamRagSearchingEvent {
    type: 'rag.searching';
    query: string;
}

export interface AskStreamRagRetrievedEvent {
    type: 'rag.retrieved';
    chunks: Array<{
        documentTitle: string;
        score: number;
    }>;
}

export interface AskStreamDeltaEvent {
    type: 'delta';
    /** Token (or token-like fragment) appended to the running answer. */
    content: string;
}

export interface AskStreamToolCallingEvent {
    type: 'tool.calling';
    name: string;
    args: Record<string, unknown>;
}

export interface AskStreamToolResultEvent {
    type: 'tool.result';
    name: string;
    success: boolean;
    durationMs: number;
}

/**
 * Debug-only message frame describing one LLM chat-completion iteration.
 *
 * Emitted only when the request was made with `debug: true` AND the
 * caller is authenticated as a console JWT user. Safe to ignore from
 * non-debug consumers — the field never appears outside that path.
 */
export interface AskStreamLLMDebugEvent {
    type: 'llm.debug';
    /** Zero-based index in the orchestrator's tool loop. */
    iteration: number;
    /** Resolved model id, e.g. `gpt-4.1-mini-2025-04-14`. */
    model: string;
    /** Snapshot of the messages array sent INTO this iteration. */
    messages: Array<{
        role: 'system' | 'user' | 'assistant' | 'tool';
        content: string | null;
        name?: string;
        toolCallId?: string;
        toolCalls?: Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
        }>;
    }>;
    /** What the LLM emitted this iteration (text + tool-call requests). */
    response: {
        content: string;
        finishReason: string;
        toolCalls?: Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
        }>;
    };
    usage: TokenUsage;
}

/**
 * Debug-only frame describing one tool HTTP execution — the actual
 * request EgoX sent to the tenant server and the response it received.
 *
 * Emitted only when the request was made with `debug: true` AND the
 * caller is authenticated as a console JWT user.
 *
 * Sensitive header values (Authorization, X-Egox-Signature,
 * X-Egox-Timestamp, and anything matching /token|secret|key|auth/i) are
 * already redacted to `***` server-side before this frame is written.
 */
export interface AskStreamToolDebugEvent {
    type: 'tool.debug';
    name: string;
    durationMs: number;
    success: boolean;
    /** What EgoX sent to the tenant server. */
    request: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body: unknown;
    };
    /** What came back. `statusCode` is null on a network exception. */
    response: {
        statusCode: number | null;
        headers: Record<string, string>;
        body: unknown;
        error?: string;
    };
    /** Total number of attempts including the final one (1 + retries). */
    attempts: number;
    /**
     * Provenance map of which tool-allowlisted headers were actually
     * forwarded and from which source (`'body'` =
     * `AskRequestBody.toolHeaders`, `'inbound'` = inbound HTTP
     * forwarded by `tool.forwardHeaders` allowlist). Header VALUES
     * are NOT included — they're already in `request.headers`
     * (redacted there). Useful for debugging "why did/didn't my
     * header get forwarded?" without leaking secrets a second time.
     * Omitted when no headers were forwarded.
     */
    forwardedHeaderSources?: Record<string, 'body' | 'inbound'>;
}

export interface AskStreamDoneEvent {
    type: 'done';
    threadId: string;
    /**
     * Echo of `AskStreamRequestBody.externalThreadId` when one was
     * supplied — same semantics as `AskResponseData.externalThreadId`.
     * Lets streaming consumers correlate the SSE result back to their
     * own conversation id without parsing the final `data` payload
     * separately (Phase 6).
     */
    externalThreadId?: string;
    intent: Intent;
    toolUsed: string | null;
    ragChunksUsed: number;
    model: string;
    usage: TokenUsage;
    /**
     * Auto-generated conversation title (SPI_202). Same semantics as
     * `AskResponseData.title` — surfaced on the terminal event so streaming
     * consumers can label the thread without a separate thread fetch. Present
     * once the thread has a title (the turn the overlapped title lands, and
     * every turn after); absent while a first-turn title is still generating.
     */
    title?: string;
    /**
     * Pending high-impact actions awaiting user approval (Path-A, DotCollab #8).
     * Same semantics + shape as `AskResponseData.pendingActions` — surfaced on
     * the stream's terminal event so streaming consumers can render the
     * Approve/Reject card without parsing the final `data` payload separately.
     */
    pendingActions?: Array<{ approvalId: string; toolName: string; summary: string }>;
    /**
     * Per-end-user learning observability (Phase 15 / exURM). Same semantics as
     * `AskResponseData.{memoryInjected,memoryProposed}` — surfaced on the
     * terminal event so streaming consumers get the signal without parsing the
     * final payload. Present only when learning was active this turn.
     */
    memoryInjected?: boolean;
    memoryProposed?: boolean;
}

export interface AskStreamErrorEvent {
    type: 'error';
    message: string;
    /** Machine-readable error code, e.g. `INVALID_INPUT`, `INTERNAL_SERVER_ERROR`. */
    code?: string;
}
