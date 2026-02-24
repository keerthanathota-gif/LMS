/**
 * LMS Shared Tailwind Preset
 *
 * Single source of truth for both admin and learner frontends.
 * Colors, typography, animations, shadows — all derived from tokens.json.
 *
 * Usage in tailwind.config.ts:
 *   import lmsPreset from '../shared/tailwind-preset'
 *   export default { presets: [lmsPreset], content: [...] }
 */

import type { Config } from 'tailwindcss'
import tokens from './tokens.json'

/* ── Helpers to extract $value from W3C tokens ─────────────────────────── */

function flattenColorGroup(group: Record<string, { $value: string }>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, token] of Object.entries(group)) {
    out[key] = token.$value
  }
  return out
}

/* ── Color palette ─────────────────────────────────────────────────────── */

const colors = {
  navy:   flattenColorGroup(tokens.color.navy),
  indigo: flattenColorGroup(tokens.color.indigo),

  surface: {
    DEFAULT:   tokens.color.surface.primary.$value,
    primary:   tokens.color.surface.primary.$value,
    secondary: tokens.color.surface.secondary.$value,
    tertiary:  tokens.color.surface.tertiary.$value,
    card:      tokens.color.surface.secondary.$value,   // alias for backward compat
    border:    tokens.color.surface.border.$value,
    hover:     tokens.color.surface.tertiary.$value,     // alias
    input:     tokens.color.surface.secondary.$value,    // alias
    divider:   tokens.color.surface.divider.$value,
  },

  text: {
    primary:   tokens.color.text.primary.$value,
    secondary: tokens.color.text.secondary.$value,
    muted:     tokens.color.text.muted.$value,
    inverse:   tokens.color.text.inverse.$value,
  },

  // Keep "brand" as alias → indigo (backward compat so existing brand-* classes work)
  brand: flattenColorGroup(tokens.color.indigo),

  // Accent / status
  accent: {
    amber:   tokens.color.accent.amber.$value,
    emerald: tokens.color.accent.emerald.$value,
    rose:    tokens.color.accent.rose.$value,
    sky:     tokens.color.accent.sky.$value,
    violet:  tokens.color.accent.violet.$value,
  },

  status: {
    success: tokens.color.accent.emerald.$value,
    warning: tokens.color.accent.amber.$value,
    error:   tokens.color.accent.rose.$value,
    info:    tokens.color.indigo[500].$value,
  },
}

/* ── Typography ────────────────────────────────────────────────────────── */

const fontFamily = {
  sans:    tokens.typography.fontFamily.body.$value.split(',').map((s: string) => s.trim().replace(/^'|'$/g, '')),
  display: tokens.typography.fontFamily.display.$value.split(',').map((s: string) => s.trim().replace(/^'|'$/g, '')),
  mono:    tokens.typography.fontFamily.mono.$value.split(',').map((s: string) => s.trim().replace(/^'|'$/g, '')),
}

const fontSize: Record<string, string> = {}
for (const [key, token] of Object.entries(tokens.typography.fontSize)) {
  fontSize[key] = (token as { $value: string }).$value
}

/* ── Shadows ───────────────────────────────────────────────────────────── */

const boxShadow: Record<string, string> = {}
for (const [key, token] of Object.entries(tokens.shadow)) {
  boxShadow[key] = (token as { $value: string }).$value
}

/* ── Animations ────────────────────────────────────────────────────────── */

const animation = {
  'fade-in':     'fadeIn 0.2s ease-out',
  'slide-up':    'slideUp 0.3s ease-out',
  'slide-down':  'slideDown 0.3s ease-out',
  'scale-in':    'scaleIn 0.2s ease-out',
  'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  'typing':      'typing 1.2s steps(3) infinite',
}

const keyframes = {
  fadeIn: {
    from: { opacity: '0' },
    to:   { opacity: '1' },
  },
  slideUp: {
    from: { opacity: '0', transform: 'translateY(10px)' },
    to:   { opacity: '1', transform: 'translateY(0)' },
  },
  slideDown: {
    from: { opacity: '0', transform: 'translateY(-10px)' },
    to:   { opacity: '1', transform: 'translateY(0)' },
  },
  scaleIn: {
    from: { opacity: '0', transform: 'scale(0.95)' },
    to:   { opacity: '1', transform: 'scale(1)' },
  },
  typing: {
    '0%, 100%': { content: '"."' },
    '33%':      { content: '".."' },
    '66%':      { content: '"..."' },
  },
}

/* ── Border Radius ─────────────────────────────────────────────────────── */

const borderRadius: Record<string, string> = {}
for (const [key, token] of Object.entries(tokens.borderRadius)) {
  borderRadius[key] = (token as { $value: string }).$value
}

/* ── Export Preset ─────────────────────────────────────────────────────── */

const lmsPreset: Config = {
  content: [],  // overridden by consuming config
  theme: {
    extend: {
      colors,
      fontFamily,
      fontSize,
      boxShadow,
      animation,
      keyframes,
      borderRadius,
    },
  },
  plugins: [],
}

export default lmsPreset
