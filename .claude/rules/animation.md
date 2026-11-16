# Animation Rules

**Applies to:** All UI components and transitions

## Standard Animation Settings

| Property | Value | Description |
|----------|-------|-------------|
| Duration | **0.3s (300ms)** | Not too fast, not too slow |
| Easing | **ease-in-out** | Smooth acceleration and deceleration |
| Effect | Fade + subtle transform | Gentle "ふわっと" appearance |

## Tailwind CSS Classes

```tsx
// Standard transition (recommended)
className="transition-all duration-300 ease-in-out"

// Opacity fade
className="transition-opacity duration-300 ease-in-out"

// Transform (scale, translate)
className="transition-transform duration-300 ease-in-out"

// Combined fade + slide up - a real keyframe in globals.css
className="animate-[fadeInUp_0.3s_ease-in-out]"

// Fade only / a dialog's card from 95% / a dropdown 4px down
className="animate-[fadeIn_0.3s_ease-in-out]"
className="animate-[popIn_0.3s_ease-in-out]"
className="animate-[dropIn_0.3s_ease-in-out]"

// NOT `animate-in fade-in slide-in-from-*` / `zoom-in-95`: tailwindcss-animate is
// not a dependency, so those compile to nothing (CLAUDE.md rule 15). This file
// recommended them until 2026-10-20, and 36 copies of them shipped.
```

## CSS Custom Properties

```css
:root {
  --transition-duration: 300ms;
  --transition-easing: ease-in-out;
  --transition-standard: all 300ms ease-in-out;
}
```

## Usage Examples

### Button Hover

```tsx
<button className="transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-lg">
  Click me
</button>
```

### Dropdown Menu

```tsx
<div className="transition-all duration-300 ease-in-out opacity-0 group-hover:opacity-100">
  {/* Menu content */}
</div>
```

### Modal/Dialog Appearance

```tsx
<div className="transition-all duration-300 ease-in-out scale-95 opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100">
  {/* Modal content */}
</div>
```

### Collapsible Content

```tsx
<div
  className="transition-all duration-300 ease-in-out overflow-hidden"
  style={{ maxHeight: isOpen ? '500px' : '0' }}
>
  {/* Collapsible content */}
</div>
```

### Theme Row Expand/Collapse

```tsx
{isExpanded && (
  <div className="animate-[dropIn_0.3s_ease-in-out]">
    {theme.items.map(item => <ItemRow key={item.id} item={item} />)}
  </div>
)}
```

## Animation Keyframes

For complex animations, define custom keyframes:

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeOutUp {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-10px);
  }
}

```

> **What `globals.css` actually defines** (corrected 2026-10-20): the keyframes
> `fadeInUp` (20px, not 10px), `fadeOutUp`, `fadeIn`, `popIn` and `dropIn` - and
> **no** `.animate-fade-in-up` / `.animate-fade-out-up` classes. Use the keyframe
> through Tailwind's arbitrary value, `animate-[fadeInUp_0.3s_ease-in-out]`, the
> way `dashboard/page.tsx` and `BudgetOverviewPanel.tsx` do.

## Micro-interactions

| Element | Hover | Active | Focus |
|---------|-------|--------|-------|
| Button | scale-105, shadow-lg | scale-98 | ring-2 |
| Row | bg-gray-50 | - | - |
| Link | text-blue-600 | - | underline |
| Card | shadow-xl, -translate-y-1 | - | ring-2 |

## Performance Notes

- Use `transform` and `opacity` for animations (GPU accelerated)
- Avoid animating `width`, `height`, `top`, `left` (causes layout thrashing)
- Use `will-change` sparingly for heavy animations
- Prefer CSS transitions over JavaScript animations when possible

## The one endless animation: whose turn it is (2026-10-20)

`turn-pulse` (a decision button, only while enabled) and `stage-pulse` (a ring outside the
current stage's card) breathe at **3.2s**, opacity only, forever - asked for by the owner so
nobody misses the button that is theirs. Everything else here still runs once at 0.3s; an
endless animation needs that reason. Both go still under `prefers-reduced-motion`.

