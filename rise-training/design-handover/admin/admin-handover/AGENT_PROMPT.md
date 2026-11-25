# Prompt for your AI coding agent: programme admin redesign and Week report

Copy everything below the line into your agent, with this folder in the repo (for example at `design-handover/admin/`).

---

## What we're doing and why

Our app has an admin area where Jessie's training programme is edited, and Jessie shares it with her coach, Brenna. It works, but it's hard to use. Every field is open at once, related settings are scattered, actions like Move and Remove sit loose on the page, and the grey Save button doesn't tell you whether anything has changed. Brenna also has no single place to see what Jessie actually did each week.

We're doing two things:

1. **Redesign the programme editor** (the "Edit plan" tab) so it's calm, grouped and hard to make mistakes in. This is a **UI/UX change only.** Keep our existing data model, save logic, the "applies from" date behaviour, and the rule that logged workouts keep the plan they were saved with.
2. **Add a new "Week" tab:** a read-only weekly report of everything Jessie logged (workouts with every set, daily habits, notes and check-ins), so Brenna can review the week before she adjusts the plan. This reads data we already store; it doesn't create new data.

Both use the same visual style as the rest of the app.

## Files in this folder

- `screens/programme-editor-desktop.html`, `screens/week-report-desktop.html`, `screens/programme-editor-phone.html`: working references. Open them in a browser and click around. They're the visual source of truth, so match spacing, radii, type and colour. They run on a throwaway renderer (`dc-lite.js`); don't copy that into the app.
- `screenshots/`: a PNG of each.
- `tokens.css`: design tokens. Use our existing theme variables where they match.

Before you change anything, map our current admin route(s), components and data to these designs, and tell me what you'll reuse, change and add.

## 1. Programme editor ("Edit plan" tab)

**Header**
- Serif heading: "Programme." in ink, then "Shared with Brenna." in grey.
- Tabs: **Week · Edit plan · History · Notes.** Week is new; History and Notes keep what they do today.
- **Save state, top right.** When there are no changes, show "All changes saved" and no buttons. When there are, show an orange dot with "N unsaved changes" and the line "Logged workouts keep the plan they were saved with", then **Discard** (white) and **Save · applies 26 Nov** (ink). The button text uses the "Applies from" date. If someone leaves with unsaved changes, warn them.

**Week settings: one compact row of white cards**
- **Applies from:** a date picker.
- **Deload week:** an on/off switch, not a checkbox.
- **Daily steps target:** two number fields, from and to.
- **Week note:** collapsed by default as a dashed "+ Add a note for this week" card that expands into a textarea. Help text: "Shows on Jessie's Today screen".

**Three panes (desktop)**

| Pane | What it shows |
|---|---|
| Days, 280px | "Week plan · drag to reorder". Workouts 1–7 with a drag handle, "Workout N", the day name and a tag ("Strength · 5", "Rest", "Cardio"). The selected day is ink. Ends with "+ Add day". |
| Day, 420px | The day name, editable inline in serif. A Strength / Cardio / Active rest segmented control. A "⋯" menu holding Move up, Move down, Copy to next day and Duplicate. The exercise list as rows with a drag handle, name, a one-line summary ("4 × 8 · rest 2:00") and an optional peach tag ("2 options", "Time"). The selected exercise gets an ink outline. Then "+ Add exercise" and a footer "5 exercises · 16 working sets". |
| Exercise | Described in the next section. |

**Exercise pane**
- **Header:** the name, editable inline in serif, with "Exercise N of M" above it. A Reps / Bodyweight / Time segmented control. A "⋯" menu holding Replace, Duplicate and Remove. Remove asks for confirmation.
- **Prescription:** working sets; reps as one range field (from – to); rest; target weight in kg (placeholder "Not set"); warm-up sets (placeholder "Optional"); sides (Together / Each side); and a rest note.
- **Effort target:** a single None / RIR / RPE switch. Choosing RIR or RPE reveals one value field. The help text changes with it: with None, "Jessie logs RIR on every set; no target shown". This replaces the separate RIR and RPE fields.
- **Swap options:** chips plus "+ Add option". With none set, say "Jessie won't see a Swap button for this exercise". This replaces the free-text "Equipment options".
- **Coaching:** three textareas side by side, each labelled with where it shows: "Technique cue · shown on the set screen", "Coaching note · in Cues" and "Progression rule".
- **Preview:** a peach "Jessie sees" line at the bottom, built live from the fields, for example "Leg Press · 4 × 8 · rest 2:00 · no weight set".

**Phone layout** (see `programme-editor-phone.html`)
- Days list, then day, then the exercise editor opening as a bottom sheet.
- The groups become collapsible sections, each with a one-line summary when closed. Prescription shows the four main fields, with "More: warm-up sets, sides, rest note".
- The "Jessie sees" preview and Discard / Save stay pinned at the bottom.

**Rules**
- Reordering days or exercises, editing and removing are all just unsaved changes until Save.
- Keep every field we have today. Nothing is dropped, only regrouped. Tell me if you find a field that doesn't fit a group.
- Never pre-fill weights or targets the coach hasn't set.

## 2. Week report ("Week" tab, new, read-only)

**Purpose:** Brenna opens this first to see Jessie's week, then taps "Adjust the plan" to go to Edit plan.

**Header**
- Serif heading: "Jessie's week." then "Everything she logged, in one place."
- The same tabs, with Week selected.
- A week picker: previous and next buttons around "Mon 23 – Sun 29 Nov · this week". Next is disabled on the current week.
- **Adjust the plan** (ink), which opens Edit plan.

**Summary row: 5 white cards**

| Card | Value | Note |
|---|---|---|
| Workouts | "3 of 7" | "+ Workout 4 in progress" |
| Avg steps | average | the goal from the plan |
| Water target hit | "2 of 3 days" | counted only over days Jessie answered |
| Avg sleep | average | the goal, plus the number of nights with a sleep note |
| Notes | count | which kinds of notes |

Work every value out from logged data. When there's no data, show "—", not 0.

**Day by day (left)**
- One card per day, Monday to Sunday.
- **Collapsed:** the date, the workout done ("Workout 1 · Lower body"), a status line ("Done · 5 exercises · 16 sets", or "swapped forward from Saturday" when it was done on a different day from usual), and habit chips (steps, Water ✓/✗, sleep hours). A chip turns peach when its target was hit.
- **Expanded:** "Sets logged · weight × reps (RIR)", one row per exercise listing every set in order. Next to that, the day's notes: workout note, sleep note and fuelling note, in serif.
- **Today:** gets an ink outline and "in progress · N of M sets".
- **Future days:** faded, reading "Nothing logged yet". The first one lists the workouts still left this week.
- The week runs Monday to Sunday in Jessie's time zone, the same as the app's weekly reset.

**Right column**
- **Check-ins:** the week's check-ins, newest first: wins, what's been hard, and "Question for you" highlighted in peach. Also show when the next one is due.
- **Top sets vs last week:** for each main lift, this week's best set and the change from last week ("+2.5 kg" in a peach pill, "same" in grey).

**Rules:** this tab is read-only. It never edits logs or the plan. Use only real logged data. The numbers in the reference are sample data.

## Accessibility

- Tabs are links or tabs with `aria-current`.
- Segmented controls are radio groups. Deload uses `role="switch"`.
- Day cards use `aria-expanded`. Menus have labels.
- Drag-to-reorder also works from the keyboard (or with Move up / down in the menu).
- Text contrast is at least 4.5:1, and tap targets are at least 44px on phone.

## When you're done

Show me screenshots of both tabs on desktop and the phone editor, side by side with the PNGs. Paste an example of the Week report built from real logged data. List anything you couldn't match, and ask before changing any save or data behaviour.
