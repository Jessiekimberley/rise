# Design handover: Jessie Peters strength app

This folder is a UI overhaul package for the React/Next.js app.

| Path | What it is |
|---|---|
| `AGENT_PROMPT.md` | The prompt to paste into your AI coding agent |
| `DESIGN_SPEC.md` | Principles, tokens, components, every screen, rules that must not change |
| `screens/` | 10 working reference screens. Open any `.html` in a browser and click through |
| `screenshots/` | A PNG of each screen at 390×844 (2x) |
| `tokens/` | `tokens.css` (CSS variables) and `tailwind.config.ts` (theme extension) |
| `programme.json` | Brenna's programme as data: the source of truth for exercises, cues and targets |
| `images/` | The 7 day photos, one per programme day |

Start the click-through at `screens/01-today.html`. The screens load Google Fonts, so they need an internet connection to show the exact type.

Logged numbers in the screens (weights, steps, sleep, past sessions, check-in dates) are sample data for layout only.
