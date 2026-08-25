# Design System

## Purpose

This file is the source of truth for AI agents creating or modifying UI in this repository. It summarizes the design and brand system that already exists in code. Follow these rules before adding new UI, and update this file whenever tokens, primitives, layout patterns, or brand assets change.

## Brand

DB Studio is a compact, developer-focused database management studio. Product UI should feel like a technical workbench: dense, fast, dark, monospaced, and optimized for scanning database objects, rows, schema metadata, and query results. The public site is more editorial but still minimal, terminal-first, and grid/border based.

The product name appears inconsistently as `DB Studio`, `db-studio`, `dbstudio`, and `dbstudio.sh`. Use `DB Studio` in prose and UI labels unless matching package names, CLI commands, domains, or metadata.

The logo exists as a PNG mark in the repo. README references both `assets/logo-light.png` and `assets/logo-dark.png`, but only `assets/logo-light.png` was present in the cloned repository.

```yaml
brand:
  name: "DB Studio"
  personality:
    - "developer-focused"
    - "compact"
    - "pragmatic"
    - "fast"
    - "technical"
    - "open-source"
  logo:
    files:
      - "assets/logo-light.png"
      - "assets/icon.png"
      - "www/public/logo.png"
      - "www/public/favicon.ico"
      - "packages/web/public/image.png"
    usage_rules:
      - "Use the existing PNG logo assets instead of drawing new marks."
      - "Use alt text `DB Studio` or `DB Studio logo`."
      - "Use the logo small in navigation and documentation contexts; README uses width 100 and the public site header uses width 32."
      - "Do not add decorative mascot or illustration language to product UI."
  needs_decision:
    - "README references `assets/logo-dark.png`, but that file was not present."
    - "Canonical naming should be confirmed: `DB Studio`, `db-studio`, `dbstudio`, and `dbstudio.sh` all appear."
    - "Logo clear-space, minimum size, and light/dark usage are not documented in code."
```

## Color

The shared UI library defines semantic OKLCH tokens in `packages/ui/src/styles/tokens.css`. The product app imports those tokens and then adds a hardcoded dark workspace shell: `bg-zinc-950`, `bg-black`, `border-zinc-800`, `text-zinc-400`, `text-zinc-500`, and Monaco/editor surfaces like `#1E1E1E`.

The public site has a separate token set in `www/src/styles.css`, also dark-first, with a less blue default primary and a `--primary-light` blue accent. Treat `packages/ui` tokens as normative for app UI. Treat `www` tokens as public-site specific.

```yaml
colors:
  primary:
    value: "oklch(0.488 0.243 264.376)"
    usage: "Shared UI primary/accent in `packages/ui`; used for primary buttons, active sidebar bars, selected controls, highlights, resize handles, and status emphasis."
  background:
    value: "oklch(0.141 0.005 285.823) in dark mode; product shell also uses Tailwind `zinc-950` and `black`."
    usage: "Main app workspace background, root body, panels, sidebars, headers, and fixed footer."
  surface:
    value: "oklch(0.21 0.006 285.885) for dark `--card`/`--popover`; `#1E1E1E` for Monaco editor/result surfaces."
    usage: "Cards, popovers, menus, dialogs, command palette, editor split, and JSON result areas."
  text:
    value: "oklch(0.985 0 0) foreground; secondary text commonly `text-muted-foreground`, `text-zinc-400`, `text-zinc-500`, and `text-zinc-600`."
    usage: "Primary readable text is light; metadata, row counts, labels, inactive nav, and empty-state detail use muted/zinc values."
  border:
    value: "oklch(1 0 0 / 10%) dark token; product shell repeatedly uses `border-zinc-800`."
    usage: "Thin dividers around headers, sidebars, grid cells, menus, sheets, and footers."
  danger:
    value: "oklch(0.704 0.191 22.216) dark `--destructive`; alerts/toasts also use Tailwind red classes."
    usage: "Destructive buttons, invalid fields, delete dialogs, parse errors, connection errors."
  warning:
    value: "Tailwind `amber-500`/`amber-600` classes in alerts/toasts."
    usage: "Warning alert variant and warning toast icon."
  success:
    value: "Tailwind `emerald-500`/`emerald-600` classes; connected indicator uses `green-400`/`green-500`."
    usage: "Success alerts/toasts, successful parsing, connection status, rate-limit health."
  needs_decision:
    - "Status colors are hardcoded Tailwind classes instead of semantic CSS variables."
    - "Product shell hardcodes zinc/black values instead of using `--background`, `--border`, and related tokens consistently."
    - "No formal contrast audit exists. Token pairs are likely designed for dark UI, but new combinations must be checked."
    - "Query runner uses `#1E1E1E` and `#d4d4d4` to match VS Code/Monaco; decide whether these should become tokens."
```

Color rules:

- Prefer semantic tokens: `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-popover`, `bg-card`, `bg-primary`, `text-primary`, `text-destructive`.
- Product workspace chrome may reuse existing hardcoded shell classes where matching nearby code: `bg-zinc-950`, `bg-black`, `border-zinc-800`, `text-zinc-400`, `text-zinc-500`.
- Avoid new arbitrary colors. If a color role is missing, add a token and update this file.
- Preserve focus rings: primitives use `focus-visible:border-ring` and `focus-visible:ring-ring/*`.
- Preserve disabled opacity and pointer rules: primitives use `disabled:pointer-events-none`, `disabled:opacity-50`, and `data-[disabled]:opacity-50`.

## Typography

The product app imports `@fontsource-variable/jetbrains-mono` in `packages/web/src/index.css`. The shared UI token sets `--font-sans` to `"JetBrains Mono Variable", monospace`, so both `font-sans` and `font-mono` effectively read as monospaced in product UI. The public site sets `font-family: "Geist Mono", monospace` in `www/src/styles.css`, but no import was found in the inspected files.

Typography is compact. Product controls are mostly `text-xs/relaxed`; table/editor content may be `text-sm`; large marketing text exists only in `www`.

```yaml
typography:
  fonts:
    sans: "\"JetBrains Mono Variable\", monospace"
    serif: ""
    mono: "monospace; product code/editor contexts use Monaco and `font-mono`"
  scale:
    - "text-[0.625rem]: badges, tiny shortcuts, xs buttons"
    - "text-xs/relaxed: default primitive buttons, inputs at md, selects, menus, descriptions, fields"
    - "text-sm: app empty/error states, forms, table row text, dialog/sheet titles in primitives"
    - "text-lg font-semibold: SheetSidebar title override"
    - "text-xl and above: public site marketing headings only"
  weights:
    - "font-normal for descriptions and helper text"
    - "font-medium for controls, labels, table headers, dialog titles"
    - "font-semibold for sheet titles and public-site headings"
    - "font-bold appears in public-site hero copy"
  rules:
    - "Keep product UI monospaced and compact."
    - "Use sentence case for labels, headings, empty states, and errors."
    - "Use title-style action labels only where existing commands do, such as `Add Record`, `Create New Table`, or command-palette items."
    - "Use `font-mono` for database names, table names, column names, SQL, JSON, connection details, and code-like values."
    - "Do not introduce a proportional app font without updating tokens and this file."
  needs_decision:
    - "The public site specifies Geist Mono but no explicit font import was found."
    - "No formal text scale token object exists beyond Tailwind utility usage."
```

## Layout And Spacing

The product app is a full-viewport dark workspace with a fixed top header, optional/pinned left sheet sidebar, full-height routed content, and fixed table footer. Layout is border-heavy and low-radius. Controls are short and dense.

```yaml
layout:
  spacing_scale:
    - "gap-0.5 for tight pagination and row metadata"
    - "gap-1 and gap-1.5 for control internals"
    - "gap-2 for form actions, toolbar groups, menu items, fields"
    - "gap-3 and gap-4 for sidebars, field groups, popover content"
    - "space-y-2 for compact form sections"
    - "space-y-4 and space-y-6 for sheet form sections"
    - "px-2 / py-1 for compact menu items"
    - "px-3 for grid cells and sidebar search"
    - "px-4 / py-3 for alerts"
    - "px-5 / py-6 for SheetSidebar body"
  containers:
    - "Product root: `w-dvw h-dvh max-h-dvh overflow-hidden`."
    - "Header: `h-12`, border-bottom, full width."
    - "Table/action headers: `max-h-8`, sticky top, border-bottom."
    - "Table footer: fixed bottom, `h-9`, border-top."
    - "Sidebar: Radix Sheet left side, resizable, black background, `border-r border-zinc-800`."
    - "Sheets: right side by default, usually `sm:max-w-2xl!`, header border-bottom, scrollable body."
    - "Dialogs: centered, max width around `sm:max-w-sm` or local overrides."
    - "Public site: centered `max-w-2xl` column with `border-x` and section `border-y`."
  breakpoints:
    - "Tailwind defaults are used through utility classes; no custom Tailwind config was found."
    - "`sm` appears for dialog widths, sheet widths, public-site grids."
    - "`md` appears for public-site padding/text, input text downsizing, and responsive field orientation."
    - "Container queries appear in Field responsive orientation via `@container/field-group`."
  radius:
    - "`--radius: 0.625rem`."
    - "`rounded-sm` for most product controls."
    - "`rounded-md` for command items, alerts, some public-site controls, and inline panels."
    - "`rounded-lg` for popovers, dropdown content, feature icon boxes, primary-key field grouping."
    - "`rounded-xl` for dialogs, command palette, drawer backing surface."
    - "`rounded-full` for badges, switches, indicators, and resize hover indicator."
  shadows:
    - "`shadow-md` for popovers, dropdowns, selects, hover cards."
    - "`shadow-lg` for sheets."
    - "`shadow-sm` appears in public-site code blocks and tabs."
    - "Product shell relies more on borders than elevation."
  rules:
    - "Keep app UI dense. Prefer `h-7`, `h-8`, `h-9`, `size-6`, `size-7`, `size-8` controls."
    - "Use borders/dividers to separate workspace regions."
    - "Avoid large card layouts in product UI unless displaying repeated objects."
    - "Virtualized tables/data grids use CSS grid/flex inside semantic table tags; keep sticky headers."
    - "Use fixed dimensions for toolbar buttons and grid cells to avoid layout shift."
  needs_decision:
    - "Sidebar min/max width constraints are not evident in the inspected wrapper."
    - "No documented responsive behavior exists for the product app below desktop widths."
    - "The public-site decorative cross marks and radial highlights should not be assumed valid for product UI."
```

## Components

```yaml
component:
  name: "Button"
  source_files:
    - "packages/ui/src/primitives/button.tsx"
    - "www/src/components/ui/btn.tsx"
  anatomy:
    - "Inline-flex control with optional icon, label, or asChild Slot."
    - "Product default height is `h-7`; sizes include `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`."
  variants:
    - "default"
    - "outline"
    - "secondary"
    - "ghost"
    - "destructive"
    - "link"
  states:
    - "hover"
    - "focus-visible ring and border"
    - "aria-invalid"
    - "aria-expanded"
    - "disabled opacity 50 and pointer-events none"
  rules:
    - "Use `@db-studio/ui/button` in product UI."
    - "Use icon sizes from the primitive unless a local toolbar pattern already overrides them."
    - "Toolbar buttons in headers often override to `h-8!`, `rounded-none`, and side borders."
    - "Destructive actions use the `destructive` variant, not ad hoc red buttons."
  accessibility:
    - "Icon-only buttons must include `aria-label` or sr-only text."
    - "Preserve focus-visible styles."
  avoid:
    - "Do not create raw `<button>` controls unless a primitive cannot support the behavior."
    - "Do not add new button variants without updating `buttonVariants` and this file."
```

```yaml
component:
  name: "Inputs And Textareas"
  source_files:
    - "packages/ui/src/primitives/input.tsx"
    - "packages/ui/src/primitives/textarea.tsx"
    - "packages/ui/src/primitives/field.tsx"
    - "packages/web/src/features/records/components/add-record-field.tsx"
  anatomy:
    - "Input uses tokenized `bg-input/20`, `border-input`, `rounded-sm`, `h-7`, horizontal padding."
    - "Textarea uses `min-h-16`, `resize-none`, tokenized input colors, and compact text."
    - "Fields compose labels, descriptions, content, and error text."
  variants:
    - "text input"
    - "number input"
    - "file input"
    - "textarea"
    - "input with trailing action button"
  states:
    - "placeholder muted"
    - "focus-visible ring"
    - "aria-invalid destructive"
    - "disabled"
  rules:
    - "Use labels for form controls."
    - "Use `font-mono` for database values and code-like input."
    - "Use FieldError for validation errors where possible."
  accessibility:
    - "Link labels using `htmlFor`/`id` or existing field composition."
    - "Error output should use `role=alert` as FieldError does."
  avoid:
    - "Avoid large form fields in product sheets unless required for bulk data or JSON."
```

```yaml
component:
  name: "Selects"
  source_files:
    - "packages/ui/src/primitives/select.tsx"
    - "packages/web/src/components/sidebar/sidebar-content-tables-list.tsx"
    - "packages/web/src/components/sidebar/sidebar-footer.tsx"
  anatomy:
    - "Radix Select root, trigger, content, item, label, separator, scroll buttons."
    - "Trigger includes value and ChevronsUpDown icon."
  variants:
    - "default `h-7`"
    - "sm `h-6`"
    - "locally enlarged `h-8` or `h-9` in sidebars"
  states:
    - "placeholder muted"
    - "focus-visible"
    - "open/closed animations"
    - "disabled"
    - "selected item check icon"
  rules:
    - "Use Select for schema/database/type/operator choices."
    - "Keep menu items `text-xs/relaxed` and `min-h-7`."
  accessibility:
    - "Rely on Radix select roles and keyboard behavior."
  avoid:
    - "Do not replace with custom dropdown markup for standard select behavior."
```

```yaml
component:
  name: "Checkboxes, Switches, Toggles"
  source_files:
    - "packages/ui/src/primitives/checkbox.tsx"
    - "packages/ui/src/primitives/switch.tsx"
    - "packages/ui/src/primitives/toggle.tsx"
    - "packages/ui/src/primitives/toggle-group.tsx"
  anatomy:
    - "Checkbox is a `size-4` square with check indicator."
    - "Switch is a compact rounded track with translated thumb."
    - "Toggle and ToggleGroup are compact button-like controls."
  variants:
    - "checkbox"
    - "switch default"
    - "switch sm"
    - "toggle default/ghost/outline"
    - "toggle group single-selection"
  states:
    - "checked/on"
    - "unchecked/off"
    - "focus-visible"
    - "invalid"
    - "disabled"
  rules:
    - "Use Checkbox for schema boolean options like primary/nullable/unique."
    - "Use ToggleGroup for mutually exclusive display modes such as table/json."
  accessibility:
    - "Keep labels nearby or provide aria-label."
    - "Do not remove Radix state attributes used by styling."
  avoid:
    - "Do not implement toggle state with plain divs."
```

```yaml
component:
  name: "Navigation"
  source_files:
    - "packages/web/src/routes/_pathlessLayout.tsx"
    - "packages/web/src/components/components/header.tsx"
    - "packages/web/src/components/components/tabs.tsx"
    - "packages/web/src/components/sidebar/sidebar.tsx"
    - "packages/web/src/components/sidebar/sidebar-wrapper.tsx"
    - "packages/web/src/components/sidebar/sidebar-list-tables-item.tsx"
    - "packages/web/src/components/sidebar/sidebar-footer.tsx"
  anatomy:
    - "Dark full-viewport app shell."
    - "Top header with left route tabs and right utility icons."
    - "Resizable left sidebar implemented with Sheet."
    - "Sidebar lists tables or queries depending on route."
    - "Footer area contains database selector and connection details."
  variants:
    - "Pinned sidebar"
    - "Hover-open unpinned sidebar"
    - "Table/sidebar content"
    - "Query/sidebar content"
  states:
    - "Active tab: `bg-zinc-900 text-white`."
    - "Inactive tab: `text-zinc-400`."
    - "Active sidebar item: `text-white bg-zinc-800/50` with left `bg-accent` bar."
    - "Connection status: green pulsing indicator."
  rules:
    - "Keep nav compact and border-separated."
    - "Use tooltips for icon-only header actions."
    - "Use route-aware sidebar content instead of duplicating sidebars per screen."
  accessibility:
    - "Provide aria-labels for external icon links and icon buttons."
    - "Resizable sidebar handle currently uses `role=button` and `tabIndex=0`; keyboard resizing is a needs_decision."
  avoid:
    - "Do not add marketing navigation patterns to product UI."
```

```yaml
component:
  name: "Cards And Panels"
  source_files:
    - "packages/ui/src/primitives/alert.tsx"
    - "packages/ui/src/primitives/popover.tsx"
    - "packages/ui/src/primitives/hover-card.tsx"
    - "www/src/components/features.tsx"
  anatomy:
    - "Product mostly uses panels, sheets, menus, and table regions rather than card-heavy layouts."
    - "Alerts are bordered rounded-md panels with icon, title, optional message."
    - "Public site feature cards are grid cells separated by borders."
  variants:
    - "alert info/warning/error/success"
    - "popover panel"
    - "feature card on public site"
  states:
    - "hover background changes on public feature cards"
    - "popover open/closed animation"
  rules:
    - "Use cards sparingly in product UI."
    - "Prefer bordered sections and sheets for workflows."
  accessibility:
    - "Alert content should be concise and readable; icon is decorative with `aria-hidden`."
  avoid:
    - "Do not introduce nested cards or large decorative cards in the product app."
```

```yaml
component:
  name: "Tables And Data Grids"
  source_files:
    - "packages/ui/src/primitives/table.tsx"
    - "packages/ui/src/data-display/data-grid/*"
    - "packages/web/src/features/tables/components/table-grid.tsx"
    - "packages/web/src/features/tables/components/table-container.tsx"
    - "packages/web/src/features/tables/components/table-head-row.tsx"
    - "packages/web/src/features/tables/components/table-body-row.tsx"
    - "packages/web/src/features/schema/screens/schema-screen.tsx"
  anatomy:
    - "Virtualized rows and columns with TanStack Table and React Virtual."
    - "Semantic table elements styled with CSS grid/flex for dynamic sizing."
    - "Sticky header, resizable columns, border-separated cells, compact rows."
  variants:
    - "record table"
    - "schema data grid"
    - "query result table"
    - "MongoDB document view"
  states:
    - "hover row/cell `bg-accent/20`"
    - "open row/cell `bg-accent/40`"
    - "selected rows"
    - "resizing column"
    - "loading"
    - "empty"
    - "error"
  rules:
    - "Use virtualization for potentially large datasets."
    - "Keep row height around 32-33px unless a cell editor needs more space."
    - "Use `font-mono` for identifiers and values."
    - "Keep resize handles accessible as separators."
  accessibility:
    - "Column resizers use `role=separator`, `aria-orientation`, `aria-label`, and value attributes."
    - "Preserve keyboard/focus behavior when editing cells."
  avoid:
    - "Do not replace virtualized grid paths with static table rendering for large data."
```

```yaml
component:
  name: "Modals, Sheets, Drawers"
  source_files:
    - "packages/ui/src/primitives/dialog.tsx"
    - "packages/ui/src/primitives/sheet.tsx"
    - "packages/ui/src/primitives/drawer.tsx"
    - "packages/web/src/components/sheet-sidebar.tsx"
    - "packages/web/src/features/table-builder/screens/table-builder-overlay.tsx"
    - "packages/web/src/features/records/components/add-record-form.tsx"
    - "packages/web/src/features/schema/components/add-column-form.tsx"
  anatomy:
    - "Dialogs are centered with overlay, title, description, footer, optional close icon."
    - "Sheets are side panels for CRUD and sidebar interactions."
    - "Drawer is Vaul-backed and used for drawer-style related-record views."
    - "SheetSidebar wraps Sheet with standard header and scrollable content."
  variants:
    - "center dialog"
    - "right sheet"
    - "left sheet sidebar"
    - "pinned sheet sidebar without overlay"
    - "drawer bottom/left/right/top"
  states:
    - "open/closed fade, zoom, or slide animation"
    - "loading submit button"
    - "disabled actions"
  rules:
    - "Use sheets for multi-field create/edit workflows."
    - "Use dialogs for destructive confirmations and small decisions."
    - "Use SheetSidebar for app CRUD panels to maintain title/header/body consistency."
  accessibility:
    - "Use Dialog/Sheet title and description primitives."
    - "Close buttons require sr-only text."
    - "Preventing auto focus is used for the sidebar; do not copy that behavior unless needed."
  avoid:
    - "Do not create custom modal overlays outside Radix/Vaul primitives."
```

```yaml
component:
  name: "Toasts And Alerts"
  source_files:
    - "packages/ui/src/primitives/sonner.tsx"
    - "packages/ui/src/primitives/alert.tsx"
    - "packages/web/src/components/components/command-palette.tsx"
    - "packages/web/src/features/query-runner/screens/runner-screen.tsx"
    - "packages/web/src/features/table-builder/screens/table-builder-overlay.tsx"
  anatomy:
    - "Sonner toaster positioned top-right in app root."
    - "Toasts use tokenized popover background/text/border and status icons."
    - "Inline alerts use icon, title, optional message."
  variants:
    - "success"
    - "info"
    - "warning"
    - "error"
    - "loading"
  states:
    - "normal toast"
    - "inline alert"
    - "validation toast"
  rules:
    - "Use toasts for transient command outcomes and validation blockers."
    - "Use inline alerts when the user needs persistent context inside a sheet/form."
  accessibility:
    - "Keep toast and alert messages short."
    - "Do not rely on color alone; include text and icons."
  avoid:
    - "Avoid console-only error feedback for user-facing failures."
```

```yaml
component:
  name: "Empty States"
  source_files:
    - "packages/web/src/routes/_pathlessLayout/index.tsx"
    - "packages/web/src/features/tables/components/table-empty-state.tsx"
    - "packages/web/src/components/components/command-palette.tsx"
    - "packages/ui/src/stories/feedback-states.stories.tsx"
    - "www/src/components/ui/empty.tsx"
  anatomy:
    - "Centered, compact text in product table areas."
    - "Command palette uses terse no-results messages."
    - "Storybook has a more composed empty-state example with icon, title, description, action."
  variants:
    - "No data available for table"
    - "Select a tab to get started"
    - "No filters applied"
    - "No results found"
    - "No tables in database"
  states:
    - "empty table"
    - "empty search"
    - "empty command group"
  rules:
    - "Keep empty-state copy direct and specific."
    - "Offer an action when the next step is obvious."
  accessibility:
    - "Use readable text, not icon-only empties."
  avoid:
    - "Do not use playful or marketing-style empty states in the product app."
```

```yaml
component:
  name: "Loading States"
  source_files:
    - "packages/ui/src/primitives/spinner.tsx"
    - "packages/web/src/routes/__root.tsx"
    - "packages/web/src/features/tables/components/table-loading-state.tsx"
    - "packages/web/src/features/query-runner/components/query-result-container.tsx"
    - "packages/web/src/components/ai-elements/loading-text.tsx"
    - "packages/web/src/index.css"
  anatomy:
    - "Spinner has 12 animated bars using `--animate-spinner`."
    - "Table loading centers `Spinner size-7`."
    - "App init loading centers `Spinner size-8`."
    - "AI loading text uses shine/shimmer animations."
  variants:
    - "spinner"
    - "shimmer text"
    - "suspense blank editor panel"
  states:
    - "initial app loading"
    - "table loading"
    - "query executing"
    - "AI streaming/loading"
  rules:
    - "Center loading indicators inside the affected region."
    - "Use product token color unless matching Monaco result surface."
  accessibility:
    - "Respect `prefers-reduced-motion`; public site includes a reduced-motion rule."
  avoid:
    - "Do not use large skeleton card layouts in dense product screens unless there is an existing nearby pattern."
```

```yaml
component:
  name: "Command Palette"
  source_files:
    - "packages/ui/src/primitives/command.tsx"
    - "packages/web/src/components/components/command-palette.tsx"
  anatomy:
    - "Radix Dialog plus cmdk command list."
    - "Input at top, grouped commands, separators, command items with icons and descriptions."
    - "Tables mode is triggered by `>` or `table ` / `tables `."
  variants:
    - "all commands"
    - "tables search"
  states:
    - "empty search"
    - "disabled command"
    - "selected command"
    - "mode badge"
  rules:
    - "Use command palette for cross-app navigation and power actions."
    - "Group commands by workflow: Quick Access, AI Assistant, Database Actions, Data Operations, SQL & Schema, Access & Security, View & Settings."
  accessibility:
    - "Open with ctrl+k/meta+k."
    - "Keep command labels and descriptions meaningful."
  avoid:
    - "Do not bury core navigation only in the command palette."
```

## Product UI Patterns

```yaml
patterns:
  navigation:
    - "Full-viewport dark shell with fixed top header and route tabs."
    - "Resizable left sidebar opens as a non-modal Sheet; it can be pinned or hover-opened from the left edge."
    - "Header right side uses icon buttons with tooltips for AI chat, bug report, and GitHub."
    - "Sidebar content changes by route: tables/schema show tables; runner shows queries."
  forms:
    - "Create/edit workflows live in SheetSidebar."
    - "Use react-hook-form and zod where existing schemas are available."
    - "Grid-based field rows are common for schema/table builder forms."
    - "Footer actions use outline Close/Cancel and default Save/Insert/Create."
    - "Validation blockers may use toast.error; persistent explanatory states use Alert."
  dashboards:
    - "No traditional dashboard card layout was found."
    - "Primary workspace is table/schema/query tooling, not metrics cards."
  settings:
    - "Settings are currently incomplete; a settings button exists as TODO for light/dark mode and JSON cell tab size."
    - "Personal preferences store sidebar width/open/pinned state."
  onboarding:
    - "Product app root empty state says `Select a tab to get started`."
    - "Public site onboarding is terminal-first with `npx db-studio` and package-manager tabs."
    - "No in-app onboarding flow was found."
  errors:
    - "Database connection errors are centered full-screen with destructive title and muted detail."
    - "Table errors detect not-found and network cases, with concise title/detail."
    - "Destructive confirmations explain irreversible data loss and foreign-key constraints."
  empty_states:
    - "Use direct text: `No data available for \"{tableName}\" table`, `No filters applied`, `No tables in database`, `No results found.`"
    - "Keep empties compact and centered in the affected region."
  responsive:
    - "Product app primarily targets desktop data-management workflows."
    - "Public site is responsive with centered `max-w-2xl`, `sm:grid-cols-2`, and mobile bottom sheet nav."
    - "Radix primitives support keyboard interaction and responsive sheet/dialog widths."
  needs_decision:
    - "Product mobile behavior is not fully defined."
    - "Settings information architecture is not implemented."
    - "Dashboard pattern is absent; do not invent one without product direction."
    - "In-app onboarding is minimal and may need a product decision."
```

## Voice And Tone

The voice is plain, technical, and action-oriented. UI copy names concrete database operations: Add Table, Add Record, Run, Format, Save, Filter, Export data, Copy table schema, Delete table. Errors are direct and explanatory. Public-site copy is a little more opinionated (`pgAdmin alternative but good`) but product UI stays utilitarian.

```yaml
voice:
  adjectives:
    - "plain"
    - "technical"
    - "direct"
    - "concise"
    - "action-oriented"
  rules:
    - "Use concrete database nouns: table, row, record, column, schema, query, database."
    - "Prefer short action verbs: Add, Save, Run, Copy, Delete, Export, Refresh, Apply, Reset."
    - "Use sentence case for normal product UI."
    - "Use title case where existing command/menu items use it."
    - "For destructive actions, state the object and consequence."
    - "For empty states, state what is missing and, when obvious, how to proceed."
    - "For validation, tell the user exactly what is wrong."
  cta_style: "Short imperative labels such as `Add Table`, `Save`, `Run`, `Apply`, `Insert`, `Preview`, `Create New Table`."
  error_style: "Direct title plus muted detail, for example `Failed to connect to the database`, `Table not found`, `Connection failed`, `Query is empty!`."
  empty_state_style: "Compact and literal, for example `No filters applied`, `No tables in database`, `Run the query to see the results`."
  avoid:
    - "Avoid decorative marketing copy in product UI."
    - "Avoid vague errors like `Oops` without technical detail."
    - "Avoid long explanatory paragraphs in dense workspace regions."
    - "Avoid inventing playful personality for database actions."
  needs_decision:
    - "Whether product labels should consistently use `row` or `record`; both appear."
    - "Whether exclamation marks should be used in validation messages; `Query is empty!` exists, but most copy is calmer."
    - "Whether public-site informal phrasing should influence product UI; current product UI mostly does not use it."
```

## Agent Rules

- Reuse existing components before creating new ones. Start with `@db-studio/ui` primitives and local wrappers like `SheetSidebar`, `DataGrid`, table header/footer components, sidebar components, and command palette patterns.
- Prefer existing tokens over hardcoded values. Use `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-popover`, `bg-card`, `bg-primary`, `text-primary`, and `text-destructive`.
- Match the existing product density. Use compact heights (`h-7`, `h-8`, `h-9`), small text (`text-xs/relaxed`, `text-sm`), tight gaps, and border-separated regions.
- Match radius and elevation patterns. Use `rounded-sm` for controls, `rounded-md`/`rounded-lg` for menus and small panels, `rounded-xl` for dialogs/command surfaces, and shadows only for floating overlays.
- Preserve accessibility behavior. Keep Radix primitives, labels, `aria-label`s, sr-only close text, focus-visible rings, invalid states, keyboard shortcuts, and separator semantics.
- Do not introduce new colors, shadows, fonts, or component variants without updating this file and the relevant token/primitive source.
- Do not invent public-site visuals for product UI. The product app is a dense tool, not a landing page.
- Keep copy direct and database-specific. Use existing terms and labels when possible.
- When uncertain, follow the closest existing pattern and leave a `needs_decision` note in this file or in the implementation notes.
- If a local pattern hardcodes color or spacing, prefer the nearby pattern for consistency, then consider whether to move it into a shared token/component in a separate change.
