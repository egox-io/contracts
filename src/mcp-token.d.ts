/**
 * @egox/contracts — `/egox/tenants/:tenantId/mcp-tokens/*` wire types.
 *
 * Per-tenant developer tokens (the `egox_mcp_*` credentials Cursor
 * presents to the EgoX MCP server). Each token is short-lived,
 * tenant-scoped, and revocable.
 *
 * Structurally similar to `api-key.d.ts` but a distinct family:
 *   - MCP tokens have a smaller scope vocabulary (no `'ask'`, no
 *     `'threads:read'`, no `'admin'`).
 *   - MCP tokens carry a `revokedAt` audit field that API keys don't.
 *   - MCP tokens have `createdByUserId` provenance (which console
 *     user issued it).
 */

// ============================================================================
// Locked vocabularies
// ============================================================================

/**
 * Scopes an MCP token can hold. Mirrors `MCP_SCOPES` in
 * `backend/egox/modules/mcp/token/constants.ts`. The MCP server
 * enforces these in its tool router; the backend re-enforces on
 * every admin route call.
 */
export type McpTokenScope =
    | 'tools:read'
    | 'tools:write'
    | 'rag:read'
    | 'rag:write';

// ============================================================================
// McpTokenWire — the canonical row shape (no secrets)
// ============================================================================

/**
 * Public-facing MCP token info. Returned by every
 * `GET /egox/tenants/:tenantId/mcp-tokens` and
 * `GET /egox/tenants/:tenantId/mcp-tokens/:tokenId` response.
 *
 * Carries NO secret material — only the display prefix
 * (`egox_mcp_abc12345…`). The raw token is exposed exactly once
 * on create / rotate via `McpTokenCreatedWire`; there is no endpoint
 * that returns it again.
 *
 * Timestamps are ISO 8601 strings (backend's `formatTokenInfo` emits
 * ISO to match the wire — verified by re-anchor in Phase 9.4).
 */
export interface McpTokenWire {
    id: string;
    tenantId: string;
    name: string;
    /** Public-display prefix; safe to log. */
    tokenPrefix: string;
    scopes: McpTokenScope[];
    expiresAt: string | null;
    /**
     * When the token was revoked. `null` while active. Distinct from
     * `expiresAt`: revocation is a deliberate user action and
     * recorded immediately; expiration is server-clock natural decay.
     */
    revokedAt: string | null;
    /** Server-computed: `true` when `expiresAt` is in the past. */
    isExpired: boolean;
    /**
     * Server-computed convenience flag — `true` only when
     * `revokedAt === null && !isExpired`. Console badge logic should
     * branch on this rather than re-deriving from the raw fields.
     */
    isActive: boolean;
    lastUsedAt: string | null;
    /**
     * Total successful authentications using this token. Denormalised
     * counter updated by the MCP auth middleware on every accepted
     * SSE connection.
     */
    usageCount: number;
    /**
     * Console user who issued the token. `null` for tokens minted
     * via system / migration paths (none today; future-proof).
     */
    createdByUserId: string | null;
    createdAt: string;
}

/**
 * Returned exactly once at creation. The raw `token` is unrecoverable
 * afterwards — only the SHA-256 hash and prefix are persisted
 * server-side. Same one-shot contract as `ApiKeyCreatedWire`.
 */
export interface McpTokenCreatedWire {
    /** Raw token — show once, then forget. */
    token: string;
    id: string;
    tenantId: string;
    name: string;
    tokenPrefix: string;
    scopes: McpTokenScope[];
    expiresAt: string | null;
    createdAt: string;
}

// ============================================================================
// Request bodies (what the client SENDS)
// ============================================================================

/**
 * Wire body of `POST /egox/tenants/:tenantId/mcp-tokens`. `tenantId`
 * is the URL param; `createdByUserId` is derived from the console
 * JWT on the request side.
 */
export interface McpTokenCreateBody {
    name: string;
    scopes?: McpTokenScope[];
    /** Optional TTL in days. Server caps at `MAX_EXPIRY_DAYS`. */
    expiresInDays?: number;
}

// ============================================================================
// Response data shapes (carried inside `EgoxApiResponse.data`)
// ============================================================================

export interface McpTokenListResponseData {
    tokens: McpTokenWire[];
}

export interface McpTokenGetResponseData {
    token: McpTokenWire;
}

export interface McpTokenCreatedResponseData {
    token: McpTokenCreatedWire;
}
