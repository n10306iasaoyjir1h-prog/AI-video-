import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';
import { google } from 'googleapis';

const root = fileURLToPath(new URL('.', import.meta.url));
function loadLocalEnv() {
  try {
    return Object.fromEntries(readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
      const separator = line.indexOf('=');
      if (separator < 0) return [line.trim(), ''];
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')];
    }));
  } catch { return {}; }
}
const localEnv = loadLocalEnv();
const setting = name => process.env[name] || localEnv[name] || '';
const port = Number(setting('PORT') || 4173);
const irodoriUrl = setting('IRODORI_URL') || 'http://localhost:7860';
const irodoriApiName = setting('IRODORI_API_NAME');
const youtubeClientId = setting('YOUTUBE_CLIENT_ID');
const youtubeClientSecret = setting('YOUTUBE_CLIENT_SECRET');
const youtubeRedirectUri = setting('YOUTUBE_REDIRECT_URI');
const youtubeDynamicRedirect = setting('YOUTUBE_DYNAMIC_REDIRECT') === 'true';
const youtubeTokenFile = join(root, 'data', 'youtube-token.json');
const oauthStates = new Map();
const stateDir = join(root, 'data');
const stateFile = join(stateDir, 'state.json');
const assetsDir = join(stateDir, 'assets');
const videosDir = join(stateDir, 'videos');
const maxJsonBodyBytes = 1 * 1024 * 1024;
const maxAssetBytes = 250 * 1024 * 1024;
const maxRenderMs = 15 * 60 * 1000;
const allowedAssetTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'video/mp4', 'video/webm']);
const activeRenders = new Set();
const renderJobs = new Map();
const initialState = { projects: [], assets: [], channels: [], materialRequests: [], notifications: [], feedback: [], strategies: [], automation: { enabled: false, lastRunAt: null }, activity: [], updatedAt: new Date().toISOString() };

mkdirSync(assetsDir, { recursive: true });
mkdirSync(videosDir, { recursive: true });
if (!existsSync(stateFile)) writeFileSync(stateFile, JSON.stringify(initialState, null, 2));
function createYoutubeAuth(redirectUri = youtubeRedirectUri) {
  if (!youtubeClientId || !youtubeClientSecret || !redirectUri) return null;
  return new google.auth.OAuth2(youtubeClientId, youtubeClientSecret, redirectUri);
}
function requestOrigin(request) {
  const forwardedHost = request.headers['x-forwarded-host'] || request.headers.host;
  const forwardedProto = request.headers['x-forwarded-proto'] || 'http';
  return `${forwardedProto}://${forwardedHost}`;
}
function readYoutubeToken() {
  try { return JSON.parse(readFileSync(youtubeTokenFile, 'utf8')); } catch { return null; }
}
function writeYoutubeToken(token) { writeFileSync(youtubeTokenFile, JSON.stringify(token), { mode: 0o600 }); }
function getYoutubeClient() {
  const auth = createYoutubeAuth();
  const token = readYoutubeToken();
  if (!auth || !token) return null;
  auth.setCredentials(token);
  return auth;
}
async function publishProject(project) {
  const auth = getYoutubeClient();
  if (!auth) throw new Error('YouTube OAuth未接続です。設定・連携から接続してください。');
  const youtube = google.youtube({ version: 'v3', auth });
  const video = await youtube.videos.insert({ part: ['snippet', 'status'], requestBody: { snippet: { title: project.title, description: project.description || '', tags: project.tags || [], categoryId: '22' }, status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false } }, media: { body: createReadStream(join(videosDir, project.video.file)) } });
  return { id: video.data.id, url: `https://www.youtube.com/watch?v=${video.data.id}`, privacyStatus: 'unlisted', publishedAt: new Date().toISOString() };
}
async function synthesizeIrodori(text, outputName = `irodori-${randomUUID()}.wav`) {
  if (!irodoriApiName) throw new Error('IRODORI_API_NAMEが未設定です。GradioのAPI名を設定してください。');
  const call = await fetch(`${irodoriUrl}/gradio_api/call/${encodeURIComponent(irodoriApiName)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: [text] }) });
  if (!call.ok) throw new Error(`Irodori API request failed: HTTP ${call.status}`);
  const callResult = await call.json();
  const events = await fetch(`${irodoriUrl}/gradio_api/call/${encodeURIComponent(irodoriApiName)}/${callResult.event_id}`);
  const stream = await events.text();
  const match = stream.match(/"url"\s*:\s*"([^"]+)"/);
  if (!match) throw new Error('Irodoriの応答から音声URLを取得できません。IRODORI_API_NAMEとGradioの出力を確認してください。');
  const audio = await fetch(new URL(match[1], irodoriUrl));
  if (!audio.ok) throw new Error(`Irodori audio download failed: HTTP ${audio.status}`);
  const outputPath = join(assetsDir, outputName);
  writeFileSync(outputPath, Buffer.from(await audio.arrayBuffer()));
  return { outputPath, storedName: outputName };
}
async function syncYoutubeAnalytics() {
  const auth = getYoutubeClient();
  if (!auth) throw new Error('YouTube OAuth未接続です。');
  const youtube = google.youtube({ version: 'v3', auth });
  const analytics = google.youtubeAnalytics({ version: 'v2', auth });
  const channelResponse = await youtube.channels.list({ part: ['snippet', 'statistics', 'contentDetails'], mine: true });
  const channel = channelResponse.data.items?.[0];
  if (!channel) throw new Error('YouTubeチャンネルが見つかりません。');
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 28 * 24 * 60 * 60 * 1000);
  const date = value => value.toISOString().slice(0, 10);
  const report = await analytics.reports.query({ ids: `channel==${channel.id}`, startDate: date(startDate), endDate: date(endDate), metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained', dimensions: 'video', sort: '-views', maxResults: 50 });
  const state = readState();
  const stats = { channelId: channel.id, title: channel.snippet?.title, subscribers: Number(channel.statistics?.subscriberCount || 0), views: Number(channel.statistics?.viewCount || 0), videoCount: Number(channel.statistics?.videoCount || 0), periodStart: date(startDate), periodEnd: date(endDate), videoRows: report.data.rows || [], syncedAt: new Date().toISOString() };
  for (const localProject of state.projects) {
    const videoId = localProject.youtube?.id;
    const row = stats.videoRows.find(item => item[0] === videoId);
    if (!row) continue;
    const feedback = { id: `youtube_${videoId}_${stats.periodEnd}`, projectId: localProject.id, channel: localProject.channel, views: Number(row[1] || 0), retention: Number(row[4] || 0), ctr: 0, note: 'YouTube Analyticsから自動同期', measuredAt: stats.syncedAt };
    state.feedback = [feedback, ...(state.feedback || []).filter(item => item.id !== feedback.id)].slice(0, 200);
    updateStrategy(state, localProject.channel);
  }
  state.youtube = stats;
  writeState(state);
  return stats;
}

function readState() {
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    const channels = (state.channels || []).map(channel => ({ ...channel, assetRules: channel.assetRules || buildAssetRules(channel) }));
    const projects = (state.projects || []).map(project => project.rendering?.status === 'running' ? { ...project, rendering: { ...project.rendering, status: 'stale', error: 'サーバー再起動により前回の生成は中断されました。' } } : project);
    return { ...initialState, ...state, projects, channels, materialRequests: state.materialRequests || [], notifications: state.notifications || [], feedback: state.feedback || [], strategies: state.strategies || [], automation: { ...initialState.automation, ...(state.automation || {}) }, activity: state.activity || [] };
  } catch { return structuredClone(initialState); }
}
function writeState(state) {
  state.updatedAt = new Date().toISOString();
  const temporaryFile = `${stateFile}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryFile, JSON.stringify(state, null, 2), 'utf8');
  renameSync(temporaryFile, stateFile);
}
function isWithin(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !path.startsWith(`..${sep}`) && !path.startsWith(sep));
}
function addNotification(state, notification) {
  state.notifications = state.notifications || [];
  state.notifications.unshift({ id: `notification_${randomUUID()}`, read: false, createdAt: new Date().toISOString(), ...notification });
  state.notifications = state.notifications.slice(0, 100);
}
function buildAssetRules(channel) {
  const slug = String(channel.name || 'channel').trim().toLowerCase().replace(/[^a-z0-9一-龯ぁ-んァ-ン]+/g, '_').replace(/^_|_$/g, '') || 'channel';
  return {
    root: `素材/${slug}`,
    folders: [
      { category: 'character', folder: `素材/${slug}/01_キャラクター`, pattern: `${slug}_char_{name}_v{version}.png` },
      { category: 'background', folder: `素材/${slug}/02_背景`, pattern: `${slug}_bg_{scene}_v{version}.jpg` },
      { category: 'object', folder: `素材/${slug}/03_小物`, pattern: `${slug}_obj_{name}_v{version}.png` },
      { category: 'voice', folder: `素材/${slug}/04_Irodori音声`, pattern: `${slug}_voice_{character}_{scene}_v{version}.wav` },
      { category: 'bgm', folder: `素材/${slug}/05_BGM`, pattern: `${slug}_bgm_{mood}_v{version}.mp3` },
      { category: 'sfx', folder: `素材/${slug}/06_効果音`, pattern: `${slug}_sfx_{name}_v{version}.wav` },
      { category: 'thumbnail', folder: `素材/${slug}/07_サムネイル`, pattern: `${slug}_thumb_{title}_v{version}.jpg` }
    ],
    naming: '英数字または日本語の短い識別子を使い、末尾に必ずv01形式の版数を付ける。上書きせず新しい版を追加する。'
  };
}
function updateStrategy(state, channelName) {
  const channel = state.channels.find(item => item.name === channelName);
  if (!channel) return null;
  const feedback = state.feedback.filter(item => item.channel === channelName);
  const average = feedback.length ? Math.round(feedback.reduce((sum, item) => sum + (Number(item.retention) || 0), 0) / feedback.length) : null;
  const direction = average === null ? 'まずは3本公開し、視聴維持率・クリック率・コメントを比較する' : average >= 55 ? '維持率の高い冒頭構成をシリーズ化し、投稿頻度を維持する' : '冒頭15秒の約束を明確にし、短い導入で再検証する';
  const strategy = { id: `strategy_${randomUUID()}`, channel: channelName, basedOn: feedback.length, averageRetention: average, direction, nextExperiments: ['冒頭フックを2パターン比較', 'サムネイルの主題を1つに絞る', '高反応テーマの続編を制作'], updatedAt: new Date().toISOString() };
  state.strategies = [strategy, ...(state.strategies || []).filter(item => item.channel !== channelName)].slice(0, 50);
  channel.strategy = { ...channel.strategy, ...strategy };
  return strategy;
}
function sendJson(response, status, body) {
  if (response.headersSent) return;
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}
function serveStatic(request, response) {
  const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const filePath = normalize(join(root, requested));
  if (!isWithin(root, filePath) || !existsSync(filePath)) return sendJson(response, 404, { error: 'Not found' });
  const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-store, max-age=0' });
  response.end(readFileSync(filePath));
}
async function readBody(request) {
  const contentLength = Number(request.headers['content-length'] || 0);
  if (contentLength > maxJsonBodyBytes) throw new Error('request body too large');
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxJsonBodyBytes) throw new Error('request body too large');
  }
  return JSON.parse(body || '{}');
}
async function readBuffer(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxAssetBytes) throw new Error('asset too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function decodeHeader(value, fallback) {
  try { return decodeURIComponent(String(value || fallback)); } catch { return String(value || fallback); }
}
async function checkIrodori() {
  try {
    const result = await fetch(irodoriUrl, { signal: AbortSignal.timeout(2500) });
    return { online: true, status: result.status, url: irodoriUrl };
  } catch (error) {
    return { online: false, status: 0, url: irodoriUrl, message: error.message };
  }
}
function buildProduction(input) {
  const title = String(input.title || `${String(input.purpose || '日常の小さな物語').slice(0, 24)}｜今日の一話`).slice(0, 160);
  const channel = String(input.channel || '夜の余白 / YOHaku').slice(0, 120);
  const purpose = String(input.purpose || '眠る前に心が少し軽くなる短い物語').slice(0, 300);
  const tone = String(input.tone || '静かであたたかい').slice(0, 100);
  const duration = Math.max(30, Math.min(300, Number(input.duration) || 60));
  const script = [`【オープニング】\nこんにちは。${channel}です。今日は「${title}」をお届けします。`, `【本編】\n${purpose}をテーマに、${tone}空気感でお話しします。\n\n忙しい一日の中で、ほんの少し立ち止まる時間を作ってみてください。見慣れた景色にも、小さな変化が隠れています。`, `【余白】\nすぐに答えを出さなくても大丈夫です。今日できたことをひとつだけ思い出して、そのままの自分を休ませてあげましょう。`, `【エンディング】\n最後まで聴いてくださって、ありがとうございました。あなたの明日が、今日より少し穏やかになりますように。`].join('\n\n');
  const tags = [`#${channel.split('/')[0].trim().replace(/\s+/g, '')}`, '#朗読', '#癒し', '#日常'];
  const description = `${purpose}\n\n${channel}から、${tone}雰囲気の動画をお届けします。\n\n${tags.join(' ')}`;
  return { title, channel, purpose, tone, duration, script, description, tags };
}
function buildChannelStrategy(channel) {
  return { positioning: `${channel.purpose}を、${channel.tone}世界観で継続的に届ける`, pillars: ['定番シリーズ', '季節・話題の短編', '視聴者参加型'], cadence: channel.cadence || '週2本', horizon: '90日', nextReview: '公開後の視聴維持率とクリック率を毎週確認' };
}
function createAutomaticProject(channel) {
  const seed = `${channel.purpose}｜${new Date().toISOString().slice(0, 10)}`;
  return buildProduction({ channel: channel.name, purpose: seed, tone: channel.tone, duration: channel.duration });
}
async function runAutomation() {
  const state = readState();
  if (!state.automation.enabled) return { created: [], skipped: 'disabled' };
  const created = [];
  const rendered = [];
  for (const project of state.projects.filter(item => item.source === '自動運転' && item.stage === '台本完成 / 素材待ち')) {
    const selected = selectProductionAssets(state.assets || [], project);
    if (!selected.background || !selected.character || !selected.voice || !selected.bgm) continue;
    const outputName = `${project.id}-${Date.now()}.mp4`;
    try {
      const duration = Math.max(10, Math.min(300, Number(project.duration) || 60));
      await renderVideo(join(assetsDir, selected.background.storedName), join(assetsDir, selected.character.storedName), join(assetsDir, selected.voice.storedName), join(assetsDir, selected.bgm.storedName), join(videosDir, outputName), duration);
      project.video = { file: outputName, url: `/media/${outputName}`, duration, createdAt: new Date().toISOString() };
      project.stage = '最終確認';
      project.progress = 100;
      addNotification(state, { type: 'review-required', projectId: project.id, channel: project.channel, title: project.title, message: '自動生成した動画が完成しました。公開前の最終チェックが必要です。', url: project.video.url });
      rendered.push(project.id);
    } catch (error) {
      state.activity.unshift({ type: 'render-error', projectId: project.id, message: error.message, createdAt: new Date().toISOString() });
    }
  }
  for (const channel of state.channels) {
    const pending = state.projects.some(project => project.channel === channel.name && !['公開済み', '最終確認'].includes(project.stage));
    if (pending) continue;
    const production = createAutomaticProject(channel);
    const project = { id: `project_${Date.now()}_${created.length}`, ...production, imageAssetId: '', audioAssetId: '', progress: 20, stage: '台本完成 / 素材待ち', source: '自動運転', createdAt: new Date().toISOString() };
    state.projects.unshift(project);
    created.push(project);
  }
  state.automation.lastRunAt = new Date().toISOString();
  if (created.length || rendered.length) state.activity.unshift({ type: 'auto-run', created: created.length, rendered: rendered.length, createdAt: state.automation.lastRunAt });
  writeState(state);
  return { created, rendered, skipped: created.length || rendered.length ? null : 'pending-project' };
}
function renderVideo(backgroundPath, characterPath, voicePath, bgmPath, outputPath, duration) {
  // Voice is intentionally not looped: an Irodori sample must never become repeated dialogue.
  const args = ['-y', '-loop', '1', '-i', backgroundPath, '-loop', '1', '-i', characterPath, '-i', voicePath, '-stream_loop', '-1', '-i', bgmPath];
  args.push('-filter_complex', '[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=rgba[bg];[1:v]scale=720:-1:force_original_aspect_ratio=decrease,format=rgba[char];[bg][char]overlay=x=\'W-w-140+18*sin(2*PI*t/8)\':y=\'H-h-40+10*sin(2*PI*t/5)\':shortest=1,format=yuv420p[v];[2:a]volume=1.0[voice];[3:a]volume=0.18[bgm];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]', '-map', '[v]', '-map', '[a]', '-t', String(duration), '-r', '24', '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-preset', 'fast', '-crf', '19', '-threads', '2', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  args.push(outputPath);
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, args);
    let errorOutput = '';
    const timeout = setTimeout(() => {
      process.kill('SIGKILL');
      reject(new Error('動画生成が20分を超えたため停止しました。動画尺を短くするか、素材サイズを小さくして再試行してください。'));
    }, maxRenderMs);
    process.stderr.on('data', chunk => { errorOutput += chunk.toString(); });
    process.on('error', error => { clearTimeout(timeout); reject(error); });
    process.on('close', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(errorOutput.slice(-1000) || `ffmpeg exited with code ${code}`)); });
  });
}
function renderThumbnail(imagePath, outputPath) {
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, ['-y', '-i', imagePath, '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', '-frames:v', '1', outputPath]);
    let errorOutput = '';
    process.stderr.on('data', chunk => { errorOutput += chunk.toString(); });
    process.on('error', reject);
    process.on('close', code => code === 0 ? resolve() : reject(new Error(errorOutput.slice(-1000))));
  });
}
function selectAsset(assets, project, predicate) {
  const eligible = assets.filter(predicate);
  return eligible.find(asset => asset.id === project.imageAssetId || asset.id === project.audioAssetId)
    || eligible.find(asset => asset.channel === project.channel)
    || eligible.find(asset => asset.channel === '共通素材');
}
function selectProductionAssets(assets, project) {
  const sameChannel = asset => asset.channel === project.channel || asset.channel === '共通素材';
  const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const image = (category) => assets.find(asset => asset.id === project.imageAssetId && asset.category === category && imageTypes.has(asset.mimeType))
    || assets.find(asset => sameChannel(asset) && asset.category === category && imageTypes.has(asset.mimeType));
  const voice = assets.find(asset => asset.id === project.audioAssetId && asset.mimeType.startsWith('audio/'))
    || assets.find(asset => sameChannel(asset) && asset.category === 'voice' && asset.mimeType.startsWith('audio/'));
  const bgm = assets.find(asset => sameChannel(asset) && asset.category === 'bgm' && asset.mimeType.startsWith('audio/'));
  return { background: image('background'), character: image('character'), voice, bgm };
}
function createMaterialRequests(state, project, missing) {
  const rules = state.channels.find(channel => channel.name === project.channel)?.assetRules;
  const byCategory = new Map((rules?.folders || []).map(rule => [rule.category, rule]));
  const requests = missing.map(category => {
    const rule = byCategory.get(category) || { folder: `素材/${project.channel}/${category}`, pattern: `${project.channel}_${category}_{name}_v01` };
    return { id: `material_${randomUUID()}`, projectId: project.id, channel: project.channel, category, status: 'pending', title: `${project.title} に必要な${category}`, folder: rule.folder, naming: rule.pattern, rationale: `${project.title}の台本と演出に${category}が必要です。`, createdAt: new Date().toISOString() };
  });
  state.materialRequests = [...requests, ...(state.materialRequests || []).filter(item => !(item.projectId === project.id && item.status === 'pending'))].slice(0, 200);
  return requests;
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/api/youtube/auth' && request.method === 'GET') {
    const redirectUri = youtubeDynamicRedirect ? `${requestOrigin(request)}/oauth2callback` : youtubeRedirectUri;
    const auth = createYoutubeAuth(redirectUri);
    if (!auth) return sendJson(response, 503, { error: 'youtube_credentials_missing', message: 'YOUTUBE_CLIENT_ID、YOUTUBE_CLIENT_SECRET、YOUTUBE_REDIRECT_URIを設定してください。' });
    const state = randomUUID();
    oauthStates.set(state, { redirectUri, createdAt: Date.now() });
    for (const [key, value] of oauthStates) if (Date.now() - value.createdAt > 10 * 60 * 1000) oauthStates.delete(key);
    const authorizationUrl = auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'], state });
    return sendJson(response, 200, { authorizationUrl });
  }
  if (url.pathname === '/oauth2callback' && request.method === 'GET') {
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const oauthState = state ? oauthStates.get(state) : null;
    if (!oauthState || !oauthStates.delete(state) || !code) return sendJson(response, 400, { error: 'invalid_oauth_callback' });
    try {
      const auth = createYoutubeAuth(oauthState.redirectUri);
      const { tokens } = await auth.getToken(code);
      writeYoutubeToken(tokens);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return response.end('<!doctype html><meta charset="utf-8"><title>接続完了</title><p>YouTubeとの接続が完了しました。この画面を閉じてStorylineへ戻ってください。</p><script>window.close()</script>');
    } catch (error) { return sendJson(response, 502, { error: 'youtube_oauth_failed', message: error.message }); }
  }
  if (url.pathname === '/api/config' && request.method === 'GET') {
    return sendJson(response, 200, { irodoriUrl, youtubeClientId, youtubeRedirectUri, youtubeConfigured: Boolean(youtubeClientId && youtubeClientSecret), youtubeAuthorized: Boolean(getYoutubeClient()), irodoriConfigured: Boolean(setting('IRODORI_URL')) });
  }
  if (url.pathname === '/api/youtube/sync' && request.method === 'POST') {
    try { return sendJson(response, 200, await syncYoutubeAnalytics()); }
    catch (error) { return sendJson(response, 502, { error: 'youtube_sync_failed', message: error.message }); }
  }
  if (url.pathname === '/api/irodori/health' && request.method === 'GET') return sendJson(response, 200, await checkIrodori());
  if (url.pathname === '/api/irodori/synthesize' && request.method === 'POST') {
    try {
      const input = await readBody(request);
      if (!input.text) return sendJson(response, 400, { error: 'text is required' });
      const result = await synthesizeIrodori(String(input.text).slice(0, 30000));
      const state = readState();
      const asset = { id: `asset_${randomUUID()}`, name: result.storedName, storedName: result.storedName, mimeType: 'audio/wav', channel: String(input.channel || '共通素材'), category: 'voice', relativePath: result.storedName, size: readFileSync(result.outputPath).length, createdAt: new Date().toISOString() };
      state.assets.unshift(asset);
      writeState(state);
      return sendJson(response, 201, asset);
    } catch (error) { return sendJson(response, 502, { error: 'irodori_synthesis_failed', message: error.message }); }
  }
  if (url.pathname === '/api/projects' && request.method === 'GET') return sendJson(response, 200, readState().projects);
  if (url.pathname === '/api/channels' && request.method === 'GET') return sendJson(response, 200, readState().channels);
  if (url.pathname === '/api/channels' && request.method === 'POST') {
    try {
      const input = await readBody(request);
      if (!input.name || !input.purpose) return sendJson(response, 400, { error: 'name and purpose are required' });
      const state = readState();
      const channel = { id: input.id || `channel_${Date.now()}`, name: String(input.name).slice(0, 120), purpose: String(input.purpose).slice(0, 500), audience: String(input.audience || '').slice(0, 300), tone: String(input.tone || '上質で落ち着いた').slice(0, 100), cadence: String(input.cadence || '週2本').slice(0, 30), duration: Math.max(30, Math.min(300, Number(input.duration) || 60)), strategy: buildChannelStrategy(input), assetRules: buildAssetRules(input), updatedAt: new Date().toISOString() };
      state.channels = [channel, ...state.channels.filter(item => item.id !== channel.id)];
      state.automation.enabled = true;
      writeState(state);
      return sendJson(response, 201, channel);
    } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
  }
  if (url.pathname === '/api/automation/status' && request.method === 'GET') return sendJson(response, 200, readState().automation);
  if (url.pathname === '/api/automation/run' && request.method === 'POST') return sendJson(response, 200, await runAutomation());
  if (url.pathname.startsWith('/api/render-jobs/') && request.method === 'GET') {
    const job = renderJobs.get(url.pathname.split('/')[3]);
    return sendJson(response, job ? 200 : 404, job || { error: 'Render job not found' });
  }
  if (url.pathname === '/api/notifications' && request.method === 'GET') {
    const state = readState();
    return sendJson(response, 200, state.notifications.slice(0, 30));
  }
  if (url.pathname === '/api/notifications/read' && request.method === 'POST') {
    try {
      const input = await readBody(request);
      const state = readState();
      for (const notification of state.notifications) if (!input.id || notification.id === input.id) notification.read = true;
      writeState(state);
      return sendJson(response, 200, { ok: true });
    } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
  }
  if (url.pathname === '/api/feedback' && request.method === 'GET') return sendJson(response, 200, readState().feedback.slice(0, 100));
  if (url.pathname === '/api/feedback' && request.method === 'POST') {
    try {
      const input = await readBody(request);
      if (!input.channel || !input.projectId) return sendJson(response, 400, { error: 'channel and projectId are required' });
      const state = readState();
      const feedback = { id: `feedback_${randomUUID()}`, projectId: String(input.projectId), channel: String(input.channel).slice(0, 120), views: Math.max(0, Number(input.views) || 0), retention: Math.max(0, Math.min(100, Number(input.retention) || 0)), ctr: Math.max(0, Math.min(100, Number(input.ctr) || 0)), likes: Math.max(0, Number(input.likes) || 0), comments: Math.max(0, Number(input.comments) || 0), note: String(input.note || '').slice(0, 1000), measuredAt: new Date().toISOString() };
      state.feedback.unshift(feedback);
      const strategy = updateStrategy(state, feedback.channel);
      state.activity.unshift({ type: 'feedback-imported', channel: feedback.channel, createdAt: feedback.measuredAt });
      writeState(state);
      return sendJson(response, 201, { feedback, strategy });
    } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
  }
  if (url.pathname === '/api/strategy' && request.method === 'GET') return sendJson(response, 200, readState().strategies || []);
  if (url.pathname === '/api/material-requests' && request.method === 'GET') return sendJson(response, 200, readState().materialRequests || []);
  if (url.pathname.startsWith('/api/material-requests/') && request.method === 'PATCH') {
    try {
      const requestId = url.pathname.split('/')[3];
      const input = await readBody(request);
      const state = readState();
      const materialRequest = state.materialRequests.find(item => item.id === requestId);
      if (!materialRequest) return sendJson(response, 404, { error: 'Material request not found' });
      if (!['approved', 'rejected'].includes(input.status)) return sendJson(response, 400, { error: 'status must be approved or rejected' });
      materialRequest.status = input.status;
      materialRequest.decidedAt = new Date().toISOString();
      writeState(state);
      return sendJson(response, 200, materialRequest);
    } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
  }
  if (url.pathname === '/api/assets/rules' && request.method === 'GET') {
    const state = readState();
    const channel = state.channels.find(item => item.name === url.searchParams.get('channel'));
    return sendJson(response, channel ? 200 : 404, channel?.assetRules || { error: 'Channel not found' });
  }
  if (url.pathname === '/api/projects' && request.method === 'POST') {
    try {
      const input = await readBody(request);
      if (!input.title || !input.channel) return sendJson(response, 400, { error: 'title and channel are required' });
      const state = readState();
      const project = { id: `project_${Date.now()}`, title: String(input.title).slice(0, 160), channel: String(input.channel).slice(0, 120), script: '', description: '', tags: [], imageAssetId: '', audioAssetId: '', progress: 0, stage: '構成準備中', createdAt: new Date().toISOString() };
      state.projects.unshift(project);
      writeState(state);
      return sendJson(response, 201, project);
    } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
  }
  if (url.pathname === '/api/automation/create-project' && request.method === 'POST') {
    try {
      const input = await readBody(request);
      const production = buildProduction(input);
      const state = readState();
      const project = { id: `project_${Date.now()}`, ...production, imageAssetId: '', audioAssetId: '', progress: 20, stage: '台本完成 / 素材待ち', createdAt: new Date().toISOString() };
      state.projects.unshift(project);
      writeState(state);
      return sendJson(response, 201, project);
    } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
  }
  if (url.pathname.startsWith('/api/projects/') && url.pathname.endsWith('/render') && request.method === 'POST') {
    const projectId = url.pathname.split('/')[3];
    if (activeRenders.has(projectId)) return sendJson(response, 409, { error: 'render_in_progress', message: 'この企画はすでに動画を生成しています。' });
    const state = readState();
    const project = state.projects.find(item => item.id === projectId);
    if (!project) return sendJson(response, 404, { error: 'Project not found' });
    if (project.rendering?.status === 'running') return sendJson(response, 409, { error: 'render_in_progress', message: 'この企画はすでに動画を生成しています。' });
    const selected = selectProductionAssets(state.assets || [], project);
    const missing = [['background', selected.background], ['character', selected.character], ['voice', selected.voice], ['bgm', selected.bgm]].filter(([, asset]) => !asset).map(([category]) => category);
    if (missing.length) {
      const requests = createMaterialRequests(state, project, missing);
      writeState(state);
      return sendJson(response, 422, { error: 'production_assets_required', missing, requests, message: `高品質動画に必要な素材が不足しています。素材提案を確認し、承認した素材を追加してください。` });
    }
    const outputName = `${project.id}-${Date.now()}.mp4`;
    const outputPath = join(videosDir, outputName);
    const jobId = `render_${randomUUID()}`;
    const job = { jobId, projectId, status: 'queued', progress: 0, createdAt: new Date().toISOString() };
    renderJobs.set(jobId, job);
    project.rendering = { jobId, status: 'running', startedAt: job.createdAt };
    writeState(state);
    activeRenders.add(projectId);
    void (async () => {
      try {
        job.status = 'rendering';
        job.startedAt = new Date().toISOString();
        const duration = Math.max(10, Math.min(300, Number(project.duration) || 60));
        await renderVideo(join(assetsDir, selected.background.storedName), join(assetsDir, selected.character.storedName), join(assetsDir, selected.voice.storedName), join(assetsDir, selected.bgm.storedName), outputPath, duration);
        project.video = { file: outputName, url: `/media/${outputName}`, duration, createdAt: new Date().toISOString() };
        project.stage = '最終確認';
        project.progress = 100;
        project.rendering = { jobId, status: 'completed', completedAt: new Date().toISOString() };
        addNotification(state, { type: 'review-required', projectId: project.id, channel: project.channel, title: project.title, message: '動画が完成しました。公開前の最終チェックが必要です。', url: project.video.url });
        writeState(state);
        Object.assign(job, { status: 'completed', progress: 100, video: project.video, completedAt: new Date().toISOString() });
      } catch (error) {
        project.rendering = { jobId, status: 'failed', error: error.message, completedAt: new Date().toISOString() };
        writeState(state);
        Object.assign(job, { status: 'failed', error: error.message, completedAt: new Date().toISOString() });
      } finally {
        activeRenders.delete(projectId);
        setTimeout(() => renderJobs.delete(jobId), 60 * 60 * 1000);
      }
    })();
    return sendJson(response, 202, { jobId, status: job.status, statusUrl: `/api/render-jobs/${jobId}` });
  }
  if (url.pathname.startsWith('/api/projects/') && url.pathname.endsWith('/review') && request.method === 'POST') {
    try {
      const projectId = url.pathname.split('/')[3];
      const input = await readBody(request);
      const state = readState();
      const project = state.projects.find(item => item.id === projectId);
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (input.decision === 'revise') {
        project.stage = '修正依頼';
        project.reviewNote = String(input.note || '').slice(0, 2000);
        project.updatedAt = new Date().toISOString();
        writeState(state);
        return sendJson(response, 200, project);
      }
      if (input.decision !== 'approve') return sendJson(response, 400, { error: 'decision must be approve or revise' });
      if (!project.video) return sendJson(response, 422, { error: 'video_required', message: '動画生成後に審査してください。' });
      project.youtube = await publishProject(project);
      project.stage = '非公開投稿済み';
      project.updatedAt = new Date().toISOString();
      writeState(state);
      return sendJson(response, 200, project);
    } catch (error) { return sendJson(response, 502, { error: 'review_action_failed', message: error.message }); }
  }
  if (url.pathname.startsWith('/api/projects/') && request.method === 'PATCH') {
    try {
      const projectId = url.pathname.split('/')[3];
      const input = await readBody(request);
      const state = readState();
      const project = state.projects.find(item => item.id === projectId);
      if (!project) return sendJson(response, 404, { error: 'Project not found' });
      if (typeof input.title === 'string') project.title = input.title.slice(0, 160);
      if (typeof input.script === 'string') project.script = input.script.slice(0, 30000);
      if (typeof input.description === 'string') project.description = input.description.slice(0, 5000);
      if (Array.isArray(input.tags)) project.tags = input.tags.map(tag => String(tag).slice(0, 40)).slice(0, 20);
      if (typeof input.imageAssetId === 'string') project.imageAssetId = input.imageAssetId;
      if (typeof input.audioAssetId === 'string') project.audioAssetId = input.audioAssetId;
      if (typeof input.duration === 'number') project.duration = Math.max(30, Math.min(300, input.duration));
      if (typeof input.stage === 'string') project.stage = input.stage.slice(0, 40);
      if (typeof input.progress === 'number') project.progress = Math.max(0, Math.min(100, input.progress));
      project.updatedAt = new Date().toISOString();
      writeState(state);
      return sendJson(response, 200, project);
    } catch { return sendJson(response, 400, { error: 'Invalid JSON' }); }
  }
  if (url.pathname === '/api/assets' && request.method === 'GET') return sendJson(response, 200, readState().assets || []);
  if (url.pathname === '/api/assets/upload' && request.method === 'POST') {
    const originalName = decodeHeader(request.headers['x-file-name'], 'asset.bin').slice(0, 180);
    const channel = decodeHeader(request.headers['x-channel'], '共通素材').slice(0, 120);
    const category = decodeHeader(request.headers['x-category'], 'その他').slice(0, 40);
    const relativePath = decodeHeader(request.headers['x-relative-path'], originalName).slice(0, 300);
    const mimeType = String(request.headers['content-type'] || '').split(';')[0].toLowerCase();
    const contentLength = Number(request.headers['content-length'] || 0);
    if (!allowedAssetTypes.has(mimeType)) return sendJson(response, 415, { error: 'unsupported_asset_type' });
    if (contentLength > maxAssetBytes) return sendJson(response, 413, { error: 'asset_too_large', maxBytes: maxAssetBytes });
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'asset.bin';
    const storedName = `${randomUUID()}-${safeName}`;
    const filePath = join(assetsDir, storedName);
    let buffer;
    try { buffer = await readBuffer(request); } catch (error) { return sendJson(response, 413, { error: 'asset_too_large', message: error.message }); }
    if (!buffer.length) return sendJson(response, 400, { error: 'empty file' });
    writeFileSync(filePath, buffer);
    const asset = { id: `asset_${randomUUID()}`, name: originalName, storedName, mimeType, channel, category, relativePath, size: buffer.length, createdAt: new Date().toISOString() };
    const state = readState();
    state.assets = state.assets || [];
    state.assets.unshift(asset);
    writeState(state);
    if ((state.materialRequests || []).some(item => item.status === 'approved' && item.channel === channel)) void runAutomation().catch(error => console.error('Automatic retry failed:', error.message));
    return sendJson(response, 201, asset);
  }
  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'API route not found' });
  if (url.pathname.startsWith('/media/')) {
    const mediaName = url.pathname.slice('/media/'.length);
    const mediaPath = normalize(join(videosDir, mediaName));
    if (!isWithin(videosDir, mediaPath) || !existsSync(mediaPath)) return sendJson(response, 404, { error: 'Video not found' });
    response.writeHead(200, { 'content-type': 'video/mp4', 'cache-control': 'no-store' });
    return response.end(readFileSync(mediaPath));
  }
  return serveStatic(request, response);
}
const server = createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    console.error('Request failed:', error);
    sendJson(response, 500, { error: 'internal_error', message: error.message || 'Unexpected server error' });
  });
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the existing process or run with PORT=4174 npm start.`);
  } else {
    console.error('STORYLINE server failed to start:', error.message);
  }
  process.exitCode = 1;
});
server.listen(port, () => console.log(`STORYLINE server running at http://localhost:${port}`));
setInterval(() => runAutomation().catch(error => console.error('Autopilot run failed:', error.message)), 10 * 60 * 1000);
setInterval(() => syncYoutubeAnalytics().catch(error => console.error('YouTube sync skipped:', error.message)), 6 * 60 * 60 * 1000);
