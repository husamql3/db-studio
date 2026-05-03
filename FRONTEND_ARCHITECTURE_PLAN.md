# Frontend Architecture Improvement Plan

Scope: current frontend package (`packages/core`), targeted to become `packages/web`.

This plan assumes the frontend will evolve from a single Vite React package into a
scalable monorepo architecture with shared UI, internal feature modules, and a future desktop
application.

The first packaging cleanup is to rename the current `core` package to `web`. The package
is the web app, not shared core logic, so `web` is clearer once `ui`, `desktop`, and
feature boundaries exist.

---

## Revamp TODO

> **Goal**: Turn the current frontend package into a feature-first web app with extractable
> UI primitives, stable data/client boundaries, and a future desktop host path.
>
> **Scope**: Frontend architecture only. Server, proxy, and shared contracts should only
> change when package references or import paths require it.
>
> **Approach**: Incremental. Each phase should preserve runtime behavior and be reviewable
> on its own.

### Phase 0 — Rename Core Package to Web

- [ ] Rename `packages/core` to `packages/web`
  - Keep source structure intact during the rename
  - Update workspace package references and package name to `web` or `@db-studio/web`
  - Update root scripts, Turbo pipeline inputs, Vite config references, and docs
  - Update dev-server wording from "core" to "web app"

- [ ] Update import aliases and generated metadata after the rename
  - Preserve `@/` as the web package's local `src` alias
  - Keep `shared` / `shared/types` imports unchanged
  - Update `components.json`, TypeScript project references, and package paths

- [ ] Run verification after the rename
  - `bun run typecheck`
  - `bun run build`
  - `bun run format`

### Phase 1 — Safe Refactors

- [ ] Create `src/shared/api` and move endpoint functions there
- [ ] Add query-key factories for databases, tables, schema, records, and query runner
- [ ] Keep current hooks but make them call API functions and query-key factories
- [ ] Replace mutable Axios `dbType` module state with an `ApiClient` instance
- [ ] Split `TableTab` into container, grid, empty state, and error state components
- [ ] Move TanStack Table model setup into `useTableModel`
- [ ] Standardize mutation feedback with `toast.promise`
- [ ] Remove debug `console.log` calls from feature components and stores
- [ ] Replace unstable pending cell edit keys with a scoped edit key

### Phase 2 — Extract UI Package

- [ ] Create `packages/ui`
- [ ] Move primitive components from the web package's `src/components/ui`
- [ ] Move `cn` and shared token CSS into `packages/ui`
- [ ] Update app imports to `@db-studio/ui`
- [ ] Update `components.json` aliases
- [ ] Keep the web app importing UI CSS during the transition
- [ ] Add Storybook for isolated component states
- [ ] Add stories for dense controls, sheets/dialogs, table controls, spinner, and empty/error states
- [ ] Move generic `DataGrid` after primitives are stable

### Phase 3 — Introduce Internal Feature Modules

- [ ] Create `src/features/database`
- [ ] Create `src/features/query-runner`
- [ ] Create `src/features/schema`
- [ ] Create `src/features/table-builder`
- [ ] Create `src/features/tables`
- [ ] Create `src/features/records`
- [ ] Create `src/features/chat`
- [ ] Move routes to render feature entry points only
- [ ] Replace global `sheet.store.ts` with an overlay registry
- [ ] Keep feature draft state feature-local
- [ ] Enforce internal dependency rules before extracting more packages

### Phase 4 — Add Desktop Package

- [ ] Add `packages/desktop` with Tauri
- [ ] Build the web app as renderer assets
- [ ] Introduce a `Transport` interface in the internal client boundary
- [ ] Implement web transport over the existing HTTP API
- [ ] Implement first desktop transport milestone over localhost
- [ ] Keep native menus, secure storage, filesystem, and sidecar lifecycle behind Tauri commands

### Phase 5 — Hardening & Documentation

- [ ] Update `AGENTS.md` / `CLAUDE.md` frontend architecture references from `core` to `web`
- [ ] Document package ownership and dependency direction
- [ ] Add architecture notes for feature modules and shared API/query layers
- [ ] Run `bun run typecheck`
- [ ] Run `bun run build`
- [ ] Run `bun run format`

---

## 1. Current Issues

The current frontend stack is solid: Vite, React 19, TanStack Router, TanStack Query,
TanStack Table, Zustand, Tailwind v4, and shadcn-style primitives. The architectural
issue is that `packages/core` currently owns too many responsibilities at once:

- app shell and routing
- feature screens
- reusable UI primitives
- API transport
- query hooks
- mutation feedback
- global and feature state
- workflow orchestration

Concrete issues found in `packages/core`:

- `src/components` is organized by broad UI areas, not stable feature boundaries:
  `table-tab`, `schema-tab`, `add-table`, `runnr-tab`, `sidebar`, `chat`, `data-grid`,
  and `ui` all live together.
- `src/hooks` is a flat folder of feature/API hooks. Query keys, endpoint paths, cache
  invalidation, selected database lookup, toasts, and feature behavior are mixed.
- The root route imports feature UI directly. `AddTableForm` is mounted globally from
  `src/routes/__root.tsx`, coupling the app shell to the table-builder feature.
- `src/lib/api.ts` uses mutable module state for `dbType` and mutates Axios `baseURL`.
  This couples transport behavior to browser runtime assumptions and makes desktop
  transport harder.
- `useTableData` mixes URL state, Zustand state, query-key construction, request
  serialization, endpoint knowledge, and React Query behavior.
- `TableTab` combines container logic, table model creation, presentation, error
  mapping, row selection, edit focus, and feature layout.
- `sheet.store.ts` is a global union of sheets across unrelated features.
- `update-cell.store.ts` keys edits by `rowData.id ?? JSON.stringify(rowData)`, which is
  unstable for tables without `id`, duplicate rows, composite keys, and cross-table edits.
- UI primitives are extractable, but app and feature components still rely on many
  hard-coded `zinc`, `black`, sizing, and border classes instead of semantic tokens.

## 2. Proposed Architecture

Move toward a feature-first, layered architecture:

```txt
app shell
  -> feature modules
    -> data/query client
    -> shared UI
    -> shared types/utils
```

Recommended interim shape inside the web package before package extraction:

```txt
packages/web/src/
  app/
    providers/
    router/
    shell/
    overlays/
  features/
    database/
    tables/
    schema/
    records/
    query-runner/
    table-builder/
    chat/
  shared/
    api/
    query/
    stores/
    url-state/
    errors/
  ui/
    primitives/
    data-grid/
```

Rules:

- Routes bind URL params and render feature entry points only.
- Feature screens own their local components, hooks, queries, stores, and schemas.
- Shared UI does not import router, API clients, Zustand stores, or feature types.
- API functions are pure transport wrappers.
- Query hooks compose API functions, query-key factories, and React Query.
- Mutation hooks should expose operations; feedback should be standardized with
  `toast.promise`.
- Global Zustand is limited to app-wide state: selected database, preferences, overlay
  registry.
- Feature draft state stays feature-local.

## 3. Package Structure

Initial target package layout:

```txt
packages/
  web/
  ui/
  desktop/
  shared/
  server/
  proxy/
```

Package responsibilities:

- `web`: web app shell, router, providers, top-level layout, route composition.
- `ui`: design tokens, primitives, generic layout/display components, Storybook.
- `desktop`: Tauri host app and platform-specific desktop integration.
- `shared`: existing backend/frontend contracts, constants, and Zod schemas.
- `server`: existing Hono API server and CLI.
- `proxy`: existing Cloudflare Workers proxy.

Important sequencing rule:

- Start with `web`, `ui`, `desktop`, `shared`, `server`, and `proxy`.
- Do not create `packages/features/*`, `packages/data-client`, or `packages/utils` as
  first-step packages.
- Keep feature modules and data-client boundaries inside the web package first.
- Extract additional packages only after imports and ownership boundaries are stable.

Allowed dependency direction:

```txt
web -> ui
web -> shared
desktop -> web
desktop -> ui
desktop -> shared
ui -> shared only for shared type imports, if unavoidable
server -> shared
proxy -> shared
```

Avoid:

- `ui -> web`
- `ui -> desktop`
- `ui -> server`
- `ui -> proxy`
- `web -> desktop`
- `web -> server`
- `web -> proxy`
- circular imports between `web` and `ui`

Later package evolution, only after the initial layout is stable:

```txt
packages/
  data-client/
  features/
    database/
    tables/
    records/
    schema/
    query-runner/
    table-builder/
    chat/
  utils/
```

These later packages are useful, but they should not be part of the first extraction.
Until then, use internal folders in the web package:

```txt
packages/web/src/
  features/
  shared/api/
  shared/query/
  shared/utils/
```

## 4. UI System Design

Start with a `packages/ui` extraction from the web package's `src/components/ui`, `cn`, and
shared token CSS.

Proposed structure:

```txt
packages/ui/
  src/
    styles/
      tokens.css
      theme.css
    primitives/
      button.tsx
      dialog.tsx
      sheet.tsx
      select.tsx
      input.tsx
      tooltip.tsx
    data-display/
      data-grid/
    feedback/
      toast.tsx
      spinner.tsx
    hooks/
      use-controllable-state.ts
    index.ts
```

Token categories:

```css
:root {
  --dbs-bg-app: ...;
  --dbs-bg-panel: ...;
  --dbs-bg-elevated: ...;
  --dbs-border-subtle: ...;
  --dbs-text-primary: ...;
  --dbs-text-muted: ...;
  --dbs-accent: ...;
  --dbs-danger: ...;
  --dbs-radius-sm: 4px;
  --dbs-control-height-sm: 24px;
  --dbs-control-height-md: 28px;
}
```

Component conventions:

- named exports only
- `asChild` for polymorphic primitives
- `variant`, `size`, and `density` via CVA
- controlled APIs use `open/onOpenChange` and `value/onValueChange`
- UI package never imports API, router, feature stores, or feature types
- UI package does not execute app toasts directly

Extraction order:

1. Move `cn`, primitive components, and token CSS.
2. Update app imports to `@db-studio/ui`.
3. Add Storybook for isolated states.
4. Move generic `DataGrid`.
5. Keep database-specific table cells, FK drawers, schema badges, and record editors in
   feature packages.

## 5. Desktop Strategy

Use Tauri as the default desktop host.

Why Tauri:

- The frontend already compiles to Vite assets.
- The app benefits from smaller desktop bundles.
- Native integration can be introduced through explicit commands.
- A database studio should keep filesystem, credentials, process management, and native
  APIs behind a strict boundary.

Use Electron only if bundled Chromium consistency, heavy Node-native access, or a mature
Electron plugin ecosystem becomes more important than bundle size and boundary strictness.

Proposed desktop package:

```txt
packages/desktop/
  src-tauri/
    src/
      main.rs
      commands/
        sidecar.rs
        file_system.rs
        secrets.rs
    tauri.conf.json
  src/
    main.ts
    platform/
      desktop-transport.ts
      desktop-shell.ts
```

Shared between web and desktop:

- React feature modules
- shared UI package
- query-key factories
- typed API/domain contracts
- parsing utilities

Desktop-specific:

- native menus
- auto-update
- export/import file dialogs
- secure credential storage
- local server sidecar lifecycle
- OS-level clipboard and filesystem permissions

Introduce transport inversion before adding desktop:

```ts
export interface Transport {
  request<T>(input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    params?: Record<string, string | undefined>;
    body?: unknown;
  }): Promise<T>;
}
```

Web transport can wrap Axios. Desktop transport can later wrap Tauri `invoke`, a localhost
sidecar, or a hybrid.

## 6. Migration Plan

### Phase 0: Rename Core to Web

Goal: make package ownership explicit before extracting more frontend architecture.

- Rename `packages/core` to `packages/web`.
- Rename the package to `web` or `@db-studio/web`.
- Update workspace references, root scripts, Turbo config, TypeScript references, Vite
  config, docs, and generated metadata.
- Keep runtime code unchanged during this phase.

Risk: broken workspace or script references.

Mitigation: do the rename as a mechanical-only change and verify with typecheck, build,
and format.

### Phase 1: Safe Refactors

Goal: introduce boundaries without changing runtime behavior.

- Create `src/shared/api` and move endpoint functions there.
- Add query-key factories for tables, schema, records, databases, and query runner.
- Keep current hooks but make them call API functions and key factories.
- Split `TableTab` into:
  - `TableTabContainer`
  - `TableGrid`
  - `TableEmptyState`
  - `TableErrorState`
- Move table model setup into `useTableModel`.
- Replace mutable Axios `dbType` module state with an `ApiClient` instance.
- Standardize mutation feedback with `toast.promise`.
- Remove debug `console.log` calls from feature components and stores.
- Replace pending cell edit keys with a scoped key:

```ts
type CellEditKey = {
  db: string;
  table: string;
  column: string;
  primaryKey: Record<string, unknown>;
};
```

Risk: accidental query cache breakage.

Mitigation: land query-key factories first, then move code.

### Phase 2: Extract UI Package

Goal: isolate reusable UI without moving domain behavior.

- Create `packages/ui`.
- Move primitive components from the web package's `src/components/ui`.
- Move `cn` and token CSS.
- Update `components.json` aliases.
- Add Storybook.
- Add stories for dense controls, sheet/dialog states, table controls, spinner, empty/error
  states.
- Move generic `DataGrid` after primitives are stable.

Risk: styling regressions due to Tailwind content scanning and token imports.

Mitigation: keep the web package's `src/index.css` importing UI CSS during the transition.

### Phase 3: Introduce Internal Feature Modules

Goal: make features independently movable without creating more packages yet.

Create:

```txt
packages/web/src/features/
  tables/
  schema/
  records/
  table-builder/
  query-runner/
  database/
  chat/
```

Move in this order:

1. `query-runner`, because it is mostly self-contained.
2. `schema`, because it has clear table-name input and schema mutations.
3. `table-builder`, because global sheet coupling should be removed.
4. `tables`, because it has the highest interaction complexity.
5. `records`, after table editing and add-record forms are separated.
6. `chat`, after platform/API boundaries are clearer.

Replace global `sheet.store.ts` with an overlay registry:

```ts
type OverlayId =
  | "table-builder.create-table"
  | "schema.add-column"
  | "schema.edit-column"
  | "records.add-record"
  | "records.bulk-insert"
  | "chat.assistant";
```

Risk: circular package dependencies.

Mitigation: enforce internal dependency rules first. Feature code can import web shared modules,
`ui`, and `shared`, but features should not import sibling feature internals.

### Phase 4: Add Desktop Package

Goal: host the same feature UI in a desktop shell.

- Add `packages/desktop` with Tauri.
- Build the current web app as renderer assets.
- Inject desktop transport through the internal client boundary in the web package's
  `src/shared/api`.
- First milestone: wrap existing server over localhost.
- Later milestone: move platform capabilities to Tauri commands.

Risk: web and desktop transports drift.

Mitigation: all feature code depends only on the internal client abstraction. A future
`packages/data-client` can be extracted later if the boundary proves stable.

## 7. Code Examples

Before:

```txt
packages/web/src/
  components/
    ui/
    table-tab/
    schema-tab/
    add-table/
    runnr-tab/
    sidebar/
  hooks/
    use-table-data.ts
    use-create-table.ts
    use-update-cell.ts
  stores/
    sheet.store.ts
    update-cell.store.ts
  lib/
    api.ts
```

After:

```txt
packages/web/src/features/tables/
  api/
    table-api.ts
  queries/
    table-queries.ts
  model/
    table-edit.store.ts
    table-model.ts
    types.ts
  components/
    table-grid.tsx
    table-toolbar.tsx
    table-cell.tsx
    table-empty-state.tsx
    table-error-state.tsx
  screens/
    table-screen.tsx
  index.ts
```

Example query split:

```ts
export const tableKeys = {
  all: ["tables"] as const,
  data: (input: TableDataInput) => [...tableKeys.all, "data", input] as const,
};

export function createTableQueries(client: DbStudioClient) {
  return {
    useTableData(input: TableDataInput) {
      return useQuery({
        queryKey: tableKeys.data(input),
        queryFn: () => client.tables.getData(input),
        enabled: Boolean(input.db && input.table),
      });
    },
  };
}
```

Example route after feature extraction:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { TableScreen } from "@/features/tables";

export const Route = createFileRoute("/_pathlessLayout/table/$table")({
  component: RouteComponent,
});

function RouteComponent() {
  const { table } = Route.useParams();
  return <TableScreen tableName={table} />;
}
```

Example container/presentational split:

```tsx
export function TableScreen({ tableName }: { tableName: string }) {
  const model = useTableModel(tableName);

  if (model.status === "loading") return <TableLoading />;
  if (model.status === "error") return <TableError error={model.error} />;

  return (
    <TableGrid
      rows={model.rows}
      columns={model.columns}
      selection={model.selection}
      editing={model.editing}
      actions={model.actions}
    />
  );
}
```

Example feature public API:

```ts
export { TableScreen } from "./screens/table-screen";
export { tableKeys } from "./queries/table-queries";
export type { TableDataInput, TableEdit } from "./model/types";
```

## Priority Recommendation

Start with exactly these frontend-relevant packages:

```txt
packages/
  web/
  ui/
  desktop/
  shared/
  server/
  proxy/
```

Within that structure, create boundaries inside the web package first. Once routes,
features, UI primitives, client abstractions, and app shell are separated internally,
additional package extraction becomes mostly mechanical.

The highest-leverage first milestone is:

1. typed API functions
2. query-key factories
3. `TableTab` split
4. overlay registry replacement for `sheet.store.ts`
5. UI primitive extraction
