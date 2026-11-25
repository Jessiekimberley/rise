export default function googleConfig(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const config = {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    apiKey: process.env.GOOGLE_PICKER_API_KEY ?? '',
    projectNumber: process.env.GOOGLE_PROJECT_NUMBER ?? '',
    documentId: process.env.GOOGLE_DOC_ID ?? '',
    tabId: 't.0',
  };
  response.status(200).json(Object.values(config).every(Boolean) ? config : {});
}
