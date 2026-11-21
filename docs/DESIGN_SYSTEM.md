# Design system

How the app looks and why. Read this before adding or changing a screen.
Code: tokens in `apps/mobile/src/theme/tokens.ts`, components in
`apps/mobile/src/components/ui/`. Introduced in the U1 redesign (2026-11-17).

Direction: **less UI, less confusion, more clarity.** Calm warm neutrals, one
deep teal accent, flat surfaces, content first. Inspired by Apple's own apps,
Airbnb and Linear, not copied.

## Principles

1. **One primary action per screen.** It is the only filled teal button. Everything
   else is tonal (`secondary`), plain (`ghost`) or inside a "…" menu.
2. **Lists, not stacks of cards.** Collections of things (trips, places, settings,
   stops) are rows in one grouped surface (`ListGroup`) separated by hairlines.
3. **Flat in-flow content.** Cards and groups have no border and no shadow; the white
   surface on the warm background is enough. Shadows (`shadows.floating`) are only
   for things that float: the Discover save bar, map overlays, sheets.
4. **Progressive disclosure.** Rows stay clean; every secondary action for a thing
   lives in its action menu (`useActionMenu`). Settings that are rarely changed live
   behind one line that opens a sheet (Discover's "Near my hotel · Saving to …").
5. **Hierarchy through type and space**, not boxes, icons or color. Section labels
   are sentence case (`label` variant), never uppercase.
6. **Explain once, quietly.** One footnote per screen at most; no per-card notes.
7. **Show it only when it matters.** Hints, free time and suggestions appear only
   when there is something to say. Today shows at most two suggestions at once.

## Tokens

| Group | Values |
| --- | --- |
| Colors | Unchanged from M3: `background` #F6F4F0, `surface` #FFF, `surfaceMuted`, `border`, `text` #14202E, `textSecondary`, `textTertiary`, `accent` #1F5C66, `accentSoft`, `danger`, `dangerSoft`, `success`. U4 named the remaining literals: `accentSoftPressed`, `successSoft`, `surfaceTranslucent` (map controls), `textOnAccentSecondary` / `textOnAccentTertiary` / `borderOnAccent` (on the accent surface). |
| Weights | `weights.regular` / `semibold` / `bold` for emphasis outside the text variants; no literal `fontWeight` in new code. |
| Touch | `hitSlop` (8 all round) for icon buttons; `compactHitSlop` (6 vertical, 4 sideways) for chips and `Button size="sm"`. A horizontal chip row pads vertically by `compactHitSlop.top` so the target isn't clipped. |
| Type | `display` 30/700 (screen titles), `title` 20/700, `heading` 17/600, `body` 16, `bodyStrong` 16/600, `label` 13/600 (section labels, eyebrows), `caption` 13. `overline` (uppercase) is legacy; only the welcome screen uses it. |
| Radii | `md` 12 (buttons, inputs), `card` 20 (cards, groups, sheets, action menu), `pill` (chips, compact buttons). |
| Spacing | 4-pt scale `xxs` 2 … `huge` 48. Screen padding 20, section gap 24. |
| Elevation | `shadows.floating` only. `shadows.card` is kept for compatibility and is no longer used by the kit. |

## Components (`components/ui`)

| Component | Use |
| --- | --- |
| `Button` | `primary` (one per screen), `secondary` (tonal teal), `ghost` (text), `danger` (red text). `size="md"` 48 pt, `size="sm"` 36 pt pill for inline actions. |
| `ListGroup` / `ListRow` | Grouped list with optional sentence-case title and footer. Row: leading icon (tinted tile) or node, title, subtitle, trailing value, trailing node (Switch, check), chevron when tappable, `destructive`, `selected` for choice lists. |
| `useActionMenu()` | Opens the app-wide bottom action sheet (`ActionMenuProvider` is mounted in the root layout). Items: label, icon, `destructive`, `hidden`. Works the same on iOS and Android, in RTL and LTR, with any number of items. The chosen action runs after the menu has closed, so it can open a sheet or an alert. |
| `Card` | Flat white surface (radius 20). Use for one bounded object (the trip card on Home, a place over a map). |
| `Section` | Sentence-case label above content, with an optional trailing action (e.g. "New trip"). |
| `Sheet` | Native page sheet for focused tasks (pick a day, time and length, search settings, edit name). |
| `EmptyState`, `LoadingState`, `ErrorState`, `InlineError` | Empty and error states are borderless and centered; empty states invite with one action. |
| `MapSheet` | Bottom sheet over a full-screen map (U2): collapsed (the `peek`), half, full. Tap the handle to cycle, drag or flick; VoiceOver adjustable; Reduce Motion snaps. Full height still leaves the top of the map visible. Reports its height so the map can pad (`mapPadding`) and controls can sit above it. No native modules. |
| `PlaceCard` (features/places) | A saved place as a list row (inside a `ListGroup`); `standalone` wraps it in a `Card` (map overlays). |

## Patterns

- **Lists of things:** `ListGroup` per category; tap = open; a trailing "…" or a
  row tap opens the action menu when the thing has several actions.
- **Itinerary stop:** three touch targets only: the number (done/not done), the time
  chip (time and visit length) and the row (menu: open, time, directions, done,
  earlier/later, move day, mute reminders, remove time, remove from itinerary).
- **Header "…":** a screen's secondary and destructive actions (edit trip, pin hotel,
  delete trip; Google Maps, delete place). No big red buttons at the bottom of pages.
- **Choices:** a row showing the current value; tapping opens the action menu or a
  sheet with a check on the current option (language, distance unit, Discover context).
- **Proposals (U5):** a suggested change is a `ChangeRow` (check = included; tap to leave out), its
  reasons are `Tag`s, a day's load is a `LoadBar`; the primary button says what it saves.
- **Chips:** white pills without a border; the selected chip is filled teal.
- **Show it when it matters (U4):** explanations that never change (legends, how estimates
  work, pricing) wait behind one ghost link; status text appears only when something is off
  (e.g. location); a note appears only when its subject is on screen (≈ only with an estimate).
- **One copy of each action:** an action already on the screen is not repeated in its "…" menu;
  a row keeps one visible action, the rest go in its "…".
- **Touch targets:** `Button size="sm"` is 36pt tall with `compactHitSlop`; chips use
  `compactHitSlop`; icon-only controls are at least 36pt with `hitSlop`.

## Map-first screens (U2, Today)

- The map is the workspace; floating UI is limited to a top bar (back, day chip,
  "…"), two round controls above the sheet (fit day, show my location) that hide
  when the sheet is fully open, and the sheet.
- Pins carry progress without colour alone: done = small grey check, next = large
  accent filled with its number, now = green with a location icon, later = white
  with an accent number, hotel = bed icon. One emphasized line: the next leg.
- `colors.location` (#2F6FDE) is only for the user's own dot; stale = hollow grey.
- Map style: `theme/map-style.ts` (quiet, business POIs hidden).
- The one large number on Today is the leave-by time (title size, tabular figures).

## Navigation

Four tabs: **Home** (active trip card + your trips), **Discover** (search icon:
Google-first), **Saved** (the global collection), **Profile**. The old Trips tab
route still exists (`href: null`) so links keep working; Home lists every trip.

## Accessibility and languages

- Every icon-only control has an `accessibilityLabel`; menu rows announce their label;
  choice rows announce `selected`; the stop number is a checkbox.
- Touch targets ≥ 44 pt (hit slop on small chips and numbers).
- Text contrast unchanged (dark text on white/warm background; white on teal).
- All layout uses `row` with the root `direction` style, so it mirrors in Hebrew;
  direction-bearing icons use `flipInRtl`. The action menu sets `direction` itself
  because a Modal is a separate root.
- Every string is in `i18n/en.ts` and `i18n/he.ts` (parity is checked).

## Google attribution

Unchanged by the redesign: the `GoogleAttribution` component ("Google Maps", T14)
appears wherever Google place content is shown, including the redesigned rows,
the Today timeline, suggestions, the preview sheet and the Home next stop.
