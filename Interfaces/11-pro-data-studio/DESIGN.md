# Apple Pro Data Studio — Design System

## Brief

Designing a high-density analytical workspace for operators, data scientists, and finance teams on the web. The primary goal is to compare datasets, inspect anomalies, and export a defensible report without losing context. The tone is precise, calm, native, and quietly premium. The main risk is turning “Apple style” into oversized soft cards and decorative glass.

## Reference lock

**Primary direction:** professional macOS workspaces such as Numbers, Xcode inspectors, and Finder list views.

**Preserve:**

- fixed command toolbar with compact icon tools;
- navigator / canvas / inspector spatial model;
- silver-white canvas built from precise one-pixel separators;
- system typography with tabular numerals and compact labels;
- low 3–8 px radii; elevation reserved for floating feedback and dialogs.

**Borrow only:** dense financial-table alignment for the grid; scientific-plot restraint for chart axes, annotations, and legends.

**Role rules:** teal is active-tool and primary-series only. Semantic colors are restricted to status and feedback. Neutral gray owns all structural chrome. No gradient is a decorative surface.

**Media strategy:** charts are code-native SVG with visible axes, labels, comparative series, and annotations. No stock imagery is appropriate for this product.

**Reject:** rounded-card mosaics, large marketing type, colorful category tiles, permanent shadows, indigo, ornamental blur, and fake macOS traffic lights.

## Token commitments

| Role | Commitment |
| --- | --- |
| Canvas | `#eceef0` silver workspace behind panels |
| Surface | white and cool gray, differentiated mainly by borders |
| Type | system UI; 11–13px controls, tabular numeric data |
| Accent | `#0f766e`, only active selection/tool and main data series |
| Radius | 3px controls, 5px panels, 8px floating overlays |
| Border | `#d4d7da`, always 1px |
| Elevation | none for layout; subtle shadow only for popovers/modal/toast |
| Motion | 110ms feedback, 180ms state, 240ms overlay; reduced motion removes transforms |

## Decision ledger

| Decision | Source | Source rule / role | Why |
| --- | --- | --- | --- |
| Three-pane workspace | User brief + macOS workspace pattern | Navigation, work, inspection remain spatially stable | Keeps analytical context visible during selection changes |
| Dense 28–32px rows | Professional data-grid craft | Density must reflect repeated expert use | Supports comparison without excessive scrolling |
| Teal active state | User constraint | Active tools and key series only | Gives focus without turning the product colorful |
| Tabular numerals | Typography craft | Metrics and grid values align by digit | Makes scanning variances materially easier |
| Flat sections over cards | Anti-AI-slop guidance | Borders and layout establish grouping | Prevents generic dashboard appearance |
| SVG charts | Product requirement | Real data marks, axes, legends, annotations | Keeps charts crisp, dependency-free, and credible |
| Inspector on right | Apple pro-app convention | Properties follow current selection | Makes the page feel like a tool, not a report |
| Mobile canvas priority | Responsive craft | Secondary panes become horizontally available or hidden | Preserves the dataset and chart, the core job-to-be-done |

## Component architecture

- `components/ui.tsx`: controls, feedback, navigation, tables, and layout primitives.
- `components/icons.tsx`: consistent 16px outlined SVG icon system.
- `components/charts.tsx`: line, bar, scatter, and heatmap visualization primitives.
- `components/studio-shell.tsx`: shared command bar and three-pane responsive shell.
- `app/kit/page.tsx`: full, production-component-driven system inventory.
- `app/page.tsx`: realistic production analysis workspace composed from the same kit.

## Accessibility

- All interactive elements expose text or `aria-label`.
- Focus uses a visible teal outline and never relies on color alone.
- Statuses pair color with text or an icon.
- Minimum mobile touch target is 40px; dense desktop controls expand at narrow widths.
- `prefers-reduced-motion` disables non-essential transforms and animation.
