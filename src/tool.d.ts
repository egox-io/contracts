/**
 * @egox/contracts — `/egox/tools/*` + `/egox/mcp-admin/tools/*` wire types.
 *
 * Three independent consumers used to hand-mirror these shapes:
 *   - the backend (`modules/tool/interfaces.ts`)
 *   - the MCP server (`egox-mcp/src/backend-client.ts` — `BackendTool`)
 *   - the console (`console/src/types/models.ts` — `Tool`)
 * Each drift was one rename away from a silent runtime bug — the same
 * shape of failure that produced the `answer === undefined` regression
 * on `/ask`. Phase 9.1 unifies them under `ToolWire`.
 *
 * **Wire shape vs. backend in-process shape.** Timestamps are typed as
 * `string` here because that's what JSON serialization produces (Fastify
 * calls `Date.prototype.toJSON()` on the way out). The backend's
 * in-process `Tool` type re-exports `ToolWire` and its formatter now
 * emits ISO strings to match — no consumer of `tool.createdAt` in the
 * backend treats it as a `Date`, so there's no plumbing cost.
 */

// ============================================================================
// Locked vocabularies
// ============================================================================

/**
 * What kind of upstream API this tool wraps. Locked because the
 * orchestrator branches on it (REST → fetch, GRAPHQL → POST gql_query).
 * Adding a value is a one-edit change across backend + MCP + console
 * because they all reference `ToolType` from this file.
 */
export type ToolType = 'REST' | 'GRAPHQL';

/** HTTP method for REST tools. Locked — the backend allows only these. */
export type ToolHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * How the tool authenticates upstream.
 *   - `'FORWARD'` — EgoX injects the caller's `authToken` into the
 *     outbound request as `Authorization: Bearer …`.
 *   - `'NONE'`    — no auth header is injected; tool-static `headers`
 *     are still applied.
 */
export type ToolAuthType = 'FORWARD' | 'NONE';

/**
 * Provenance of the tool definition.
 *   - `'manual'` — created in the Console.
 *   - `'mcp'`    — created via the MCP server (Cursor / 3rd-party MCP
 *                  client). Mutating an `mcp` tool from the Console
 *                  requires an explicit override.
 */
export type ToolSource = 'manual' | 'mcp';

// ============================================================================
// JSON Schema (recursive, for tool input/output shapes)
// ============================================================================

/**
 * Recursive JSON Schema fragment used by tool `inputSchema` /
 * `outputSchema`. Distinct from `JsonSchemaDefinition` in `envelope.d.ts`
 * (which is the narrow root-must-be-object shape used for `/ask`'s
 * `responseFormat: 'json_object'`).
 *
 * Intentionally narrow vs. the full JSON Schema 2020-12 surface — only
 * what EgoX's LLM-side adapter actually consumes. Adding a field here
 * requires updating the adapter in `modules/tool/index.ts` in the
 * same PR.
 */
export interface JsonSchemaWire {
    type: string;
    properties?: Record<string, JsonSchemaPropertyWire>;
    required?: string[];
    additionalProperties?: boolean;
    items?: JsonSchemaWire;
    description?: string;
}

export interface JsonSchemaPropertyWire {
    type: string;
    description?: string;
    enum?: string[];
    items?: JsonSchemaPropertyWire;
    properties?: Record<string, JsonSchemaPropertyWire>;
    required?: string[];
}

// ============================================================================
// ToolWire — the canonical row shape
// ============================================================================

/**
 * Wire-format Tool row. Returned by every `/egox/tools/*` and
 * `/egox/mcp-admin/tools/*` response that produces a Tool.
 *
 * Backend in-process `Tool` is an alias of this type — including the
 * `tenantId` field, which is on the row even though the API caller
 * never sends it (it's derived from API key / JWT context on the
 * request side, but echoed on responses for audit).
 */
export interface ToolWire {
    id: string;
    /**
     * Owning tenant. Present on every response for audit; the request
     * side never carries it (the backend derives tenant from the API
     * key context).
     */
    tenantId: string;
    toolName: string;
    toolDescription: string;
    apiEndpoint: string;
    toolType: ToolType;
    httpMethod: ToolHttpMethod;
    inputSchema: JsonSchemaWire;
    outputSchema: JsonSchemaWire;
    headers: Record<string, string>;
    authType: ToolAuthType;
    retryAttempts: number;
    retryDelayMs: number;
    enabled: boolean;
    /** GraphQL query/mutation string. Required when `toolType === 'GRAPHQL'`. */
    gqlQuery: string | null;
    /** Example input values for LLM reference. */
    exampleInput: Record<string, unknown> | null;
    /** Example output values for LLM reference. */
    exampleOutput: Record<string, unknown> | null;
    /** Total LLM-initiated invocations (denormalized counter). */
    callCount: number;
    successCount: number;
    failureCount: number;
    /**
     * ISO 8601 timestamp of the most recent invocation. `null` when the
     * tool has never been called. The backend in-process formatter
     * emits ISO strings here so wire and runtime shapes agree.
     */
    lastCalledAt: string | null;
    source: ToolSource;
    /**
     * Lowercase header-name allowlist. Headers from the inbound `/ask`
     * request whose name matches an entry are forwarded verbatim to
     * the tool endpoint. Empty array (default) = no inbound header is
     * forwarded — preserves the original safe behavior.
     *
     * Forbidden names (`Cookie`, `Host`, `Authorization`, …) are
     * stripped defensively at execution time even if accidentally
     * listed here.
     */
    forwardHeaders: string[];
    /**
     * Hard cap on how many times this tool may be EXECUTED inside a
     * single `/ask` turn. Dedup cache hits don't count — only real
     * upstream calls. When exceeded, the orchestrator returns a
     * synthetic refusal message to the LLM. Range 1-50, default 5
     * (Phase 5 / Layer 2).
     */
    maxCallsPerTurn: number;
    /** ISO 8601 timestamp. */
    createdAt: string;
    /** ISO 8601 timestamp. */
    updatedAt: string;
}

// ============================================================================
// Request bodies (what the client SENDS)
// ============================================================================

/**
 * Wire body of `POST /egox/tools`. Notable absences:
 *   - `tenantId` — derived from API key context / JWT.
 *   - `enabled` — new tools are always created `enabled: true`.
 *   - counters / `lastCalledAt` — server-managed.
 *   - timestamps                 — server-managed.
 */
export interface ToolCreateBody {
    toolName: string;
    toolDescription: string;
    apiEndpoint: string;
    toolType?: ToolType;
    httpMethod?: ToolHttpMethod;
    inputSchema: JsonSchemaWire;
    outputSchema?: JsonSchemaWire;
    headers?: Record<string, string>;
    authType?: ToolAuthType;
    retryAttempts?: number;
    retryDelayMs?: number;
    /** GraphQL query/mutation. Required when `toolType === 'GRAPHQL'`. */
    gqlQuery?: string;
    exampleInput?: Record<string, unknown>;
    exampleOutput?: Record<string, unknown>;
    /** Provenance. Defaults to `'manual'`. */
    source?: ToolSource;
    forwardHeaders?: string[];
    /** Per-turn execution cap (1-50, default 5). */
    maxCallsPerTurn?: number;
}

/**
 * Wire body of `PUT /egox/tools/:toolId`. Every field is optional —
 * unspecified fields are left untouched (`COALESCE` semantics).
 * `toolId` lives in the URL, not the body; `tenantId` is derived
 * from the auth context.
 */
export interface ToolUpdateBody {
    toolName?: string;
    toolDescription?: string;
    apiEndpoint?: string;
    toolType?: ToolType;
    httpMethod?: ToolHttpMethod;
    inputSchema?: JsonSchemaWire;
    outputSchema?: JsonSchemaWire;
    headers?: Record<string, string>;
    authType?: ToolAuthType;
    retryAttempts?: number;
    retryDelayMs?: number;
    enabled?: boolean;
    gqlQuery?: string;
    exampleInput?: Record<string, unknown>;
    exampleOutput?: Record<string, unknown>;
    source?: ToolSource;
    forwardHeaders?: string[];
    maxCallsPerTurn?: number;
}

// ============================================================================
// Response data shapes (carried inside `EgoxApiResponse.data`)
// ============================================================================

export interface ToolListResponseData {
    tools: ToolWire[];
}

export interface ToolGetResponseData {
    tool: ToolWire;
}

// ============================================================================
// MCP-admin tool preview (`POST /egox/mcp-admin/tools/:name/preview`)
// ============================================================================

/**
 * Single field diff entry for a tool-upsert preview. `oldValue` is
 * `undefined` on a fresh create.
 */
export interface ToolPreviewDiffEntry {
    field: string;
    oldValue: unknown;
    newValue: unknown;
}

/**
 * Response payload of the MCP "preview before upsert" endpoint.
 *
 *   - `action`           — what an unforced PUT would do.
 *   - `requiresForce`    — true when overwriting a `'manual'` tool
 *                          from MCP; the upsert refuses without
 *                          `force: true`.
 *   - `existingSource`   — provenance of the row that would be
 *                          overwritten; null on a fresh create.
 *   - `validationErrors` — flat strings; empty array means the body
 *                          is valid as-is.
 *   - `diff`             — only the fields that would change.
 */
export interface ToolPreview {
    toolName: string;
    action: 'create' | 'update' | 'noop';
    exists: boolean;
    requiresForce: boolean;
    existingSource: ToolSource | null;
    validationErrors: string[];
    diff: ToolPreviewDiffEntry[];
}
