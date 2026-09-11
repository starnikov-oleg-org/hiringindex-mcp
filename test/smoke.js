// Гоняет сервер как настоящий MCP-клиент: пишет в stdin, читает stdout.
// Живые вызовы выполняются только если задан ключ.
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['src/index.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let buf = '';
let id = 0;

child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const raw = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!raw) continue;
    const msg = JSON.parse(raw);
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  }
});

const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const myId = ++id;
    pending.set(myId, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
    setTimeout(() => reject(new Error(`timeout on ${method}`)), 40000);
  });

const notify = (method) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

try {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  check('initialize отвечает', !!init.result);
  check('версия протокола согласована', init.result?.protocolVersion === '2025-06-18', init.result?.protocolVersion);
  check('сервер представился', init.result?.serverInfo?.name === 'hiringindex');
  check('инструкции есть', typeof init.result?.instructions === 'string' && init.result.instructions.length > 40);

  const older = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  check('старая версия протокола принята', older.result?.protocolVersion === '2024-11-05');

  notify('notifications/initialized');
  check('нотификация не роняет сервер', true);

  const ping = await rpc('ping');
  check('ping отвечает', ping.result && Object.keys(ping.result).length === 0);

  const tools = await rpc('tools/list');
  const names = (tools.result?.tools ?? []).map((t) => t.name).sort();
  check('четыре инструмента', names.length === 4, names.join(', '));
  check('состав инструментов', names.join(',') === 'get_job,job_market_insights,posting_age_report,search_jobs', names.join(','));
  check('схемы закрыты', (tools.result?.tools ?? []).every((t) => t.inputSchema.additionalProperties === false));
  check('get_job требует id', tools.result.tools.find((t) => t.name === 'get_job')?.inputSchema.required?.includes('id'));
  check('инструменты помечены read-only', (tools.result?.tools ?? []).every((t) => t.annotations?.readOnlyHint === true));

  const bad = await rpc('tools/call', { name: 'nope', arguments: {} });
  check('неизвестный инструмент -> isError', bad.result?.isError === true);

  const noId = await rpc('tools/call', { name: 'get_job', arguments: {} });
  check('get_job без id -> внятная ошибка', noId.result?.isError === true && /id_required/.test(noId.result.content[0].text));

  const unknown = await rpc('totally/unknown');
  check('неизвестный метод -> -32601', unknown.error?.code === -32601);

  if (process.env.HIRINGINDEX_API_KEY || process.env.RAPIDAPI_KEY) {
    const live = await rpc('tools/call', { name: 'search_jobs', arguments: { titles: ['Software Engineer'], limit: 3 } });
    check('живой поиск вернул текст', typeof live.result?.content?.[0]?.text === 'string' && !live.result.isError,
          live.result?.content?.[0]?.text?.slice(0, 120));
    const age = await rpc('tools/call', { name: 'posting_age_report', arguments: { titles: ['Software Engineer'] } });
    check('живой отчёт по возрасту', !age.result?.isError, age.result?.content?.[0]?.text?.slice(0, 120));
  } else {
    const noKey = await rpc('tools/call', { name: 'search_jobs', arguments: { titles: ['x'] } });
    check('без ключа — понятное сообщение', noKey.result?.isError === true && /API key/i.test(noKey.result.content[0].text));
    check('без ключа — ссылка, где взять бесплатный ключ',
          noKey.result?.content?.[0]?.text?.includes('rapidapi.com/starnikovoleg/api/hiringindex/pricing'),
          noKey.result?.content?.[0]?.text?.slice(0, 200));
    console.log('  —     живые вызовы пропущены: нет HIRINGINDEX_API_KEY');
  }
} catch (e) {
  fail++;
  console.log('  FAIL  ' + e.message);
} finally {
  child.stdin.end();
  console.log(`\n  ${pass} пройдено, ${fail} провалено\n`);
  process.exit(fail ? 1 : 0);
}
