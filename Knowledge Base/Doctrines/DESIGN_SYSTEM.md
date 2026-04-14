# Design System — Alabaster Terminal

**Status:** Active  
**Applies to:** All Zantrix-family products (Zanflow and future apps)  
**Last updated:** 2026-04-14

---

## Overview

All Zantrix products share a house style called **"The Alabaster Terminal"** — a light theme combining the warmth of architectural stone with the precision of high-end tech interfaces. It is editorial and curated, not template-based SaaS.

There is also a dark variant, **"The Gilded Node"**, held in the design folder for apps where a dark theme is appropriate. Zanflow uses the light theme.

The design folder (`/design`) is the original source. This document extracts everything needed to apply the theme consistently. **Once this document is complete and the theme is applied, the design folder can be deleted.**

---

## Colour Tokens

All colours are defined as CSS custom properties in `frontend/src/index.css`.

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-bg` | `#FBF9F4` | Page background (warm alabaster) |
| `--color-surface` | `#FFFFFF` | Elevated cards, auth card |
| `--color-surface-low` | `#F5F3EE` | Secondary sections |
| `--color-surface-container` | `#F0EEE9` | Input backgrounds (milled look) |
| `--color-surface-high` | `#EAE8E3` | Disabled inputs, draft status tags |
| `--color-primary` | `#735C00` | Links, labels, nav active state |
| `--color-primary-container` | `#D4AF37` | Gold — CTA buttons, active highlights |
| `--color-primary-hover` | `#B8960A` | Button hover state |
| `--color-on-primary-container` | `#554300` | Text on gold surfaces |
| `--color-text` | `#1B1C19` | Body text (near-black, never pure black) |
| `--color-text-muted` | `#4D4635` | Secondary text, labels, meta |
| `--color-border` | `rgba(208,197,175,0.35)` | Ghost borders — tonal, not harsh lines |
| `--color-border-strong` | `#D0C5AF` | Input field borders |
| `--color-danger` | `#BA1A1A` | Errors, delete actions |
| `--color-success` | `#386A20` | Success states, approved |
| `--color-warning` | `#92400E` | Draft expiry warnings |

---

## Typography

**Font:** Manrope (Google Fonts) — weights 300, 400, 500, 600, 700  
**Loaded via:** `@import` in `index.css` (CDN, swap display)  
**Fallback:** `system-ui, sans-serif`

### Rules
- **Labels and section headings:** uppercase, `letter-spacing: 0.1em`, `font-weight: 700`, `color: --color-text-muted` or `--color-primary`
- **Page titles:** `font-size: 1.75rem`, `font-weight: 700`, `letter-spacing: -0.02em` — tight and authoritative
- **Body text:** `font-size: 0.9375rem`, `line-height: 1.6`, `font-weight: 400`
- **Hints and meta:** `font-size: 0.8rem`, `color: --color-text-muted`
- **Never use pure black** (`#000000`) — use `--color-text` (`#1B1C19`)

---

## Spacing & Layout

- **Page max-width:** 880px, centred
- **Page padding:** `48px 32px`
- **Header height:** 60px, sticky, frosted glass (`backdrop-filter: blur(20px)`)
- **Card padding:** `28px 32px`
- **Section gap:** `24px` between form sections
- **List item gap:** `8px` — no dividers between rows
- **Border radius:** `--radius-sm: 2px` / `--radius: 6px` / `--radius-lg: 10px`
- **Shadow (ambient):** `0px 12px 32px -4px rgba(27,28,25,0.08)` — soft, warm, not cold grey

---

## Components

### Buttons

| Class | Appearance | Use |
|-------|-----------|-----|
| `.btn-primary` | Gold gradient (`#D4AF37 → #B8960A`), warm text | Primary CTA (Save, Submit) |
| `.btn-secondary` | Transparent, `--color-primary` text and border | Secondary actions |
| `.btn-danger` | Transparent, red text and border; fills red on hover | Destructive actions (Delete) |

All buttons: `active:scale(0.97)` press animation, `font-weight: 600`, `letter-spacing: 0.02em`.

### Inputs

Background: `--color-surface-container` (`#F0EEE9`) — the "milled into the surface" look.  
Box shadow (inset): `inset 0 2px 4px rgba(0,0,0,0.02)` — subtle carved depth.  
On focus: border turns gold (`--color-primary-container`), soft gold ring.

### Cards & Sections

Form sections are white cards (`--color-surface`) with a subtle ambient shadow and ghost border. Section titles are small-caps labels in `--color-primary`, separated by a tonal divider — not a heavy line.

Application type cards lift slightly on hover (`translateY(-1px)`) with a deeper shadow.

### Status Tags

Pill-shaped (`border-radius: 9999px`), uppercase, `letter-spacing: 0.07em`, `font-size: 0.7rem`.

| Status | Background | Text |
|--------|-----------|------|
| draft | `--color-surface-high` | `--color-tag-draft` |
| submitted | gold tint | `--color-on-primary-container` |
| under_review | warm yellow | dark amber |
| awaiting_information | warm orange | dark orange |
| approved | green tint | `--color-success` |
| refused | red tint | `--color-danger` |

### Header / Brand

Brand name in uppercase, `letter-spacing: 0.08em`, `--color-primary`. Header uses frosted glass (`rgba(251,249,244,0.85)` + backdrop blur) — not a solid opaque bar.

---

## House Rules (Do / Don't)

### Do
- Use warm creams and gold — this is a premium, editorial product
- Use tonal layering for depth (background shifts instead of lines)
- Give headlines and sections generous whitespace — "expensive negative space"
- Keep labels uppercase and tracked out
- Use ambient shadows (warm-tinted, large blur radius, low opacity)

### Don't
- Never use pure black (`#000`) or pure blue (`#1d4ed8`) — these are generic SaaS colours
- Never use heavy 1px dividers as primary separators — use background tonal shifts
- Never use large border radii (`>12px`) — the aesthetic is precise, not bubbly
- Don't introduce new CSS classes without first checking `index.css`
- Don't import a UI component library — the theme is hand-crafted plain CSS

---

## Adding New Screens

1. Use the CSS tokens already defined — do not hardcode colours
2. Section wrappers: use `.form-section` class (white card, ambient shadow)
3. Headings within sections: use `.form-section-title` (uppercase gold label style)
4. Page-level headings: `font-size: 1.75rem`, `font-weight: 700`, `letter-spacing: -0.02em`
5. Any new status values: add a `.status-[value]` rule in `index.css` following the existing pattern
6. Verify Manrope is loading — it is imported at the top of `index.css` via Google Fonts CDN

---

## Source Reference

Original design assets are in `/design/lightTheme/` (Alabaster Terminal) and `/design/darkTheme/` (The Gilded Node). These can be deleted once this doctrine is confirmed as the single source of truth for the theme.
