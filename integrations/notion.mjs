import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function loadEnvFile() {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    return Object.fromEntries(readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
      const index = line.indexOf('=');
      if (index < 0) return [line.trim(), ''];
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
    }));
  } catch { return {}; }
}
const localEnv = loadEnvFile();
const setting = name => process.env[name] || localEnv[name] || '';
const token = setting('NOTION_TOKEN').trim();
const databaseId = setting('NOTION_DATABASE_ID').trim().replace(/-/g, '');
const notionVersion = setting('NOTION_API_VERSION') || '2022-06-28';

function configured() { return Boolean(token && databaseId); }
function diagnostics() {
  return {
    configured: configured(),
    tokenPresent: Boolean(token),
    tokenLength: token.length,
    databasePresent: Boolean(databaseId),
    databaseLength: databaseId.length,
    databaseIdFormat: /^[a-f0-9]{32}$/i.test(databaseId) ? 'valid-32-hex' : 'unexpected-format',
    envTokenPresent: Boolean(process.env.NOTION_TOKEN),
    envDatabasePresent: Boolean(process.env.NOTION_DATABASE_ID)
  };
}
async function notion(path, options = {}) {
  if (!configured()) throw new Error('NOTION_TOKENとNOTION_DATABASE_IDを設定してください。');
  const response = await fetch(`https://api.notion.com/v1${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Notion-Version': notionVersion, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `Notion API HTTP ${response.status}`);
  return payload;
}
function title(value) { return { title: [{ text: { content: String(value || '').slice(0, 2000) } }] }; }
function rich(value) { return { rich_text: [{ text: { content: String(value || '').slice(0, 2000) } }] }; }
function select(value) { return { select: { name: String(value || '未設定').slice(0, 100) } }; }
function date(value) { return value ? { date: { start: new Date(value).toISOString() } } : { date: null }; }
export async function upsertProject(project) {
  const properties = { Name: title(project.title), Channel: rich(project.channel), Stage: select(project.stage), Status: select(project.status || project.stage), UpdatedAt: date(project.updatedAt || project.createdAt), StorylineId: rich(project.id || randomUUID()) };
  return notion('/pages', { method: 'POST', body: JSON.stringify({ parent: { database_id: databaseId }, properties }) });
}
export async function queryProjects(filter) { return notion(`/databases/${databaseId}/query`, { method: 'POST', body: JSON.stringify(filter || {}) }); }
export async function health() { return notion(`/databases/${databaseId}`); }
export { configured, diagnostics };
