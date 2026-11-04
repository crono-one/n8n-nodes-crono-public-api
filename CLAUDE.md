# n8n-nodes-crono-public-api

n8n community node (`@crono-one/n8n-nodes-crono-public-api`, public on npm) that wraps Crono's Public API
(`CronoPublicApi`) as one node, "Crono", plus one credential type. TypeScript, built with `@n8n/node-cli`.

## Layout

- `nodes/CronoPublicApi/CronoPublicApi.node.ts`: the whole node in one file (~9.5k lines). The `description`
  holds every resource, operation and field; `execute()` maps them to HTTP calls in a `switch (resource)`.
  Shared helpers at the top: `cronoApiRequest`, pagination (`getPaginationConfig`, `extractItemsFromResponse`,
  `getTotalCount`), raw-JSON parameters (`useRawJsonData`, `useRawJsonSearch`).
- `nodes/CronoPublicApi/CronoPublicApi.node.json`: codex metadata (category, docs links). `crono.svg`: icon.
- `credentials/CronoPublicApi.credentials.ts`: credential type `cronoPublicApi`.
- `package.json` `n8n` block registers the compiled `dist/` node and credential; only `dist` is published.

## Resources and the endpoints they call

Node resource names differ from the API's: company → `Accounts`, contact → `Prospects`, deal →
`Opportunities`, list → `CronoLists`, sequence → `Strategies`. The rest map by name: `Activities`, `Notes`,
`Tasks`, `Pipelines`, `Templates`, `ExternalProperties/search`, `Users`, `Import`, `Sync`.
The path is `/api/v<apiVersion>/<Controller>[/…]`; `apiVersion` is a node parameter, default `1`.

- company, contact: create, get, getAll, import, search, sync, update (deal: the same without import)
- list: create, get, update, delete, search, add/remove companies, contacts, sequences, templates
- sequence: create, search, searchDetails, addContacts, stopContactSequence
- note: create, get, getAll, search. task: create, search. activity, user: get, getAll, search
- template: get, search. import, sync: get, getAll. pipeline: getAll. externalProperty: search

`CronoPublicApi` controllers with no node resource: `Calls`, `Status`.
The README's operation list is older than the code (no Sync, list or sequence writes); trust the code.

## Credentials and auth

Credential `cronoPublicApi` has three fields: `baseUrl` (optional override; empty means
`https://ext.crono.one`), `apiKey`, `apiSecret`. Requests go through `httpRequestWithAuthentication`, which
adds the `X-Api-Key` and `X-Api-Secret` headers. The credential test calls `GET /api/v1/Users`.

## Keeping in sync with CronoPublicApi

When a Public API endpoint changes, read `CronoPublicApi/CronoPublicApi/Controllers/<Name>Controller.cs`
(routes are `api/v{version:apiVersion}/[controller]`) and its DTOs under
`CronoPublicApi/PublicApi.Core/Common/DTOs/`, then update both the field definitions in `description` and
the matching `case` in `execute()`. Query flags such as `WithUser`, `WithTags`, `WithExternalValuesNoTags`
are exposed as per-operation boolean toggles and must match the API's parameter names exactly.

## Commands

- `npm run build` (`n8n-node build`), `npm run build:watch` (`tsc --watch`)
- `npm run dev` (`n8n-node dev`: local n8n with the node loaded)
- `npm run lint` / `npm run lint:fix` (`n8n-node lint`, n8n community-node ESLint rules; `strict: true`
  in the `n8n` block)
- No test script and no test files.

Node version: no `.nvmrc` or `engines`. CI runs Node 22, the release workflow Node 24.

## CI and release

- `ci.yml`: on PRs to `develop` or `master`, `npm ci`, lint, build.
- `pr-title-lint.yml`: PRs to `master` only. Title must be Conventional Commits with one of `feat`, `fix`,
  `chore`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`; scope optional; subject 1-80 chars.
- `cd.yml`: on push to `master`. Lint, build, then picks the bump from commit messages since the last tag:
  `BREAKING CHANGE` or `type!:` → major, `feat:` → minor, `fix:` → patch, anything else → no release.
  It runs `npm version`, regenerates `CHANGELOG.md` (conventional-changelog), commits
  `chore(release): vX.Y.Z [skip ci]` and tags on `master`, then `npm publish --provenance --access public`.
- So only `feat`/`fix` commits on `develop` ship anything, and the released version lives on `master`:
  `develop`'s `package.json` can lag behind. Do not bump the version or edit `CHANGELOG.md` by hand.
- `npm run release` (`n8n-node release`) and the `semantic-release`/`release-it` devDependencies are not
  used by `cd.yml`.
