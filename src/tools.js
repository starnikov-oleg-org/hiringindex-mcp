// Схемы инструментов. Закрытые (additionalProperties: false) — модель не сможет
// придумать параметр, которого нет, и получить молчаливое игнорирование.
//
// Набор фильтров — ровно то, что живой API умеет применять (сверено 07.09).
// Регион/штат, отрасль и «без агентств» у апстрима фильтров не имеют, а
// уровень (seniority) он хранит сырыми строками вендора — такие фильтры не
// объявляем, иначе модель получит 422 или молча неверную выборку.

const COHORT = {
  titles: { type: 'array', items: { type: 'string' }, description: 'Job titles to match, e.g. ["Data Engineer"]. Terms shorter than 3 characters are rejected by the index.' },
  keywords: { type: 'array', items: { type: 'string' }, description: 'Terms mentioned anywhere in the posting — title or description — e.g. ["Kubernetes"]. Any keyword matches. Use titles for the role itself; keywords for a tool, skill or technology the posting talks about.' },
  city: { type: 'string', description: 'City name as employers write it, e.g. "Berlin", "New York", "Bengaluru".' },
  country: { type: 'string', description: 'Country as ISO 3166-1 alpha-2 code ("US", "DE") or an English name ("Germany").' },
  work_arrangement: {
    type: 'array',
    items: { type: 'string', enum: ['Remote', 'In Person'] },
    description: 'Filter by how the work is done. Hybrid is not a separate filter upstream.'
  },
  company: { type: 'string', description: 'Restrict to one employer by name.' },
  board_handle: { type: 'string', description: 'Restrict to one ATS board by its handle, exactly as the `handle` field of a posting reports it, e.g. "EndeavorITSolution" (SmartRecruiters) or "walmart:wd504:WalmartExternal" (Workday). The precise way to pull one employer\'s postings when names are ambiguous.' },
  salary_min: { type: 'number', description: 'Lowest advertised salary to include. Only postings that disclose a salary match.' },
  salary_max: { type: 'number', description: 'Highest advertised salary to include.' },
  posted_within_days: { type: 'integer', description: 'Only postings published in the last N days.' }
};

export const TOOLS = [
  {
    name: 'search_jobs',
    title: 'Search job postings',
    description:
      'Search live job postings read directly from ten applicant tracking systems (Workday, SmartRecruiters, ' +
      'Greenhouse, Workable, Lever, Ashby, Recruitee, Teamtailor, Breezy, Personio). Returns title, employer ' +
      'where the ATS publishes it, location, employment type, advertised salary where disclosed, posting date ' +
      'and the employer\'s own apply link where the source carries one.',
    inputSchema: {
      type: 'object',
      properties: {
        ...COHORT,
        page: { type: 'integer', minimum: 1, description: 'Result page, starts at 1.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Postings per page, up to 100.' },
        format: { type: 'string', enum: ['markdown', 'json'], description: 'markdown (default) or raw json.' }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'job_market_insights',
    title: 'Aggregate a slice of the job market',
    description:
      'Counts, salary percentiles by currency, remote share, top employers, seniority and employment-type mix, ' +
      'city and source split for any slice of postings. Accepts the same filters as search_jobs. Use this ' +
      'instead of paging through results when the question is about the market rather than about individual roles.',
    inputSchema: {
      type: 'object',
      properties: { ...COHORT, format: { type: 'string', enum: ['markdown', 'json'] } },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'posting_age_report',
    title: 'How long these postings have been open',
    description:
      'Age profile of a slice of postings: median days since publication, share posted in the last week, and ' +
      'share still open after sixty days. A listing that has been open for months is the most commonly cited ' +
      'sign that a role is not being actively filled — this reports the numbers rather than guessing.',
    inputSchema: {
      type: 'object',
      properties: { ...COHORT, format: { type: 'string', enum: ['markdown', 'json'] } },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'get_job',
    title: 'Fetch one posting',
    description: 'Full detail for a single posting by its id, including the description and the application link.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Posting id returned by search_jobs.' },
        format: { type: 'string', enum: ['markdown', 'json'] }
      },
      required: ['id'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
  }
];
