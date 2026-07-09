/**
 * @egox/contracts
 *
 * Wire-format type contracts shared between every EgoX surface that talks
 * over HTTP / SSE — the backend (`backend/egox`), the Node SDK
 * (`@egox/client`), the MCP server (`egox-mcp`), and the console.
 *
 * **Types only.** This file (and every file it re-exports) deliberately
 * exports nothing at runtime so consumers can
 * `import type { ... } from '@egox/contracts'` and pay zero bundle cost,
 * and so a missing path-alias in one tsconfig can never cause a runtime
 * ReferenceError. Per-package runtime constants (e.g.
 * `SDK_RESERVED_HEADERS` in the SDK, `HEADER_FORWARD_BLOCKLIST` on the
 * backend) live next to the code that needs them.
 *
 * **Single source of truth.** Field names and shapes here are
 * authoritative for the wire. Backend response builders, SDK decoders,
 * and MCP previews MUST conform to these types — that is what prevents
 * the kind of silent `answer === undefined` bug we hit when the SDK was
 * reading `.response` while the backend was writing `.answer`.
 *
 * **Layout.** One file per endpoint family (Phase 9):
 *   - `envelope.d.ts` — `EgoxApiResponse`, `Intent`, `ResponseFormat`,
 *                        `JsonSchemaDefinition`, `TokenUsage`.
 *   - `ask.d.ts`      — `AskRequestBody`, `AskStreamRequestBody`,
 *                        `AskResponseData`.
 *   - `stream.d.ts`   — full `AskStreamEvent` discriminated union +
 *                        every variant.
 *   - `tool.d.ts`     — `ToolWire`, `ToolCreateBody`, `ToolUpdateBody`,
 *                        `ToolListResponseData`, `ToolGetResponseData`,
 *                        `ToolPreview`, vocabularies (`ToolType`,
 *                        `ToolHttpMethod`, `ToolAuthType`, `ToolSource`),
 *                        recursive `JsonSchemaWire`.
 *   - `rag.d.ts`      — `RagDocumentWire`, `RagDocumentCreateBody`,
 *                        `RagDocumentUpsertByTitleBody`,
 *                        `RagDocumentListResponseData`,
 *                        `RagDocumentGetResponseData`,
 *                        `RagDocumentUpsertResponseData`, vocabularies
 *                        (`RagDocumentSourceType`, `RagProcessingStatus`,
 *                        `RagDocumentSource`).
 *   - `api-key.d.ts`  — `ApiKeyWire`, `ApiKeyCreatedWire`,
 *                        create / rotate bodies, list / get / created
 *                        response data, vocabulary (`ApiKeyScope`).
 *   - `mcp-token.d.ts` — `McpTokenWire`, `McpTokenCreatedWire`, create
 *                        body, list / get / created response data,
 *                        vocabulary (`McpTokenScope`).
 *   - `tenant.d.ts`   — `TenantWire` (snake_case on the wire — see
 *                        the file header), create / update bodies,
 *                        list / get / created response data,
 *                        vocabularies (`ComplianceTier`,
 *                        `DataResidencyRegion`, `TenantStatus`,
 *                        `TenantIndustry`).
 *   - `thread.d.ts`   — `ThreadWire`, `MessageWire`,
 *                        `ThreadWithStatsWire`, `ThreadWithMessagesWire`,
 *                        `ToolCallWire`, list / get response data,
 *                        vocabularies (`MessageRole`,
 *                        `MessageFailureReason`).
 *   - `personality.d.ts` — Both surfaces share this file. User-level:
 *                        `PersonalityProfileWire`, `PresetDefinitionWire`,
 *                        create / update bodies, `ActivePersonalityWire`.
 *                        Project-scoped: `TenantPersonalityProfileWire`,
 *                        create / update / clone bodies,
 *                        `ActiveTenantPersonalityWire`. Shared:
 *                        `PersonalityTraitsWire`, `PresetType`.
 *   - `user-memory.d.ts` — Per-end-user learning (Phase 15 / exURM).
 *                        `UserMemoryWire`, `UserMemoryUserSummaryWire`,
 *                        `UpdateUserMemoryFactBody`, list / detail / fact /
 *                        forget response data, vocabularies (`UserMemoryKind`,
 *                        `UserMemoryStatus`, `UserMemorySource`).
 *
 * This barrel re-exports everything so existing consumers' import paths
 * (`import type { AskResponseData } from '@egox/contracts'`) keep
 * working unchanged. Adding a new family is a single-file change here
 * plus a new `export *` line below.
 *
 * **Versioning.**
 *   - Additive optional field → minor bump, non-breaking.
 *   - Rename / remove          → major bump, coordinated release of
 *                                backend + SDK + MCP + console.
 */

export * from './envelope';
export * from './ask';
export * from './stream';
export * from './tool';
export * from './rag';
export * from './api-key';
export * from './mcp-token';
export * from './mcp-connection';
export * from './tenant';
export * from './thread';
export * from './personality';
export * from './user-memory';
export * from './search';
