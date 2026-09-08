// Единственное место, где живут адрес и ключ.
//
// Два режима, потому что API живёт в двух местах:
//   HIRINGINDEX_API_BASE  — прямой адрес нашего бэкенда
//   HIRINGINDEX_HOST      — хост на RapidAPI (тогда ключ уходит как x-rapidapi-key)

export const API_BASE = process.env.HIRINGINDEX_API_BASE || '';
export const HOST = process.env.HIRINGINDEX_HOST || 'hiringindex.p.rapidapi.com';

export const API_KEY =
  process.env.HIRINGINDEX_API_KEY || process.env.RAPIDAPI_KEY || process.env.X_RAPIDAPI_KEY;

export const TIMEOUT_MS = Number(process.env.HIRINGINDEX_TIMEOUT_MS || 30000);

export const viaRapidApi = () => !API_BASE;
export const baseUrl = () => (API_BASE ? API_BASE.replace(/\/$/, '') : `https://${HOST}`);

export function assertKey() {
  if (!API_KEY) {
    throw new Error(
      'No API key. Set HIRINGINDEX_API_KEY (or RAPIDAPI_KEY) to your key.\n' +
        'The free tier needs no card: https://rapidapi.com/'
    );
  }
}
