#!/usr/bin/env node
// Hiring Index MCP server — stdio, JSON-RPC, без зависимостей.
//
// Инструменты бьют по REST-эндпоинтам напрямую, а не проксируют удалённый /mcp.
// Причина денежная: маркетплейс тарифицирует каждый запрос по объявленному пути,
// включая initialize и tools/list. Через этот пакет рукопожатие локальное,
// в сеть уходят только запросы данных.

import { searchJobs, marketInsights, getJob, HiringIndexError } from './client.js';
import { searchToMarkdown, insightsToMarkdown, ageToMarkdown, jobToMarkdown } from './markdown.js';
import { TOOLS } from './tools.js';
import { baseUrl } from './config.js';

const PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOLS = new Set([PROTOCOL_VERSION, '2025-03-26', '2024-11-05']);
const SERVER_INFO = { name: 'hiringindex', title: 'Hiring Index — job market data', version: '0.1.0' };

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const result = (id, r) => send({ jsonrpc: '2.0', id, result: r });
const failure = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const text = (s, isError = false) => ({ content: [{ type: 'text', text: s }], isError });

async function callTool(name, args = {}) {
  const raw = args.format === 'json';
  try {
    switch (name) {
      case 'search_jobs': {
        const r = await searchJobs(args);
        return text(raw ? JSON.stringify(r, null, 2) : searchToMarkdown(r, args));
      }
      case 'job_market_insights': {
        const r = await marketInsights(args);
        return text(raw ? JSON.stringify(r, null, 2) : insightsToMarkdown(r, args));
      }
      case 'posting_age_report': {
        const r = await marketInsights(args);
        return text(raw ? JSON.stringify(r?.freshness ?? {}, null, 2) : ageToMarkdown(r, args));
      }
      case 'get_job': {
        if (typeof args.id !== 'string' || !args.id.trim()) {
          return text('id_required: pass an id returned by search_jobs', true);
        }
        const r = await getJob(args.id);
        return text(raw ? JSON.stringify(r, null, 2) : jobToMarkdown(r));
      }
      default:
        return text(`Unknown tool: ${name}`, true);
    }
  } catch (e) {
    if (e instanceof HiringIndexError) {
      const retry = ['upstream_error', 'upstream_unreachable', 'upstream_timeout', 'rate_limited'];
      const hint = retry.includes(e.code) ? ' (transient — retrying may help)' : '';
      return text(`${e.code}: ${e.message}${hint}`, true);
    }
    return text(String(e?.message ?? e), true);
  }
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return result(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.has(asked) ? asked : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          'Live job postings read from company career pages. Use search_jobs for individual roles, ' +
          'job_market_insights when the question is about a market rather than a listing, and ' +
          'posting_age_report to see how long the listings in a slice have been sitting open.'
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, { tools: TOOLS });
    case 'tools/call':
      return result(id, await callTool(params?.name, params?.arguments));
    default:
      if (isNotification) return;
      return failure(id, -32601, `Method not found: ${method}`);
  }
}

// Кадрирование по переводу строки: одно сообщение может прийти несколькими
// чанками, несколько — одним.
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const raw = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!raw) continue;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      failure(null, -32700, 'Parse error');
      continue;
    }
    try {
      await dispatch(msg);
    } catch (e) {
      if (msg.id !== undefined && msg.id !== null) failure(msg.id, -32603, String(e?.message ?? e));
    }
  }
});

process.stdin.on('end', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

process.stderr.write(`hiringindex-mcp ${SERVER_INFO.version} → ${baseUrl()}\n`);
