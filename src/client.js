import { API_KEY, TIMEOUT_MS, assertKey, baseUrl, viaRapidApi } from './config.js';

// Ошибка с сохранённым кодом — агент ветвится по коду, а не по тексту.
export class HiringIndexError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'HiringIndexError';
    this.code = code;
    this.status = status;
  }
}

// Страна → ISO 3166-1 alpha-2: апстрим узнаёт только код (сверено 07.09: «United
// States» в country_codes даёт 0 строк, «US» — 85 939). Модель чаще пишет имя.
const COUNTRY_CODES = {
  'united states': 'US', usa: 'US', america: 'US', canada: 'CA', 'united kingdom': 'GB', uk: 'GB',
  britain: 'GB', england: 'GB', ireland: 'IE', germany: 'DE', france: 'FR', netherlands: 'NL',
  spain: 'ES', italy: 'IT', sweden: 'SE', switzerland: 'CH', belgium: 'BE', poland: 'PL',
  portugal: 'PT', austria: 'AT', denmark: 'DK', norway: 'NO', finland: 'FI', australia: 'AU',
  'new zealand': 'NZ', singapore: 'SG', japan: 'JP', india: 'IN', brazil: 'BR', mexico: 'MX',
  israel: 'IL', 'united arab emirates': 'AE', uae: 'AE', 'south africa': 'ZA', latvia: 'LV',
  thailand: 'TH', philippines: 'PH', indonesia: 'ID', vietnam: 'VN', argentina: 'AR', colombia: 'CO'
};
export function countryCode(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY_CODES[s.toLowerCase()] || null;
}

/**
 * Фильтры инструмента -> тело запроса апстрима. Одна точка замены.
 *
 * Имена ключей — те, что апстрим перечисляет в своём же 422 (сверено 07.09):
 * cities, company_name, country_codes, days_ago, employment_type, job_titles,
 * keywords, limit, page, remote_flag, salary, seniority, source_platforms;
 * handles — с 08.09 (проверено прямым вызовом: EndeavorITSolution → 8 478 строк).
 * keywords с 08.09 15:07 ищет и в описании (kubernetes: 314 → 25 196), job_titles — только заголовок.
 * Неизвестный ключ апстрим отвергает, а не игнорирует, поэтому сюда попадает
 * только то, что он понимает.
 */
export function toQuery(a = {}) {
  const b = {};
  if (a.titles?.length) b.job_titles = a.titles;
  if (a.keywords?.length) b.keywords = a.keywords;
  if (a.city) b.cities = [a.city];
  const cc = countryCode(a.country);
  if (cc) b.country_codes = [cc];
  // Hybrid отдельным флагом не выбирается: у вендоров он размазан между
  // remote_flag и hybrid_flag; такой фильтр молча не применяем.
  if (a.work_arrangement?.length) {
    const flags = a.work_arrangement
      .map((t) => (t === 'Remote' ? 'true' : t === 'In Person' ? 'false' : null))
      .filter(Boolean);
    if (flags.length) b.remote_flag = [...new Set(flags)];
  }
  if (a.company) b.company_name = a.company;
  // Доска ATS — точное значение поля handle у строки; одна доска = один работодатель.
  if (a.board_handle) b.handles = [String(a.board_handle)];
  if (a.salary_min != null || a.salary_max != null) {
    b.salary = {};
    if (a.salary_min != null) b.salary.min = a.salary_min;
    if (a.salary_max != null) b.salary.max = a.salary_max;
  }
  if (a.posted_within_days != null) b.days_ago = a.posted_within_days;
  if (a.page) b.page = a.page;
  if (a.limit) b.limit = Math.min(100, a.limit);
  return b;
}

// Через RapidAPI пути листинга объявлены в корне (/jobs/search); /v1 — путь
// origin за гейтвеем, и с ним роутер RapidAPI отдаёт 404 «Endpoint does not exist».
const prefix = () => (viaRapidApi() ? '' : '/v1');

async function call(path, { method = 'POST', body = null } = {}) {
  assertKey();
  const url = `${baseUrl()}${prefix()}${path}`;
  const headers = { accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  if (viaRapidApi()) {
    headers['x-rapidapi-key'] = API_KEY;
    headers['x-rapidapi-host'] = new URL(url).host;
  } else {
    headers['x-api-key'] = API_KEY;
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal
    });
    const text = await res.text();
    if (!res.ok) {
      const code =
        res.status === 401 || res.status === 403 ? 'auth_failed'
        : res.status === 429 ? 'rate_limited'
        : res.status >= 500 ? 'upstream_error'
        : 'bad_request';
      throw new HiringIndexError(code, `${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`, res.status);
    }
    return text ? JSON.parse(text) : null;
  } catch (e) {
    if (e instanceof HiringIndexError) throw e;
    if (e.name === 'AbortError') throw new HiringIndexError('upstream_timeout', `timed out after ${TIMEOUT_MS} ms`);
    throw new HiringIndexError('upstream_unreachable', String(e?.message ?? e));
  } finally {
    clearTimeout(timer);
  }
}

export const searchJobs = (a) => call('/jobs/search', { body: toQuery(a) });
export const marketInsights = (a) => call('/jobs/insights', { body: toQuery(a) });
export const getJob = (id) => call(`/jobs/${encodeURIComponent(id)}`, { method: 'GET' });
