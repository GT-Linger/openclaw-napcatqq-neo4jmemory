# Style Selector → Consumer Map

This artifact documents style selectors/tokens and where their class contracts are consumed in UI render code. It is intended as a **do-not-break reference** for CSS refactors.

## Scope

### CSS sources audited

- `ui/src/styles/base.css`
- `ui/src/styles/layout.css`
- `ui/src/styles/components.css`
- `ui/src/styles/chat/layout.css`
- `ui/src/styles/chat/grouped.css`
- `ui/src/styles/chat/tool-cards.css`
- `ui/src/styles/chat/text.css`
- `ui/src/styles/chat/sidebar.css`

### Consumer sources cross-referenced

- `ui/src/ui/app.ts`
- `ui/src/ui/app-render.ts`
- `ui/src/ui/views/*.ts`
- `ui/src/ui/chat/*.ts`

---

## 1) Theme/token list

Primary token pipeline (defined in `base.css`) is dark-first on `:root`, with light overrides under `:root[data-theme="light"]`.

### Global tokens (from `:root` / light override root)

- Color/background/surface tokens: `--bg`, `--surface`, `--surface-2`, `--text`, `--muted`, `--primary`, `--accent`, semantic status tokens used by pills/callouts/buttons/labels.
- Border/elevation tokens: border colors, ring/glow/shadow values used by cards, fields, bubbles, topbar/nav/shell containers.
- Spacing/radius/typography tokens: spacing scale, radius scale, font sizing/line-height utilities consumed by component and chat typography rules.
- Motion tokens: transition durations/easing used by hover/focus/nav collapse/shell transitions.
- Chat/layout tokens: thread/compose/sidebar split sizing tokens and bubble max widths (where present).

### Theme transition hooks (do not break)

- `html.theme-transition`
- transition pseudo elements used by View Transitions API path.
- CSS variables used by transition origin math: `--theme-switch-x`, `--theme-switch-y`.

### App host hook

- `openclaw-app` host/root styling entry in `base.css`.

> Note: keep `data-theme` attribute contract intact; mode switching depends on this selector path.

---

## 2) Selector → consumer references

The table below includes selector families and concrete TS consumer files where class names are emitted or delegated.

### 2.1 Shell/layout/navigation selectors

| Selector family                                                                               | Primary consumers                                                                |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `.shell`, `.shell--chat`, `.shell--chat-focus`, `.shell--nav-collapsed`, `.shell--onboarding` | `ui/src/ui/app-render.ts` (root template wrapper)                                |
| `.topbar`, `.topbar-left`, `.topbar-status`                                                   | `ui/src/ui/app-render.ts`                                                        |
| `.brand`, `.brand-logo`, `.brand-text`, `.brand-title`, `.brand-sub`                          | `ui/src/ui/app-render.ts`                                                        |
| `.nav`, `.nav--collapsed`                                                                     | `ui/src/ui/app-render.ts`                                                        |
| `.nav-group`, `.nav-group--collapsed`, `.nav-group--links`                                    | `ui/src/ui/app-render.ts`                                                        |
| `.nav-label`, `.nav-label__text`, `.nav-label__chevron`, `.nav-label--static`                 | `ui/src/ui/app-render.ts`                                                        |
| `.nav-item`, `.nav-item--external`, `.nav-item__icon`, `.nav-item__text`                      | `ui/src/ui/app-render.ts`; helper rendering in `ui/src/ui/app-render.helpers.ts` |
| `.nav-collapse-toggle`, `.nav-collapse-toggle__icon`                                          | `ui/src/ui/app-render.ts`                                                        |
| `.content`, `.content--chat`, `.content-header`, `.page-title`, `.page-sub`, `.page-meta`     | `ui/src/ui/app-render.ts`                                                        |

### 2.2 Shared primitives/components selectors

| Selector family                                                                              | Primary consumers                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `.pill`, `.pill.danger`, status dot variants                                                 | `ui/src/ui/app-render.ts`; multiple `ui/src/ui/views/*.ts`               |
| `.btn`, size/state variants (`.btn--sm`, etc.)                                               | `ui/src/ui/app-render.ts`; `ui/src/ui/views/*.ts`; `ui/src/ui/chat/*.ts` |
| `.card*`, `.stat*`, `.label`, `.field*`, `.list*`, `.table*`, `.chip*`, `.callout*`, `.mono` | `ui/src/ui/views/*.ts` (overview/config/logs/skills/agents/nodes/etc.)   |
| Banner/alert utility classes like `.update-banner`, `.update-banner__btn`                    | `ui/src/ui/app-render.ts`                                                |

### 2.3 Chat core selectors

| Selector family                                                     | Primary consumers                                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `.chat` container family                                            | `ui/src/ui/views/chat.ts`; lower-level builders in `ui/src/ui/chat/*.ts`   |
| `.chat-header*`                                                     | `ui/src/ui/views/chat.ts`; `ui/src/ui/chat/*.ts`                           |
| `.chat-thread`                                                      | `ui/src/ui/views/chat.ts`; message list rendering in `ui/src/ui/chat/*.ts` |
| `.chat-compose*`, `.chat-controls*`                                 | `ui/src/ui/views/chat.ts`; compose controls in `ui/src/ui/chat/*.ts`       |
| `.chat-new-messages`                                                | `ui/src/ui/views/chat.ts`                                                  |
| `.chat-line`, role/state variants                                   | `ui/src/ui/chat/*.ts`                                                      |
| `.chat-msg`, `.chat-bubble`, `.chat-stamp` and role/state modifiers | `ui/src/ui/chat/*.ts`                                                      |
| `.chat-reading-indicator*`                                          | `ui/src/ui/chat/*.ts`                                                      |

### 2.4 Grouped chat selectors

| Selector family                 | Primary consumers                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `.chat-group*`                  | `ui/src/ui/chat/*.ts`                                                                    |
| `.chat-avatar*`                 | `ui/src/ui/chat/*.ts`; avatar wiring from `ui/src/ui/app-render.ts` props into chat view |
| `.chat-copy-btn*`               | `ui/src/ui/chat/*.ts`                                                                    |
| grouped `.chat-bubble` variants | `ui/src/ui/chat/*.ts`                                                                    |

### 2.5 Tool-card selectors

| Selector family                                                                                   | Primary consumers     |
| ------------------------------------------------------------------------------------------------- | --------------------- |
| `.chat-tool-card*`                                                                                | `ui/src/ui/chat/*.ts` |
| `.chat-tool-card__header`, `__title`, `__action`, `__status`, `__detail`, `__preview`, `__inline` | `ui/src/ui/chat/*.ts` |

### 2.6 Chat rich text selectors

| Selector family                                                                                            | Primary consumers                                           |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `.chat-text`                                                                                               | `ui/src/ui/chat/*.ts`                                       |
| `.chat-text` descendant markdown rules (`p`, `ul`, `ol`, `pre`, `code`, `blockquote`, `table`, `hr`, etc.) | markdown/chat content render paths in `ui/src/ui/chat/*.ts` |
| `.chat-thinking`                                                                                           | `ui/src/ui/chat/*.ts`                                       |
| RTL hook `.chat-text[dir="rtl"]`                                                                           | `ui/src/ui/chat/*.ts`                                       |

### 2.7 Sidebar/split selectors

| Selector family                                    | Primary consumers                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| chat sidebar/split classes from `chat/sidebar.css` | `ui/src/ui/views/chat.ts` and sidebar-related render fragments under `ui/src/ui/chat/*.ts` |

---

## 3) Consumer file index (explicit)

### App shell and orchestration

- `ui/src/ui/app.ts`
  - Defines app state used to toggle CSS class contracts (e.g., chat focus mode, onboarding, nav collapsed, theme mode application path).
- `ui/src/ui/app-render.ts`
  - Emits primary shell/nav/content classes directly.
  - Wires tab-specific views that emit component/chat classes.

### Views (tab renderers)

- `ui/src/ui/views/agents.ts`
- `ui/src/ui/views/channels.ts`
- `ui/src/ui/views/chat.ts`
- `ui/src/ui/views/config.ts`
- `ui/src/ui/views/cron.ts`
- `ui/src/ui/views/debug.ts`
- `ui/src/ui/views/exec-approval.ts`
- `ui/src/ui/views/gateway-url-confirmation.ts`
- `ui/src/ui/views/instances.ts`
- `ui/src/ui/views/logs.ts`
- `ui/src/ui/views/nodes.ts`
- `ui/src/ui/views/overview.ts`
- `ui/src/ui/views/sessions.ts`
- `ui/src/ui/views/skills.ts`
- `ui/src/ui/views/usage.ts`

### Chat render pipeline

- `ui/src/ui/chat/attachments.ts`
- `ui/src/ui/chat/constants.ts`
- `ui/src/ui/chat/copy.ts`
- `ui/src/ui/chat/dom.ts`
- `ui/src/ui/chat/icons.ts`
- `ui/src/ui/chat/markdown.ts`
- `ui/src/ui/chat/messages.ts`
- `ui/src/ui/chat/render.ts`
- `ui/src/ui/chat/sidebar.ts`
- `ui/src/ui/chat/streaming.ts`
- `ui/src/ui/chat/tool-call-accessibility.ts`
- `ui/src/ui/chat/tool-card-state.ts`
- `ui/src/ui/chat/tool-cards.ts`
- `ui/src/ui/chat/tool-format.ts`
- `ui/src/ui/chat/tool-icons.ts`
- `ui/src/ui/chat/types.ts`

---

## 4) Do-not-break contract notes

1. **Do not rename/remove class selectors** above without atomic updates in their TS emitters.
2. **Cascade order matters** across `components.css` and `chat/*.css` (intentional layered overrides).
3. Preserve theming contract: `:root[data-theme="light"]` and transition hook `html.theme-transition`.
4. Safer refactors: change internals (token values/properties), avoid selector churn.
