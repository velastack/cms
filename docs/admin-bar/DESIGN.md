# VelaCMS admin bar — redesign brief

This document specifies the redesign of the VelaCMS admin bar and its associated panels. It supersedes the existing skeleton UI shown in `screenshots/skeleton/`. Reference mockups for the new design live in `screenshots/redesign/`.

The audience for the bar is split: site administrators ranging from non-technical (a hotel owner editing room descriptions) to power users (developers maintaining the site). Every design decision below is in service of that split — beginners get clarity and discoverability, power users get speed and keyboard shortcuts.

---

## 1. Architecture

### 1.1 The bar

A single floating pill, fixed width 560px on desktop, full width on mobile. Dark surface (`#1f1f1f`), light text, rounded fully (`border-radius: 999px`).

The bar uses **space-between** to separate two groups:

- **Left group**: brand label (`CMS`) + status pill
- **Right group**: contextual action buttons + menubar + user avatar + close (`×`)

The status pill on the left answers _what is true right now_. The action buttons on the right answer _what can I do next_. This is a deliberate native-app convention (window title left, controls right).

### 1.2 The menubar

The menubar has **three top-level items**: `Page`, `Site`, `View`. Each opens a dropdown built with the shadcn/ui `Menubar` component.

The menubar's structure stays stable across every state of the bar. Items inside menus may enable or disable depending on context, but their location never moves. This is a key native-app pattern: users learn where things live and don't have to re-find them when conditions change.

A fourth conceptual category — account/auth — lives behind the avatar on the right, not in the menubar. This matches macOS conventions (Apple menu) and keeps the menubar to a readable three items.

### 1.3 The avatar and close button

The user avatar (`JD` initials in a colored circle) is clickable and opens an account menu (sign out, profile, switch site if multi-tenant). The `×` button to its right collapses/hides the bar — equivalent to `View → Hide bar` (`⌘.`).

---

## 2. Bar states

The bar has three primary states. Visual treatment changes with state; structure does not.

### 2.1 Idle — site is clean

No unpublished changes. No active edit session.

- Status pill: green dot + `All published`
- Right group: menubar + avatar + close

The bar is quiet. Nothing competes for attention.

### 2.2 Unpublished changes exist

One or more pages have been edited and saved to the working copy but not yet published.

- Status pill: amber dot + `1 page draft` (or `N pages draft`), with a **subtle pulse animation** (2.4s ease-in-out, opacity 1 → 0.6 → 1)
- Promoted action button: `Preview` (ghost) + `Publish…` (primary, white background)
- Menubar still present, after the action buttons

The amber pulse is a gentle nudge — not an alarm. The `…` ellipsis on `Publish` signals that clicking opens a dialog rather than acting instantly.

### 2.3 Editing this page

The user has clicked `Edit` (or pressed `⌘E`) and is actively editing the page.

- Status pill: blue dot + `Editing /` (the path of the page being edited)
- Promoted action buttons: `Cancel` (ghost, with `esc` shortcut) + `Save` (primary, with `⌘S` shortcut)
- Menubar items become **dim** (still clickable, but visually subordinated) — page-level meta-actions like SEO are secondary while editing

Save and Cancel replace each other in the same slot as `Edit` does in the idle state. The bar's right side has exactly one job at a time.

---

## 3. Status pill — design rules

The status pill replaces the existing `1 page` chip. Three variants:

| State       | Background  | Text color        | Dot color        |
| ----------- | ----------- | ----------------- | ---------------- |
| Clean       | transparent | `#d4d4d4`         | `#5DCAA5` (teal) |
| Unpublished | `#2a2416`   | `#FAC775` (amber) | `#EF9F27`        |
| Editing     | `#182338`   | `#85B7EB` (blue)  | `#378ADD`        |

The dot is 6×6px. The pill is 28px tall, padding `0 12px 0 10px`, gap 6px between dot and text. Use full-sentence text ("All published"), not noun fragments ("Clean"). The pill should be readable as plain English without prior context.

---

## 4. Color tokens

These should map to existing design tokens where possible. If new tokens are needed:

```
--cms-bar-bg: #1f1f1f
--cms-bar-bg-hover: #2e2e2e
--cms-bar-divider: #3a3a3a
--cms-bar-text: #f5f5f5
--cms-bar-text-secondary: #a3a3a3
--cms-bar-text-tertiary: #737373

--cms-status-clean-dot: #5DCAA5
--cms-status-warn-bg: #2a2416
--cms-status-warn-text: #FAC775
--cms-status-warn-dot: #EF9F27
--cms-status-edit-bg: #182338
--cms-status-edit-text: #85B7EB
--cms-status-edit-dot: #378ADD

--cms-accent: #534AB7  /* purple — used for active editing slots, focus rings */
```

Panel surfaces (Pages, Releases, SEO) and the publish modal use the same `--cms-bar-bg` background with `0.5px solid #2e2e2e` borders. The whole bar surface is dark — there are no light-surface chrome elements.

---

## 5. Menu contents

### 5.1 Page menu

Scoped to the current URL.

| Item                | Shortcut | Notes                                                                            |
| ------------------- | -------- | -------------------------------------------------------------------------------- |
| Edit                | `⌘E`     | Primary action; enters edit mode                                                 |
| Edit SEO & metadata | `⌘I`     | Opens SEO panel                                                                  |
| — divider —         |          |                                                                                  |
| Copy preview link   |          | Copies the working-copy preview URL                                              |
| Open in new tab     | `⌘↵`     |                                                                                  |
| — divider —         |          |                                                                                  |
| Discard changes     |          | Disabled if no unpublished changes on this page                                  |
| Publish this page…  | `⌘P`     | Disabled if no unpublished changes; opens publish modal scoped to this page only |

### 5.2 Site menu

Site-wide actions, grouped into five sections.

**Navigate**

- All pages… (`⌘K`) — opens the All pages panel

**Create**

- New page… (`⌘N`)
- New from /rooms/[slug] ▸ — submenu, one entry per dynamic route template

**Working copy**

- Review & publish… (`⌘P`) — opens the publish modal, with an amber count badge if there are pending changes
- Share preview link
- Regenerate preview key
- Discard all changes… — destructive (red text), opens confirmation

**History**

- Recent releases… (`⌘H`) — opens the Releases panel
- Revert to release…

**Settings**

- Site settings (`⌘,`)

### 5.3 View menu

Overlay state and preview controls. Uses checkbox and radio item patterns from shadcn `Menubar`.

**Bar**

- Hide bar (`⌘.`) — toggle
- Position ▸ — submenu (Top / Bottom)

**Page indicators** (checkbox items)

- ✓ Highlight editable areas (`⌘⇧E`)
- ✓ Show draft markers on links
- ☐ Show grid & spacing (`⌘G`)

**Preview as** (radio group — exactly one active)

- ● Desktop
- ○ Tablet
- ○ Mobile
- ○ Signed-out visitor

**Appearance**

- Theme ▸

**Help**

- Keyboard shortcuts… (`?`)

---

## 6. Panels

Panels open below the bar, anchored to whichever menubar item triggered them. Same dark surface as the bar. 560px wide on desktop.

### 6.1 All pages

Replaces the existing Pages panel.

**Header**

- Title: `All pages`
- Subtitle (muted): `5 pages · 1 with draft` — shows total count and how many have unpublished changes
- Close button

**Search field** — full-text filter across paths and page titles. Shortcut `/` to focus.

**Static routes section** — header `STATIC ROUTES`, count on right

- Each row shows: amber draft-dot (or empty spacer) + path (monospace) + optional title metadata
- A `draft` badge (amber) appears on the right for any page with unpublished changes
- Clicking the row navigates to that page

**Template groups** — for dynamic routes like `/rooms/[slug]`

- Subtle background tint (`#181818`) to distinguish from static
- Header: `Template /rooms/[slug]` (the template path in monospace purple `#AFA9EC`) + `+ New room` button on the right
- Instances listed below, indented with a small connector line (1px gray, 8px wide)
- Each instance has a `Delete` button (red text)
- The `+ New` button is inline with the template header, not a peer to the instances

**Footer** — `Click a page to open it · ⌘N to create`

### 6.2 Recent releases

Replaces the existing History panel.

**Header**

- Title: `Recent releases`
- Subtitle: `last 30 days`

**Timeline of release entries**

- Vertical rail on the left: 8×8 dot per release, connected by 1px line
- Current/live release: teal dot (`#5DCAA5`)
- Older releases: gray dot (`#444`)
- Each entry shows:
  - **Title**: release name (e.g. "Spring relaunch") in 13px medium weight; **falls back to commit hash** in monospace 12px regular when no name was given
  - **Meta line**: timestamp · publisher · status (e.g. "Today, 3:35 PM · published by JD · live now")
  - **Change chips**: monospace pills showing which paths were in the release (e.g. `/`, `/rooms/suite-2`). Cap at ~3, then `+N more`.
  - **Actions**: `View` (opens diff/preview of what shipped) + `Revert` (hidden on the current live release)

**Footer**

- `4 releases shown` left-aligned
- `Load older →` right-aligned

### 6.3 SEO & metadata

Replaces the existing metadata panel.

**Header**

- Title: `SEO & metadata`
- Subtitle: page path in monospace (e.g. `/`)

**Search preview** — the headline feature

- Light card (`#fafafa`) with Google-result styling
- Favicon + hostname breadcrumb
- Title in `#1a0dab` 18px regular
- Description in `#4d5156` 13px
- Updates live as the user types in the fields below

**Title field**

- Label + character counter (`4 / 60`)
- Counter turns amber as it approaches 60, red if it exceeds
- Counters are **soft feedback, not validation** — never block the user

**Description field**

- Same pattern, `155` character target
- Textarea, min-height 56px

**Advanced (collapsed by default)**

- Contains: `Canonical URL`, `Robots`, future `Open Graph`, `Twitter card`, `schema.org type`
- Hiding these is intentional — they're the fields where a non-technical admin can break SEO by accident

**Footer**

- Note: `Changes apply on Save` (left)
- `Cancel` + `Save` buttons (right)

### 6.4 Review & publish (modal)

A true modal: blocking, requires a decision. Same dark surface as the rest of the bar (`--cms-bar-bg`, `--cms-bar-divider` border).

The modal publishes **everything** in the working copy as a single atomic release. There is no per-item selection — partial publishes were removed; the working copy is the unit of release.

**Header**

- Title: `Review & publish`
- Subtitle: `All changes will go live together.`

**Change list** — read-only summary, one row per page with unpublished changes

- Path (monospace)
- Meta line: what changed + when (e.g. "Edited welcome.title · 2 minutes ago")
- Change-type badge on the right (dark variants matching the bar palette):
  - `edited` — `#2a2416` bg, `#FAC775` text (warn tokens)
  - `new` — `#162a1d` bg, `#7ED49A` text
  - `delete` — `#2a1818` bg, `#F08A8A` text
  - `SEO` — `#182338` bg, `#85B7EB` text (edit tokens) — for releases that only touch metadata

**Release name field**

- Label: `Release name (optional)` + hint `Helps you find it in History`
- Plain text input on `--cms-bar-bg-hover` with `--cms-accent` focus border

**Footer**

- Left: `Publishing as JD`
- Right: `Cancel` (ghost) + `Publish N changes` (primary white-on-dark, count = total items in the working copy)

---

## 7. Editing experience

When the user enters edit mode (`⌘E` or the `Edit` button), the bar transitions to the editing state and the page itself becomes interactive.

### 7.1 Editable slot model

Pages are composed of **named content slots** using dot notation: `welcome.title`, `welcome.body`, `welcome.cta`, `welcome.hero_image`. The slot name is the contract between the page template and the CMS.

### 7.2 Slot affordances

- **Default**: slots look like normal page content. No outlines, no chrome.
- **Hover**: a 1px dashed purple outline (`#AFA9EC`) appears, with the slot name in monospace 10px shown above the slot
- **Active (currently editing)**: solid 2px purple outline (`#534AB7`), 2px offset, with a faint background tint (`#fdfcff`)
- **Dirty (has unsaved changes)**: a 6×6 amber dot in the top-right corner of the slot — same amber as the bar's status pill, the All pages draft badges, etc.

The `View → Highlight editable areas` toggle makes all slot outlines permanently visible — useful for non-technical users who want to see the full editable surface at a glance.

### 7.3 Inline toolbar

When a text slot is active, a small dark toolbar floats above it:

- Bold, italic, link buttons (depending on the slot's allowed formatting)
- Divider
- `Revert` button with `⌘Z` shortcut

The toolbar's contents are **type-driven**, not user-toggleable. A plain-text title slot gets fewer options than a rich-text body slot. This matches the schema's constraint surface — the editor never offers formatting the slot can't store.

### 7.4 Non-text slots

Image, reference, and structured slots use a **side panel**, not inline editing. Clicking such a slot opens a contextual panel anchored to the slot with its specific controls (image picker, alt text, crop, etc.).

This is the hybrid model: simple things inline, structured things in a panel. The choice is type-driven; the user doesn't pick.

### 7.5 Save / Cancel semantics

Edit mode is **page-wide**, not slot-by-slot. Entering edit mode unlocks every slot on the page; `Save` commits all dirty slots together to the working copy; `Cancel` discards all unsaved edits.

If the user clicks `Cancel` with unsaved changes, show a confirmation modal: "Discard X unsaved changes?" with `Keep editing` (default) and `Discard` (destructive red).

### 7.6 First-run legend

For new users, show a small legend in the bottom-right of the page during edit mode:

- dashed line: `editable area`
- solid line: `currently editing`
- dot: `unsaved change`

Dismiss permanently after the user has been in edit mode 3+ times. Never auto-show again.

---

## 8. Responsive behavior

### 8.1 Mobile (< 600px)

- Bar goes full-width
- Menubar items collapse to a single overflow trigger (`⋯`) that opens a sheet showing all three menus stacked vertically
- Action buttons keep their priority but may shrink (icon-only at extreme widths)
- Status pill abbreviates: `Editing /` becomes `Editing` if the path is too long

### 8.2 Editing on mobile

- Inline toolbar pins to the bottom of the viewport instead of floating above the active slot (avoids being hidden behind the keyboard)
- Side panels for non-text slots become full-screen sheets

---

## 9. Keyboard shortcuts — full reference

Single-letter shortcuts only fire when no input is focused.

| Shortcut | Action                                              |
| -------- | --------------------------------------------------- |
| `⌘E`     | Enter edit mode                                     |
| `esc`    | Cancel edit / close panel                           |
| `⌘S`     | Save                                                |
| `⌘K`     | Open All pages panel                                |
| `⌘M`     | Open Media library panel                            |
| `⌘L`     | Open Locales panel (when site has multiple locales) |
| `⌘N`     | New page                                            |
| `⌘H`     | Open Recent releases panel                          |
| `⌘I`     | Open SEO panel for current page                     |
| `⌘P`     | Open Review & publish modal                         |
| `⌘⇧E`    | Toggle highlight editable areas                     |
| `⌘G`     | Toggle grid & spacing overlay                       |
| `⌘.`     | Hide/show bar                                       |
| `⌘,`     | Site settings                                       |
| `⌘↵`     | Open current page in new tab                        |
| `⌘Z`     | Revert last edit (in edit mode)                     |
| `?`      | Open keyboard shortcuts cheat sheet                 |
| `/`      | Focus search field (when a panel is open)           |

---

## 10. Things deliberately left out

These are intentional non-features for the redesign. Don't add them without a separate discussion.

- **A persistent left sidebar.** The bar is a single floating pill. A sidebar would compete with the user's primary focus (the page they're managing).
- **Tabs across multiple open pages.** Editing is single-page; the working copy is the staging area for cross-page changes. Tabs would imply parallel editing sessions, which complicates the publish model.
- **A separate "drafts" view distinct from "pages with unpublished changes."** These are the same concept; conflating them adds vocabulary without value.
- **Real-time multi-user editing indicators.** Out of scope for v1. The publish dialog's `Publishing as JD` is the only collaborator surface for now.
- **Per-slot save buttons.** Edit mode is page-wide; per-slot commits would fragment the mental model.
- **A scheduled-publishing UI.** When this lands, it gets its own panel (`Site → Releases…` with tabs). Don't cram it into the publish modal.

---

## 11. Implementation order

Suggested build order, smallest-blast-radius first:

1. **The bar in idle state.** Just the pill, the status, the menubar (with empty dropdowns), the avatar and close. Get the layout and tokens right.
2. **The three bar states.** Wire up the status pill variants and the conditional action buttons.
3. **Menu contents.** Populate Page, Site, View with their items and shortcuts. Disabled states for Discard/Publish when not applicable.
4. **The All pages and Releases panels.** Reuse the panel chrome (header, search, footer pattern).
5. **The SEO panel.** The Google preview is the headline feature — implement it before the form fields.
6. **The Review & publish modal.** This is the highest-stakes UI; build it last when patterns are settled.
7. **The editing experience.** Slot affordances, inline toolbar, dirty-state tracking. The biggest piece; depends on having the bar's editing state working first.

Each step should be reviewable in isolation. Don't try to ship everything at once.
