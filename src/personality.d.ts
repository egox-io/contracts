/**
 * @egox/contracts — `/egox/personality/*` and
 * `/egox/tenants/:tenantId/personality/*` wire types.
 *
 * Two related but distinct surfaces share this file:
 *
 *   - **User-level templates** (`/egox/personality/*`). A library of
 *     personality profiles a console user authors and later clones
 *     into specific projects. NOT used at `/ask` resolution time.
 *   - **Project-scoped profiles** (`/egox/tenants/:tenantId/personality/*`,
 *     Item #6 refactor). The single ACTIVE row per tenant drives the
 *     LLM's persona on every `/ask`. Cloned from a template or
 *     authored fresh in the project.
 *
 * Both shapes share `PersonalityTraitsWire` and `PresetType` —
 * cloning a template is a structural copy plus a `templateSourceUserId`
 * / `templateSourceProfileId` pointer.
 *
 * Drift cleaned up:
 *   - Backend `PersonalityProfile` and `TenantPersonalityProfile`
 *     used `Date` for timestamps; wire and console already used ISO.
 *     Backend formatters now match.
 */

// ============================================================================
// Locked vocabularies
// ============================================================================

/**
 * Preset personality archetypes the console offers as starting points.
 * Mirrors the keys of the backend's preset registry. Adding a preset
 * is a one-edit change here + a new entry in the registry; the union
 * fails the build on any consumer that hard-codes the old set.
 */
export type PresetType =
    | 'balanced'
    | 'professional'
    | 'friendly'
    | 'casual'
    | 'expert'
    | 'playful'
    | 'empathetic'
    | 'concise';

// ============================================================================
// Supporting shapes
// ============================================================================

/**
 * The eight personality dials (0-100 each). Used as the active
 * configuration on both user templates and project profiles, and as
 * the slider values the console renders.
 *
 * Each axis is documented relative to its low / high pole — that
 * documentation belongs in the contracts package because it's part
 * of what consumers (the SDK exposing it, future MCP tools surfacing
 * it) need to render the control correctly.
 */
export interface PersonalityTraitsWire {
    /** 0 = serious, 100 = playful. */
    senseOfHumor: number;
    /** 0 = casual, 100 = formal/grave. */
    seriousness: number;
    /** 0 = diplomatic, 100 = blunt. */
    directness: number;
    /** 0 = conventional, 100 = creative. */
    creativity: number;
    /** 0 = neutral, 100 = caring. */
    empathy: number;
    /** 0 = casual, 100 = formal. */
    formality: number;
    /** 0 = brief, 100 = detailed. */
    verbosity: number;
    /** 0 = calm, 100 = energetic. */
    enthusiasm: number;
}

// ============================================================================
// User-level personality template (the templates library)
// ============================================================================

/**
 * Wire-format user-level personality profile. Returned by
 * `/egox/personality/*` endpoints. Owned by a console user and
 * intended to be cloned INTO projects via the tenant-personality
 * clone endpoint.
 *
 * `isActive` here is a per-template "currently authoring this one"
 * flag, NOT the `/ask` resolution flag (that's
 * `TenantPersonalityProfileWire.isActive`).
 */
export interface PersonalityProfileWire {
    id: string;
    userId: string;
    name: string;
    traits: PersonalityTraitsWire;

    customInstructions: string | null;
    exampleResponses: string[];
    avoidPhrases: string[];
    preferredPhrases: string[];

    agentName: string | null;
    agentRole: string | null;
    agentTone: string | null;

    isActive: boolean;
    /** `true` for the immutable seed templates the backend ships with. */
    isPreset: boolean;
    presetType: PresetType | null;

    /** ISO 8601 timestamp. */
    createdAt: string;
    /** ISO 8601 timestamp. */
    updatedAt: string;
}

/**
 * Definition of one immutable seed preset. Returned by the
 * "list presets" endpoint so the console can render the picker
 * without hard-coding the catalogue.
 */
export interface PresetDefinitionWire {
    type: PresetType;
    name: string;
    description: string;
    traits: PersonalityTraitsWire;
    /** Optional emoji / lucide icon name; console-renderer-defined. */
    icon?: string;
}

/**
 * Wire body of `POST /egox/personality/profiles`. `userId` is derived
 * from the console JWT, not the body.
 */
export interface PersonalityProfileCreateBody {
    name: string;
    traits?: Partial<PersonalityTraitsWire>;
    customInstructions?: string;
    exampleResponses?: string[];
    avoidPhrases?: string[];
    preferredPhrases?: string[];
    agentName?: string;
    agentRole?: string;
    agentTone?: string;
}

/**
 * Wire body of `PUT /egox/personality/profiles/:profileId`. Every
 * field is optional; `null` is a meaningful value for the nullable
 * string columns (clears them), `undefined` means "leave alone". The
 * service distinguishes between the two.
 */
export interface PersonalityProfileUpdateBody {
    name?: string;
    traits?: Partial<PersonalityTraitsWire>;
    customInstructions?: string | null;
    exampleResponses?: string[];
    avoidPhrases?: string[];
    preferredPhrases?: string[];
    agentName?: string | null;
    agentRole?: string | null;
    agentTone?: string | null;
}

// ============================================================================
// Project-scoped personality (Item #6 — drives /ask)
// ============================================================================

/**
 * Wire-format project-scoped personality profile. Returned by
 * `/egox/tenants/:tenantId/personality/*`. The single row with
 * `isActive: true` per tenant is what the orchestrator resolves for
 * `/ask`.
 *
 * `templateSourceUserId` and `templateSourceProfileId` are nullable
 * provenance pointers — preserved as `SET NULL` if the source
 * template or its owner is deleted. They power the future "compare
 * against template" UX without coupling project profile lifetime to
 * template lifetime.
 */
export interface TenantPersonalityProfileWire {
    id: string;
    tenantId: string;
    name: string;
    traits: PersonalityTraitsWire;

    customInstructions: string | null;
    exampleResponses: string[];
    avoidPhrases: string[];
    preferredPhrases: string[];

    agentName: string | null;
    agentRole: string | null;
    agentTone: string | null;

    isActive: boolean;

    templateSourceUserId: string | null;
    templateSourceProfileId: string | null;

    /** ISO 8601 timestamp. */
    createdAt: string;
    /** ISO 8601 timestamp. */
    updatedAt: string;
}

/**
 * Wire body of `POST /egox/tenants/:tenantId/personality/profiles`
 * (fresh, no template lineage). `tenantId` is the URL param, not the
 * body.
 */
export interface TenantPersonalityCreateBody {
    name: string;
    traits?: Partial<PersonalityTraitsWire>;
    customInstructions?: string;
    exampleResponses?: string[];
    avoidPhrases?: string[];
    preferredPhrases?: string[];
    agentName?: string;
    agentRole?: string;
    agentTone?: string;
}

/**
 * Wire body of `PUT /egox/tenants/:tenantId/personality/profiles/:profileId`.
 * Same null-vs-undefined semantics as `PersonalityProfileUpdateBody`.
 */
export interface TenantPersonalityUpdateBody {
    name?: string;
    traits?: Partial<PersonalityTraitsWire>;
    customInstructions?: string | null;
    exampleResponses?: string[];
    avoidPhrases?: string[];
    preferredPhrases?: string[];
    agentName?: string | null;
    agentRole?: string | null;
    agentTone?: string | null;
}

/**
 * Wire body of the clone endpoint. `sourceUserId` MUST be the
 * requesting console user (validated server-side); a stolen
 * `sourceProfileId` therefore can't be cloned across user boundaries.
 */
export interface TenantPersonalityCloneBody {
    sourceUserId: string;
    sourceProfileId: string;
    /** Defaults to `${source.name} (cloned)` server-side. */
    name?: string;
}

// ============================================================================
// Resolution envelopes (returned by the "what's active?" endpoints)
// ============================================================================

/**
 * Response of `GET /egox/personality/active`. `isDefault: true`
 * means no user-level profile is selected and the future caller
 * should treat the user as having no template-level preference.
 */
export interface ActivePersonalityWire {
    profile: PersonalityProfileWire | null;
    isDefault: boolean;
}

/**
 * Response of `GET /egox/tenants/:tenantId/personality/active`.
 * `isDefault: true` means no project-level profile is active —
 * `/ask` falls back to the orchestrator's built-in baseline prompt.
 */
export interface ActiveTenantPersonalityWire {
    profile: TenantPersonalityProfileWire | null;
    isDefault: boolean;
}
