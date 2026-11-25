# Rise Gym

Rise Gym reads the seven plan tables from a shared Google Doc. Workout and habit entries stay in the current browser. The check-in summarises seven days ending on the selected date and is editable before saving. Save to Google Doc appends the reviewed entry to the configured tab using the signed-in user's Google permissions.

## Vercel and Google configuration

Deploy this directory as a Vercel project. `dist` contains the frontend and `/api/google-config` supplies browser configuration. The site contains no copy of the private workout plan.

In one Google Cloud project, enable the Google Docs API, Google Drive API and Google Picker API. Configure Google Auth and create a **Web application** client with the stable production Vercel origin in its authorised JavaScript origins. If the consent screen is in testing mode, add the Google account used for the workout Doc as a test user.

Create a browser API key restricted to the Google Picker API, the app's production origin and `https://docs.google.com/*`. Use the same Cloud project for the OAuth client and key. The Google Picker API is used with the `drive.file` scope. The browser configuration is public by design. Keep OAuth client secrets and Google access tokens out of these variables.

Set these production environment variables in Vercel and deploy again.

- `GOOGLE_CLIENT_ID` — Web application's OAuth client ID
- `GOOGLE_PICKER_API_KEY` — restricted browser API key
- `GOOGLE_PROJECT_NUMBER` — numeric Cloud project number
- `GOOGLE_DOC_ID` — the shared workout document ID from its URL

On the production site, choose **Connect Google Doc** and select the original file in Google Picker. The integration targets `t.0` in that file. Check-in writes require edit access to the Doc. Entries with identical dates and text are detected on a retry, and the Google Docs revision guard prevents two simultaneous saves from appending the same entry.

For local development, use `vercel dev` and register its localhost origin with the OAuth client if you need to exercise Google sign-in locally.
