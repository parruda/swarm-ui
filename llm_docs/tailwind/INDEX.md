# Tailwind CSS 4 Documentation Index

This index helps you find the right documentation file for Tailwind CSS 4 utilities.

## Quick Reference by Common Tasks

### Colors & Backgrounds
- **Background colors**: `background-color.mdx` (bg-red-500, bg-blue-600, etc.)
- **Text colors**: `color.mdx` (text-gray-900, text-white, etc.)
- **Border colors**: `border-color.mdx` (border-gray-300, border-transparent, etc.)
- **Color palette reference**: `colors.mdx`

### Layout & Positioning
- **Display types**: `display.mdx` (block, flex, grid, hidden, etc.)
- **Position**: `position.mdx` (relative, absolute, fixed, sticky)
- **Top/Right/Bottom/Left**: `top-right-bottom-left.mdx` (top-0, left-4, etc.)
- **Z-index**: `z-index.mdx` (z-10, z-50, etc.)

### Flexbox
- **Flex container**: `flex.mdx` (flex, flex-1, flex-auto, etc.)
- **Direction**: `flex-direction.mdx` (flex-row, flex-col, etc.)
- **Wrap**: `flex-wrap.mdx` (flex-wrap, flex-nowrap)
- **Align items**: `align-items.mdx` (items-center, items-start, etc.)
- **Justify content**: `justify-content.mdx` (justify-between, justify-center, etc.)
- **Gap**: `gap.mdx` (gap-4, gap-x-2, gap-y-6, etc.)

### Grid
- **Grid columns**: `grid-template-columns.mdx` (grid-cols-3, grid-cols-12, etc.)
- **Grid rows**: `grid-template-rows.mdx` (grid-rows-4, etc.)
- **Column span**: `grid-column.mdx` (col-span-2, col-start-1, etc.)
- **Row span**: `grid-row.mdx` (row-span-2, row-start-1, etc.)

### Spacing
- **Padding**: `padding.mdx` (p-4, px-6, py-2, pt-8, etc.)
- **Margin**: `margin.mdx` (m-4, mx-auto, my-8, mt-0, etc.)
- **Width**: `width.mdx` (w-full, w-1/2, w-64, etc.)
- **Height**: `height.mdx` (h-screen, h-full, h-16, etc.)

### Typography
- **Font size**: `font-size.mdx` (text-sm, text-lg, text-2xl, etc.)
- **Font weight**: `font-weight.mdx` (font-bold, font-medium, etc.)
- **Font family**: `font-family.mdx` (font-sans, font-serif, font-mono)
- **Text alignment**: `text-align.mdx` (text-center, text-left, etc.)
- **Line height**: `line-height.mdx` (leading-none, leading-tight, etc.)
- **Letter spacing**: `letter-spacing.mdx` (tracking-tight, tracking-wide, etc.)

### Borders & Rounded Corners
- **Border width**: `border-width.mdx` (border, border-2, border-t-4, etc.)
- **Border style**: `border-style.mdx` (border-solid, border-dashed, etc.)
- **Border radius**: `border-radius.mdx` (rounded, rounded-lg, rounded-full, etc.)

### Effects & Filters
- **Box shadow**: `box-shadow.mdx` (shadow, shadow-lg, shadow-none, etc.)
- **Opacity**: `opacity.mdx` (opacity-50, opacity-100, etc.)
- **Blur**: `filter-blur.mdx` (blur-sm, blur, etc.)
- **Transitions**: `transition-property.mdx` (transition, transition-colors, etc.)

### States & Responsive
- **Hover, Focus, etc.**: `hover-focus-and-other-states.mdx`
- **Responsive design**: `responsive-design.mdx`
- **Dark mode**: `dark-mode.mdx`

### Advanced Topics
- **Theme customization**: `theme.mdx`
- **Adding custom styles**: `adding-custom-styles.mdx`
- **Functions & directives**: `functions-and-directives.mdx`
- **Preflight (CSS reset)**: `preflight.mdx`

## Utility Pattern to File Mapping

When you see a utility class, use this pattern to find its documentation:
- `bg-*` → `background-color.mdx`
- `text-*` (for color) → `color.mdx`
- `text-*` (for size) → `font-size.mdx`
- `p-*`, `px-*`, `py-*` → `padding.mdx`
- `m-*`, `mx-*`, `my-*` → `margin.mdx`
- `w-*` → `width.mdx`
- `h-*` → `height.mdx`
- `flex*` → `flex.mdx`, `flex-direction.mdx`, `flex-wrap.mdx`
- `grid*` → `grid-template-columns.mdx`, `grid-template-rows.mdx`
- `items-*` → `align-items.mdx`
- `justify-*` → `justify-content.mdx`
- `rounded*` → `border-radius.mdx`
- `shadow*` → `box-shadow.mdx`
- `hover:*` → `hover-focus-and-other-states.mdx`
- `sm:*`, `md:*`, `lg:*` → `responsive-design.mdx`