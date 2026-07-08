/**
 * @egox/contracts — `/egox/tenants/:tenantId/mcp-connections` wire types.
 *
 * Live MCP *presence*: which IDE/CLI sessions are connected to the standalone
 * EgoX MCP server for a tenant right now. Distinct from `mcp-token.d.ts` —
 * a token is a long-lived credential; a connection is an ephemeral session
 * that a token authenticated. The MCP server reports lifecycle best-effort
 * (connect + ~30s heartbeat); records age out server-side after ~90s of
 * silence, so this list is inherently "as of the last heartbeat".
 *
 * Mirrors `McpConnectionInfo` in
 * `backend/egox/modules/mcp/connection/interfaces.ts` (the wire projection
 * that drops the internal `expiresAt`).
 */

/** The connecting IDE/CLI, from the MCP `initialize` handshake, if known. */
export interface McpConnectionClientInfo {
    /** e.g. "cursor", "claude-code", "windsurf". */
    name?: string;
    version?: string;
}

/**
 * One live MCP session as reported by the MCP server. Timestamps are ISO 8601
 * strings. No secrets — `tokenId`/`tokenName` identify *which* token opened the
 * session (so the console can tie a live agent back to a row in the tokens
 * list) but never expose the token material.
 */
export interface McpConnectionInfo {
    sessionId: string;
    tenantId: string;
    /** The MCP token that authenticated this session. */
    tokenId: string;
    tokenName: string;
    client?: McpConnectionClientInfo;
    transport?: 'streamable-http' | 'sse';
    /** Source IP of the connecting agent, if the MCP server reported it. */
    remoteAddr?: string;
    userAgent?: string;
    /** When the session first connected. */
    connectedAt: string;
    /** ISO timestamp of the most recent heartbeat. Drives live/stale status. */
    lastSeenAt: string;
}

/** Response data of `GET /egox/tenants/:tenantId/mcp-connections`. */
export interface McpConnectionListResponseData {
    connections: McpConnectionInfo[];
}
