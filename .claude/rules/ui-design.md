# CAPEX Budget Control - UI Design System

## Design Philosophy: macOS Tahoe

The application follows **macOS Tahoe** design principles, emphasizing:

- **Translucency** - Glass-like surfaces with blur effects
- **Depth** - Layered elements with subtle shadows
- **Clarity** - Clean typography and generous whitespace
- **Consistency** - Unified visual language across all components

---

## 0. Page Layouts

### 0.1 Landing Page

Modern, clean design with MD Brand Colors. Simple hero section with animated icons.
Navigation menu is hidden until user logs in.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  💰 CAPEX Budget                                                🌙  Sign In │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│              Manage Your CAPEX Budget                                        │
│                                                                              │
│     Track and manage capital expenditures with ease. Multi-year planning,   │
│     theme-based organization, and powerful insights for your entire team.   │
│                                                                              │
│              [🏭] ────── [⚙️] ────── [📊]                                   │
│            Factory      Gear       Chart                                     │
│                       (spinning)                                             │
│                                                                              │
│     [Manufacturing] [Budget Tracking] [Multi-Year Planning] [ROI Analysis]   │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  💰 CAPEX Budget Control              Admin Tools                            │
│  © 2026 Hoya Corp-MD. All rights reserved.                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Animation:**
- Three icons connected by gradient arrows (Factory → Gear → Chart)
- Gear icon spins slowly (10s animation duration)
- Feature pills below the animation

**Auth-Aware Header:**
- Navigation menu (Dashboard, Themes, Items, Schedule, Summary, Admin) only visible after login
- Sign In button visible when not authenticated

### 0.2 List/Detail Split View (Themes, Items)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ☰  🏠  [Schedules] [Themes]  [Create New]  Items        Login: User  👤   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Search filters row...                                                       │
├────────────────────────────────┬────────────────────────────────────────────┤
│           List (40%)           │          Detail & Edit (60%)               │
│                                │                                            │
│ │ Selected Item              │→│  Field 1: [_______________]               │
│ │     PIC: Name            🗑 │  Field 2: [_______________]               │
│ ├──────────────────────────────│                                            │
│ │ Item 2                       │  Field 3:                                  │
│ │     PIC: Name            🗑 │  ┌────────────────────────────────────────┐│
│ ├──────────────────────────────│  │                                        ││
│ │ Item 3                       │  │                                        ││
│ │     PIC: Name            🗑 │  └────────────────────────────────────────┘│
│ ├──────────────────────────────│                                            │
│ │ ...                          │  !!! You can edit only if you are "PIC"   │
│ │                              │                                            │
│                                │                       [ UPDATE / EDIT ]    │
│ Contact info for delete...     │                                            │
└────────────────────────────────┴────────────────────────────────────────────┘
```

### 0.3 Schedule Grid View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ☰  🏠  [Items] [Themes]  [New Schedule]  [CAPEX] Schedule & Amount  User  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ← Schedule & Amount                              [FY2026|Q2] (dropdown)    │
├─────────────────────────────────────────────────────────────────────────────┤
│  [🔍 Search...] [Filters] (Ordinary)(Extra)              KUSD   [Refresh]   │
├─────────────────────────────────────────────────────────────────────────────┤
│  [<] ['23]['24]['25]['26]['27]['28]['29]['30]['31]['32]['33]['34]['35] [>]   │ ← Year selector (sticky)
├──────┬──────────────────────────────────────────────────────────────────────┤
│      │   FY'23    │  FY'24    │  FY'25     │  FY'26     │                   │
│      │Q1│Q2│Q3│Q4│Q1│Q2│Q3│Q4│Q1│Q2│Q3│Q4 │Q1│Q2│Q3│Q4 │ ← Header (sticky) │
├──────┼──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴───┴──┴──┴──┴───┴──────────────────┤
│Total │ 2,524 │ 4,212 │ 3,826 │ 1,079 │ 1,633 │13,322│ ...   [Name▲][Total▼]│
├──────┼───────────────────────────────────────────────────────────────────────┤
│ Edit │ ☐ Item Name                           PIC: Person Name               │
│&Detail│   FY23: [__][__][__][__] Total: xxx   FY24: [__][__][__][__] Total: │
└──────┴───────────────────────────────────────────────────────────────────────┘

Features:
- Fixed height layout: h-screen with overflow-hidden
- Year selector row: sticky (flex-shrink-0)
- Table header: sticky top-0 z-20 (HOYA Blue background)
- Budget type filter: Pill-style multi-select toggle (Ordinary/Extra)
  - Black = show data, White = hide data
  - Default: both black (show all)
- Sort buttons: Name (A-Z/Z-A), Total (desc/asc)
- KUSD indicator in toolbar
- Searchable theme dropdown in Filters panel
```

### 0.4 Summary By Theme View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ☰  💰 CAPEX Budget        Dashboard                     Admin  🌙  User 👤 │
├─────────────────────────────────────────────────────────────────────────────┤
│  ← Summary: By Theme                                       + Create New     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Year: [FY2026▼]   Budget In: [FY2026▼] [Q2▼]   Unit: KUSD                  │
│  Order by: [Total▼]   [Expand all]   [Combine entity]                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Grand Total (HOYA Blue bg)       │ 311,311 │  17,407 │  34,200 │   7,463 │ 370,381 │
│   Ordinary (white bg)            │  91,611 │  17,407 │         │   6,650 │ 147,511 │
│   Extra (white bg)               │ 219,700 │         │   2,357 │     813 │ 222,870 │
│                                                                              │
│ ▼ HLAO Phase3                    │  32,209 │   9,883 │   5,284 │   1,200 │  48,576 │
│     HLAO Phase 3 - QC Tools HLAO │   9,050 │         │         │         │   9,050 │
│     HLAO Phase 3 - HPG Conv HLAO │         │   2,250 │         │         │   2,250 │
│                                                                              │
│ ▶ Factory Renovation             │  18,500 │   4,200 │   1,800 │     500 │  25,000 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Features:
- Order By dropdown: Sort themes by Q1, Q2, Q3, Q4, or Total (descending)
- Expand all / Collapse all button (was "Summary", a mode that also disabled the chevrons -
  replaced 2026-09-15): opens or closes every visible theme at once; per-theme chevrons always
  work. The label is derived from which themes are open, never stored
- Combine entity button (labelled "Combine" until 2026-09-15; now the same words For IIR uses):
  Merge items with same name within each theme, their sites added together
  (now "Meeting (Combine entity)"; **on by default** since 2026-09-29 - the meeting's view)
- Grand Total row: HOYA Blue (#0057BC) background with white text
- Theme rows: MD Brand Color (HOYA Blue #0057BC with 10% opacity)
- Expandable: Click chevron to show/hide items
- Location column: Shows entity (V1, HLAO, etc.)
- All dropdowns/inputs: White background with black border
```

### 0.4b Summary For IIR View (Flat List)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ☰  💰 CAPEX Budget        Dashboard                     Admin  🌙  User 👤 │
├─────────────────────────────────────────────────────────────────────────────┤
│  ← Summary: For IIR                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  Year: [FY2026▼]   Budget In: [FY2026▼] [Q2▼]   Unit: KUSD                  │
│  [Ordinary] [Extra] [Combine entity] [1 page for IIR] [IIR item name]       │
├─────────────────────────────────────────────────────────────────────────────┤
│   │ Item Name ✏️       │ Explanation ✏️        │ Theme ✏️│ Entity │  Q1  │  Q2  │  Q3  │  Q4  │ Total │
├───┼────────────────────┼───────────────────────┼─────────┼────────┼──────┼──────┼──────┼──────┼───────┤
│   │ Grand Total (Blue) │                       │         │        │311K  │ 17K  │ 34K  │  7K  │ 370K  │
├───┼────────────────────┼───────────────────────┼─────────┼────────┼──────┼──────┼──────┼──────┼───────┤
│ ▶ │ Automation  ✏️     │ Description here...✏️ │ CD ✏️   │ HLAO   │ 5,000│      │      │      │ 5,000 │
│ ▼ │ 3.5inch Capacity   │ HLAO Phase 3...   ✏️ │ Capa ✏️ │ V1,HLAO│85,790│10,366│25,356│ 1,200│122,712│
│   │ └ 1.5M and UTG 4li │                       │         │ V2     │      │19,800│      │      │19,800 │ ← Detail (editable IIR)
│   │ └ 1.5M/Line Step 2 │                       │         │ V1     │25,250│      │      │      │25,250 │
└───┴────────────────────┴───────────────────────┴─────────┴────────┴──────┴──────┴──────┴──────┴───────┘

Features:
- Flat list view (no theme grouping, unlike By Theme page)
- Ordinary/Extra toggle buttons: Filter by budget type
- Combine entity button: Merge items with same Item name across entities
- 1 page for IIR button: Combine items by IIR item name (hi_other_item_name)
- IIR item name toggle: Show "IIR item name: xxx" vs actual explanation
- Grand Total row: Shows filtered totals (not raw totals)
- All toggle buttons: White bg inactive, Black bg active
- **Table width limited to 1400px for PowerPoint copy/paste**

"1 page for IIR" mode features:
- Theme column: Shows theme from ExplanationAndTheme_IIRS table (editable)
- Explanation column: Shows explanation from ExplanationAndTheme_IIRS table (editable)
- Item Name column: Editable IIR name (click ✏️ icon)
- Expand/collapse: Click ▶/▼ to show/hide detail items
- Detail items: Show original items that make up combined row
- Detail IIR editing: Click ✏️ on detail row → separate "IIR:" input box appears
```

### 0.4c Schedule Detail Page (Multi-Year Grid)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Test item - CAPEX  ↗                                   FY2026 | Q2  USD  │
│    Test Theme creation                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  [<] ['23]['24]['25]['26]['27]['28]['29]['30] [>]        ← Year pill selector│
├─────────────────────────────────────────────────────────────────────────────┤
│            │    FY'24     │    FY'25     │    FY'26     │ Actions │
│   Entity   │Q3│Q4│Q1│Q2│Q3│Q4│Q1│Q2│Q3│Q4│  ← Header   │
│            │Fx│Fx│Fx│Fx│Fx│Fx│Fx│Op│Op│Op│              │
├────────────┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──────────────┤
│ G.Total    │  │  │  │  │  │  │  │1M│  │  │              │ ← HOYA Blue row
├────────────┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──────────────┤
│ │ V1       │  │  │  │  │  │  │  │1M│  │  │  ✏️  🗑     │ ← Entity row
└────────────┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──────────────┘

Features:
- Horizontal scroll with inner container (inline-flex flex-col min-w-full)
- Quarter cells with vertical separator lines:
  - Blue row: border-white/30 (semi-transparent white)
  - White rows: border-slate-200 (gray lines)
- Fixed/Open status indicators below quarter headers
- Year pill selector: Black = visible, White = hidden
- Actions column with Edit/Delete buttons per entity row
```

**Horizontal Scroll Pattern:**
```tsx
{/* Outer container with overflow */}
<div className="overflow-x-auto overflow-y-hidden">
  {/* Inner container ensures consistent width across all rows */}
  <div className="inline-flex flex-col min-w-full">
    {/* Header row */}
    <div className="flex ...">...</div>
    {/* Grand Total row */}
    <div className="flex ...">...</div>
    {/* Entity rows */}
    {entities.map(entity => (
      <div className="flex ...">...</div>
    ))}
  </div>
</div>
```

**Quarter Cell Borders:**
```tsx
// Blue row (Grand Total) - white separator lines
className="... border-r border-white/30"

// White rows (Header, Entity) - gray separator lines
className="... border-r border-slate-200 dark:border-slate-600"
```

### 0.5 Themes/Items Management (List + Detail Split View)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← CAPEX Items                                             + Create New     │
│    Manage budget line items                                                 │
├────────────────────────────────┬────────────────────────────────────────────┤
│  [Search items...]              │                                            │
│  [All Themes ▼]                 │        📄  Select an Item                  │
├────────────────────────────────│                                            │
│  DSSC at CMU, Annual...       🗑│    Choose an item from the list to view   │
│    └ DSSC at CMU                │           or edit details                  │
│    👤 Hiroyuki Ishige           │                                            │
├────────────────────────────────│         [ + Create New Item ]              │
│  Wire saw MC                  🗑│                                            │
│    └ Deliver High stiffness     │                                            │
│    👤 Hiroyuki Ishige           │                                            │
├────────────────────────────────│                                            │
│  ...                            │                                            │
│                                 │                                            │
│  298 items                      │                                            │
└────────────────────────────────┴────────────────────────────────────────────┘

When item selected (Edit Form):
┌────────────────────────────────────────────────────────────────────────────┐
│  ✏️ Edit Item                                    Last modified: 2024-06-01 │
├────────────────────────────────────────────────────────────────────────────┤
│  CAPEX Theme: [Select Theme... ▼]                                          │
│  * Item Name: [_____________________________________]                      │
│  📎 Objective: [___________________________________]                       │
│  🔗 Document URL: [_______________________] [Open]                         │
│  📝 Memo: [_____________________________________]                          │
│  📝 Memo for IIR: [________________________________]                       │
│  🧮 Payback (months): [____]   ROI (%): [____]                             │
│  👤 PIC: [Select PIC... ▼]                                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                          [ Cancel ]  [ Save Changes ]      │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Color Palette

### MD Brand Colors

Based on HOYA MD Brand Identity Guidelines (Feb 2022):

```css
:root {
  /* Primary Brand Colors */
  --color-hoya-blue: #0057BC;      /* HOYA Blue - Primary actions, headers */
  --color-cyan-blue: #00A3DE;      /* Cyan Blue - Accent, secondary actions */
  --color-cool-grey: #B0B5B5;      /* Cool Grey - Secondary text, borders */
  --color-warm-black: #2D2A28;     /* Warm Black - Primary text */
  --color-white: #FFFFFF;          /* White - Backgrounds */

  /* Derived Colors */
  --color-hoya-blue-hover: #004494;
  --color-hoya-blue-light: #0057BC10;
  --color-cyan-blue-light: #00A3DE10;

  /* Semantic Colors */
  --color-success: #22c55e;        /* DO NOT USE - green nowhere (rule 33, 2026-10-20). A success is HOYA Blue, filled */
  --color-warning: #f59e0b;        /* Amber - Caution */
  --color-error: #ef4444;          /* Red - Errors */
}
```

### Dark Mode Colors

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-primary: #2D2A28;     /* Warm Black */
    --color-bg-secondary: #1a1918;
    --color-bg-tertiary: #3a3734;
    --color-text-primary: #FFFFFF;
    --color-text-secondary: #B0B5B5; /* Cool Grey */
    --color-border: #B0B5B51A;       /* Cool Grey 10% */
  }
}
```

### The palette is a closed set - CLAUDE.md rule 33

**Every colour that carries meaning is an MD brand colour or a variance of one. This is
strict.** HOYA Blue `#0057BC`, Cyan Blue `#00A3DE`, Cool Grey `#B0B5B5`, Warm Black `#2D2A28`,
white - and opacity variants of those (`/10`, `/15`, `/30`, `/40`) for tints, borders and
hovers. The neutral `slate-*` scale stays available for **structure**: page and card
backgrounds, hairlines, placeholder and secondary text. It carries no meaning.

> **It said "a decision, not a default" until 2026-09-04, and that is why this is now worded
> as an instruction.** A sentence that invites you to decide gets decided: a **green** band
> shipped to production on every finished-route notification - and mail is the half of this
> app that leaves the company, read by people from more than one organisation. It took the
> user asking. The entry behind it is rule 33 in
> [rules-that-bite.md](../docs/rules-that-bite.md).

**Three steps before a colour ships, and they are mechanical:**

1. **Is it one of the five, or a tint/shade of one at the same hue?** If not, stop. A
   "variance" means the same hue lighter or darker - `#007099` is Cyan Blue at 196 degrees and
   30% lightness, not "a blue that looked right".
2. **Measure the contrast; do not judge it.** A brand value is not automatically legible:
   `#00A3DE` as text on its own 8% tint is **2.66:1**, nowhere near AA, while the darkened
   `#007099` is **5.13:1**. Put the number in the comment - it is what separates a necessary
   darkening from a fussy one.
3. **Three exceptions, and there is no fourth** - red, amber, green-nowhere, below. Where the
   instinct says "a second hue", the answer is a second **weight**: filled or outlined, one
   hue.

**The standing debt is not a licence.** New work keeps to the palette; an existing screen is
converted when it is being touched for another reason. *"The rest of the file does it"* is the
argument that produced the green band. And **converting half a pair is worse than converting
neither** - the price report's award ticks in the mail were deliberately left green because
they mirror the compare grid on screen, and the two must not disagree.

This app has to look like one company's tool in a room where the ringi is being approved.

**A status is filled or outlined, never a second hue.** A HOYA Blue tint when a condition
holds; the white / Warm Black chip when it does not; a **line** where the instinct says
amber. One shape, two states, no legend for a reader to learn.

```tsx
// The chip both Step 2 and Step 4 use - one function, not two spellings
const conditionChipClass = (met: boolean): string =>
  `px-2.5 py-1 rounded-full text-xs font-medium ${
    met
      ? "bg-[#0057BC]/10 text-[#0057BC] border border-[#0057BC]/30 dark:bg-[#00A3DE]/15 dark:text-[#00A3DE] dark:border-[#00A3DE]/40"
      : "bg-white text-[#2D2A28] border border-[#2D2A28]/40 dark:bg-transparent dark:text-slate-300 dark:border-slate-500"
  }`;
```

**Why, in one sentence each:**

- **Green and amber read as pass/fail.** "3 quotes compared" was an emerald chip on Step 2 and
  a blue one on Step 4 - the same fact, two colours, on a screen whose job is comparison. And
  the count is a fact this app deliberately *reports without enforcing*: whether a
  single-source purchase is allowed is a purchasing policy question. A green badge answers it
  anyway.
- **A ringi is read by people from more than one company.** A colour nobody agreed needs a
  legend, and there is no legend on a printed approval sheet.
- **Two screens showing one status in two hues is one status until somebody notices.** When a
  chip already exists, export the class (rule 20) rather than writing the second spelling.

**The three semantic colours that remain**, and nothing else: `--color-error` red for a
destructive action or a refusal the reader must not miss, amber for a **reopen/withdraw**
warning, green nowhere. Reach for one only when the alternative is a reader taking a
destructive act for an ordinary one - not to decorate a state that is merely *true*.

**A worked example of that exception**: a quotation's expiry on Step 2
(`lib/approval/quotation-expiry.ts`). It is **one hue - orange - at two weights**, and the
weight carries the difference: **expired is filled and boxed** with a heavy rule (those prices
are what the ringi asks approval for, and they are no longer an offer); **within ten days is
the same orange, outlined**; **anything further out has no box and the ordinary text colour**,
because a quotation good until March is not news and must not look like it.

Two things that example teaches beyond the colour:

- **Colour alone lost.** Red text was tried first and read as a line of a table - every column
  on that grid already carries figures, chips and a tint. What made it findable was the
  **box**: a different *shape*, which the eye finds before it reads.
- **One hue, two weights, no legend.** Red-then-amber would have been two hues for one fact at
  two distances, and a ringi read by two companies should not need a key to the colours.

The three maps (`EXPIRY_TONE`, `EXPIRY_BOX`, `EXPIRY_CHIP`) live together because three
screens print that state - the compare grid, the reader's review dialog and the approval list -
and a meaning with three looks is three meanings.

> There is a **standing debt** here: `amber-*` and `red-*` still appear across ~18 components,
> most of it predating this rule, and the compare grid's award is still green. What to do
> about it is stated once, beside the closed-set rule above - **the debt is not a licence** -
> rather than a second time here, because two spellings of one rule is how they come to
> disagree (rule 20).

### Budget-Specific Colors

```css
:root {
  /* Theme Row Backgrounds */
  --color-theme-bg: #0057BC08;        /* HOYA Blue 5% */
  --color-theme-bg-dark: #0057BC14;   /* HOYA Blue 8% */

  /* Budget Type Colors */
  --color-ordinary: #0057BC;           /* HOYA Blue badge */
  --color-extra: #00A3DE;              /* Cyan Blue badge */

  /* Amount Colors */
  --color-amount-positive: #2D2A28;    /* Warm Black */
  --color-amount-zero: #B0B5B5;        /* Cool Grey */
}
```

### Form Control Styling Pattern

All dropdowns, inputs, and toggle buttons follow a consistent **white background with black border** pattern:

```css
/* Default state - white with black border */
.form-control {
  background: white;
  border: 1px solid #1e293b;           /* slate-900 */
  color: #1e293b;
}

/* Dark mode */
.form-control-dark {
  background: #0f172a;                 /* slate-900 */
  border: 1px solid #cbd5e1;           /* slate-300 */
  color: white;
}

/* Selected/Active state - filled black */
.form-control-active {
  background: #1e293b;                 /* slate-900 */
  border: 1px solid #1e293b;
  color: white;
}
```

**Tailwind Classes:**
```tsx
// Dropdown/Input (white with black border)
className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-900 dark:border-slate-300 rounded-md"

// Toggle button - inactive
className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-900 dark:border-slate-300 hover:bg-slate-50"

// Toggle button - active
className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
```

---

## 2. Typography

### Font Stack

Using **Space Grotesk** as the primary font (loaded via `next/font/google`).

```css
:root {
  --font-sans: 'Space Grotesk', -apple-system, BlinkMacSystemFont,
               'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
}
```

```typescript
// src/app/layout.tsx
import { Space_Grotesk } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});
```

### Type Scale

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| H1 (Page Title) | 28px | 700 | 1.2 |
| H2 (Section) | 22px | 600 | 1.3 |
| H3 (Card Title) | 17px | 600 | 1.4 |
| Body | 15px | 400 | 1.5 |
| Body Small | 13px | 400 | 1.4 |
| Caption | 11px | 400 | 1.3 |
| Table Header | 12px | 600 | 1.2 |
| Table Cell | 14px | 400 | 1.3 |
| Amount (Number) | 14px | 500 | 1.0 |

### Usage Examples

```tsx
// Page title
<h1 className="text-[28px] font-bold leading-tight">CAPEX Budget</h1>

// Section header
<h2 className="text-[22px] font-semibold">FY2026 Budget Overview</h2>

// Table amount
<span className="text-sm font-medium tabular-nums">311,311</span>
```

---

## 3. Spacing System

```css
:root {
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### Layout Guidelines

| Element | Padding | Gap |
|---------|---------|-----|
| Page | 24px | - |
| Card | 16px | - |
| Table Header | 12px 16px | 8px |
| Table Cell | 8px 16px | - |
| Button | 8px 16px | 8px |
| Filter Bar | 12px 16px | 12px |

---

## 4. Component Specifications

### 4.1 Glass Card

```tsx
// Component
<div className="glass-card">
  {children}
</div>

// CSS
.glass-card {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.04);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .glass-card {
    background: rgba(28, 28, 30, 0.72);
    border-color: rgba(255, 255, 255, 0.08);
  }
}
```

### 4.2 Header Bar with Supabase-style Sidebar

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ☰  CAPEX Budget                                      Admin  🌙  User Name 👤 │
└─────────────────────────────────────────────────────────────────────────────┘

When hamburger menu clicked, slides in sidebar from left:
┌──────────────────────────┬──────────────────────────────────────────────────┐
│ CAPEX Portal         [X] │  (Semi-transparent backdrop with blur)           │
├──────────────────────────┤                                                  │
│ 🏠 Home               ▸  │                                                  │
│ 🎨 Themes             ▸  │                                                  │
│ 📦 Items              ▸  │                                                  │
│ 📅 Schedule           ▸  │                                                  │
│ 📄 Report             ▾  │                                                  │
│    ├── 📊 By Theme       │                                                  │
│    └── 📄 For IIR        │                                                  │
│ ─────────────────────────│                                                  │
│ ⚙️ Admin              ▸  │                                                  │
└──────────────────────────┴──────────────────────────────────────────────────┘

Specifications:
- Header Height: 64px (h-16 on desktop, h-14 on mobile)
- Header Background: HOYA Blue #0057BC (dark: #003d82)
- Sidebar Width: 288px (w-72)
- Sidebar Background: White (dark: slate-900)
- Animation: 300ms slide-in from left
- Backdrop: Semi-transparent black (50%) with blur
```

**Menu Items with Icons:**
| Item | Icon | Route |
|------|------|-------|
| Home | Home (lucide) | /dashboard |
| Themes | Palette | /capex/themes |
| Items | Package | /capex/items |
| Schedule | Calendar | /capex/schedules |
| Report (group) | FileText | - |
| └─ By Theme | BarChart3 | /summary/by-theme |
| └─ For IIR | FileText | /summary/for-iir |
| Admin | Settings | /admin |

**Active State:**
- Background: HOYA Blue 10% opacity
- Text/Icon: HOYA Blue (#0057BC)
- Left border indicator for sub-items

**Sidebar Features:**
- **"CAPEX Portal"** as the title (`components/ui/AppName` - renamed 2026-11-15 from "CAPEX Plus", which replaced "CAPEX Budget" on 2026-09-27), "Portal" the same size and weight as "CAPEX", in HOYA Blue (`#0057BC` light, 6.8:1; Cyan `#00A3DE` dark) - no "CB" badge, here or on the signed-out header
- Expandable Report group with animated chevron
- Body scroll lock when open
- Click outside to close
- Smooth 300ms slide animation

```tsx
{/* Supabase-style Sidebar */}
<>
  {/* Backdrop */}
  <div
    className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] transition-opacity duration-300 ${
      isMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
    }`}
    onClick={closeMenu}
  />

  {/* Sidebar */}
  <div
    className={`fixed top-0 left-0 h-full w-72 bg-white dark:bg-slate-900 z-[70] shadow-2xl transition-transform duration-300 ease-out ${
      isMenuOpen ? "translate-x-0" : "-translate-x-full"
    }`}
  >
    {/* Sidebar Header */}
    <div className="flex items-center justify-between h-16 px-5 border-b">
      <AppName className="font-semibold" />
      <button onClick={closeMenu}>
        <X className="w-5 h-5 text-slate-500" />
      </button>
    </div>

    {/* Navigation */}
    <nav className="p-3 space-y-1">
      {/* Menu items with icons */}
    </nav>
  </div>
</>
```

### 4.3 Summary Cards

Dashboard displays three summary cards in a row: Grand Total, Ordinary Budget, and Extra Budget.

```
┌─────────────────────┬─────────────────────┬─────────────────────┐
│  Grand Total        │  Ordinary Budget    │  Extra Budget       │
│              +161.4%│               +10.9%│            +2465.1% │
│              vs LY  │               vs LY │               vs LY │
│  370,381 KUSD       │  147,511 KUSD       │  222,870 KUSD       │
└─────────────────────┴─────────────────────┴─────────────────────┘

Specifications:
- Layout: 3-column grid (md:grid-cols-3)
- Card style: GlassCard with p-6 padding
- Title: text-sm text-slate-500 (top-left)
- vs LY percentage: text-sm font-medium text-slate-900 (top-right, black color)
- vs LY label: text-xs text-slate-400 (below percentage)
- Value: text-2xl font-bold tabular-nums
- Unit: text-sm font-normal text-[#B0B5B5] (inline with value)
- No icons in cards (removed)
```

**Key Design Decisions:**
- Icons removed from summary cards for cleaner appearance
- Percentage change displayed in black/neutral color (not green/red)
- Format: `+XX.X%` or `-XX.X%` with "vs LY" label below

```tsx
function SummaryCard({ title, value, trend, isLoading }: { title: string; value: number; trend?: number | null; isLoading?: boolean }) {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
        {trend !== null && trend !== undefined && (
          <div className="text-right">
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
            </span>
            <p className="text-xs text-slate-400 mt-1">vs LY</p>
          </div>
        )}
      </div>
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {formatCurrency(value)}
        <span className="text-sm font-normal text-[#B0B5B5] ml-2">KUSD</span>
      </p>
    </GlassCard>
  );
}
```

### 4.4 Quarterly Breakdown Table

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                           Q1        Q2        Q3        Q4    Total │
│ Grand Total                           311,311    17,407    34,200     7,463  370,381 │
│   Ordinary                             91,611    17,407                6,650  147,511 │
│   Extra                               219,700             2,357        813   222,870 │
└─────────────────────────────────────────────────────────────────────────────┘

Specifications:
- Background: White with subtle shadow
- Font: 14px, right-aligned numbers
- Grand Total row: Bold
- Ordinary/Extra: Normal weight, indented
```

```tsx
<div className="grid grid-cols-[1fr_repeat(5,100px)] gap-4 p-4 bg-white rounded-xl shadow-sm">
  {/* Header row */}
  <div />
  <div className="text-right text-xs font-semibold text-gray-500">Q1</div>
  <div className="text-right text-xs font-semibold text-gray-500">Q2</div>
  <div className="text-right text-xs font-semibold text-gray-500">Q3</div>
  <div className="text-right text-xs font-semibold text-gray-500">Q4</div>
  <div className="text-right text-xs font-semibold text-gray-500">Total</div>

  {/* Grand Total row */}
  <div className="font-semibold">Grand Total</div>
  <AmountCell value={311311} className="font-semibold" />
  <AmountCell value={17407} className="font-semibold" />
  {/* ... */}

  {/* Ordinary row */}
  <div className="pl-4 text-gray-600">Ordinary</div>
  {/* ... */}
</div>
```

### 4.4 Budget Table

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Item Name                         │ Location │  Q1   │  Q2   │  Q3   │  Q4   │ Total │
├─────────────────────────────────────────────────────────────────────────────┤
│ ▾ HLAO Phase3                     │          │32,209 │ 9,883 │ 5,284 │ 1,200 │48,576 │ ← Theme row
│   HLAO Phase 3 - QC Tools         │ HLAO     │ 9,050 │       │       │       │ 9,050 │ ← Item row
│   HLAO Phase 3 - HPG1 Conversion  │ HLAO     │       │ 2,250 │       │       │ 2,250 │
└─────────────────────────────────────────────────────────────────────────────┘

Specifications:
- Theme row: HOYA Blue 10% (`bg-[#0057BC]/10`), bold text - it was a yellow #FFF8E6 in this
  example until 2026-10-20, which the screen never was (0.4 above; rule 33)
- Item row: White background, normal weight
- Row height: 44px (theme), 40px (item)
- Cell padding: 8px 16px
- Amount alignment: Right
- Location column width: 60px
- Quarter column width: 80px
- Total column width: 100px
```

```tsx
// Theme Row
<div className="grid grid-cols-[1fr_60px_repeat(4,80px)_100px]
               bg-[#0057BC]/10 font-semibold border-y border-[#0057BC]/30">
  <div className="flex items-center gap-2 px-4 py-3">
    <ChevronDown className="w-4 h-4" />
    <span>HLAO Phase3</span>
  </div>
  <div />
  <AmountCell value={32209} />
  <AmountCell value={9883} />
  <AmountCell value={5284} />
  <AmountCell value={1200} />
  <AmountCell value={48576} className="font-semibold" />
</div>

// Item Row
<div className="grid grid-cols-[1fr_60px_repeat(4,80px)_100px]
               hover:bg-gray-50 border-b border-gray-100">
  <div className="px-8 py-2.5">HLAO Phase 3 - QC Tools</div>
  <div className="px-2 py-2.5 text-gray-500 text-sm">HLAO</div>
  <AmountCell value={9050} />
  <AmountCell value={null} />
  <AmountCell value={null} />
  <AmountCell value={null} />
  <AmountCell value={9050} />
</div>
```

### 4.5 Amount Cell

```tsx
interface AmountCellProps {
  value: number | null;
  className?: string;
}

export function AmountCell({ value, className }: AmountCellProps) {
  if (value === null || value === 0) {
    return <div className="px-4 py-2.5" />;
  }

  return (
    <div className={cn(
      "px-4 py-2.5 text-right tabular-nums",
      className
    )}>
      {formatAmount(value, 0)}  {/* `@/lib/utils/format` - never a bare toLocaleString() (2026-10-20) */}
    </div>
  );
}
```

### 4.6 Dropdown Select

```tsx
<Select>
  <SelectTrigger className="
    w-28 h-9 px-3
    bg-white/10
    border border-white/20
    rounded-lg
    text-white text-sm
    hover:bg-white/15
    focus:ring-2 focus:ring-white/30
  ">
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent className="
    bg-white/95 backdrop-blur-xl
    border border-gray-200
    rounded-xl shadow-xl
  ">
    <SelectItem value="FY2026">FY2026</SelectItem>
    <SelectItem value="FY2025">FY2025</SelectItem>
  </SelectContent>
</Select>
```

### 4.7 Badge

```tsx
// Ordinary badge
<span className="
  px-2 py-0.5
  text-xs font-medium
  bg-blue-100 text-blue-700
  rounded-full
">
  Ordinary
</span>

// Extra badge
<span className="
  px-2 py-0.5
  text-xs font-medium
  bg-orange-100 text-orange-700
  rounded-full
">
  Extra
</span>
```

### 4.8 Multi-Select Toggle Buttons (Pill Style)

Modern pill-shaped toggle buttons for multi-select filters (e.g., Ordinary/Extra budget type):

```tsx
// State: array-based multi-select
const [selected, setSelected] = useState<string[]>(["ordinary", "extra"]);

// Toggle handler
const toggle = (value: string) => {
  setSelected(prev =>
    prev.includes(value)
      ? prev.filter(v => v !== value)
      : [...prev, value]
  );
};

// Button component
<div className="flex items-center gap-1.5">
  <button
    onClick={() => toggle("ordinary")}
    className={`px-2.5 md:px-3.5 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-full transition-all duration-300 ${
      selected.includes("ordinary")
        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md"
        : "bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 hover:border-slate-900 dark:hover:border-slate-300 hover:shadow-sm"
    }`}
  >
    Ordinary
  </button>
  <button
    onClick={() => toggle("extra")}
    className={`px-2.5 md:px-3.5 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-full transition-all duration-300 ${
      selected.includes("extra")
        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md"
        : "bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 hover:border-slate-900 dark:hover:border-slate-300 hover:shadow-sm"
    }`}
  >
    Extra
  </button>
</div>
```

**Design Principles:**
- Black fill = data shown, White fill = data hidden
- Default: both selected (both black)
- Pill shape with `rounded-full`
- Shadow on selected state
- Subtle border on unselected state
- 0.3s transition for smooth animation

### 4.9 Unsaved Changes Modal

Modal dialog shown when user tries to leave a page with unsaved changes:

```tsx
function UnsavedChangesModal({
  isOpen,
  onClose,
  onDiscard,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDiscard: () => void;
}) {
  // Real keyframes (globals.css) - `animate-in fade-in` / `zoom-in-95` compile to
  // nothing here, rule 15; this example used them until 2026-10-20.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.3s_ease-in-out]">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 animate-[popIn_0.3s_ease-in-out]">
        {/* Header with warning icon */}
        <div className="px-6 py-5 border-b flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Unsaved Changes</h3>
            <p className="text-sm text-slate-500">You have unsaved changes</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-sm text-slate-600">
            Are you sure you want to leave? Your changes will be lost.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="...">Stay on Page</button>
          <button onClick={onDiscard} className="bg-red-600 ...">Discard Changes</button>
        </div>
      </div>
    </div>
  );
}
```

**Usage with beforeunload:**
```tsx
// Prevent browser navigation
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, [hasUnsavedChanges]);
```

### 4.10 Save Button State Pattern

Three-state Save button for edit forms:

```tsx
const [hasChanges, setHasChanges] = useState(false);
const [isSaved, setIsSaved] = useState(false);
const [isSaving, setIsSaving] = useState(false);

const canSave = isValid && (isCreating || hasChanges) && !isSaving && !isSaved;

// Button states:
// 1. Disabled: No changes or invalid
// 2. Enabled: Ready to save
// 3. Saving...: In progress with spinner
// 4. Saved: Checkmark, then resets

<button
  onClick={handleSave}
  disabled={!canSave}
  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-colors shadow-lg ${
    canSave
      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800"
      : "bg-slate-300 dark:bg-slate-600 text-slate-500 cursor-not-allowed"
  }`}
>
  {isSaving ? (
    <>
      <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
      Saving...
    </>
  ) : isSaved ? (
    <>
      <Check className="w-4 h-4" />
      Saved
    </>
  ) : (
    <>
      <Save className="w-4 h-4" />
      {isCreating ? "Create Item" : "Save Changes"}
    </>
  )}
</button>
```

### 4.11 RichTextEditor Component

Rich text editor for multi-line formatted content (used in Approval System):

```tsx
import { RichTextEditor } from "@/components/ui/RichTextEditor";

<RichTextEditor
  value={htmlContent}
  onChange={(html) => setContent(html)}
  placeholder="Enter description..."
/>
```

**Toolbar Features:**
- **B** - Bold
- **I** - Italic
- **U** - Underline
- **Bullet list** - Unordered list
- **Number list** - Ordered list
- **A** (color) - Text color picker (6 colors)
- **Highlight** - Background highlight picker (5 colors)
- **Link** - Create link with URL validation

**Styling:**
```tsx
// Toolbar
className="flex items-center gap-0.5 p-1 border-b border-slate-200 bg-slate-50"

// Editor area
className="prose prose-sm dark:prose-invert max-w-none p-3 min-h-[120px] focus:outline-none"

// Color picker dropdown
className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border p-2 z-50"
```

**Security (XSS Protection):**
```typescript
import DOMPurify from "isomorphic-dompurify";
import { SANITIZE_CONFIG } from "@/lib/constants/editor";

// Sanitize on render
const sanitizedValue = DOMPurify.sanitize(value, SANITIZE_CONFIG);

// URL validation for links
function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return false;  // Reject dangerous protocols
  }
  // Only allow http/https
  const parsed = new URL(normalized);
  return ["http:", "https:"].includes(parsed.protocol);
}
```

**Rendering HTML Content:**
```tsx
// In detail/view pages, render sanitized HTML
<div
  className="prose prose-sm dark:prose-invert max-w-none [&_a]:text-blue-500 [&_a]:underline"
  dangerouslySetInnerHTML={{
    __html: DOMPurify.sanitize(content || "", SANITIZE_CONFIG),
  }}
/>
```

---

## 5. Icons

Using **Lucide Icons** (MIT licensed, consistent with Tailwind ecosystem).

| Icon | Usage |
|------|-------|
| `Menu` | Hamburger menu |
| `Home` | Home/Dashboard |
| `ChevronDown` | Dropdown, Expand |
| `ChevronRight` | Collapsed |
| `RefreshCw` | Refresh data |
| `Search` | Search input |
| `Filter` | Filter panel |
| `Download` | Export |
| `Settings` | Settings |
| `User` | User menu |

```tsx
import {
  Menu, Home, ChevronDown, ChevronRight,
  RefreshCw, Search, Filter, Download,
  Settings, User
} from 'lucide-react';

<Menu className="w-5 h-5" />
```

---

## 6. Responsive Breakpoints

```css
/* Tailwind CSS v4 breakpoints (mobile-first) */
default: < 640px   /* Mobile phones */
sm: ≥ 640px        /* Large phones, small tablets */
md: ≥ 768px        /* Tablets */
lg: ≥ 1024px       /* Laptops, small desktops */
xl: ≥ 1280px       /* Desktops */
2xl: ≥ 1536px      /* Large desktops */
```

### Responsive Behaviors

| Breakpoint | Layout |
|------------|--------|
| < 640px | Single column, Name+Total only in tables, h-14 header, icons only buttons |
| 640px+ | + Location column, abbreviated text labels |
| 768px+ | + Q1/Q2 columns, 2-column grids, h-16 header, full button text |
| 1024px+ | All Q1-Q4 columns, 3-column grids, side-by-side list/detail |

### Header Responsive Patterns

```tsx
// Header height
className="h-14 md:h-16"

// Sticky toolbar position (below header)
className="sticky top-14 md:top-16 z-40"

// Logo text - abbreviated on mobile
<span className="text-base md:text-lg font-semibold">CAPEX</span>
<span className="hidden sm:inline"> Budget</span>
```

### Table Column Progressive Hiding

```tsx
// Always visible
<th>Item/Theme</th>
<th>Total</th>

// Show on sm+ (640px)
<th className="hidden sm:table-cell">Location</th>

// Show on md+ (768px)
<th className="hidden md:table-cell">Q1</th>
<th className="hidden md:table-cell">Q2</th>

// Show on lg+ (1024px)
<th className="hidden lg:table-cell">Q3</th>
<th className="hidden lg:table-cell">Q4</th>
```

### List/Detail Layout Order

```tsx
// Edit form appears first on mobile (order-1), list second (order-2)
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
  <div className="lg:col-span-1 order-2 lg:order-1">{/* List */}</div>
  <div className="lg:col-span-2 order-1 lg:order-2">{/* Edit form */}</div>
</div>
```

### Mobile-Specific Patterns

```tsx
// Responsive padding
className="p-3 md:p-6"
className="px-2 md:px-4"

// Responsive text
className="text-xs md:text-sm"
className="text-base md:text-lg"

// Responsive icons
className="w-4 h-4 md:w-5 md:h-5"
className="w-5 h-5 md:w-6 md:h-6"

// Responsive grid
className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3"

// Responsive gaps
className="gap-2 md:gap-4"
className="gap-3 md:gap-6"

// Hide on mobile, show on larger
className="hidden sm:inline"
className="hidden md:block"

// Show only on mobile
className="sm:hidden"

// Truncate text
className="truncate"

// Prevent shrinking
className="shrink-0"

// Allow shrinking below content
className="min-w-0"
```

### Button Responsive Patterns

```tsx
// Create New button - short text on mobile
<button className="flex items-center gap-1 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2">
  <Plus className="w-4 h-4 md:w-5 md:h-5" />
  <span className="hidden sm:inline">Create New</span>
  <span className="sm:hidden">New</span>
</button>

// Toolbar button - icon only on mobile
<button className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5">
  <Icon className="w-4 h-4 md:w-5 md:h-5" />
  <span className="text-xs md:text-sm hidden sm:inline">Label</span>
</button>
```

### Testing Viewports

| Width | Device |
|-------|--------|
| 320px | iPhone SE |
| 390px | iPhone 12/13/14 |
| 768px | iPad |
| 1024px | Laptop |
| 1280px | Desktop |

**See `.claude/rules/responsive.md` for complete responsive design rules.**

---

## 7. Animations

```css
/* Transitions */
--transition-fast: 150ms ease;
--transition-normal: 200ms ease;
--transition-slow: 300ms ease;

/* Usage */
.button {
  transition: all var(--transition-fast);
}

.dropdown-content {
  transition: opacity var(--transition-normal),
              transform var(--transition-normal);
}

/* Expand/Collapse */
.theme-group-content {
  transition: max-height var(--transition-slow),
              opacity var(--transition-normal);
}
```

### Micro-interactions

| Element | Hover | Active | Focus |
|---------|-------|--------|-------|
| Button | bg-opacity increase | scale(0.98) | ring-2 |
| Row | bg-gray-50 | - | - |
| Link | text-blue-600 | - | underline |
| Dropdown | bg-white/15 | - | ring-2 |

---

## 8. Dark Mode Support

```tsx
// Tailwind dark mode classes
<div className="
  bg-white dark:bg-gray-900
  text-gray-900 dark:text-white
  border-gray-200 dark:border-gray-700
">
  {children}
</div>

// System preference
<html className="dark:bg-black">
```

### Dark Mode Color Mappings

| Element | Light | Dark |
|---------|-------|------|
| Page Background | #F9FAFB | #000000 |
| Card Background | #FFFFFF | #1C1C1E |
| Theme Row | `#0057BC` 10% | `#0057BC` 20% |
| Border | #E5E7EB | #38383A |
| Text Primary | #111827 | #FFFFFF |
| Text Secondary | #6B7280 | #8E8E93 |

---

## 9. Accessibility

### Color Contrast

- All text meets WCAG 2.1 AA (4.5:1 ratio)
- Interactive elements have visible focus states
- Icons have aria-labels when standalone

### Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab | Move between interactive elements |
| Enter/Space | Activate buttons, select options |
| Arrow Up/Down | Navigate dropdown options |
| Escape | Close dropdowns, modals |

### Screen Reader

```tsx
// Table header
<th scope="col" className="sr-only">Actions</th>

// Amount cell
<td aria-label="Q1 amount: 32,209">32,209</td>

// Theme expand button
<button aria-expanded={isExpanded} aria-controls={`theme-${id}-items`}>
  <ChevronDown aria-hidden="true" />
  <span className="sr-only">{isExpanded ? 'Collapse' : 'Expand'} {themeName}</span>
</button>
```
