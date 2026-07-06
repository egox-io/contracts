/**
 * @egox/contracts — common envelope + shared primitives.
 *
 * Cross-family types that every other contract file ends up importing.
 * Lives in its own file so a future family (RAG, tenants, …) can pull
 * just what it needs without dragging the whole `/ask` surface along.
 *
 * Versioning policy (also in package README, kept here for any reader
 * who lands on this file first):
 *   - Additive optional field → minor bump, non-breaking.
 *   - Rename / remove           → major bump, coordinated release of
 *                                 backend + SDK + MCP + console.
 */

/**
 * Standard envelope every JSON endpoint wraps its response in.
 *   - `status: 'OK'` → success, `data` is present and well-formed.
 *   - `status: 'KO'` → failure, `code` + `message` describe the problem.
 */
export interface EgoxApiResponse<T> {
    status: 'OK' | 'KO';
    data?: T;
    message?: string;
    code?: string;
}

/**
 * What the orchestrator decided this turn was about. Drives prompt /
 * tool selection in the backend; surfaced verbatim to consumers so they
 * can attribute behaviour ("which turns hit RAG?", "which used tools?").
 */
export type Intent = 'vanilla' | 'rag' | 'tools' | 'rag_tools';

/**
 * Output format the LLM was asked to produce.
 *   - `'text'`        → free-form natural language (default).
 *   - `'json_object'` → strict JSON, requires `jsonSchema` on the request.
 */
export type ResponseFormat = 'text' | 'json_object';

/**
 * JSON Schema fragment used for structured-output (`/ask`'s
 * `responseFormat: 'json_object'`). Intentionally narrow: the wire only
 * accepts an object root with named properties — that's what the LLM
 * constrained-decoders expect.
 *
 * NOT the same as the recursive `JsonSchema` shape used by tool
 * input/output definitions (see `tool.d.ts`). Two different surfaces,
 * two different shapes — don't conflate.
 */
export interface JsonSchemaDefinition {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    description?: string;
}

/**
 * Token accounting echoed back on every `/ask` and the `done` SSE frame.
 * Useful for per-call cost attribution on the consumer side.
 */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
