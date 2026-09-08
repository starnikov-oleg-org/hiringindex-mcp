// Ответ в Markdown: агенту дешевле по токенам, чем сырой JSON, и читается человеком.
// Повторяющиеся поля идут таблицей — на списке с подписями токенов уходит больше.
//
// Форма ответа — живой API (сверено 07.09): строка вакансии несёт title,
// company_name (может отсутствовать — ashby не публикует работодателя),
// city/region/country, remote_flag строкой, salary {min,max,currency,period},
// posted_at, first_seen_at, apply_url/posting_url, description как HTML.
// insights: headline.row_count, salary[] по группам валюта×период,
// top_companies[{company_name,count}], *_split[{value,count}], freshness.

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const CUR = { USD: '$', EUR: '€', GBP: '£', SGD: 'S$', CAD: 'C$', AUD: 'A$', INR: '₹' };
const money = (v, c = 'USD') => {
  const n = num(v);
  if (n == null) return '';
  const s = CUR[c] || c + ' ';
  return Math.abs(n) >= 1000 ? `${s}${Math.round(n / 1000)}k` : `${s}${Math.round(n)}`;
};
const int = (v) => (num(v) == null ? '—' : Math.round(v).toLocaleString('en-US'));
const pct = (v) => (num(v) == null ? '—' : `${v.toFixed(1)}%`);
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const share = (part, whole) => (num(part) != null && num(whole) ? (100 * part) / whole : null);

const daysSince = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d) / 86400000));
};

// HTML описания -> текст: теги долой, сущности назад, пробелы схлопнуть.
export const htmlToText = (html) =>
  String(html ?? '')
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

const location = (j) => [j.city, j.region, j.country].filter(Boolean).join(', ') || j.location_raw || '';
const work = (j) => (j.remote_flag === 'true' || j.remote_flag === true ? 'Remote'
  : j.remote_flag === 'false' || j.remote_flag === false ? 'On-site'
  : j.remote_flag && typeof j.remote_flag === 'string' ? j.remote_flag : '');
const employer = (j) => j.company_name || (j.handle ? `— (ATS tenant: ${j.handle})` : '—');
const pay = (s) => (s && (num(s.min) != null || num(s.max) != null)
  ? `${money(s.min, s.currency)}–${money(s.max, s.currency)}${s.period ? ' / ' + cell(s.period) : ''}`
  : 'Not disclosed');
const posted = (j) => j.posted_at || j.first_seen_at || null;
const link = (j) => j.apply_url || j.posting_url || null;

export function searchToMarkdown(res, args) {
  const jobs = res?.jobs ?? [];
  const head = [
    `# ${int(res?.total_count)} matching postings`,
    args.titles?.length ? `**Titles:** ${args.titles.join(', ')}` : null,
    [args.city, args.country].filter(Boolean).length
      ? `**Location:** ${[args.city, args.country].filter(Boolean).join(', ')}`
      : null,
    `**Page** ${res?.page ?? 1} of ${int(res?.total_pages)} · ${int(res?.company_count)} employers`
  ].filter(Boolean).join('\n');

  if (!jobs.length) return `${head}\n\nNo postings match these filters.`;

  const rows = jobs.map((j) => {
    const age = daysSince(posted(j));
    return `| ${cell(j.title)} | ${cell(employer(j))} | ${cell(location(j))} | ${cell(work(j))} | ${cell(pay(j.salary))} | ${age == null ? '—' : age + 'd'} | ${cell(j._id)} |`;
  });

  return `${head}

| Role | Employer | Location | Work | Salary | Posted | id |
|---|---|---|---|---|---|---|
${rows.join('\n')}

*"Posted" is days since the employer published the listing (or since the index first saw it). An employer shown as "—" is not published by that ATS. Use get_job with an id for full detail.*`;
}

const splitList = (arr, whole, key = 'value') =>
  (arr || []).slice(0, 6)
    .map((x) => `${cell(x[key] ?? x.company_name ?? x.label)} ${num(x.percent) != null ? pct(x.percent) : share(x.count, whole) != null ? pct(share(x.count, whole)) : int(x.count)}`)
    .join(' · ') || '—';

export function insightsToMarkdown(ins, args) {
  if (!ins) return 'No aggregates available for this slice.';
  const h = ins.headline || {};
  const total = num(h.row_count) ?? num(h.total_count);
  // Группы зарплат — по валюте и периоду; показываем самую большую.
  const groups = Array.isArray(ins.salary) ? [...ins.salary].sort((a, b) => (b.count || 0) - (a.count || 0)) : [];
  const g = groups[0];
  const cur = g?.currency || 'USD';
  const remote = (ins.remote_flag_split || []).find((x) => x.value === 'true' || x.value === true);

  const salaryBlock = g
    ? `## Pay distribution (${cell(cur)}${g.period ? ', ' + cell(g.period) : ''}; lower bound of the advertised range)
| Percentile | Salary |
|---|---|
| 25th | ${money(g.min?.p25, cur)} |
| Median | ${money(g.min?.p50, cur)} |
| 75th | ${money(g.min?.p75, cur)} |
| 90th | ${money(g.min?.p90, cur)} |

Computed from ${int(g.count)} postings that publish a range${groups.length > 1 ? `; ${groups.length - 1} more currency/period groups in the json output` : ''}.`
    : `## Pay distribution
Not enough disclosed salaries in this slice (percentiles need at least 30 postings per currency).`;

  return `# Market slice${args.titles?.length ? `: ${args.titles.join(', ')}` : ''}${args.city ? ` in ${args.city}` : ''}

| Measure | Value |
|---|---|
| Open postings | ${int(total)} |
| Employers | ${int(h.company_count)} |
| Posted this week | ${int(h.new_this_week)} |
| Median salary | ${g ? money(g.min?.p50, cur) : '—'} |
| Salary disclosed by | ${pct(share(h.with_salary, total))} of postings |
| Remote | ${pct(share(remote?.count, total))} |

${salaryBlock}

## Demand
**Top employers:** ${splitList(ins.top_companies, total, 'company_name')}
**Seniority (as written by employers):** ${splitList(ins.seniority_split, total)}
**Employment type (as written):** ${splitList(ins.employment_type_split, total)}
**Cities:** ${splitList(ins.city_split, total)}
**Sources:** ${splitList(ins.platform_split, total)}`;
}

export function ageToMarkdown(ins, args) {
  if (!ins) return 'No age data available for this slice.';
  const f = ins.freshness || {};
  const h = ins.headline || {};
  const p = ins.posted_at?.days_since_posted || {};
  const med = num(f.median_days_live) ?? num(p.p50);
  const old = num(f.pct_over_60_days);
  const verdict =
    med == null ? 'Not enough data to judge.'
    : med <= 14 ? 'This slice turns over quickly — most listings are recent.'
    : med <= 35 ? 'Normal turnover for an active market.'
    : 'Postings here sit for a long time. Worth checking individual listings before relying on them.';

  return `# Posting age${args.titles?.length ? `: ${args.titles.join(', ')}` : ''}${args.city ? ` in ${args.city}` : ''}

| Measure | Value |
|---|---|
| Open postings | ${int(h.row_count ?? h.total_count)} |
| With a publication date | ${int(f.count ?? h.with_posted_at)} |
| Median age | ${med == null ? '—' : med + ' days'} |
| Age quartiles | ${num(p.p25) == null ? '—' : `${Math.round(p.p25)} / ${Math.round(p.p50)} / ${Math.round(p.p75)} days`} |
| Posted in the last 7 days | ${pct(f.pct_last_7_days)} |
| Still open after 60 days | ${pct(old)} |

${verdict}

*Age counts days since the employer published the posting, over the rows that carry a date. A long-lived listing is a signal that a role may not be actively filled, not proof of it — some roles genuinely take months to close.*`;
}

export function jobToMarkdown(j) {
  if (!j) return 'Posting not found.';
  const age = daysSince(posted(j));
  const desc = htmlToText(j.description);
  const url = link(j);
  return `# ${cell(j.title)}
**${cell(employer(j))}** · ${cell(location(j))}${work(j) ? ' · ' + cell(work(j)) : ''}

| Field | Value |
|---|---|
| Salary | ${cell(pay(j.salary))}${j.salary_text ? ` (${cell(j.salary_text)})` : ''} |
| Seniority | ${cell(j.seniority) || '—'} |
| Employment | ${cell(j.employment_type) || '—'} |
| Department | ${cell([j.department, j.team].filter(Boolean).join(' / ')) || '—'} |
| Education | ${cell(j.education_level) || '—'} |
| Industry | ${cell(j.industry) || '—'} |
| Posted | ${cell((posted(j) || '').slice(0, 10)) || '—'}${age == null ? '' : ` (${age} days ago)`} |
| Source | ${cell(j.source_platform) || '—'} |
| Board | ${cell(j.handle) || '—'} |

${desc ? `## Description\n\n${desc.length > 4000 ? desc.slice(0, 4000) + '…' : desc}\n\n` : ''}${url ? `[Apply on the company site](${url})` : '*This source does not publish an apply link for this posting.*'}`;
}
