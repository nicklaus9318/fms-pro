// app-params.js – versione locale (nessuna dipendenza da base44)
export const appParams = {
  appId: 'local',
  token: null,
  fromUrl: typeof window !== 'undefined' ? window.location.href : '/',
  functionsVersion: 'local',
  appBaseUrl: typeof window !== 'undefined' ? window.location.origin : '',
};
