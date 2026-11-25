import { documentTab, paragraphText, parseWorkoutPlan } from './plan.js';

const driveFileScope = 'https://www.googleapis.com/auth/drive.file';

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Google could not load. Refresh and try again.'));
    document.head.append(script);
  });
}

export async function prepareGoogleDocs(config) {
  const { clientId, apiKey, projectNumber, documentId, tabId } = config;
  if (![clientId, apiKey, projectNumber, documentId, tabId].every(Boolean)) {
    throw new Error('Google Docs setup is pending.');
  }
  await Promise.all([
    loadScript('https://accounts.google.com/gsi/client'),
    loadScript('https://apis.google.com/js/api.js').then(() => new Promise((resolve, reject) => {
      window.gapi.load('picker', { callback: resolve, onerror: reject, ontimeout: reject, timeout: 15000 });
    })),
  ]);

  const { accounts, picker } = window.google;
  const documentUrl = `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit?tab=${encodeURIComponent(tabId)}`;
  const apiUrl = `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`;
  let token;
  let expiresAt = 0;

  function accessToken() {
    if (token && Date.now() < expiresAt) return Promise.resolve(token);
    return new Promise((resolve, reject) => {
      const failure = () => reject(new Error('Google sign-in did not finish. Try again with the account that can edit the shared Doc.'));
      const client = accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: driveFileScope,
        include_granted_scopes: false,
        error_callback: failure,
        callback: (response) => {
          if (!response.access_token || !accounts.oauth2.hasGrantedAllScopes(response, driveFileScope)) {
            failure();
            return;
          }
          token = response.access_token;
          expiresAt = Date.now() + (Number(response.expires_in) - 60) * 1000;
          resolve(token);
        },
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  function pickExactDoc(access) {
    return new Promise((resolve, reject) => {
      const view = new picker.DocsView(picker.ViewId.DOCUMENTS)
        .setMimeTypes('application/vnd.google-apps.document')
        .setMode(picker.DocsViewMode.LIST);
      new picker.PickerBuilder().addView(view)
        .setTitle('Select your shared workout Google Doc')
        .setOrigin(location.origin)
        .setAppId(projectNumber)
        .setDeveloperKey(apiKey)
        .setOAuthToken(access)
        .setCallback((result) => {
          if (result.action === picker.Action.CANCEL) reject(new Error('Doc selection cancelled.'));
          if (result.action !== picker.Action.PICKED) return;
          if (result.docs?.[0]?.id === documentId) resolve();
          else reject(new Error('Select the original shared workout Doc. This app is set up for that file.'));
        })
        .build().setVisible(true);
    });
  }

  async function request(access, path, body) {
    const result = await fetch(`${apiUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${access}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (result.ok) return result.json();
    if (result.status === 401) expiresAt = 0;
    const { error } = await result.json().catch(() => ({}));
    const details = error?.details ?? [];
    const disabled = details.some(({ reason }) => reason === 'SERVICE_DISABLED');
    const messages = {
      400: 'The shared Doc changed during the save. Try again to use its latest version.',
      401: 'Google access expired. Try again to sign in.',
      403: 'Google denied access. Use the account that can edit the shared Doc.',
      404: 'Google could not access the shared Doc. Reconnect it from the Workout tab.',
      429: 'Google is busy. Wait a moment and try again.',
    };
    throw Object.assign(new Error(disabled ? 'The Google Docs API still needs to be enabled for this app.' :
      messages[result.status] ?? 'Google did not confirm the request. Try again.'), { status: result.status, disabled });
  }

  const read = (access) => request(access, '?includeTabsContent=true&suggestionsViewMode=PREVIEW_WITHOUT_SUGGESTIONS');

  async function connect() {
    const access = await accessToken();
    let doc;
    try {
      doc = await read(access);
    } catch (error) {
      if (error.disabled || ![403, 404].includes(error.status)) throw error;
      await pickExactDoc(access);
      doc = await read(access);
    }
    return parseWorkoutPlan(documentTab(doc, tabId));
  }

  async function appendCheckIn(title, text) {
    const access = await accessToken();
    const doc = await read(access);
    const target = documentTab(doc, tabId);
    const existing = `\n${(target.content ?? []).map(paragraphText).join('')}\n`;
    const cleanText = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000c-\u001f\ue000-\uf8ff]/g, '');
    const entry = `${title}\n\n${cleanText}`;
    if (existing.includes(`\n${entry}\n`)) return { duplicate: true };
    if (!doc.revisionId) throw new Error('Google did not grant edit access to the shared Doc.');
    await request(access, ':batchUpdate', {
      writeControl: { requiredRevisionId: doc.revisionId },
      requests: [{ insertText: { endOfSegmentLocation: { tabId }, text: `\n\n${entry}` } }],
    });
    return { duplicate: false };
  }

  return { connect, appendCheckIn, documentUrl };
}
