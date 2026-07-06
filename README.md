# @egox/contracts

Wire-format TypeScript contracts shared by every EgoX surface — backend,
SDK (`@egox/client`), MCP server, and console. **Types only**, no runtime
exports. Published to npm as [`@egox/contracts`](https://www.npmjs.com/package/@egox/contracts) so every surface can pin the same version.

## Why this exists

The `answer === undefined` bug in `@egox/client@1.1.0` was caused by the
SDK's response decoder reading `data.response` while the backend was
writing `data.answer`. Two parallel hand-maintained interface sets in two
packages, drifting silently — exactly the failure mode this package is
designed to make impossible.

Anything that crosses the network between EgoX components is declared
here once. Backend response builders and SDK decoders both reference the
same `AskResponseData` interface, so a field rename is a one-edit change
that the TypeScript compiler enforces across the stack.

## Why types-only

`import type { … } from '@egox/contracts'` is fully erased by `tsc` /
`tsup`. That means:

- **Zero runtime cost.** No JS file is ever required. End users of
  `@egox/client` see no `@egox/contracts` in their `node_modules`.
- **No path-alias-at-runtime headaches.** Path resolution only matters at
  compile time; `dist` output has no leftover references.
- **No publish.** This package is `private: true` and is consumed via
  tsconfig `paths` only.

If you need a runtime constant (e.g. `SDK_RESERVED_HEADERS`,
`HEADER_FORWARD_BLOCKLIST`), keep it in the package that actually uses it
and add a `// must mirror @egox/contracts` comment if it shadows a contract.

## How to consume it

In any package that needs the wire types, add to its `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@egox/contracts": ["../egox-contracts/src"]
    }
  }
}
```

Adjust the relative path if the package isn't a sibling of `egox-contracts/`.
Then in code:

```ts
import type { AskRequestBody, AskResponseData, AskStreamEvent } from '@egox/contracts';
```

`tsup`-built packages (`@egox/client`) inline the imported types into
their generated `.d.ts` automatically — end users see the types as if
they were declared in the SDK itself.

## When to bump

- **Adding** an optional field — non-breaking, no version bump required
  (still good practice to bump the minor).
- **Renaming or removing** a field — breaking, bump major **and** ship a
  coordinated update of backend + SDK + MCP in one release.
- **Adding** a new SSE event variant to `AskStreamEvent` — non-breaking
  for producers (backend just starts emitting it), breaking for consumers
  who exhaustively switch on `event.type` and rely on `never` checks. Bump
  the minor and call it out in the release notes.

## What's in scope today

- `EgoxApiResponse<T>` envelope
- `/ask` request + response (`AskRequestBody`, `AskResponseData`)
- `/ask/stream` request + full SSE event union
- Common building blocks: `Intent`, `ResponseFormat`, `TokenUsage`,
  `JsonSchemaDefinition`

What's **not** in scope yet (planned, see TODOs in each module):

- Tool CRUD wire shapes (`/tools/*`)
- RAG document wire shapes (`/rag/*`)
- API key / MCP token wire shapes (`/api-keys/*`, `/mcp-tokens/*`)
- Tenant / project wire shapes

These will be migrated incrementally as we touch them.
