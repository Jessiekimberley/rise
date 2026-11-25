# Rise Training

Mobile training log for Brenna’s programme. Next.js, TypeScript, Tailwind, pnpm, Neon and Google Docs. The home URL opens one shared log, and anyone who can open it can read and edit its entries. The private link unlocks coaching Docs tools on that browser and stores a signed, HTTP-only cookie.

## Run and verify

1. `pnpm install --frozen-lockfile`
2. Add a Neon connection string to `.env.local` as `DATABASE_URL`. Run `pnpm db:migrate` once per database or branch.
3. For coaching Docs access, set `RISE_ACCESS_KEY` to a randomly generated URL-safe secret of at least 32 characters.
4. Run `pnpm dev` and open `http://localhost:3000/`. To unlock coaching Docs tools, open `http://localhost:3000/#access=<private-key>`. Share the private link only with its intended user.
5. Run `pnpm typecheck`, `pnpm test` and `pnpm build`. The automated flow tests cover concurrent set saves, substitutions, reloading persisted data, report generation, and revision-controlled Google Docs appends.

To develop without Neon credentials, set `RISE_LOCAL_DATABASE=.rise-local` and use `pnpm dev`. The development server stores your log in that folder using PGlite and creates its tables on first use. Production uses Neon.

## Google Docs

Enable the Google Docs API in the Google Cloud project. Give its service account access to the specific coaching Doc. The app needs viewer access to read the programme and editor access to append check-ins. In Vercel set `GOOGLE_SERVICE_ACCOUNT_JSON` as a sensitive environment variable and set `GOOGLE_SERVICE_ACCOUNT_EMAIL` for the in-app sharing instructions. Set `GOOGLE_DOC_ID` and `GOOGLE_DOC_TAB_ID` for the original shared document. The service account key stays server-side.

In **Programme settings**, set the actual programme start date. The app calculates programme weeks from that date. The default is Monday of the first logged week. The app can read coaching tables under `Week 1`, `Week 2`, and so on, or refresh a single set of four strength tables edited in place. Retain the `Day 1`, `Day 2`, `Day 4` and `Day 5` table markers and the Exercise, Sets, Reps, Rest, Weight and Cues columns. For coach notes outside exercise rows, use a numbered week heading or a `Coach notes` heading. Google Docs margin comments remain in Google Docs.

To switch Docs, share the replacement with the service account and enter its link under **Programme Doc** or **Check-in Doc**. The app verifies the requested access before switching. **Review programme changes** on Today shows changes from Brenna's Doc before you apply them. Started workouts keep their original prescriptions and set history. Check-ins already sent or in progress retain their original destination.

## Vercel

Use the Next.js framework preset and `pnpm install --frozen-lockfile`. There is no static output-directory override. Set the environment variables in the intended Vercel environment, then redeploy. Keep the private access link and database/service account credentials out of source control.

## Apple Health steps

On your iPhone, open your private Rise link and choose **Habits → Apple Health → Show Shortcut details**. Follow the instructions to set up iOS Shortcuts. The Shortcut uses a key limited to step uploads. Keep it in your Shortcut and rotate `RISE_ACCESS_KEY` if you need to revoke it.

Rise stores one step total per Auckland date. Re-running the Shortcut replaces that day's total, and check-ins average days with a logged count. Compare the first Shortcut result with the Steps screen in Apple Health. If the readings differ, you can use a Shortcut **Ask for Input** action set to Number and enter the displayed Health total as `steps`.
