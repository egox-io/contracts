/**
 * @egox/contracts — `/egox/tenants/:tenantId/rag/documents/*` +
 * `/egox/mcp-admin/rag-documents/*` wire types.
 *
 * Three independent consumers used to hand-mirror these shapes:
 *   - the backend (`modules/rag/interfaces.ts`)
 *   - the MCP server (`egox-mcp/src/backend-client.ts` — `BackendRagDoc`)
 *   - the console (`console/src/types/models.ts` — `RagDocument`)
 * Each mirror had its own subtle drift:
 *   - MCP's `sourceType` / `processingStatus` were typed as bare `string`
 *     (no `'file'|'url'|'manual'` lock), and `sourceUrl` was missing entirely.
 *   - Console's `RagDocument` had no `source` (provenance) field at all,
 *     so the manual-vs-MCP distinction was invisible in the UI.
 *   - Backend timestamps were `Date` in-process but ISO strings on the
 *     wire — same wire/runtime mismatch we removed for Tools in P1.
 * Phase 9.2 unifies all three under `RagDocumentWire`.
 *
 * Mirrors the pattern locked in P1 (`tool.d.ts`):
 *   - locked vocabularies prefixed `Rag*` to avoid collisions with
 *     future families that have their own "source type" concept;
 *   - timestamps as ISO 8601 `string` (backend `formatDocument` now
 *     emits ISO via the same `toIso` helper Tools uses);
 *   - request bodies omit context fields the route layer attaches
 *     (`tenantId`, identifying URL params).
 *
 * **Backend-only.** `RagChunk`, `RetrievedChunk`, `RetrievalRequest`,
 * `RetrievalResponse`, and `ChunkOptions` are NOT wire types — they're
 * orchestrator-internal retrieval shapes. The only chunk info that
 * crosses the wire is the minimal `{ documentTitle, score }` pair
 * already on `AskStreamRagRetrievedEvent` in `stream.d.ts`.
 */

// ============================================================================
// Locked vocabularies
// ============================================================================

/**
 * How a RAG document entered the system.
 *   - `'file'`   — uploaded via Console.
 *   - `'url'`    — fetched from a URL the user provided.
 *   - `'manual'` — pasted as text in the Console editor.
 *
 * Distinct from `RagDocumentSource` (provenance: which user surface
 * created the row, `'manual'` console vs `'mcp'` Cursor flow).
 */
export type RagDocumentSourceType = 'file' | 'url' | 'manual';

/**
 * Async ingestion state. Documents start `'pending'`, advance to
 * `'processing'` while chunking + embedding run, then settle at
 * `'completed'` or `'failed'`. Console surfaces these as badge colors.
 */
export type RagProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Provenance of the document.
 *   - `'manual'` — created in the Console.
 *   - `'mcp'`    — created via the MCP server (Cursor / 3rd-party MCP
 *                  client). Overwriting a `'manual'` document from MCP
 *                  requires `force: true` (see `RagDocumentUpsertByTitleBody`).
 *
 * Structurally identical to `ToolSource` from `tool.d.ts` but kept as a
 * distinct nominal type so a function expecting one can't be passed the
 * other by mistake — each family owns its own source-of-truth vocab.
 */
export type RagDocumentSource = 'manual' | 'mcp';

// ============================================================================
// RagDocumentWire — the canonical row shape
// ============================================================================

/**
 * Wire-format RAG document row. Returned by every
 * `/egox/tenants/:tenantId/rag/documents/*` and
 * `/egox/mcp-admin/rag-documents/*` response that produces a document.
 *
 * Backend in-process `RagDocument` is an alias of this type. Timestamps
 * are typed as `string` (ISO 8601) because that's what Fastify
 * serialises Date values to; the backend's `formatDocument` emits ISO
 * strings to match so wire and in-process shapes never disagree.
 *
 * The body of the document and its chunked content live in different
 * places — this row carries the raw `content` (so consumers can
 * display the source text) but does NOT include the derived chunks.
 * Chunks are an orchestrator-internal concept; only the `chunkCount`
 * is exposed.
 */
export interface RagDocumentWire {
    id: string;
    /**
     * Owning tenant. Present on every response for audit; the request
     * side never carries it (the backend derives tenant from the API
     * key / JWT context).
     */
    tenantId: string;
    /**
     * Display title. Also the natural key for the MCP upsert path
     * (`PUT /egox/mcp-admin/rag-documents/:title`) — uniqueness is
     * enforced per tenant.
     */
    title: string;
    sourceType: RagDocumentSourceType;
    /** Origin URL when `sourceType === 'url'`; `null` otherwise. */
    sourceUrl: string | null;
    /** Raw text content. May be large — Console truncates in list views. */
    content: string;
    /** Tenant-supplied tags. Used for retrieval filtering (`tags?: string[]` on `/ask`). */
    tags: string[];
    /** Free-form per-document metadata (provenance hints, authoring info, etc.). */
    metadata: Record<string, unknown>;
    processingStatus: RagProcessingStatus;
    /** Number of chunks the document was split into. `0` until processing completes. */
    chunkCount: number;
    source: RagDocumentSource;
    /** ISO 8601 timestamp. */
    createdAt: string;
    /** ISO 8601 timestamp. */
    updatedAt: string;
}

// ============================================================================
// Request bodies (what the client SENDS)
// ============================================================================

/**
 * Wire body of `POST /egox/tenants/:tenantId/rag/documents` (the
 * Console admin path). Notable absences:
 *   - `tenantId`         — URL param, not body.
 *   - `processingStatus` — server-managed, starts at `'pending'`.
 *   - `chunkCount`       — server-managed, populated by the chunker.
 *   - `source`           — admin route hardcodes `'manual'`; the MCP
 *                          path uses `RagDocumentUpsertByTitleBody`
 *                          and hardcodes `'mcp'`.
 *   - timestamps         — server-managed.
 */
export interface RagDocumentCreateBody {
    title: string;
    content: string;
    sourceType?: RagDocumentSourceType;
    sourceUrl?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
}

/**
 * Wire body of `PUT /egox/mcp-admin/rag-documents/:title` (the MCP
 * idempotent upsert path). Differs from `RagDocumentCreateBody`:
 *   - `title`     — URL param, not body.
 *   - `sourceType`/`sourceUrl` — not accepted; MCP-created docs are
 *                                 always `sourceType: 'manual'`,
 *                                 `sourceUrl: null`, `source: 'mcp'`.
 *   - `force`     — opt-in escape hatch to overwrite a `'manual'`
 *                   document of the same title. Without it the
 *                   backend returns `McpManualOverrideRequired`.
 */
export interface RagDocumentUpsertByTitleBody {
    content: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
    /** Set to `true` to overwrite a `'manual'`-source document of the same title. */
    force?: boolean;
}

// ============================================================================
// Response data shapes (carried inside `EgoxApiResponse.data`)
// ============================================================================

export interface RagDocumentListResponseData {
    documents: RagDocumentWire[];
}

export interface RagDocumentGetResponseData {
    document: RagDocumentWire;
}

/**
 * Response payload of the MCP upsert endpoint
 * (`PUT /egox/mcp-admin/rag-documents/:title`).
 *   - `action: 'created'`  — there was no prior row for this title.
 *   - `action: 'replaced'` — the old row was deleted and a fresh one
 *     created; chunks are recomputed asynchronously.
 *   - `message`            — operator-facing hint about async processing.
 */
export interface RagDocumentUpsertResponseData {
    document: RagDocumentWire;
    action: 'created' | 'replaced';
    message: string;
}
