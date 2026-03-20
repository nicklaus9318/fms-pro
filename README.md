# FC Fanta Legacy – Versione Standalone (senza base44)

Questa versione è stata modificata per funzionare **completamente offline**, senza alcuna dipendenza dai server base44.

## Cosa è cambiato

| File | Modifica |
|------|----------|
| `src/api/base44Client.js` | Re-esporta dal nuovo client locale |
| `src/api/localClient.js` | **Nuovo** – sostituisce il backend base44 con localStorage |
| `src/lib/AuthContext.jsx` | Usa utente locale (admin) senza auth remota |
| `src/lib/app-params.js` | Parametri statici locali |
| `vite.config.js` | Rimosso plugin base44, aggiunto alias `@` |
| `package.json` | Rimossi `@base44/sdk` e `@base44/vite-plugin` |

## Come avviare

```bash
npm install
npm run dev
```

## Dati

Tutti i dati vengono salvati nel **localStorage** del browser sotto chiavi del tipo `fanta_Player`, `fanta_Team`, ecc.

Per esportare/importare i dati puoi usare la console del browser:
```js
// Esporta tutto
JSON.stringify(Object.entries(localStorage).filter(([k]) => k.startsWith('fanta_')))

// Importa
const data = [...]; // array di [key, value]
data.forEach(([k, v]) => localStorage.setItem(k, v));
```

## Utente locale

L'app si avvia automaticamente come **admin** locale:
- Email: `admin@fantacalcio.local`
- Ruolo: `admin`

Puoi modificare i dati utente dalla pagina Profilo.

## Funzioni serverless

Le funzioni originali (serverless base44) sono reimplementate localmente in `src/api/localClient.js`:
- `calculatePlayerValues`, `cancelBid`, `closePublicAuction`, `closeSealedBidAuction`
- `deleteAllPlayers`, `endLoans`, `findDuplicatePlayers`, `fixDuplicateNames`
- `generateNextKnockoutRound`, `generateNextWorldCupRound`, `processMatchResults`
- `resetAllStatistics`, `resetSeasonData`, `updatePlayerMarketValueAndSalary`

> **Nota**: `processTeamScreenshot` (analisi immagini con AI) non è disponibile in locale.
