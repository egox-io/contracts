/**
 * @egox/contracts — `/egox/tenants/*` wire types (project CRUD).
 *
 * `Tenant` is what the Console calls "Project" — same row, two names.
 * The wire shape preserves `snake_case` field names because that's the
 * actual JSON the backend has always emitted and the console has always
 * consumed. Renaming to camelCase here would be a breaking wire change
 * (every API caller would need to update) and is deliberately out of
 * scope for the additive Phase 9 sweep. If/when we ever do that
 * migration, this is the file the major-version bump touches.
 *
 * Drift cleaned up:
 *   - Backend `Tenant` used `Date` for `created_at` / `updated_at` /
 *     `attestation_signed_at`; wire and console already used ISO
 *     strings. Backend `formatTenant` now emits ISO via the same
 *     pattern as Tools and RAG.
 */

// ============================================================================
// Locked vocabularies (mirror DB CHECK constraints)
// ============================================================================

/**
 * Compliance tier (mirrors `egox_tenants.compliance_tier` CHECK
 * constraint, migration 010). Phase 1 services `'standard'` only;
 * the rest are forward-compat for Phase 2.
 */
export type ComplianceTier =
    | 'standard'
    | 'pending_review'
    | 'gdpr'
    | 'hipaa'
    | 'enterprise'
    | 'pending_upgrade';

/**
 * Data residency region (mirrors `egox_tenants.data_residency_region`
 * CHECK constraint, migration 010). Phase 1 deploys only to
 * `'eu-west'`; the rest are forward-compat.
 */
export type DataResidencyRegion =
    | 'us-east'
    | 'us-west'
    | 'eu-west'
    | 'eu-central'
    | 'ap-south'
    | 'ap-east';

/**
 * Operational tenant status (mirrors `egox_tenants.status` CHECK
 * constraint). The legacy `is_active` boolean still exists in
 * Phase 1 and is NOT auto-synced with `status` — both fields are
 * independent until Phase 1.5 deprecates `is_active`.
 */
export type TenantStatus =
    | 'active'
    | 'pending_review'
    | 'flagged'
    | 'suspended'
    | 'terminated';

/**
 * Billing plan (Phase 1.5, two-plan model — migration 035). Drives usage
 * quotas (e.g. monthly /ask limit).
 *
 *   - `id_ego`   — "Id Ego": free, pay-as-you-go via BYOK, capped limits.
 *                  Default for self-service signup.
 *   - `superego` — "Superego": $20/mo, higher (but still capped) limits.
 */
export type TenantPlan = 'id_ego' | 'superego';

/**
 * Industry classification driving the signup gate (Phase 1.5+).
 * The regulated entries (`'healthcare'`, `'finance'`, `'insurance'`,
 * `'government'`, `'legal'`) auto-route new tenants to
 * `status: 'pending_review'`.
 */
export type TenantIndustry =
    | 'saas'
    | 'ecommerce'
    | 'marketing'
    | 'education'
    | 'media'
    | 'travel'
    | 'real_estate'
    | 'productivity'
    | 'other'
    | 'healthcare'
    | 'finance'
    | 'insurance'
    | 'government'
    | 'legal';

// ============================================================================
// TenantWire — the canonical row shape (snake_case on the wire)
// ============================================================================

/**
 * Wire-format tenant row. Returned by every `/egox/tenants/*` response.
 *
 * **Field naming.** This is the only wire shape in the contracts
 * package that uses `snake_case`. It's preserved verbatim from the
 * legacy backend → JSON path because the Console already consumes
 * `snake_case` here too. Treat the inconsistency as fixed-by-history,
 * not a goal — net change would be breaking, with zero behavioural
 * value.
 */
export interface TenantWire {
    id: string;
    name: string;
    /** URL-safe slug, unique per parent (when `parent_tenant_id` is set). */
    slug: string;
    description?: string;
    is_active: boolean;
    /** ISO 8601 timestamp. */
    created_at: string;
    /** ISO 8601 timestamp. */
    updated_at: string;

    // Phase 1 compliance posture (migration 010) ----------------------
    compliance_tier: ComplianceTier;
    data_residency_region: DataResidencyRegion;
    /**
     * UUID of the parent tenant when this row is a sub-project. `null`
     * for top-level tenants. Sub-projects share their parent's
     * `compliance_tier` for billing purposes (enforced at the service
     * layer, not the DB).
     */
    parent_tenant_id: string | null;
    industry: TenantIndustry | null;
    /** ISO 8601 timestamp. `null` until the operator signs an attestation. */
    attestation_signed_at: string | null;
    attestation_version: string | null;
    status: TenantStatus;
    /** Billing plan (migrations 023/035). Drives usage quotas. Default 'id_ego'. */
    plan: TenantPlan;
}

// ============================================================================
// Request bodies (what the client SENDS)
// ============================================================================

/**
 * Wire body of `POST /egox/tenants`.
 *
 * Notable absences:
 *   - `compliance_tier`, `status`     — server-derived from `industry`
 *                                       at signup (Phase 1C / Strategy A).
 *                                       Non-regulated industry →
 *                                       `'standard'` + `'active'`;
 *                                       regulated industry (healthcare,
 *                                       finance, insurance, government,
 *                                       legal) → `'pending_review'` on
 *                                       both. Manual tier moves stay an
 *                                       admin operation via
 *                                       `TenantUpdateBody`.
 *   - `is_active`, timestamps         — server-managed.
 */
export interface TenantCreateBody {
    name: string;
    slug?: string;
    description?: string;

    industry?: TenantIndustry;
    data_residency_region?: DataResidencyRegion;
    parent_tenant_id?: string | null;
    /** ISO 8601 timestamp string the operator submits at signup. */
    attestation_signed_at?: string;
    attestation_version?: string;
}

/**
 * Wire body of `PUT /egox/tenants/:tenantId`. Every field is optional —
 * the backend applies `COALESCE`-style partial updates. `tenantId` is
 * the URL param, not the body.
 *
 * `compliance_tier` and `status` are admin operations; Phase 1 has no
 * role gating on these — Phase 1.5 will introduce admin-only
 * enforcement.
 */
export interface TenantUpdateBody {
    name?: string;
    description?: string;
    is_active?: boolean;

    industry?: TenantIndustry;
    data_residency_region?: DataResidencyRegion;
    parent_tenant_id?: string | null;
    compliance_tier?: ComplianceTier;
    status?: TenantStatus;
    attestation_signed_at?: string;
    attestation_version?: string;
}

// ============================================================================
// Response data shapes (carried inside `EgoxApiResponse.data`)
// ============================================================================

export interface TenantListResponseData {
    tenants: TenantWire[];
}

export interface TenantGetResponseData {
    tenant: TenantWire;
}

/**
 * Returned by `POST /egox/tenants`. Wrapping the row in `tenant`
 * (rather than returning it raw) matches the rest of the create
 * surfaces and keeps room for additive metadata (creation source,
 * downstream side effects, …) without a major version bump.
 */
export interface TenantCreatedResponseData {
    tenant: TenantWire;
}
