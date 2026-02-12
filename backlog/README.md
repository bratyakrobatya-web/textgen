# Backlog / Development History

## design-demo/
Interactive design lab for evaluating visual effects before applying to production.

**Created:** 2026-02-12
**Status:** Completed — 9 of 10 effects applied to prod, glass blur (#6) rejected (performance).

**How to run:** `python3 -m http.server 8001` from repo root, open `/backlog/design-demo/`

**Effects evaluated:**
1. Gradient background — APPLIED
2. Layered shadows — APPLIED
3. Pill hover lift — APPLIED
4. Styled scrollbar — APPLIED
5. CTA glow — APPLIED
6. Glass cards (backdrop-filter blur) — REJECTED (heavy render cost on scroll)
7. Gradient borders — APPLIED
8. Card hover lift — APPLIED
9. Smooth state transitions — APPLIED
10. Gradient headings — APPLIED

## gradient-test/
Interactive gradient playground for choosing heading gradient type, angle, and colors.

**Created:** 2026-02-12
**Status:** Completed — radial purple gradient for h1, linear purple for h3 applied to prod.

**How to run:** `python3 -m http.server 8001` from repo root, open `/backlog/gradient-test/`

## layout-test/
Interactive layout playground with sliders for all sizing parameters (container width, paddings, gaps, all font sizes, logo size). 4 presets (Compact/Default/Large/XL) + live CSS output.

**Created:** 2026-02-12
**Status:** Completed — user-tuned values applied to prod.

**Final values applied:**
- Container: 802px, form padding 13px, gap 12px
- Title: 23px, section h3: 14px, platform titles: 13px
- Pills: 13px / 7×16px, style labels: 14px
- Inputs/textarea: 13px / 9px padding
- CTA button: 15px / 9px padding
- Cards: 14px padding, 11px gap
- Platform label: 14px, field label: 10px, field text: 15px, char count: 9px
- Logo: 25×25px

**How to run:** `python3 -m http.server 8001` from repo root, open `/backlog/layout-test/`
