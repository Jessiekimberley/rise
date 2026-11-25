# Design spec: strength app UI overhaul

The approved look for Jessie Peters' coaching app. Open the files in `screens/` in a browser to see each screen working; `screenshots/` has a PNG of each one. If this spec and a reference screen ever disagree, the reference screen wins.

## The feel in one line

Calm and premium. A soft sky-to-peach gradient up top, serif headings that read like a sentence, and plain white rows stacked underneath. No borders, no dashboard clutter, nothing competing for attention.

## Principles

1. **One hand, bottom third.** Jessie logs sets at the gym with one thumb. Every primary action sits in the bottom third of the screen: the main button, the inputs on the set logger, the timer controls. Minimum tap target is 44px.
2. **Rows, not cards.** Content is a stack of white rounded rows (24px radius, 4px gap, no borders). Each row has a small grey label on top, a dark value underneath, and, if it needs one, a round or pill action on the right.
3. **Two-tone serif headings.** Screen headings are one sentence in Newsreader: the first clause in ink, the rest in muted grey. Example: "Leg Press. *Set 2 of 4.*" (the second part is `#6E6E73`).
4. **Sans for anything you read at a glance.** Numbers, labels and buttons use Inter Tight, with tabular numerals for weights, reps, steps and times.
5. **Charcoal for actions, peach for feedback.** Primary buttons and the active state are ink `#1C1C1E`. Peach only marks progress and completion (progress bars, done ticks, the timer ring, the coach target row). Never use peach for a button.
6. **The programme is the source of truth.** Every exercise, set count, rep range, rest time, cue, swap option and habit target comes from `programme.json`. Never invent weights or calorie targets. The doc's weight column is blank, so the app shows "no weight set" until Brenna adds one.

## Tokens

These live in `tokens/tokens.css` (CSS variables) and `tokens/tailwind.config.ts` (a theme extension). The key ones:

| Token | Value | Use |
|---|---|---|
| ink | #1C1C1E | text, primary buttons, active nav |
| ink-muted | #6E6E73 | labels, the grey half of headings |
| surface | #FFFFFF | rows, cards, sheets |
| surface-muted | #F1F1EF | round buttons, pills, inputs, unselected chips |
| peach | #F6CFB2 | gradient glow, done ticks, timer ring |
| peach-tint | #FBE7DA | coach target row, selected option |
| accent | #E58F66 | progress bars, chart line, cue bullets |
| gradient-page | sky #C9D6E8 → mist #E1E7F0 → canvas #F2F2F0, with a peach radial glow about a quarter of the way down | background of every light screen |

Type: Newsreader 400 for headings (34px display, 28px greeting, 32px on photos). Inter Tight for everything else (value 17/500, label 13/400, body 15, micro 11).

## Components

- **Row:** white, 24px radius, padding `12px 12px 12px 20px`. A label (13px muted) sits above a value (17px, 500). Right slot options: a round button (44px, surface-muted), a pill (40px tall, surface-muted, 13 to 14px, 600), or a done tick (36px peach circle).
- **Row stack:** a vertical flex with a 4px gap. A stack never has a border or divider lines.
- **Primary button:** full width minus 20px each side, 60px tall, pill shape, ink background, white 17/600 label. On screens with the nav it sits 100px from the bottom; on full-focus screens it sits 34px from the bottom.
- **Round icon button:** a 44px white circle on gradients, or surface-muted inside sheets. 1.7 to 1.9px stroke icons.
- **Chips / segmented:** 44 to 48px tall pills. The selected chip is ink with white text; unselected chips are surface-muted. These are radio groups, so they need the correct ARIA roles.
- **Floating nav:** a white pill (90% opacity) 64px tall, inset 24px from the sides and 20px from the bottom, with the nav shadow. It has 5 icon-only links (Today, Train, Habits, Progress, Check-in), each with an `aria-label`. The active link becomes a 48px ink circle with a white icon. Hide the nav on full-focus screens (set logging, rest timer, cues, swap sheet, check-in sent).
- **Bottom sheet:** white, 32px top radius, sheet shadow, with a 40×5 drag handle when it's modal. Modal sheets dim the screen behind with `rgba(28,28,30,0.32)`.
- **Photo hero:** 26px radius, `object-fit: cover`, with a dark scrim at the bottom. A small 13px label and a 32px serif title sit bottom-left, and a white 48px round arrow sits bottom-right.
- **Typed number input:** 52px tall, pill shape, surface-muted, 28px centred tabular number, `inputmode="decimal"` for weight and `numeric` for reps. It starts pre-filled with the current value and has a "Tap to type" hint under it. Never use steppers for weight or reps.

## Imagery

Each programme day has one fixed photo, shown on the Today hero. There are 7 images in `images/`:

| Day | Session | Image |
|---|---|---|
| 1 | Lower body | glass.webp |
| 2 | Upper body | shoulder.webp |
| 3 | Active rest | swim.webp |
| 4 | Lower body | liquid.webp |
| 5 | Upper body | blur.webp |
| 6 | Cardio | thermal.webp |
| 7 | Active rest | night.webp |

`swim.webp` is also the Daily habits header, fading into the page. `night.webp` is the full-bleed rest timer background, with dark scrims top and bottom so the white text stays readable.

**Licensing:** `liquid.webp` carries an artist's signature (Antoine Paikert). Get permission or replace it before shipping. Confirm rights for the other images too.

## Screens

Every screen is 390×844 (iPhone). Build them responsive, but optimise for that size.

1. **Today** (`01-today.html`)
   - Avatar and check-in round buttons at the top.
   - The serif greeting uses the two-tone pattern, for example "Morning, Jessie. *Leg press, RDL, …*"
   - Photo hero for the selected day.
   - Week strip row: "This week · tap a day to preview" plus "0 of 4 strength", then 7 day buttons (L U R L U C R, with "Today" or D#). Tapping a day previews that day's photo, title and summary.
   - Habits row with three mini stats (steps, water, sleep), each with a peach progress bar.
   - The primary button reads "Start workout" for today, "Preview session" for other strength days, and opens habits on rest and cardio days.
   - Floating nav.
2. **Workout overview** (`02`)
   - Back button. Heading: "Lower body. *Day 1, last done …*"
   - One row per exercise: label "4 × 8 · rest 2:00", value is the exercise name, and the right pill shows the last session's result. The next exercise's pill is ink.
   - Primary button "Begin with Leg Press". Nav.
3. **Log a set** (`03`), the most important screen
   - Top: close button, exercise progress dashes, and a "Cues" pill.
   - Heading: "Leg Press. *Set 2 of 4.*" with the cue line in muted text under it.
   - **Brenna's target row** (peach-tint): "8 reps · rest 2:00 · no weight set" plus a chevron. Tapping it swaps the set list for past sessions of this exercise, newest first, each showing every set's weight × reps. Tapping again returns to today's sets.
   - Set rows: label "Set N · last 60 × 8"; value is today's result, "In progress" (ink outline), or "—" (55% white). Done sets get a peach tick.
   - Bottom sheet: typed Weight (kg) and Reps inputs, "Reps left in the tank" RIR chips (0, 1, 2, 3+), and the primary button "Log set N", which starts the rest timer. No nav on this screen.
4. **Rest timer** (`04`)
   - Full-bleed `night.webp` with scrims. Serif "Breathe. Rest."
   - A 272px ring with a peach stroke on a translucent track. Large tabular countdown, with "of 2:00" under it (the rest time comes from the programme).
   - −15 s / +15 s translucent pills.
   - A frosted "Up next · set 3 of 4" row with the last-time pill.
   - White "Skip rest" button. Vibrate or notify at 0:00.
5. **Cues & notes** (`05`)
   - Back and "Swap" pills. Heading: "RDL. *Barbell, 3 sets of 8–10, rest 2:00.*"
   - White block of Brenna's cues with accent bullets.
   - Row "Unsure about form? / Send Brenna a video" with a "Text" pill (`sms:` to the coach's number).
   - "My notes" textarea, which shows every session for that exercise.
   - Primary button "Back to sets".
6. **Swap exercise** (`06`)
   - Modal bottom sheet. Heading: "Swap RDL. *Options from Brenna's programme, same sets, reps and rest.*"
   - Only the `options` array from `programme.json`. The selected option is peach-tint with an ink tick.
   - Scope chips: "Today only" / "Every Day N". Each option keeps its own history.
   - Footnote: "Need something not listed? Ask Brenna".
   - Primary button "Use …". If an exercise has no options, hide Swap.
7. **Daily habits** (`07`)
   - `swim.webp` header fading into the page, with the serif "Daily habits." over it.
   - Rows: Steps (goal 8,000–10,000, a "From Health" pill), Water (goal 3–4 L, a round + that adds one bottle; bottle size is a setting), Sleep (goal 7–8 h, a quality pill that cycles Deep / OK / Broken), Recovery (soreness, a "Change" pill).
   - Fuelling block: "no calorie target", "N of 5", and 5 checkable habits.
   - Nav.
8. **Strength progress** (`08`)
   - Heading: "Strength. *Your heaviest sets over the last 8 weeks.*"
   - Lift chips (horizontal scroll).
   - White card with "Top set now" and "Since week 1" stats, and an area line chart (accent line, peach fill, ink end dot, W1 to W8).
   - "Next time" row linking to that day. Nav.
9. **Check-in** (`09`)
   - Date and heading "Check-in. *For Brenna.*"
   - Segmented Midweek / Weekly control.
   - Auto summary card from the logs: strength sessions, average steps, water and sleep, covering Days 1–3 for midweek or 1–7 for weekly.
   - Three white textarea rows: Wins, What's been hard, Questions for Brenna.
   - Primary button "Send to coaching doc". Nav.
10. **Sent to coaching doc** (`10`)
    - Ink check circle. Heading: "Added to your coaching doc. *Appended to the end of JESSIE PETERS in Google Docs. Nothing above it changed.*"
    - White preview of the appended entry, with an "Earlier entries, untouched" stub and a "New" tag.
    - List of earlier check-ins.
    - Primary button "Done". There is no "text Brenna" button: the owner removed it on purpose.

## Behaviour that must not change

- **Google Docs write-back is append-only.** Add each check-in to the end of the shared coaching doc under a dated heading (for example "Midweek check-in · Wednesday 25 November 2026"). Use the Docs API `documents.batchUpdate` with `insertText` at `endOfSegmentLocation`. Never replace, delete or reorder existing content. Show the confirmation screen only after the API call succeeds, and show a retry state if it fails.
- **No calorie target anywhere.** The 1700 kcal figure in the client form is explicitly dropped by the coach.
- **Effort is RIR** (reps in reserve: 0, 1, 2, 3+).
- **Plank logs time,** not weight. Lying leg raises are bodyweight.
- **"Last time" and history come from Jessie's own logs.** The numbers in the reference screens are sample data.

## Accessibility

- Text contrast is at least 4.5:1. The muted grey `#6E6E73` passes on white and on the canvas. Don't go lighter.
- Use real `<button>`, `<a>`, `<input>` and `<label>` elements. Chips are radio groups. The habit checklist uses checkboxes. Icon-only buttons get an `aria-label`.
- Every touch target is at least 44px.
- Respect `prefers-reduced-motion` for the hero crossfade and the timer.
