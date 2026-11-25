# Prompt for your AI coding agent

Copy everything below the line into your agent, with this handover folder in the repo (for example at `design-handover/`).

---

You're overhauling the UI of our React/Next.js strength-coaching app to match a new, approved design. The design handover is in `design-handover/`. Read it before you write any code:

1. `design-handover/DESIGN_SPEC.md`: principles, tokens, components, a spec for every screen, and the behaviour rules that must not change.
2. `design-handover/screens/*.html`: working reference screens. Open them in a browser and click through. They're the visual source of truth, so match spacing, radii, type sizes and colours to them exactly. They run on a tiny throwaway renderer (`dc-lite.js`); don't copy that renderer into the app.
3. `design-handover/screenshots/*.png`: a static image of each screen. Use these to check your work.
4. `design-handover/tokens/tokens.css` and `tailwind.config.ts`: design tokens. Merge them into our existing theme (CSS variables plus a Tailwind `theme.extend`). Don't hard-code hex values in components.
5. `design-handover/programme.json`: the coach's programme. It's the only source for exercises, sets, reps, rest, cues, swap options and habit targets.
6. `design-handover/images/`: the 7 day photos. Move them into `public/images/days/` and serve them with `next/image`.

## What to do

- **Survey first.** Map our current routes, components and data layer to the 10 reference screens, and tell me the mapping before you change anything. Flag any screen we don't have yet, and any existing feature the design doesn't cover.
- **Keep the plumbing.** This is a UI overhaul. Keep our existing data models, API routes, auth and the Google Docs integration. Change presentation and interaction only, unless a screen needs data we don't store yet. If it does, propose the smallest schema change and wait for my OK.
- **Shared components first.** Build these once and reuse them everywhere: `PageGradient`, `HeadingSentence` (the two-tone serif heading), `Row`/`RowStack`, `RoundButton`, `Pill`, `PrimaryButton`, `ChipGroup` (an accessible radio group), `FloatingNav`, `BottomSheet`, `PhotoHero`, `NumberField`, `ProgressBar`, `RestRing`.
- **Then the screens, in this order:** Log a set, Rest timer, Today, Workout overview, Cues & notes, Swap sheet, Daily habits, Strength progress, Check-in, Check-in sent. Ship each one with its states: loading, empty (no history yet), and error.
- **Load the fonts** with `next/font/google`: Newsreader (400 and 500, optical size axis) for headings only, and Inter Tight (400, 500, 600) for everything else.

## Rules you must follow

- Optimise for one-handed iPhone use at 390×844. Put primary actions in the bottom third, and make every tap target at least 44px.
- Rows have no borders and no dividers: white, 24px radius, with a 4px gap between them. Don't add cards, shadows or outlines that aren't in the reference.
- Weight and reps are typed number inputs (`inputmode="decimal"` and `"numeric"`), pre-filled with the current value. Don't use +/− steppers.
- The "Brenna's target" row on Log a set shows the coach's prescription from the programme. It shows "no weight set" when the programme weight is null. Tapping it expands this exercise's past sessions, newest first.
- Effort is RIR: 0, 1, 2, 3+.
- Never show a calorie target, and never invent weights, exercises or targets. If data is missing, show an honest empty state.
- Swap only offers that exercise's `options` from `programme.json`. Hide Swap when there are none.
- Each programme day has one fixed hero photo, using the mapping in DESIGN_SPEC.md. The Today week strip previews any day when tapped.
- Check-ins must be append-only to the Google Doc: a dated heading added at the end, using `insertText` at `endOfSegmentLocation`, and never overwriting anything. Show the success screen only after the write succeeds, and offer a retry if it fails.
- Don't add a "text Brenna" button on the check-in sent screen. It was removed on purpose.
- Accessibility: real buttons, links, inputs and labels; radio-group chips; `aria-label` on icon-only buttons; 4.5:1 text contrast; respect `prefers-reduced-motion`.

## When you're done

For each screen, put a screenshot of our app at 390×844 next to the matching PNG in `design-handover/screenshots/`. List any differences you couldn't resolve and why. Then list anything in the spec you think is wrong or unbuildable, and ask me before you deviate from it.
