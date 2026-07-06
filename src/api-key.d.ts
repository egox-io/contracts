/**
 * @egox/contracts — `/egox/tenants/:tenantId/api-keys/*` wire types.
 *
 * Per-project API keys (the `egox_live_*` / `egox_test_*` credentials
 * the SDK and any service calling the public `/ask` API present as
 * `Authorization: Bearer <key>`).
 *
 * Drift cleaned up here:
 *   - Backend's `ApiKeyInfo` used `Date` for `expiresAt` / `lastUsedAt`
 *     / `createdAt`; the wire (and the Console mirror) already used
 *     ISO strings. Backend now matches via `formatKeyInfo` + ISO emit.
 *   - The console hand-maintained an `ApiKeyScope` union that mirrored
 *     the backend's `API_KEY_SCOPES` constant. The union now lives here
 *     once and both surfaces re-export.
 */

// ============================================================================
// Locked vocabularies
// ============================================================================

/**
 * Scopes a per-project API key can hold. Mirrors `API_KEY_SCOPES` in
 * `backend/egox/modules/tenant-api-key/constants.ts` — adding a new
 * scope is a one-edit change here (plus the backend constant) and
 * propagates to console + SDK at compile time.
 *
 *   - `'ask'`           — call the `/ask` and `/ask/stream` endpoints.
 *   - `'rag:read'`      — read knowledge-base documents.
 *   - `'rag:write'`     — create / update / delete KB documents.
 *   - `'tools:read'`    — read tool definitions.
 *   - `'tools:write'`   — create / update / delete tools.
 *   - `'threads:read'`  — read conversation threads.
 *   - `'admin'`         — full access (implies every scope above).
 */
export type ApiKeyScope =
    | 'ask'
    | 'rag:read'
    | 'rag:write'
    | 'tools:read'
    | 'tools:write'
    | 'threads:read'
    | 'admin';

// ============================================================================
// ApiKeyWire — the canonical row shape (no secrets)
// ============================================================================

/**
 * Public-facing API key info. Returned by every
 * `GET /egox/tenants/:tenantId/api-keys` and
 * `GET /egox/tenants/:tenantId/api-keys/:keyId` response.
 *
 * Carries NO secret material — only the hashed-prefix display value.
 * The raw key is exposed exactly once on create / rotate via
 * `ApiKeyCreatedWire`; there is no endpoint that returns it again.
 *
 * Timestamps are ISO 8601 strings (backend's `formatKeyInfo` emits
 * ISO to match the wire — verified by re-anchor in Phase 9.3).
 */
export interface ApiKeyWire {
    id: string;
    tenantId: string;
    name: string;
    /**
     * Public-display prefix of the raw key (the part the SDK shows in
     * connection-test errors, e.g. `egox_live_abc12345`). Safe to log;
     * the full key is unrecoverable from this value.
     */
    keyPrefix: string;
    scopes: ApiKeyScope[];
    expiresAt: string | null;
    isActive: boolean;
    /**
     * Server-computed convenience flag: `true` when `expiresAt` is in
     * the past. Saves consumers from re-implementing the comparison
     * (and from forgetting timezone handling on it).
     */
    isExpired: boolean;
    lastUsedAt: string | null;
    /**
     * Total successful authentications using this key. Denormalised
     * counter, updated by the auth middleware on every accepted
     * request.
     */
    usageCount: number;
    createdAt: string;
}

/**
 * Returned exactly once at creation / rotation. The raw `apiKey`
 * string is unrecoverable afterwards — only the SHA-256 hash and
 * prefix are persisted server-side. Consumers MUST surface the value
 * to the human operator immediately and clear it from memory after
 * confirmation.
 */
export interface ApiKeyCreatedWire {
    /** Raw key — show once, then forget. */
    apiKey: string;
    keyId: string;
    keyPrefix: string;
    name: string;
    scopes: ApiKeyScope[];
    expiresAt: string | null;
    createdAt: string;
}

// ============================================================================
// Request bodies (what the client SENDS)
// ============================================================================

/**
 * Wire body of `POST /egox/tenants/:tenantId/api-keys`. `tenantId`
 * is the URL param, not the body.
 */
export interface ApiKeyCreateBody {
    name: string;
    scopes?: ApiKeyScope[];
    /**
     * Optional TTL in days. Omit (or `undefined`) for never-expiring.
     * Server caps at `MAX_EXPIRY_DAYS` from
     * `backend/egox/modules/tenant-api-key/constants.ts`.
     */
    expiresInDays?: number;
}

/**
 * Wire body of `POST /egox/tenants/:tenantId/api-keys/:keyId/rotate`.
 * Rotation generates a new raw key (returned in `ApiKeyCreatedWire`)
 * and revokes the old one. The `name` defaults to the old key's name.
 */
export interface ApiKeyRotateBody {
    name?: string;
}

// ============================================================================
// Response data shapes (carried inside `EgoxApiResponse.data`)
// ============================================================================

export interface ApiKeyListResponseData {
    keys: ApiKeyWire[];
}

export interface ApiKeyGetResponseData {
    key: ApiKeyWire;
}

/**
 * Returned by both `POST /egox/tenants/:tenantId/api-keys` (create)
 * and `POST /egox/tenants/:tenantId/api-keys/:keyId/rotate`. Wraps
 * `ApiKeyCreatedWire` so the response data shape is consistent with
 * `ApiKeyGetResponseData` / `ApiKeyListResponseData`.
 */
export interface ApiKeyCreatedResponseData {
    key: ApiKeyCreatedWire;
}
