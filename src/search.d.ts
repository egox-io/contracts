/**
 * search.d.ts — unified tenant search (`GET /egox/tenants/:tenantId/search`).
 *
 * Powers the console command-palette's dynamic fallback: when the static page
 * matrix has no match, the palette searches this tenant's tools/endpoints and
 * KB documents by keyword (min 3 chars) and indexes the results client-side.
 */

/** A single searchable entity (tool/endpoint or KB document). */
export interface SearchResultItem {
    type: 'tool' | 'document';
    id: string;
    /** Display name — tool `toolName` or document `title`. */
    title: string;
    /** Secondary line — tool `toolDescription` or document processing status. */
    subtitle?: string;
    tenantId: string;
}

/** Response of `GET /egox/tenants/:tenantId/search?q=<keyword>&limit=<n>`. */
export interface TenantSearchResponseData {
    results: SearchResultItem[];
}
