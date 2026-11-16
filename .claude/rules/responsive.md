# Responsive Design Rules

**Applies to:** All pages and components

## Tailwind CSS v4 Breakpoints

| Breakpoint | Width    | Target Device           |
|------------|----------|-------------------------|
| default    | < 640px  | Mobile phones           |
| sm         | ≥ 640px  | Large phones, small tablets |
| md         | ≥ 768px  | Tablets                 |
| lg         | ≥ 1024px | Laptops, small desktops |
| xl         | ≥ 1280px | Desktops                |
| 2xl        | ≥ 1536px | Large desktops          |

**Mobile-first approach:** Default styles are for mobile, then add breakpoint modifiers.

## Header Component

```tsx
// Height: smaller on mobile
className="h-14 md:h-16"

// Padding: tighter on mobile
className="px-3 md:px-6"

// Gaps: smaller on mobile
className="gap-2 md:gap-6"

// Icons: smaller on mobile
className="w-5 h-5 md:w-6 md:h-6"

// Logo text: abbreviated on mobile
<span className="text-base md:text-lg font-semibold">CAPEX</span>
<span className="text-base md:text-lg font-semibold hidden sm:inline"> Budget</span>

// Sticky toolbar below header
className="sticky top-14 md:top-16 z-40"
```

## Data Tables (Progressive Column Hiding)

For tables with many columns (Q1-Q4 + Total), progressively hide columns on smaller screens:

```tsx
// Column visibility patterns
<th className="hidden lg:table-cell">Q3</th>      // Show on lg+ (1024px+)
<th className="hidden lg:table-cell">Q4</th>      // Show on lg+ (1024px+)
<th className="hidden md:table-cell">Q1</th>      // Show on md+ (768px+)
<th className="hidden md:table-cell">Q2</th>      // Show on md+ (768px+)
<th className="hidden sm:table-cell">Location</th> // Show on sm+ (640px+)
<th>Item/Theme</th>                               // Always show
<th>Total</th>                                    // Always show

// Summary By Theme column visibility:
// Mobile (< 640px): Name + Total, plus ONE quarter the toolbar offers
// sm (640px+): + Location
// md (768px+): + Q1, Q2, Q3, Q4 (all columns, no toolbar control)
//
// **All four quarters arrive together, and that is the point.** They were
// split - Q1/Q2 at `md`, Q3/Q4 at `lg` - which left every width from 768 to
// 1023 showing half a year on a screen whose job is the whole year. Reported
// 2026-09-07 as "I cannot see Q3 and Q4 at this width".
//
// They fit because the table is `table-fixed` with a shared colgroup: the
// fixed columns come to 530px (Loc 70 + 4x90 + Total 100), so at 768 the name
// column still gets 238px, above its own `md:min-w-[200px]`. It costs the
// name column ~180px at that width, which is the trade being made: a truncated
// name with a `title` beats a quarter you cannot see at all.
//
// Measured after the change at 390/767/768/900/1024/1440 - both tables
// aligned, **0 clipped cells**, 0 page overflow. The quarter cells went from
// `md:px-3` to `md:px-2` to get there: `114,000` with its IIR tick needed 92px
// in a 90px box, which `table-fixed` clips rather than growing around.
//
// **Below `md` the answer is not "hide them", it is "offer one".** A phone has
// room for the name and one figure, so four pills in the toolbar (`md:hidden`)
// put a chosen quarter beside the Total; none selected is the default and is
// what the screen always did. `quarterCellClass()` is the single rule every
// cell and every `<col>` in those columns reads.
//
// Restacking each row into a card was the obvious alternative and is the wrong
// one here: it shows all four but destroys what this screen is for, which is
// reading one column *down* a list of items. A selector keeps the scan.
//
// The phone column is `w-[78px]`, not the `w-[60px]` the other narrow columns
// use - `114,000` with its IIR tick does not fit 60px, and under `table-fixed`
// that clips silently. Measured at 320/360/390 x every quarter: aligned, 0
// clipped, 0 overflow.
```

## A table inside `overflow-x-auto` needs a `min-w-`, or it never scrolls

**`overflow-x-auto` around a `w-full` table does not produce a scrollbar - it produces
crushed columns.** `w-full` means "fit the container", so the table always fits and the
wrapper has nothing to scroll; the columns absorb the shortfall until a header reads one
character to a line. Eight tables in this app were doing exactly that, and the fix is on the
**table**, not the wrapper:

```tsx
<div className="overflow-x-auto">
  {/* min-w- is what makes the wrapper scroll. Size it to the columns. */}
  <table className="w-full min-w-[860px] text-sm">
```

Pick the min-width from the columns: roughly 100-140px each, more for a name or a picker.

**But a min-width is only right for a table that should scroll.** Ask which kind it is:

- **A form table - rows people fill in.** It **restacks**: one card per row below `md`, and
  the min-width applies only from `md`. Sideways scrolling failed here in the plainest way -
  the Schedule's last two columns sat off the right edge with no visible scrollbar, and were
  reported as "not shown", which is exactly what they were.
- **A comparison grid - columns that only mean something side by side.** It **scrolls**,
  because restacking would destroy the comparison. Give it a visible count of what is off the
  edge, and check the sticky-column arithmetic above.
- **A wide read-only table.** Progressive column hiding (`hidden md:table-cell`) is the third
  option, and one that uses it needs no min-width - it is deliberately narrower on a phone.

  > **Hiding four of eight columns is not the same as fitting.** The approval list hid Site,
  > Applicant, Date and Amount below `md` and still needed 612px in a 466px box, so Status -
  > the column somebody had just asked to see - sat off the right edge behind a scrollbar
  > nobody can see. What was left had to be measured too: the culprit was a `max-w-xs`
  > (320px, the whole of a phone) on the title, plus `px-4` on every cell. `max-w-[9rem]
  > sm:max-w-xs`, `px-2 md:px-4` and a narrower chevron column brought it to exactly 390.
  > **Check the columns that survive, not the ones you removed.**
  >
  > **And then check it again, because one chip put it back.** Reported 2026-09-07: Status off
  > the right edge, on a laptop. The quotation-expiry chip had since landed in that column and
  > `Quote expired 52 days ago` renders at **175px**, which set the width of the whole column.
  > Measured across the range rather than at the floor, the table was cut off at **every width
  > below 1230px** - 115px at 390, 353px at 768, 219px at 1024 - and `page` overflow was 0 the
  > whole time, so the 390px rule at the top of this file passed while the screen was wrong.
  >
  > Two lessons, and the second is the one that cost the time:
  >
  > - **A column with no `hidden` class is not a visible column.** Status was marked
  >   always-shown and was the one nobody could see. The classes say what may be dropped; only
  >   a measurement says what fits.
  > - **`390: 0` is not a passing grade, it is one sample.** The floor is the *narrowest* case,
  >   never the worst one: this table's worst width was 768, the first pixel of `md`, where a
  >   whole set of columns switches on at once. **Sweep the range** - 375, 390, 640, 767, 768,
  >   900, 1023, 1024, 1280 - and look at both sides of every breakpoint.
  >
  > The repair was four small things and no new pattern: the chip prints `Quote expired` below
  > `xl` with the sentence kept in its `title` (`expiryShort()` beside `expiryNote()`), the
  > title max-width steps `5.5rem -> 11rem -> 10rem@md -> 13rem -> xs` instead of jumping to
  > 320px at `sm`, `md:px-4` became `md:px-3` on all 24 cells, and **Site moved from `md` to
  > `lg`** - a table showing a column half-cut is worse than one that admits it has no room.
  > Now 0 from **375px to 1920px**; 360 is 13px over and 320 is 53px over, both below the
  > project's stated floor.

**Restacking, with one markup** (rule 20 - not a second copy of the inputs): switch `display`
on the table parts and let each cell grow its own heading.

```tsx
<table className="w-full text-sm md:min-w-[860px]">
  <thead className="hidden md:table-header-group"> … </thead>
  <tbody>
    <tr className="block border-t px-3 py-3 md:table-row md:px-0 md:py-0">
      <td className="block px-0 py-1.5 md:table-cell md:px-2 md:py-1">
        <CellLabel>Order</CellLabel>   {/* md:hidden - above md the thead says it */}
        <input … />
      </td>
```

Keep the heading text in **one** place and read it from both the `<thead>` and the
`CellLabel` (`SCHEDULE_DATE_LABELS`), or "Acceptance" becomes two strings that agree until
somebody renames one.

## A sticky first column is a fixed cost, and on a phone it eats the table

The price compare grid scrolls sideways with the Scope line column pinned at
`sticky left-0`. That column is **not visible space for the ones behind it**, so
the window a supplier column has to fit into is `clientWidth - stickyWidth`. At
390px that was `314 - 224 = 90px` against columns of 235-249px: **no supplier
column could ever be brought wholly into view**, at any scroll position. Prices
were cut mid-number and the Adopt button was half off the edge - and the grid
looked like it was working, because it did scroll.

**The rule: `stickyWidth + widestColumn <= clientWidth` at 390px, or the table
has a column nobody can read.** Check it, do not assume it:

```js
const box = document.querySelector(".overflow-x-auto");
const sticky = box.querySelector("[data-sticky-column]").offsetWidth;
box.clientWidth - sticky >= widestColumnWidth;   // must be true
```

What sets a column's width is usually **content inside it**, not the `<th>`:
here it was a `max-w-56` on the supplier-name box. `max-width` on a table cell
is ignored in auto layout, so cap the **inner div** (`max-w-32 md:max-w-56`) and
bring the sticky column down with it (`w-36 min-w-36 md:w-64 md:min-w-56`).

**An overlay pinned over the grid also has to move.** The "N more" pills sat
`absolute left-0 / right-0 top-1/2`; over a 900px grid they cover margin, over a
314px one they cover the scope line itself. One markup, two placements - the
`md:contents` trick below, with `relative` on the phone and `md:absolute` above.

## A `w-full` table with few columns stretches them, and it is the same bug in reverse

The price compare grid is `w-full`, which is right for five suppliers and wrong for one:
the browser has nowhere to put the spare width but *into* the columns, so a single
quotation rendered as a **~900px column with its figures right-aligned against the far edge
of the screen**, a hand's width from the scope line they belong to. Reported (2026-09-05) as
"show it from the left with an appropriate width", which is exactly what it needed.

The fix is a **trailing cell of `width: 100%`** - a column that exists only to take the
slack - plus a real width on the columns that are left:

```tsx
const roomyColumns = columns.length <= 2;
// header:  {roomyColumns && <th aria-hidden className="w-full p-0" />}
// each row: <SlackCell show={roomyColumns} />
className={`... ${roomyColumns ? "md:w-64 md:min-w-64" : "md:min-w-40"} ...`}
```

**The condition is the part that matters.** Pinning every column to a fixed width would push
the fifth supplier off the edge of a laptop - measured: five 208px columns plus the 249px
sticky column need 1289px against a 1106px box, where sharing the row out fits in exactly
0px of overflow. A comparison you have to scroll to finish is what this grid exists to
avoid, so from three columns up nothing changes at all: no slack cell, no fixed width.

Two things to keep in mind if you copy this:

- **The spacer carries no classes.** The row's own `border-t` and tint then paint straight
  through it, which is what keeps a category heading's band and every row rule running to
  the edge of the panel. A spacer with `bg-white` on a tinted row is a white notch.
- **Header and body must agree.** The `w-full` lives on the header cell (that is what sizes
  the column), and both are behind the same flag - a header carrying a cell the body rows do
  not is a column count mismatch.

It cannot cause overflow: a cell that only absorbs positive slack has nothing to absorb at
390px, where the phone's `min-w-36` and the sticky-column arithmetic above are untouched.

## A label + field pair: `md:contents`

For a form row that is **one stacked thing on a phone and two cells of a grid on a desktop**,
wrap the pair and dissolve the wrapper at `md`. The desktop grid stays byte for byte what it
was, and there is only one markup to keep in step:

```tsx
const PAIR = "flex flex-col gap-1.5 md:contents";   // gap, NOT space-y - see below
const ROW  = "grid grid-cols-1 gap-4 px-4 py-3 md:px-5 md:items-center md:grid-cols-[180px_1fr_180px_1fr]";

<div className={ROW}>
  <div className={PAIR}><div className={LABEL}>Site</div><div>{input}</div></div>
  <div className={PAIR}><div className={LABEL}>Item</div><div>{input}</div></div>
</div>
```

Two things that bite:

- **Use `gap`, never `space-y`, inside the wrapper.** `space-y-*` puts a `margin-block-end`
  on every child but the last, and **a margin survives `display: contents`**: at `md` the
  wrapper vanishes but the label is still a grid item carrying that margin, which
  `items-center` then centres a few pixels off its own input. `gap` belongs to the flex
  container and disappears with it. (Fighting it with `md:space-y-0` does not work either -
  `space-y-*` compiles inside `:where()`, so both rules have zero specificity.)
- **A placeholder cell that only exists to hold the grid's shape** needs `hidden md:contents`,
  not a bare `<div />`. On a phone there is no grid to hold, and an empty pair reads as a
  field nobody answered.

## Responsive Column Widths

Replace fixed widths with responsive patterns:

```tsx
// Wrong - breaks on mobile
className="w-[350px] min-w-[350px]"

// Correct - responsive width
className="min-w-[120px] md:min-w-[200px] lg:min-w-[350px]"

// Correct - flexible width
className="w-[50px] md:w-[70px]"
className="w-[60px] md:w-[90px]"
className="w-[70px] md:w-[100px]"
```

## List/Detail Split View Layout

On mobile, show the edit form first (more important), list second:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
  {/* Left Panel - List */}
  <div className="lg:col-span-1 order-2 lg:order-1">
    {/* List content - appears second on mobile */}
  </div>

  {/* Right Panel - Detail & Edit */}
  <div className="lg:col-span-2 order-1 lg:order-2">
    {/* Edit form - appears first on mobile */}
  </div>
</div>
```

## Scrollable Lists

Limit height on mobile to prevent excessive scrolling:

```tsx
// List panel height
className="max-h-[300px] md:max-h-[calc(100vh-320px)] overflow-y-auto"
```

## Responsive Text Sizes

```tsx
// Headers
className="text-base md:text-xl font-bold"
className="text-xl md:text-2xl font-semibold"
className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold"

// Body text
className="text-xs md:text-sm"
className="text-sm md:text-base"

// Table cells
className="text-xs md:text-sm"

// Badges
className="text-[10px] md:text-xs"
```

## Responsive Padding & Gaps

```tsx
// Page padding
className="p-3 md:p-6"
className="px-3 md:px-4"

// Card padding
className="p-4 md:p-6"
className="p-5 md:p-8"

// Gaps
className="gap-2 md:gap-4"
className="gap-3 md:gap-6"
className="gap-4 md:gap-8"

// Cell padding
className="py-1.5 md:py-2"
className="px-2 md:px-4"
className="px-1 md:px-3"
```

## Responsive Icons

```tsx
// Standard icons
className="w-4 h-4 md:w-5 md:h-5"
className="w-5 h-5 md:w-6 md:h-6"
className="w-6 h-6 md:w-7 md:h-7"

// Hero section icons
className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10"
```

## Toolbar Controls (Summary By Theme)

```tsx
// Button with icon + text
<button className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5">
  <Icon className="w-4 h-4 md:w-5 md:h-5" />
  <span className="text-xs md:text-sm hidden sm:inline">Label</span>
</button>

// Select dropdown
<select className="px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm">

// Labels hidden on mobile
<span className="text-xs md:text-sm font-medium hidden sm:inline">Year</span>

// Search input
<input className="w-full pl-7 md:pl-9 pr-2 md:pr-3 py-1 md:py-1.5 text-xs md:text-sm" />
```

## Summary Cards Grid

```tsx
// Dashboard summary cards
className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4"

// Reports cards
className="grid grid-cols-2 gap-3 md:gap-4"
```

## Form Fields

```tsx
// Two-column form on desktop, single column on mobile
className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4"

// Example: Payback/ROI fields
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
  <div>{/* Payback field */}</div>
  <div>{/* ROI field */}</div>
</div>
```

## Buttons

```tsx
// Create New button - abbreviated on mobile
<button className="flex items-center gap-1 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 text-sm md:text-base">
  <Plus className="w-4 h-4 md:w-5 md:h-5" />
  <span className="hidden sm:inline">Create New</span>
  <span className="sm:hidden">New</span>
</button>

// Sign-in button - full width on mobile
className="w-full sm:w-auto px-6 sm:px-8 md:px-10 py-3.5 sm:py-4 md:py-5"
```

## Page Headers

```tsx
// Blue header bar
<div className="bg-[#0057BC] text-white">
  <div className="px-3 md:px-6 py-3 md:py-4">
    <div className="flex items-center justify-between gap-2">
      {/* Back button + title on left */}
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        <Link className="p-1.5 md:p-2">
          <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-base md:text-xl font-bold truncate">Page Title</h1>
          <p className="text-xs md:text-sm text-white/70 hidden sm:block">Subtitle</p>
        </div>
      </div>

      {/* Action button on right */}
      <button className="shrink-0">...</button>
    </div>
  </div>
</div>
```

## Utility Classes

```tsx
// Prevent shrinking
className="shrink-0"
className="flex-shrink-0" // deprecated, use shrink-0

// Prevent overflow
className="min-w-0"  // Allow flex items to shrink below content size
className="truncate" // Truncate overflowing text

// Whitespace
className="whitespace-nowrap" // Prevent text wrapping
```

## Testing Responsive Design

Test at these viewport widths:

| Width | Device |
|-------|--------|
| 320px | iPhone SE |
| 375px | iPhone 12 mini |
| 390px | iPhone 12/13/14 |
| 428px | iPhone 14 Pro Max |
| 768px | iPad |
| 1024px | iPad Pro / Laptop |
| 1280px | Desktop |
| 1440px | Large Desktop |

## Common Patterns Summary

| Pattern | Mobile | Tablet (md) | Desktop (lg) |
|---------|--------|-------------|--------------|
| Header height | h-14 | h-16 | h-16 |
| Table columns | Name + Total | + Location, Q1-Q4 | (all, wider name) |
| Grid columns | 1 | 2-3 | 3 |
| List/Detail order | Edit first | Edit first | List left, Edit right |
| Text size | xs/sm | sm/base | base/lg |
| Padding | p-3 | p-4-6 | p-6-8 |
| Button text | Icon only or short | Full text | Full text |
