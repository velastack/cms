# VelaCMS admin bar redesign — handoff bundle

This directory contains everything needed to implement the admin bar redesign.

## Contents

- `DESIGN.md` — the full design brief. Self-contained; readable without prior context.
- `screenshots/skeleton/` — the original undesigned admin bar UI, for reference.
- `screenshots/redesign/` — rendered reference mockups for each surface, numbered in build order.

## Suggested workflow with Claude Code

1. Drop this whole directory into the repo (or place `DESIGN.md` at the root and reference it from your existing docs folder).
2. Open Claude Code in the project.
3. Start with a prompt like:

   > Read `DESIGN.md` and look at the screenshots in `screenshots/redesign/`. We're redesigning the existing admin bar. Start with step 1 from the implementation order section: build the bar in its idle state, with the right layout, tokens, and an empty menubar. Don't touch the panels yet. Use shadcn/ui's `Menubar` for the dropdown structure even though the menus are empty for now.

4. Review what it produces against `screenshots/redesign/01_three_states_and_menu.png` and `02_bar_with_menubar_states.png`. Iterate.
5. Move to step 2 (the three states), then step 3 (menu contents), and so on. Each step is reviewable in isolation.

## Reference mockup index

| File                             | What it shows                                                               |
| -------------------------------- | --------------------------------------------------------------------------- |
| `01_three_states_and_menu.png`   | Early concept — single hamburger menu, three bar states                     |
| `02_bar_with_menubar_states.png` | Final bar layout with three-item menubar (Page / Site / View), three states |
| `03_site_and_view_menus.png`     | Full contents of Site and View dropdowns with shortcuts                     |
| `04_all_pages_panel.png`         | Pages panel with static routes and dynamic-route template groups            |
| `05_releases_panel.png`          | History panel redesigned as a release timeline                              |
| `06_seo_panel.png`               | Per-page SEO panel with Google search preview                               |
| `07_publish_modal.png`           | Multi-page Review & publish modal with per-change checkboxes                |
| `08_editing_experience.png`      | Inline editing with named slots, floating toolbar, dirty-state indicators   |

`02_bar_with_menubar_states.png` is the canonical bar layout. `01_three_states_and_menu.png` is an earlier exploration kept for context — implement `02`.
