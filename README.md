# hiringindex-mcp

MCP server over live job postings. Search roles, aggregate a market slice, and
see how long each listing has been sitting open.

Zero dependencies, Node ≥ 18, stdio transport.

## Install

```bash
npx -y hiringindex-mcp
```

Claude Desktop / Claude Code:

```json
{
  "mcpServers": {
    "hiringindex": {
      "command": "npx",
      "args": ["-y", "hiringindex-mcp"],
      "env": { "HIRINGINDEX_API_KEY": "your-key" }
    }
  }
}
```

## Tools

| Tool | What it answers |
|---|---|
| `search_jobs` | "Show me Python data roles in Amsterdam paying over 80k" |
| `job_market_insights` | "What does a data engineer earn in Berlin, and who is hiring?" |
| `posting_age_report` | "Are these listings fresh, or have they been open for months?" |
| `get_job` | "Give me the full posting for this id" |

`posting_age_report` reports median age, the share posted this week and the share
still open after sixty days — the most commonly cited signal that a role is not
being actively filled. It reports the numbers; it does not pretend to know the
employer's intent.

**Where this sits against what exists.** A free tool,
[whenthisjobwasposted.com](https://whenthisjobwasposted.com), resolves the real
posting date for *one URL at a time* and has an MCP server of its own. If that is
what you need, use it — it costs nothing. This tool answers a different question:
the age *distribution* of an entire slice of the market, computed alongside pay
and demand for the same cohort. One is a lookup, the other is an aggregate.

All four take the same filter shape, so a slice defined once can be searched,
aggregated and aged without rewriting the query.

## Filters

Exactly what the live index can apply (checked against the marketplace listing
on 2026-09-07, `board_handle` added 2026-09-08). Anything else is not a filter, and the tool schemas are closed
so a model cannot invent one.

| Field | Meaning | Notes |
|---|---|---|
| `titles` | job titles to match | terms shorter than 3 characters are rejected by the index |
| `keywords` | terms mentioned anywhere in the posting (title or description) | any keyword matches; since 2026-09-08 — before that, title only |
| `city` | city as employers write it | `"Berlin"`, `"New York"`, `"Bengaluru"` |
| `country` | ISO 3166-1 alpha-2 code or an English name | `"US"`, `"Germany"`; names are mapped to codes locally |
| `work_arrangement` | `Remote` / `In Person` | hybrid is not a separate filter upstream |
| `company` | one employer by name | |
| `board_handle` | one ATS board by its handle | take it from the `handle` field of a posting: `"EndeavorITSolution"`, `"walmart:wd504:WalmartExternal"` |
| `salary_min` / `salary_max` | advertised salary bounds | only postings that disclose a salary match |
| `posted_within_days` | published in the last N days | |
| `page` / `limit` | paging, `limit` up to 100 | `search_jobs` only |

Not offered here although the index accepts them: `seniority` and
`employment_type` — their values are raw vendor strings (`"Mid-Senior Level"`,
`"FullTime"`), so a model would guess spellings and silently get an empty slice;
the aggregates still report both as employers write them. Not available upstream
at all: region or state, industry.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `HIRINGINDEX_API_KEY` | — | required; also accepts `RAPIDAPI_KEY` |
| `HIRINGINDEX_HOST` | `hiringindex.p.rapidapi.com` | marketplace host |
| `HIRINGINDEX_API_BASE` | — | set this to call our backend directly instead of the marketplace |
| `HIRINGINDEX_TIMEOUT_MS` | `30000` | request timeout |

Setting `HIRINGINDEX_API_BASE` switches auth from `x-rapidapi-key` to `x-api-key`
and skips the marketplace entirely.

## Why the handshake is local

The tools call REST endpoints directly instead of proxying a remote `/mcp`.
The marketplace meters every request against the declared path, `initialize` and
`tools/list` included. Going through this package, the handshake never leaves the
machine and only real queries cost anything.

## Output

Markdown by default — repeated fields render as tables, which costs fewer tokens
than a labelled list and stays readable for a human. Pass `format: "json"` on any
tool for the raw response.

## Development

```bash
npm test          # 16 protocol checks, no key needed
HIRINGINDEX_API_KEY=... npm test   # 17 — adds live calls through the marketplace
```

The test drives the server the way a real client does: writes JSON-RPC to stdin,
reads from stdout.

## Before publishing

1. Smoke test with a real key: done 2026-09-07 through the marketplace, 17/17
   (search, insights, age report, single posting). Re-run before every publish.
2. `git init` and add `repository` to `package.json`.
3. The marketplace host is final (`hiringindex.p.rapidapi.com`, listing public
   since 2026-09-07), so the default in `config.js` will not need a major bump.
4. Submit to the official MCP registry (no gatekeeper), then Docker MCP Registry
   and the Cline marketplace.

### Note on the registry listing

Across 115 job-related servers in the official registry, the description is the
only thing a browsing user reads, and the ones that get installed are narrow:
a country, an industry, a single job family. "Job search with AI" is
indistinguishable from a dozen others. Lead with the number, the source and the
tool list — and with the age angle, which nobody else has taken.
