# Figma Design Workflow — LMS Design System

## Overview

This project uses **W3C Design Tokens** (`tokens.json`) as the single source of truth for colors, typography, spacing, shadows, and border radii. The same file powers both the Tailwind CSS codebase and Figma designs.

---

## Step 1: Install Tokens Studio for Figma

1. Open Figma → Plugins → Search for **"Tokens Studio for Figma"**
2. Install the plugin (free tier is fine)
3. Open it from Plugins menu

## Step 2: Import Design Tokens

1. In Tokens Studio, click **"Import"** → **"File"**
2. Select `frontend/shared/tokens.json` from this repo
3. The plugin will auto-create:
   - **Color variables**: navy.50–950, indigo.50–900, surface.*, text.*, accent.*
   - **Typography**: font families (Inter, Plus Jakarta Sans, JetBrains Mono), sizes, weights
   - **Spacing**: 0–16 scale
   - **Border radius**: sm through full
   - **Shadows**: sm, md, lg, xl, glow

## Step 3: Apply Tokens as Figma Variables

1. In Tokens Studio, click **"Create styles"** to generate Figma color/text styles
2. These styles will appear in your Figma right panel when designing
3. Always use these styles — never pick colors manually

## Step 4: Recommended Figma Page Structure

```
LMS Design System (Figma file)
├── 🎨 Foundations
│   ├── Colors (all navy, indigo, surface, text, accent swatches)
│   ├── Typography (heading/body/mono samples at all sizes)
│   └── Shadows & Radii (visual reference)
│
├── 🧩 Components
│   ├── Buttons (primary, secondary, ghost, danger × sizes)
│   ├── Cards (course card, stat card, badge card)
│   ├── Inputs (text, select, search)
│   ├── Badges (success, warning, error, info, default)
│   ├── Avatar (image, initials, sizes)
│   ├── Skeleton (line, circle, card, table-row)
│   ├── Carousel (3-card with arrows + dots)
│   └── Navigation (sidebar item, top nav pill, breadcrumb)
│
├── 📋 Admin Portal (port 5000)
│   ├── Login
│   ├── Sidebar (expanded + collapsed states)
│   ├── Header (with notifications dropdown)
│   ├── Chat Studio
│   ├── Dashboard
│   ├── Courses (table view)
│   ├── Users
│   ├── Analytics
│   └── Settings
│
├── 🎓 Learner Portal (port 5174)
│   ├── Login
│   ├── Top Nav Bar (desktop + mobile states)
│   ├── Dashboard
│   ├── My Courses (catalog)
│   ├── Library (Tessarix-style with carousels)
│   ├── Course Detail
│   ├── Learn (video/text player + sidebar)
│   ├── Quiz
│   ├── Leaderboard
│   ├── Badges
│   ├── Certificates
│   └── Profile
│
└── 📱 Responsive Breakpoints
    ├── Mobile (< 768px)
    ├── Tablet (768–1024px)
    └── Desktop (> 1024px)
```

## Step 5: Design-to-Code Sync

### Figma → Code (designer makes changes)
1. Modify tokens in Tokens Studio
2. Export as JSON: Tokens Studio → Export → JSON
3. Replace `frontend/shared/tokens.json` with exported file
4. Run `npm run dev` in both frontends — changes auto-reflect

### Code → Figma (developer adds tokens)
1. Edit `frontend/shared/tokens.json`
2. In Figma, Tokens Studio → Import → re-import the file
3. New tokens auto-appear as Figma variables

---

## Key Color References

| Figma Style Name | Hex | Usage |
|-----------------|-----|-------|
| `navy/700` | #243b53 | Admin sidebar background |
| `navy/900` | #102a43 | Admin sidebar deep |
| `indigo/500` | #6366f1 | Primary buttons, CTA |
| `indigo/400` | #818cf8 | Active nav items, links |
| `surface/primary` | #ffffff | Page backgrounds |
| `surface/secondary` | #f8fafc | Cards, inputs |
| `text/primary` | #0f172a | Headings, body text |
| `text/secondary` | #475569 | Descriptions |
| `accent/emerald` | #10b981 | Success, completion |
| `accent/amber` | #f59e0b | Stars, XP, warnings |
| `accent/rose` | #f43f5e | Errors, fail states |

## Typography Quick Reference

| Style | Font | Size | Weight |
|-------|------|------|--------|
| Page Title | Plus Jakarta Sans | 28px (3xl) | Bold (700) |
| Section Header | Plus Jakarta Sans | 22px (2xl) | Semibold (600) |
| Card Title | Inter | 14px (base) | Medium (500) |
| Body Text | Inter | 14px (base) | Normal (400) |
| Small Text | Inter | 13px (sm) | Normal (400) |
| Caption | Inter | 11px (xs) | Medium (500) |
| Code | JetBrains Mono | 13px (sm) | Normal (400) |
