const pipelineItems = [
  { title: '雨の日に聴く、深夜ラジオ', channel: '夜の余白 / YOHaku', progress: 100, stage: '最終確認', stageClass: 'review' },
  { title: '星を数えるための小さな習慣', channel: '夜の余白 / YOHaku', progress: 72, stage: '編集中', stageClass: '' },
  { title: '静かな朝のルーティン', channel: '小さな発見ノート', progress: 38, stage: '素材待ち', stageClass: 'review' },
  { title: '知らない街の朝ごはん #04', channel: '小さな発見ノート', progress: 100, stage: '予約済み', stageClass: 'ready' }
];
const assets = [
  ['夜の余白 / キャラクターA', 'character', 'キャラクター'], ['窓辺の夜・01', 'background', '背景'], ['夜の余白 / キャラクターB', 'character', 'キャラクター'], ['雨音と遠い街灯', 'sound', '効果音'], ['朝の部屋・木漏れ日', 'background', '背景'], ['Irodori_voice_01', 'audio', 'キャラボイス'], ['紙をめくる音', 'sound', '効果音'], ['夜明け前のBGM', 'audio', 'BGM']
];
const channels = [
  { name: '夜の余白', handle: '@yohaku_night', desc: '眠る前の5分間に、静かな物語を。', subscribers: '8.4K', videos: '42本', banner: '' },
  { name: '小さな発見ノート', handle: '@small_note', desc: '毎日に隠れた、小さな発見を記録。', subscribers: '2.1K', videos: '18本', banner: 'coral' },
  { name: '未設定のチャンネル', handle: 'チャンネルを準備中', desc: '新しい世界観をここから育てます。', subscribers: '—', videos: '—', banner: 'blue' }
];
const integrationConfig = {
  youtubeClientId: '',
  irodoriBaseUrl: 'http://localhost:7860'
};
let serverAssets = [];
let serverChannels = [];
let activeAssetCategory = 'all';
let serverNotifications = [];
let youtubeConfigured = false;
let youtubeRedirectUri = '';
let geminiConfigured = false;
let geminiModel = '';
let groqConfigured = false;
let notionConfigured = false;
let groqModel = '';
let activeAiModel = '';
let ownerProfile = { displayName: 'オーナー', email: '', discord: '', role: 'チャンネル運営者', timezone: 'Asia/Tokyo' };
let automationActivity = null;


const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const formatDate = value => value ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '未更新';
async function apiJson(url, options = {}) { const response = await fetch(url, { cache: 'no-store', ...options }); const text = await response.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; } if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`); return data; }

const weekdayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
function ensureStrategyTab() {
  let view = $('#strategy-view');
  if (!view) { view = document.createElement('section'); view.id = 'strategy-view'; view.className = 'view'; const main = document.querySelector('main, .main-content, .content') || document.body; main.appendChild(view); }
  let nav = document.querySelector('.nav-list, .sidebar-nav, nav');
  if (nav && !nav.querySelector('[data-view="strategy"]')) { const tab = document.createElement('button'); tab.className = 'nav-item'; tab.dataset.view = 'strategy'; tab.textContent = '長期戦略・自動運転'; nav.appendChild(tab); tab.addEventListener('click', () => switchView('strategy')); }
  return view;
}
function applyOwnerDisplayName() {
  const name = ownerProfile.displayName || 'オーナー';
  document.querySelectorAll('[data-owner-name], .user-name, .profile-name, .account-name, #owner-header-badge').forEach(node => { node.textContent = name; });
  const roots = document.querySelectorAll('header, .topbar, .top-header, .app-header, .user-menu, .profile-menu');
  roots.forEach(root => { const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode); nodes.forEach(node => { if (/Yukiさん?|Yuki|オーナーさん?/.test(node.nodeValue || '')) node.nodeValue = node.nodeValue.replace(/Yukiさん?|Yuki|オーナーさん?/g, `${name}さん`); }); });
}

function ensurePanel(id, title, anchor = document.body) { let panel = document.getElementById(id); if (!panel) { panel = document.createElement('section'); panel.id = id; panel.className = 'panel'; anchor.prepend(panel); } return panel; }
function renderDashboard(data) {
  const panel = ensurePanel('live-dashboard-panel', 'リアルタイム状況', document.querySelector('#dashboard-view, #home-view, .view.active') || document.body);
  const c = data.counts || {}; const items = (data.needsAttention || []).slice(0, 8);
  panel.innerHTML = `<div class="dashboard-live-head"><div><p class="eyebrow">LIVE STATUS</p><h2>正確な運営状況</h2><small>最終更新: ${escapeHtml(formatDate(data.latestUpdatedAt))}</small></div><button class="outline-button small" data-action="refresh-dashboard">再取得</button></div><div class="dashboard-metrics"><button data-view="pipeline"><strong>${c.review || 0}</strong><span>公開前の確認</span></button><button data-view="pipeline"><strong>${c.inProgress || 0}</strong><span>制作中の企画</span></button><button data-view="assets"><strong>${c.waitingAssets || 0}</strong><span>素材待ち</span></button><button data-view="pipeline"><strong>${c.published || 0}</strong><span>公開済み</span></button><button data-view="pipeline"><strong>${c.scheduled || 0}</strong><span>公開予約</span></button></div><div class="dashboard-attention"><strong>あなたの確認が必要なもの</strong>${items.length ? items.map(item => `<button class="attention-item" data-project-id="${escapeHtml(item.projectId || '')}"><span class="new-badge">${item.read === false ? '新着' : '要対応'}</span><b>${escapeHtml(item.title || '通知')}</b><small>${escapeHtml(item.message || '')} / ${escapeHtml(formatDate(item.createdAt))}</small></button>`).join('') : '<p>現在、確認が必要なものはありません。</p>'}</div><div class="dashboard-updated">自動運転: ${data.automation?.enabled ? '稼働中' : '停止中'} / 自動運転最終実行: ${escapeHtml(formatDate(data.automation?.lastRunAt))}</div>`;
}
async function hydrateGrowth() {
  try {
    const data = await apiJson('/api/growth');
    const target = document.querySelector('#growth-insight, [data-growth-insight]');
    const panel = target || ensurePanel('growth-live-panel', '実績上昇チャンネル', document.querySelector('#dashboard-view, #home-view, .view.active') || document.body);
    panel.innerHTML = `<div class="dashboard-live-head"><div><p class="eyebrow">GROWTH DATA</p><h2>実績が伸びているチャンネル</h2><small>最終更新: ${escapeHtml(formatDate(data.updatedAt))}</small></div></div>${data.channels?.length ? data.channels.map(item => `<article class="growth-item"><strong>${escapeHtml(item.channel)}</strong><span>再生数 ${item.views.toLocaleString()}（前回比 +${item.viewsDelta.toLocaleString()}） / 維持率 ${item.retention}%（${item.retentionDelta >= 0 ? '+' : ''}${item.retentionDelta}%）</span><small>${escapeHtml(formatDate(item.measuredAt))} / ${escapeHtml(item.source)}</small></article>`).join('') : '<p>現存チャンネルについて、上昇を確認できる実績データはまだありません。</p>'}`;
  } catch (error) { /* growth is optional */ }
}
async function hydrateDashboard() { try { const data = await apiJson('/api/dashboard'); renderDashboard(data); await hydrateGrowth(); } catch (error) { showToast('状況を取得できません', error.message); } }
function openDynamicDialog(id, title, body) { let dialog = document.getElementById(id); if (!dialog) { dialog = document.createElement('dialog'); dialog.id = id; dialog.style.cssText = 'max-width:760px;width:calc(100% - 32px);border:0;border-radius:18px;padding:0;box-shadow:0 20px 60px #0003;'; document.body.appendChild(dialog); } dialog.innerHTML = `<div style="padding:24px"><div style="display:flex;justify-content:space-between;gap:16px;align-items:center"><h2>${escapeHtml(title)}</h2><button class="outline-button small" data-close-dialog="${id}">閉じる</button></div>${body}</div>`; if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); return dialog; }
async function openChannelDetail(channelName) { try { const data = await apiJson(`/api/channels/${encodeURIComponent(channelName)}`); const p = data.projects || []; const y = data.youtube; openDynamicDialog('channel-detail-dialog', `${channelName} / 最新状況`, `<p>最終更新: <b>${escapeHtml(formatDate(data.latestUpdatedAt))}</b></p><div class="dashboard-metrics"><div><strong>${y?.subscribers ?? '—'}</strong><span>登録者</span></div><div><strong>${y?.videoCount ?? p.filter(x => x.youtube).length}</strong><span>動画数</span></div><div><strong>${y?.views ?? '—'}</strong><span>総再生回数</span></div></div><h3>最新の企画・動画</h3>${p.length ? p.slice(0, 8).map(item => `<div class="attention-item"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.stage || item.status)} / 更新 ${escapeHtml(formatDate(item.lastUpdatedAt))}</small></div>`).join('') : '<p>まだ企画データがありません。</p>'}<h3>戦略</h3><p>${escapeHtml(data.strategy?.positioning || data.strategy?.direction || '戦略データは未作成です。')}</p>`); } catch (error) { showToast('チャンネル状況を取得できません', error.message); } }
async function hydrateStrategies(channel = '') { try { const rows = await apiJson(`/api/strategy${channel ? `?channel=${encodeURIComponent(channel)}` : ''}`); const plan = await apiJson('/api/automation/plan'); const view = ensureStrategyTab(); view.innerHTML = `<div class="panel"><div class="dashboard-live-head"><div><p class="eyebrow">LONG-TERM STRATEGY</p><h2>実績に基づく長期戦略・自動運転計画</h2><small>最終更新: ${escapeHtml(formatDate(plan.generatedAt))}</small></div><button class="outline-button small" data-action="refresh-strategy">再取得</button></div><div class="strategy-status"><strong>Gemini: ${plan.aiConfigured ? `接続済み / ${escapeHtml(plan.model)}` : '未設定または未接続'}</strong><span>自動運転: ${plan.channels.some(item => item.automation.enabled) ? '稼働中' : '停止中'}</span></div>${plan.channels.length ? plan.channels.map(item => `<article class="strategy-live-card"><h3>${escapeHtml(item.channel)}</h3><p><b>この情報に基づく戦略:</b> ${escapeHtml(item.strategy.positioning)}</p><p><b>戦略の根拠:</b> ${escapeHtml(item.strategy.rationale)}</p><p><b>投稿頻度:</b> ${escapeHtml(item.schedule.cadence)}（${item.schedule.intervalDays}日おき・${weekdayNames[item.schedule.publishWeekday] || '曜日未設定'}） / <b>投稿時刻:</b> ${escapeHtml(item.schedule.publishTime)} / <b>次回投稿:</b> ${escapeHtml(formatDate(item.schedule.nextPublishAt))}</p><p><b>動画制作開始:</b> ${escapeHtml(formatDate(item.schedule.productionStartAt))}（投稿6時間前を基準）</p><p><b>参照データ:</b> 実績${item.basis.feedbackRecords}件、企画${item.basis.projects}件、素材${item.basis.assetCount}件 / YouTube同期: ${escapeHtml(formatDate(item.basis.youtubeSyncedAt))}</p><small>AI戦略更新: ${escapeHtml(formatDate(item.automation.lastAiStrategyAt))} / 自動運転最終実行: ${escapeHtml(formatDate(item.automation.lastRunAt))}</small><div><b>次の検証:</b> ${escapeHtml((item.strategy.experiments || []).join(' / ') || '未設定')}</div></article>`).join('') : '<p>チャンネル設定後に戦略が表示されます。</p>'}</div>`; } catch (error) { showToast('長期戦略を取得できません', error.message); } }
async function runAutomationNow() { try { const result = await apiJson('/api/automation/run', { method: 'POST' }); showToast('自動運転を実行しました', `${result.created?.length || 0}件の企画生成、${result.rendered?.length || 0}件の動画制作を処理しました。`); await Promise.all([hydrateDashboard(), hydrateProjects(), hydrateAutomationActivity(), hydrateMaterialRequests()]); } catch (error) { showToast('自動運転を実行できません', error.message); } }
async function openNotificationSettings() { try { const settings = await apiJson('/api/notifications/settings'); const email = window.prompt('提出通知を受け取るメールアドレス（空欄可）', settings.email || ''); if (email === null) return; const browser = window.confirm('このブラウザにも通知を表示しますか？'); await apiJson('/api/notifications/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, browser }) }); const discord = await apiJson('/api/discord/health'); showToast('提出通知を保存しました', `ブラウザ通知: ${browser ? 'オン' : 'オフ'} / Discord: ${discord.message}`); } catch (error) { showToast('提出通知を設定できません', error.message); } }
function showHelp() { openDynamicDialog('help-dialog', 'STORYLINE ヘルプ', '<p>公開前の動画はトップの「あなたの確認が必要なもの」またはパイプラインから開けます。動画・サムネイル・タイトル・概要欄・タグをプレビューで確認し、品質チェック合格後にYouTubeへ非公開投稿します。</p><p>素材不足の場合は素材ページのリクエストを承認し、チャンネルを選んでアップロードしてください。自動運転はサーバー側で10分ごとに実行されます。</p>'); }

const $ = (selector) => document.querySelector(selector);
(function prepareInstallableApp() {
  if (!document.querySelector('link[rel="manifest"]')) { const link = document.createElement('link'); link.rel = 'manifest'; link.href = '/manifest.webmanifest'; document.head.appendChild(link); }
  if (!document.querySelector('meta[name="theme-color"]')) { const meta = document.createElement('meta'); meta.name = 'theme-color'; meta.content = '#f5f7ee'; document.head.appendChild(meta); }
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
})();
const $$ = (selector) => [...document.querySelectorAll(selector)];
function renderPipeline() {
  const stateFor = item => item.rendering?.status === 'running' ? { label: '動画生成中', progress: Math.max(1, item.progress || 60), cls: '' } : item.video && item.stage !== '最終確認' && item.stage !== '非公開投稿済み' ? { label: '動画完成', progress: 100, cls: 'ready' } : { label: item.stage || '未着手', progress: item.progress || 0, cls: item.stage === '最終確認' ? 'review' : '' };
  $('#pipeline-list').innerHTML = pipelineItems.map((item, index) => { const state = stateFor(item); return `<button class="pipeline-row pipeline-row-button" data-project-id="${item.id || ''}"><input class="pipeline-select" type="checkbox" data-project-id="${item.id || `local-${index}`}" aria-label="${item.title}を選択"><span class="pipeline-number">${String(index + 1).padStart(2, '0')}</span><div class="pipeline-copy"><strong>${item.title}</strong><span>${item.channel}</span><div class="progress-track"><div class="progress-bar" style="width:${state.progress}%"></div></div><small class="last-updated">最終更新: ${formatDate(item.updatedAt || item.createdAt)}</small></div><span class="pipeline-stage ${state.cls}">${state.label}</span></button>`; }).join('');
  $('#kanban').innerHTML = [['企画・構成', pipelineItems.slice(1, 2)], ['素材準備', pipelineItems.slice(2, 3)], ['編集中', pipelineItems.slice(1, 2)], ['最終確認', pipelineItems.slice(0, 1)]].map(([name, items]) => `<div class="kanban-column"><div class="kanban-head"><strong>${name}</strong><span>0${items.length}</span></div>${items.map(item => `<button class="kanban-card kanban-card-button" data-project-id="${item.id || ''}"><strong>${item.title}</strong><small>${item.channel}</small><div class="card-foot"><span>${item.stage}</span><span class="mini-avatar">Y</span></div></button>`).join('')}</div>`).join('');
  const list = $('#pipeline-list');
  if (list && !$('#automation-insight')) {
    const panel = document.createElement('section'); panel.id = 'automation-insight'; panel.className = 'panel';
    list.parentElement?.insertBefore(panel, list);
  }
  if (automationActivity) renderAutomationInsight(automationActivity);
}
function renderAutomationInsight(data) {
  const target = $('#automation-insight');
  if (!target) return;
  const activities = data.activity || [];
  const latest = activities[0];
  const aiProjects = (data.projects || []).filter(item => item.aiGenerated).slice(0, 5);
  const aiStrategy = (data.strategies || [])[0];
  const status = data.automation?.enabled ? '自動運転中' : '停止中';
  target.innerHTML = `<div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start"><div><p class="eyebrow">GEMINI AUTOPILOT</p><h2>生成AI自動運転 <span class="connected">${status}</span></h2><p>${latest ? `${latest.type} / ${new Date(latest.createdAt).toLocaleString('ja-JP')}` : 'チャンネル設定後にAIの活動履歴が表示されます。'}</p></div><div><strong>${data.automation?.lastAiStrategyAt ? '戦略更新済み' : '戦略未更新'}</strong><br><small>${data.automation?.lastAiStrategyAt ? new Date(data.automation.lastAiStrategyAt).toLocaleString('ja-JP') : '—'}</small></div></div><div class="automation-columns"><div><strong>AI戦略の要約</strong><p>${aiStrategy?.positioning || aiStrategy?.direction || 'Geminiがチャンネル設定を分析中です。'}</p><small>${aiStrategy?.rationale || aiStrategy?.weeklyPlan || ''}</small></div><div><strong>直近のAI生成成果</strong>${aiProjects.length ? aiProjects.map(project => `<button class="automation-project" data-project-id="${project.id}"><b>${project.title}</b><small>${project.stage} / ${project.model || 'Gemini'}</small></button>`).join('') : '<p>まだAI生成成果はありません。</p>'}</div></div><details><summary>Geminiの活動履歴を表示</summary><div class="automation-log">${activities.slice(0, 12).map(item => `<div><time>${new Date(item.createdAt).toLocaleString('ja-JP')}</time><span>${item.type}${item.channel ? ` / ${item.channel}` : ''}${item.message ? ` — ${item.message}` : ''}</span></div>`).join('') || '<p>活動履歴はありません。</p>'}</div></details><div class="pipeline-bulk-tools"><label><input type="checkbox" id="select-all-projects"> すべて選択</label><button class="outline-button small" id="delete-selected-projects">選択した企画を削除</button><button class="outline-button small" id="delete-obsolete-projects">ボツ・未完了をまとめて削除</button></div>`;
}
function renderAssets() {
  const customAssets = JSON.parse(localStorage.getItem('storyline-assets') || '[]');
  const visibleAssets = activeAssetCategory === 'all' ? serverAssets : serverAssets.filter(asset => asset.category === activeAssetCategory);
  const persistedAssets = visibleAssets.map(asset => [asset.name, asset.mimeType.startsWith('audio') ? 'audio' : asset.mimeType.startsWith('video') ? 'sound' : 'character', asset.category || 'サーバー保存済み', asset.channel || '共通素材', asset.id, asset]);
  const allAssets = [...persistedAssets, ...customAssets];
  $('#asset-count').textContent = activeAssetCategory === 'all' ? serverAssets.length : visibleAssets.length;
  $('#asset-grid').innerHTML = allAssets.map((entry, index) => {
    const [name, type, label, channel = 'デモ素材', assetId = '', assetData = null] = entry;
    return `<article class="asset-card"><div class="asset-preview ${type}"><span class="asset-type">${label}</span>${type === 'audio' || type === 'sound' ? '● )))' : 'VISUAL ASSET'}</div><div class="asset-card-body"><strong>${name}</strong><small>${channel} / 使用可能${assetData?.visionStatus === 'completed' ? ` / AI検査済み${assetData.visionConfidence ? ` (${Math.round(assetData.visionConfidence * 100)}%)` : ''}` : assetData?.visionStatus === 'failed' ? ' / AI検査失敗' : ''}</small>${assetData?.contentSummary ? `<p class="asset-ai-summary">${escapeHtml(assetData.contentSummary)}</p>` : ''}${assetId ? `<div class="asset-actions"><button class="outline-button small asset-inspect" data-asset-id="${assetId}">内容をAI検査</button><button class="outline-button small asset-rename" data-asset-id="${assetId}">名前変更</button><button class="outline-button small asset-delete" data-asset-id="${assetId}">削除</button></div>` : ''}</div></article>`;
  }).join('');
}
async function hydrateAssets() {
  try {
    const response = await fetch('/api/assets');
    if (!response.ok) return;
    serverAssets = await response.json();
    renderAssets();
  } catch (error) {
    showToast('素材一覧を取得できません', 'ローカル表示を継続しています。');
  }
}
async function hydrateChannels() {
  try {
    const response = await fetch('/api/channels');
    if (!response.ok) return;
    serverChannels = await response.json();
    const select = $('#asset-channel-select');
    if (select && serverChannels.length) select.innerHTML = '<option value="共通素材">共通素材</option>' + serverChannels.map(channel => `<option value="${channel.name}">${channel.name}</option>`).join('');
    renderChannels();
    renderOperationsSelectors();
  } catch (error) {
    showToast('チャンネル設定を取得できません', 'ローカル表示を継続しています。');
  }
}
function renderChannels() {
  const configured = serverChannels.map(channel => ({ name: channel.name, handle: '自動運転中', desc: channel.purpose, subscribers: '—', videos: '企画を自動生成', banner: '' }));
  const visibleChannels = configured.length ? configured : channels;
  $('#channel-grid').innerHTML = visibleChannels.map((channel, index) => `<article class="channel-card" data-channel-name="${escapeHtml(channel.name)}" tabindex="0"><div class="channel-banner ${channel.banner}"><div class="channel-symbol">${index === 0 ? '夜' : index === 1 ? '発' : '+'}</div></div><div class="channel-card-body"><h2>${channel.name}</h2><span class="channel-handle">${channel.handle}</span><p class="heading-note" style="margin-top:13px;line-height:1.6">${channel.desc}</p><div class="channel-stats"><div><strong>${channel.subscribers}</strong><small>登録者</small></div><div><strong>${channel.videos}</strong><small>状態</small></div></div></div><div class="channel-card-footer"><span>${configured.length ? '戦略・企画・制作を自動運転中' : '設定を始める'}</span>${configured.length ? '<span class="connected">AI戦略は自動更新</span>' : '<span>チャンネル設定後に利用可能</span>'}<button class="outline-button small delete-channel" data-channel-name="${escapeHtml(channel.name)}">チャンネルを削除</button></div></article>`).join('');
}
async function refreshAiStrategy(channelName, button) {
  if (!channelName || button?.disabled) return;
  if (button) { button.disabled = true; button.textContent = 'AI分析中…'; }
  try {
    const response = await fetch(`/api/channels/${encodeURIComponent(channelName)}/strategy/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'AI戦略の更新に失敗しました');
    showToast('AI戦略を更新しました', `${result.positioning || '新しい戦略を保存しました'} 次回レビュー: ${result.nextReviewAt || '未設定'}`);
  } catch (error) {
    showToast('AI戦略を更新できません', error.message || 'サーバーとAI APIの設定を確認してください。');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'AI戦略を更新'; }
  }
}
function inferCategory(file) {
  const path = (file.webkitRelativePath || file.name).toLowerCase();
  if (/(キャラ|character|voice|ボイス)/.test(path) && file.type.startsWith('image/')) return 'character';
  if (/(背景|background|bg)/.test(path)) return 'background';
  if (/(object|オブジェクト|小物)/.test(path)) return 'object';
  if (/(bgm|音楽|music)/.test(path) || file.type.startsWith('audio/') && !/(効果|sfx|effect)/.test(path)) return 'bgm';
  if (/(効果|sfx|effect)/.test(path)) return 'sfx';
  if (file.type.startsWith('audio/')) return 'voice';
  return file.type.startsWith('image/') ? 'background' : 'sfx';
}
async function uploadAssetFiles(files, categoryOverride = '') {
  const channel = $('#asset-channel-select').value;
  if (!channel || channel === '共通素材') return showToast('チャンネルを選択してください', '素材を保存するチャンネルを指定してください。');
  let uploaded = 0;
  for (const file of files) {
    const category = categoryOverride || inferCategory(file);
    const response = await fetch('/api/assets/upload', { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name), 'x-relative-path': encodeURIComponent(file.webkitRelativePath || file.name), 'x-channel': encodeURIComponent(channel), 'x-category': encodeURIComponent(category) }, body: file });
    if (response.ok) uploaded += 1;
  }
  await hydrateAssets();
  showToast('素材を同期しました', `${uploaded}/${files.length}件を「${channel} / ${categoryOverride ? $('#asset-category-select').selectedOptions[0].textContent : 'フォルダ構成から判定'}」に登録しました。`);
}
function showToast(title, message) { $('#toast-title').textContent = title; $('#toast-message').textContent = message; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 3500); }
function switchView(view) { if (view === 'dashboard' || view === 'home') hydrateDashboard(); if (view === 'strategy' || view === 'long-term-strategy') hydrateStrategies(); $$('.view').forEach(section => section.classList.toggle('active', section.id === `${view}-view`)); $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view)); const active = $(`.nav-item[data-view="${view}"]`); $('#page-name').textContent = active ? active.textContent.trim() : view === 'settings' ? '設定・連携' : view; }
function openModal() { $('#modal').classList.add('open'); setTimeout(() => $('#project-purpose').focus(), 50); }
function closeModal() { $('#modal').classList.remove('open'); }
function openChannelModal() { $('#channel-modal').classList.add('open'); setTimeout(() => $('#channel-name').focus(), 50); }
function closeChannelModal() { $('#channel-modal').classList.remove('open'); }
let activeProject = null;
function openProduction(project) {
  activeProject = project;
  $('#production-title').textContent = project.title;
  $('#production-script').value = project.script || '';
  $('#production-description').value = project.description || '';
  $('#production-tags').value = (project.tags || []).join(', ');
  let strategyBox = $('#production-strategy');
  if (!strategyBox) {
    strategyBox = document.createElement('div');
    strategyBox.id = 'production-strategy';
    strategyBox.style.cssText = 'margin:12px 0;padding:14px;border:1px solid #dfe6d8;border-radius:12px;background:#f7faf3;line-height:1.6;white-space:pre-wrap;';
    $('#production-script').parentElement?.insertBefore(strategyBox, $('#production-script'));
  }
  strategyBox.innerHTML = `<strong>AIが設計した狙い</strong><br>${project.strategyIntent || '保存された長期戦略からの狙いはまだありません。'}<br><br><strong>映像構成</strong><br>${project.visualPlan || '映像構成は台本を参照してください。'}<br><br><strong>独自性</strong><br>${project.uniqueAngle || '未設定'}`;
  let deleteButton = $('#delete-project');
  if (!deleteButton) {
    deleteButton = document.createElement('button');
    deleteButton.id = 'delete-project';
    deleteButton.className = 'outline-button small';
    deleteButton.textContent = '企画・動画を削除';
    $('#production-title').parentElement?.appendChild(deleteButton);
  }
  deleteButton.onclick = () => deleteProject(project);
  const hasPreviousCompleted = pipelineItems.some(item => item.id && item.id !== project.id && (item.video || item.youtube || item.stage === '最終確認' || item.stage === '非公開投稿済み'));
  const renderButton = $('#render-video');
  if (renderButton) {
    renderButton.disabled = hasPreviousCompleted || Boolean(project.video) || project.rendering?.status === 'running';
    renderButton.title = renderButton.disabled ? '初回動画の確認後は自動運転で生成されます' : '初回動画を手動で生成します';
    renderButton.textContent = renderButton.disabled ? '自動制作中' : '初回動画を生成';
  }
  const approveButton = $('#approve-review');
  if (approveButton) {
    const canPublish = Boolean(project.video && project.qualityCheck?.passed && project.stage === '最終確認');
    approveButton.disabled = !canPublish;
    approveButton.title = canPublish ? '最終確認後にYouTubeへ非公開投稿します' : '動画完成・品質チェック合格後に利用できます';
  }
  const sameChannel = asset => asset.channel === project.channel || asset.channel === '共通素材';
  const imageOptions = serverAssets.filter(asset => sameChannel(asset) && ['character', 'background', 'object'].includes(asset.category) && ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType));
  const audioOptions = serverAssets.filter(asset => sameChannel(asset) && ['voice', 'sfx'].includes(asset.category) && asset.mimeType.startsWith('audio/'));
  $('#production-image').innerHTML = '<option value="">自動選択（背景とキャラを別々に使用）</option>' + imageOptions.map(asset => `<option value="${asset.id}">${asset.category} / ${asset.name}</option>`).join('');
  $('#production-audio').innerHTML = '<option value="">チャンネルのIrodori音声を自動選択</option>' + audioOptions.map(asset => `<option value="${asset.id}">${asset.category} / ${asset.name}</option>`).join('');
  $('#production-image').value = project.imageAssetId || '';
  $('#production-audio').value = project.audioAssetId || '';
  
  $$('.review-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'script'));
  $$('.review-tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-script'));
  
  updatePreviewTab(project);
  updateQualityTab(project);

  $('#production-modal').classList.add('open');
}

function updatePreviewTab(project) {
  const player = $('#preview-player');
  const thumb = $('#preview-thumb');
  const previewEmpty = $('#preview-empty');
  const thumbEmpty = $('#thumb-empty');

  if (project.video?.url) {
    player.src = project.video.url;
    player.style.display = 'block';
    if(previewEmpty) previewEmpty.style.display = 'none';
  } else {
    player.src = '';
    player.style.display = 'none';
    if(previewEmpty) previewEmpty.style.display = 'block';
  }

  if (project.thumbnail?.url) {
    thumb.src = project.thumbnail.url;
    thumb.style.display = 'block';
    if(thumbEmpty) thumbEmpty.style.display = 'none';
  } else {
    thumb.src = '';
    thumb.style.display = 'none';
    if(thumbEmpty) thumbEmpty.style.display = 'block';
  }

  $('#preview-title-text').textContent = project.title || '未設定';
  $('#preview-desc-text').textContent = project.description || '未設定';
  $('#preview-tags-text').textContent = (project.tags || []).join(', ') || '未設定';
}

async function updateQualityTab(project) {
  const details = $('#quality-details');
  const issues = $('#quality-issues');
  
  $('#quality-score').textContent = '--';
  $('#quality-score').className = 'quality-score-number';
  details.innerHTML = '<p>読み込み中...</p>';
  issues.innerHTML = '';

  if (!project.id) return;
  try {
    const res = await fetch(`/api/projects/${project.id}/quality`);
    if (!res.ok) throw new Error('Not found');
    const q = await res.json();
    project.qualityCheck = q;
    if (q.passed && project.video) { project.stage = '最終確認'; project.progress = 100; }
    renderPipeline();
    
    const scoreNum = $('#quality-score');
    scoreNum.textContent = q.score;
    scoreNum.className = `quality-score-number ${q.score >= 80 ? 'pass' : q.score >= 60 ? 'warn' : 'fail'}`;

    details.innerHTML = ['video', 'audio', 'metadata'].map(cat => {
      const catData = q.details[cat];
      if (!catData) return '';
      const sc = catData.score;
      const c = sc >= 80 ? 'pass' : sc >= 60 ? 'warn' : 'fail';
      const label = cat === 'video' ? '映像' : cat === 'audio' ? '音声' : 'メタデータ';
      return `<div class="quality-detail-row">
        <strong>${label}</strong>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="quality-bar"><div class="quality-bar-fill ${c}" style="width:${sc}%"></div></div>
          <strong>${sc}</strong>
        </div>
      </div>`;
    }).join('');
    
    issues.innerHTML = (q.issues || []).map(issue => `<div class="quality-issue fail"><span>!</span> ${issue}</div>`).join('');
    if (q.passed) issues.innerHTML += `<div class="quality-issue pass"><span>✓</span> すべての品質基準を満たしています</div>`;
    const approveButton = $('#approve-review');
    if (approveButton) approveButton.disabled = !(project.video && q.passed && project.stage === '最終確認');
  } catch (err) {
    details.innerHTML = '<p>動画生成後に品質チェック結果が表示されます</p>';
  }
}
async function submitReviewDecision(decision, noteStr = '') {
  if (!activeProject?.id) return;
  if (decision === 'approve' && !(activeProject.video && activeProject.qualityCheck?.passed && activeProject.stage === '最終確認')) {
    return showToast('まだ投稿できません', '動画完成・品質チェック合格・最終確認待ちの状態が必要です。');
  }
  const note = decision === 'revise' ? noteStr : '';
  const response = await fetch(`/api/projects/${activeProject.id}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, note }) });
  const result = await response.json();
  if (!response.ok) return showToast('審査処理に失敗しました', result.message || result.error || 'サーバーの状態を確認してください。');
  if (decision === 'approve') showToast('承認しました', 'YouTubeへ投稿しました。');
  else {
    showToast('修正依頼を送信しました', '自動で再生成されます。');
  }
  closeProduction();
}
function closeProduction() { $('#production-modal').classList.remove('open'); activeProject = null; }
async function deleteProject(project) {
  if (!project || !window.confirm(`「${project.title}」と生成動画を削除しますか？`)) return;
  if (!project.id) { const index = pipelineItems.indexOf(project); if (index >= 0) pipelineItems.splice(index, 1); renderPipeline(); closeProduction(); return showToast('初期企画を削除しました', project.title); }
  const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
  const result = response ? await response.json().catch(() => ({})) : { deleted: localIds.length };
  if (response && !response.ok) return showToast('企画を削除できません', result.message || '生成中の動画は削除できません。');
  const index = pipelineItems.findIndex(item => item.id === project.id);
  if (index >= 0) pipelineItems.splice(index, 1);
  renderPipeline(); closeProduction(); await hydrateDashboard(); await hydrateNotifications(); showToast('企画と動画を削除しました', project.title);
}
async function saveProduction(stage = null) {
  if (!activeProject?.id) return showToast('先に企画を保存してください', 'サーバー保存済みの企画を選択してください。');
  const tags = $('#production-tags').value.split(',').map(tag => tag.trim()).filter(Boolean);
  const payload = { script: $('#production-script').value, description: $('#production-description').value, tags, imageAssetId: $('#production-image').value, audioAssetId: $('#production-audio').value };
  if (stage) Object.assign(payload, { stage, progress: 100 });
  const response = await fetch(`/api/projects/${activeProject.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error('project update failed');
  Object.assign(activeProject, payload);
  renderPipeline();
  showToast(stage ? '最終確認へ送りました' : '制作データを保存しました', stage ? '公開前の確認をお願いします。' : '台本と公開情報を保存しました。');
}
async function finalizeRenderSuccess() {
  $('#render-result').innerHTML = `<a href="${activeProject.video.url}" target="_blank" rel="noreferrer">生成した動画を確認する →</a>`;
  showToast('動画を生成しました', '生成結果を確認してから最終確認へ送ってください。');
  
  await updateQualityTab(activeProject);
  
  $$('.review-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'preview'));
  $$('.review-tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-preview'));
  
  updatePreviewTab(activeProject);
}

async function renderProjectVideo() {
  if (!activeProject?.id) return showToast('先に企画を保存してください', 'サーバー保存済みの企画を選択してください。');
  const hasPreviousCompleted = pipelineItems.some(item => item.id && item.id !== activeProject.id && (item.video || item.youtube || item.stage === '最終確認' || item.stage === '非公開投稿済み'));
  if (hasPreviousCompleted || activeProject.video) return showToast('動画制作は自動運転中です', '初回動画以降は素材が揃うと自動的に制作されます。');
  $('#render-result').textContent = '動画を生成しています...';
  try {
    await saveProduction();
    const response = await fetch(`/api/projects/${activeProject.id}/render`, { method: 'POST' });
    const responseText = await response.text();
    let result;
    try { result = JSON.parse(responseText); } catch { throw new Error(responseText || `動画生成サーバーが空の応答を返しました（HTTP ${response.status}）。サーバーを再起動して再試行してください。`); }
    if (!response.ok) throw new Error(result.message || 'render failed');
    if (response.status === 202 && result.statusUrl) {
      $('#render-result').textContent = '動画を生成中です。画面を閉じても処理は継続します。';
      await waitForRenderJob(result.statusUrl);
    } else {
      activeProject.video = result;
      await finalizeRenderSuccess();
    }
  } catch (error) {
    $('#render-result').textContent = error.message;
    showToast('動画を生成できません', error.message);
  }
}

async function waitForRenderJob(statusUrl) {
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 900; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const response = await fetch(statusUrl, { cache: 'no-store' });
    const responseText = await response.text();
    let job;
    try { job = JSON.parse(responseText); } catch { throw new Error(`動画生成ジョブの状態を取得できません（HTTP ${response.status}）。サーバーが再起動されていないか確認してください。`); }
    if (!response.ok || job.status === 'failed') throw new Error(job.error || '動画生成に失敗しました');
    if (job.status === 'completed') {
      activeProject.video = job.video;
      await finalizeRenderSuccess();
      return;
    }
    const elapsedMinutes = Math.floor((Date.now() - startedAt) / 60000);
    $('#render-result').textContent = job.status === 'rendering' ? `動画を生成中です（経過 ${elapsedMinutes}分）。高品質設定のため時間がかかります。` : '動画生成を開始しています...';
  }
  throw new Error('動画生成が30分を超えました。サーバーのレンダリングログを確認してください。');
}
async function hydrateIntegrationConfig() {
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      const config = await response.json();
      if (config.irodoriUrl) integrationConfig.irodoriBaseUrl = config.irodoriUrl;
      if (config.youtubeClientId) integrationConfig.youtubeClientId = config.youtubeClientId;
      youtubeConfigured = Boolean(config.youtubeConfigured);
      youtubeRedirectUri = config.youtubeRedirectUri || `${window.location.origin}/oauth2callback`;
      geminiConfigured = Boolean(config.geminiConfigured);
      geminiModel = config.geminiModel || ''; groqConfigured = Boolean(config.groqConfigured); notionConfigured = Boolean(config.notionConfigured); groqModel = config.groqModel || ''; activeAiModel = config.activeAiModel || '';
    }
  } catch (error) {
    showToast('接続設定を取得できません', '既定の接続先で起動します。');
  }
}
async function hydrateProjects() {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) return;
    const savedProjects = await response.json();
    const savedProjectIds = new Set(savedProjects.map(project => project.id));
    for (let index = pipelineItems.length - 1; index >= 0; index -= 1) {
      if (savedProjectIds.has(pipelineItems[index].id)) pipelineItems.splice(index, 1);
    }
    pipelineItems.unshift(...savedProjects.map(project => ({ ...project, stageClass: '' })));
    renderPipeline();
  } catch (error) {
    showToast('サーバーに接続できません', 'ローカル保存のデータで表示しています。');
  }
}
async function hydrateAutomationActivity() {
  try {
    const response = await fetch('/api/automation/activity', { cache: 'no-store' });
    if (!response.ok) return;
    automationActivity = await response.json();
    renderAutomationInsight(automationActivity);
  } catch (error) { /* 可視化は本体の自動運転を止めない */ }
}
async function hydrateOwner() {
  try {
    const response = await fetch('/api/owner', { cache: 'no-store' });
    if (!response.ok) return;
    ownerProfile = await response.json();
    applyOwnerDisplayName();
    let badge = $('#owner-header-badge');
    if (!badge) {
      const header = document.querySelector('header, .topbar, .top-header, .app-header');
      if (header) { badge = document.createElement('span'); badge.id = 'owner-header-badge'; badge.style.cssText = 'margin-left:auto;padding:6px 12px;border-radius:999px;background:#eef5e8;color:#52645c;font-size:12px;'; header.appendChild(badge); }
    }
    if (badge) badge.textContent = ownerProfile.displayName || 'オーナー';
  } catch (error) { /* オーナー表示は任意情報 */ }
}
function setupIntegrations() {
  const settingsView = $('#settings-view');
  settingsView.querySelector('.settings-list').innerHTML = `<div class="setting-row"><div class="setting-icon">●</div><div><strong>オーナー設定</strong><span>アプリ上で表示する名前、連絡先、役割、タイムゾーン</span></div><span class="connected" id="owner-state">${ownerProfile.displayName || '未設定'}</span><button class="outline-button small" id="owner-edit">編集</button></div><div class="setting-row"><div class="setting-icon">▶</div><div><strong>YouTube API</strong><span>${integrationConfig.youtubeClientId ? `Client ID: ${integrationConfig.youtubeClientId.slice(0, 18)}... / ${youtubeConfigured ? 'OAuth設定済み' : 'Client Secret未設定'}` : 'Client ID未設定。サーバーの.envまたは環境変数を確認してください。'}<br>Redirect URI: ${youtubeRedirectUri || `${window.location.origin}/`}</span></div><span class="connected" id="youtube-state">${youtubeConfigured ? '設定済み' : integrationConfig.youtubeClientId ? 'Client Secret未設定' : '未設定'}</span><button class="outline-button small" id="youtube-connect" ${integrationConfig.youtubeClientId ? '' : 'disabled'}>YouTubeで接続</button><button class="outline-button small" id="youtube-sync">実績同期</button></div><div class="setting-row"><div class="setting-icon voice">◉</div><div><strong>Irodori TTS</strong><span>接続先: ${integrationConfig.irodoriBaseUrl}</span></div><span class="connected" id="irodori-state">未確認</span><button class="outline-button small" id="irodori-check">疎通確認</button></div><div class="setting-row"><div class="setting-icon">✦</div><div><strong>Gemini 生成AI</strong><span>モデル: ${geminiModel || '未設定'} / APIキーはサーバー側でのみ使用</span></div><span class="connected" id="gemini-state">${geminiConfigured ? '設定済み' : '未設定'}</span><button class="outline-button small" id="gemini-check">接続確認</button></div><div class="setting-row"><div class="setting-icon">⚡</div><div><strong>Groq 代替生成AI</strong><span>モデル: ${groqModel || '未設定'} / Gemini制限時に自動切替</span></div><span class="connected" id="groq-state">${groqConfigured ? '設定済み' : '未設定'}</span><button class="outline-button small" id="groq-check">接続確認</button></div><div class="setting-row"><div class="setting-icon">▦</div><div><strong>Notion DB</strong><span>企画・素材・承認・生成ジョブの正本データベース</span></div><span class="connected" id="notion-state">${notionConfigured ? '設定済み' : '未設定'}</span><button class="outline-button small" id="notion-check">接続確認</button></div><div class="setting-row"><div class="setting-icon">◌</div><div><strong>Discord通知</strong><span>提出・素材リクエストをDiscordへ通知</span></div><span class="connected" id="discord-state">未確認</span><button class="outline-button small" id="discord-check">接続確認</button></div><div class="setting-row"><div class="setting-icon">✉</div><div><strong>提出通知</strong><span>動画・サムネイル・概要欄の確認依頼</span></div><span class="connected">オン</span><button class="outline-button small" id="notification-settings" data-action="notification-settings">設定</button></div>`;
  $('#owner-edit').addEventListener('click', async () => {
    const displayName = window.prompt('表示名', ownerProfile.displayName || 'オーナー');
    if (displayName === null) return;
    const email = window.prompt('メールアドレス（任意）', ownerProfile.email || '') ?? ownerProfile.email;
    const discord = window.prompt('Discordユーザー名または通知先（任意）', ownerProfile.discord || '') ?? ownerProfile.discord;
    const role = window.prompt('役割', ownerProfile.role || 'チャンネル運営者') ?? ownerProfile.role;
    const response = await fetch('/api/owner', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName, email, discord, role }) });
    if (!response.ok) return showToast('オーナー設定を保存できません', 'サーバーの状態を確認してください。');
    ownerProfile = await response.json();
    $('#owner-state').textContent = ownerProfile.displayName;
    applyOwnerDisplayName();
    showToast('オーナー設定を保存しました', `${ownerProfile.displayName}として表示します。`);
  });
  $('#youtube-connect').addEventListener('click', async () => {
    const response = await fetch('/api/youtube/auth');
    const result = await response.json();
    if (!response.ok) return showToast('YouTube認証を開始できません', result.message || 'サーバー設定を確認してください。');
    window.open(result.authorizationUrl, '_blank', 'popup,width=520,height=720');
    $('#youtube-state').textContent = '認証画面を開きました';
    showToast('YouTube認証を開始しました', '認証完了後、この画面へ戻ってください。');
  });
  $('#youtube-sync').addEventListener('click', async () => {
    const response = await fetch('/api/youtube/sync', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) return showToast('実績同期に失敗しました', result.message || result.error || 'YouTube接続を確認してください。');
    showToast('YouTube実績を同期しました', `${result.title || 'チャンネル'}の直近28日間を戦略へ反映しました。`);
  });
  $('#irodori-check').addEventListener('click', async () => {
    const state = $('#irodori-state');
    state.textContent = '確認中';
    try {
      const response = await fetch('/api/irodori/health', { signal: AbortSignal.timeout(4000) });
      const result = await response.json();
      if (result.online) {
        state.textContent = '起動中';
        showToast('Irodori TTSを検出しました', `${result.url} に接続できました。`);
        return;
      }
      try {
        await fetch(integrationConfig.irodoriBaseUrl, { mode: 'no-cors', signal: AbortSignal.timeout(4000) });
        state.textContent = 'ブラウザ接続';
        showToast('Irodori TTSを検出しました', 'Storylineサーバーからは届きませんが、ブラウザから接続できました。');
        return;
      } catch (browserError) { throw new Error(`${result.url}: ${result.message || 'server and browser connection failed'}`); }
    } catch (error) {
      state.textContent = '未起動';
      showToast('Irodori TTSに接続できません', `${integrationConfig.irodoriBaseUrl} にブラウザからも到達できません。IrodoriのURL、待受先、Firewallを確認してください。`);
    }
  });
  $('#groq-check')?.addEventListener('click', async () => { const state = $('#groq-state'); state.textContent = '確認中'; try { const result = await apiJson('/api/groq/health'); state.textContent = result.online ? '接続成功' : result.configured ? '接続失敗' : '未設定'; showToast(result.online ? 'Groq APIに接続しました' : 'Groq APIを確認できません', result.message || `${result.model || ''}`); } catch (error) { state.textContent = '確認失敗'; showToast('Groq APIを確認できません', error.message); } });
  $('#discord-check')?.addEventListener('click', async () => { const state = $('#discord-state'); state.textContent = '確認中'; try { const result = await apiJson('/api/discord/health'); state.textContent = result.online ? '設定済み' : '未設定'; showToast(result.online ? 'Discord接続を確認しました' : 'Discordは未設定です', result.message); } catch (error) { state.textContent = '確認失敗'; showToast('Discord接続を確認できません', error.message); } });
  $('#gemini-check').addEventListener('click', async () => {
    const state = $('#gemini-state');
    state.textContent = '確認中';
    try {
      const response = await fetch('/api/gemini/health', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.online) throw new Error(result.message || 'Gemini APIに接続できません。');
      state.textContent = '接続成功';
      showToast('Gemini APIに接続しました', `${result.model}から応答を受信しました。`);
    } catch (error) {
      state.textContent = geminiConfigured ? '接続失敗' : '未設定';
      showToast('Gemini APIに接続できません', error.message || 'サーバーの.env設定を確認してください。');
    }
  });
  // Irodori synthesis is an internal automatic production step, not a user workflow step.
  $$('button').filter(button => /Irodori.*音声合成|音声合成.*Irodori/.test(button.textContent || '')).forEach(button => {
    button.hidden = true;
    button.disabled = true;
  });
}
function handleYoutubeCallback() {
  if (!window.location.hash.includes('access_token=')) return;
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  showToast('YouTube認証が完了しました', 'このブラウザセッションでYouTubeへの接続を確認しました。');
}

function renderOperationsSelectors() {
  const channelSelect = $('#rules-channel-select');
  const projectSelect = $('#feedback-project');
  if (channelSelect) channelSelect.innerHTML = '<option value="">チャンネルを選択</option>' + serverChannels.map(channel => `<option value="${channel.name}">${channel.name}</option>`).join('');
  if (projectSelect) projectSelect.innerHTML = '<option value="">企画を選択</option>' + pipelineItems.filter(project => project.id).map(project => `<option value="${project.id}">${project.title} / ${project.channel}</option>`).join('');
}
async function loadAssetRules(channel) {
  if (!channel) return;
  const target = $('#asset-rules-content');
  try {
    const response = await fetch(`/api/assets/rules?channel=${encodeURIComponent(channel)}`);
    const rules = await response.json();
    if (!response.ok) throw new Error(rules.error || 'rules unavailable');
    target.innerHTML = `<p>${rules.naming}</p>${rules.folders.map(rule => `<div class="rule-row"><strong>${rule.category}</strong><span>${rule.folder}</span><code>${rule.pattern}</code></div>`).join('')}`;
  } catch (error) { target.textContent = '素材ルールを取得できません。サーバーの状態を確認してください。'; }
}
async function hydrateNotifications() {
  try {
    const response = await fetch('/api/notifications');
    if (!response.ok) return;
    const previousIds = new Set(serverNotifications.map(item => item.id));
    serverNotifications = await response.json();
    const unread = serverNotifications.filter(item => !item.read);
    $('#notification-dot')?.classList.toggle('active', unread.length > 0);
    for (const notification of unread.filter(item => !previousIds.has(item.id))) {
      const heading = notification.type === 'material-request' ? '素材追加が必要です' : notification.type === 'review-required' ? '最終確認が必要です' : 'STORYLINE通知';
      showToast(heading, notification.message || notification.title);
      if ('Notification' in window && Notification.permission === 'granted') new Notification(heading, { body: notification.message || notification.title });
    }
  } catch (error) { /* 通知はアプリ本体を停止させない */ }
}
async function hydrateMaterialRequests() {
  const target = $('#material-request-list');
  if (!target) return;
  const requestPanel = target.closest('.panel, section, article');
  if (requestPanel) requestPanel.style.display = '';
  const requestDetail = $('#request-detail');
  if (requestDetail) requestDetail.style.display = '';
  try {
    const response = await fetch('/api/material-requests');
    const requests = await response.json();
    const groups = Object.values(requests.reduce((map, item) => { const key = item.projectId || item.id; (map[key] ||= []).push(item); return map; }, {}));
    target.innerHTML = groups.length ? groups.map(group => { const first = group[0]; const pending = group.filter(item => item.status === 'pending'); return `<article class="material-request-group panel"><div><p class="eyebrow">企画単位の素材提案 / ${pending.length}件が承認待ち</p><h2>${first.title.replace(/ に必要な.*$/, '')}</h2><p>この企画に必要な素材をまとめて確認してください。承認した素材だけを追加し、却下した素材は追加しません。</p>${group.map(item => `<div class="material-request" style="margin:10px 0;padding:10px;border:1px solid #e3eadf;border-radius:10px"><strong>${item.category}：${item.usageContext || item.rationale}</strong><br><small>使用場面: ${item.sceneDescription || '台本全体'}<br>保存先: ${item.folder}<br>ファイル名: ${item.naming}</small><div class="request-actions">${item.status === 'pending' ? `<button class="new-project request-decision" data-request-id="${item.id}" data-status="approved">この素材を承認</button><button class="outline-button request-decision" data-request-id="${item.id}" data-status="rejected">この素材を却下</button>` : `<span class="connected">${item.status === 'approved' ? '承認済み。素材を追加してください。' : '却下済み'}</span>`}</div></div>`).join('')}</div></article>`; }).join('') : '<div class="panel empty-state">現在、承認待ちの素材提案はありません。</div>';
    
    if (requests.length > 0 && requests.every(r => r.status === 'approved')) {
      target.innerHTML += `<div class="panel empty-state" style="margin-top: 10px; background: #eef5d3; border-color: #dce8b6; color: #52645c;">すべての素材が承認されました。素材がアップロードされると、自動で制作が再開されます。</div>`;
    }
  } catch (error) { target.textContent = '素材提案を取得できません。'; }
}
async function decideMaterialRequest(button) {
  const response = await fetch(`/api/material-requests/${button.dataset.requestId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: button.dataset.status }) });
  if (!response.ok) return showToast('素材提案を更新できません', 'サーバーの状態を確認してください。');
  await hydrateMaterialRequests();
  showToast(button.dataset.status === 'approved' ? '素材提案を承認しました' : '素材提案を却下しました', button.dataset.status === 'approved' ? '素材ライブラリへ追加してください。追加後に自動生成を再試行します。' : 'この素材は制作に使用しません。');
}
async function openNotifications() {
  await hydrateNotifications();
  const unread = serverNotifications.filter(item => !item.read);
  if (!unread.length) return showToast('未処理の審査通知はありません', '動画はすべて確認済みです。');
  showToast(`${unread.length}件の最終審査があります`, unread.map(item => item.title).slice(0, 2).join(' / '));
  await fetch('/api/notifications/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
  $('#notification-dot')?.classList.remove('active');
}

document.addEventListener('click', async event => {
  const button = event.target.closest('.delete-channel');
  if (!button) return;
  event.stopPropagation();
  const name = button.dataset.channelName;
  if (!confirm(`チャンネル「${name}」と関連するデータをすべて削除しますか？`)) return;
  const response = await fetch(`/api/channels/${encodeURIComponent(name)}`, { method: 'DELETE' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return showToast('チャンネルを削除できません', result.message || 'サーバーの状態を確認してください。');
  await hydrateChannels();
  await hydrateDashboard();
  showToast('チャンネルを削除しました', `${result.deletedProjects || 0}件の企画、${result.deletedAssets || 0}件の素材も削除しました。`);
});

document.addEventListener('click', event => {
  const close = event.target.closest('[data-close-dialog]'); if (close) { document.getElementById(close.dataset.closeDialog)?.close?.(); return; }
  const refresh = event.target.closest('[data-action="refresh-dashboard"]'); if (refresh) { hydrateDashboard(); return; }
  const refreshStrategy = event.target.closest('[data-action="refresh-strategy"]'); if (refreshStrategy) { hydrateStrategies(); return; }
  const channelCard = event.target.closest('[data-channel-name]'); if (channelCard) { openChannelDetail(channelCard.dataset.channelName); return; }
  const automation = event.target.closest('[data-action="run-automation"], #automation-run, #autopilot-run, [data-view="automation"]'); if (automation) { event.preventDefault(); runAutomationNow(); return; }
  const help = event.target.closest('[data-action="help"], #help-button, #help, [aria-label*="ヘルプ"], [title*="ヘルプ"]') || (event.target.closest('button') && /ヘルプ/.test(event.target.closest('button').textContent || '') ? event.target.closest('button') : null); if (help) { event.preventDefault(); showHelp(); return; }
  const clover = event.target.closest('[data-action="clover"], #clover-button, #clover, [aria-label*="クローバー"], [title*="クローバー"]') || (event.target.closest('button') && /クローバー/.test(event.target.closest('button').textContent || '') ? event.target.closest('button') : null); if (clover) { event.preventDefault(); showHelp(); return; }
  const settings = event.target.closest('#notification-settings, [data-action="notification-settings"]'); if (settings) { event.preventDefault(); openNotificationSettings(); return; }
});

$$('.nav-item, .settings-link, [data-view]').forEach(button => button.addEventListener('click', () => { if (button.dataset.view) switchView(button.dataset.view); }));
document.addEventListener('click', async event => {
  const inspect = event.target.closest('.asset-inspect');
  const rename = event.target.closest('.asset-rename');
  const remove = event.target.closest('.asset-delete');
  if (!inspect && !rename && !remove) return;
  if (inspect) { const response = await fetch(`/api/assets/${inspect.dataset.assetId}/inspect`, { method: 'POST' }); const result = await response.json().catch(() => ({})); if (!response.ok) return showToast('画像検査に失敗しました', result.message || 'Groq Visionの設定を確認してください。'); const index = serverAssets.findIndex(item => item.id === result.id); if (index >= 0) serverAssets[index] = result; renderAssets(); return showToast('画像内容を検査しました', result.contentSummary || '検査結果を素材台帳へ保存しました。'); }
  event.preventDefault();
  const asset = serverAssets.find(item => item.id === (rename || remove).dataset.assetId);
  if (!asset) return;
  if (rename) {
    const nextName = window.prompt('素材の表示名を入力してください（実ファイル名は変更しません）', asset.name);
    if (!nextName || nextName.trim() === asset.name) return;
    const response = await fetch(`/api/assets/${asset.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: nextName.trim() }) });
    if (!response.ok) return showToast('素材名を変更できません', 'サーバーの状態を確認してください。');
    asset.name = nextName.trim();
    renderAssets();
    return showToast('素材名を変更しました', '表示名だけを更新しました。');
  }
  if (!window.confirm(`「${asset.name}」を素材ライブラリから削除しますか？`)) return;
  const response = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
  const result = response ? await response.json().catch(() => ({})) : { deleted: localIds.length };
  if (response && !response.ok) return showToast('素材を削除できません', result.message || '制作中の企画で使用中かもしれません。');
  serverAssets = serverAssets.filter(item => item.id !== asset.id);
  renderAssets();
  showToast('素材を削除しました', asset.name);
});
['#new-project', '#pipeline-new'].forEach(selector => { const button = $(selector); if (button) { button.textContent = '新しいチャンネル'; button.title = '新しいチャンネルを設定'; button.addEventListener('click', openChannelModal); } }); $('#modal-close').addEventListener('click', closeModal); $('#modal').addEventListener('click', (event) => { if (event.target.id === 'modal') closeModal(); });
$('#create-project').addEventListener('click', async () => { const channel = $('#project-channel').value; const purpose = $('#project-purpose').value.trim(); if (!purpose) { $('#project-purpose').focus(); showToast('趣旨を入力してください', '自動で台本を作るため、チャンネルのテーマが必要です。'); return; } try { const response = await fetch('/api/automation/create-project', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, purpose, tone: $('#project-tone').value, duration: $('#project-duration').value }) }); const result = await response.json(); if (!response.ok) throw new Error(result.message || 'create failed'); const project = result; pipelineItems.unshift({ ...project, stageClass: '' }); renderPipeline(); closeModal(); showToast(project.aiGenerated ? 'AIが企画と台本を生成しました' : '企画と台本を生成しました', project.aiGenerated ? 'AI戦略と過去実績を参照しています。素材を選ぶと動画生成へ進めます。' : '生成AI未設定のためテンプレートを使用しました。'); $('#project-purpose').value = ''; switchView('pipeline'); } catch (error) { showToast('自動生成できませんでした', error.message || 'StorylineサーバーとAI APIの設定を確認してください。'); } });
$('#asset-upload').addEventListener('change', event => uploadAssetFiles([...event.target.files], $('#asset-category-select').value).catch(() => showToast('素材を追加できません', 'ファイル形式とサーバーの状態を確認してください。')));
$('#asset-folder-upload').addEventListener('change', event => uploadAssetFiles([...event.target.files], $('#asset-category-select').value).catch(() => showToast('フォルダを同期できません', '選択したカテゴリのファイル形式とサーバーの状態を確認してください。')));
$('#asset-filters').addEventListener('click', event => { const filter = event.target.closest('.filter'); if (!filter) return; activeAssetCategory = filter.dataset.category; $$('.filter').forEach(item => item.classList.toggle('active', item === filter)); renderAssets(); });
$$('[data-review]').forEach(button => button.addEventListener('click', () => showToast('最終確認を開きます', `${button.dataset.review} の提出物を準備しています。`)));
$('#request-detail').addEventListener('click', () => { switchView('assets'); showToast('素材リクエスト', 'キャラボイスの追加を待っています。'); }); $('#add-channel').addEventListener('click', openChannelModal); $$('.filter').forEach(filter => filter.addEventListener('click', () => { $$('.filter').forEach(item => item.classList.remove('active')); filter.classList.add('active'); }));
$('#channel-close').addEventListener('click', closeChannelModal);
$('#channel-modal').addEventListener('click', event => { if (event.target.id === 'channel-modal') closeChannelModal(); });
$('#notification-button')?.addEventListener('click', openNotifications);
$('#notion-check')?.addEventListener('click', async () => { const response = await fetch('/api/notion/health', { cache: 'no-store' }); const result = await response.json().catch(() => ({})); const state = $('#notion-state'); if (state) state.textContent = result.online ? '接続済み' : result.configured ? '認証エラー' : '未設定'; showToast(result.online ? 'Notionに接続しました' : 'Notionを確認できません', result.message || 'Notion Integrationの共有設定と環境変数を確認してください。'); });
$('#material-request-list')?.addEventListener('click', event => { const button = event.target.closest('.request-decision'); if (button) decideMaterialRequest(button); });
$('#rules-channel-select')?.addEventListener('change', event => loadAssetRules(event.target.value));
$('#save-feedback')?.addEventListener('click', async () => {
  const project = pipelineItems.find(item => item.id === $('#feedback-project').value);
  if (!project) return showToast('企画を選択してください', '公開後の実績を紐づける企画が必要です。');
  try {
    const response = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, channel: project.channel, views: $('#feedback-views').value, retention: $('#feedback-retention').value, ctr: $('#feedback-ctr').value, note: $('#feedback-note').value }) });
    if (!response.ok) throw new Error('feedback save failed');
    const result = await response.json();
    showToast('戦略を更新しました', result.strategy?.direction || '次回企画へ反映します。');
  } catch (error) { showToast('実績を保存できません', '入力値とサーバーの状態を確認してください。'); }
});
$('#save-channel').addEventListener('click', async () => {
  const name = $('#channel-name').value.trim();
  const purpose = $('#channel-purpose').value.trim();
  if (!name || !purpose) return showToast('設定が不足しています', 'チャンネル名と趣旨を入力してください。');
  try {
    const response = await fetch('/api/channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, purpose, audience: $('#channel-audience').value.trim(), tone: $('#channel-tone').value, cadence: $('#channel-cadence').value, duration: $('#channel-duration').value }) });
    if (!response.ok) throw new Error('channel save failed');
    serverChannels = [await response.json(), ...serverChannels.filter(channel => channel.name !== name)];
    renderChannels();
    renderOperationsSelectors();
    const runResponse = await fetch('/api/automation/run', { method: 'POST' });
    const runResult = await runResponse.json();
    closeChannelModal();
    showToast('自動運転を開始しました', `${runResult.created?.length || 0}件の企画を制作キューに追加しました。`);
    await hydrateProjects();
  } catch (error) {
    showToast('チャンネル設定を保存できません', 'Storylineサーバーの状態を確認してください。');
  }
});
$('#production-close').addEventListener('click', closeProduction);
$('#production-modal').addEventListener('click', event => { if (event.target.id === 'production-modal') closeProduction(); });
$('#save-production').addEventListener('click', () => saveProduction().catch(() => showToast('保存できませんでした', 'サーバーの状態を確認してください。')));
$('#render-video').addEventListener('click', () => renderProjectVideo());

$('#approve-review').addEventListener('click', () => {
    if (confirm('YouTubeへ投稿しますか？')) {
        submitReviewDecision('approve');
    }
});
$('#revise-review').addEventListener('click', () => {
    $('#feedback-modal').classList.add('open');
    $('#revision-feedback').value = '';
    setTimeout(() => $('#revision-feedback').focus(), 50);
});
$('#feedback-close').addEventListener('click', () => {
    $('#feedback-modal').classList.remove('open');
});
$('#submit-revision').addEventListener('click', () => {
    const note = $('#revision-feedback').value.trim();
    if (!note) return showToast('修正内容を入力してください', '修正してほしい点を入力してください。');
    submitReviewDecision('revise', note);
    $('#feedback-modal').classList.remove('open');
});

document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-project-id]');
  if (!trigger?.dataset.projectId) return;
  if (event.target.closest('.pipeline-select')) return;
  const project = pipelineItems.find(item => item.id === trigger.dataset.projectId);
  if (project) openProduction(project);
});
document.addEventListener('change', event => {
  if (event.target.id === 'select-all-projects') $$('.pipeline-select').forEach(input => { input.checked = event.target.checked; });
});
document.addEventListener('click', async event => {
  const button = event.target.closest('#delete-selected-projects, #delete-obsolete-projects');
  if (!button) return;
  const scope = button.id === 'delete-obsolete-projects' ? 'non-active' : null;
  const selectedIds = scope ? [] : $$('.pipeline-select:checked').map(input => input.dataset.projectId); const localIds = selectedIds.filter(id => id.startsWith('local-')); const ids = selectedIds.filter(id => !id.startsWith('local-'));
  if (!scope && !selectedIds.length) return showToast('削除する企画を選択してください', 'パイプライン左側のチェックボックスを使ってください。');
  const message = scope ? 'ボツ・未完了の企画をまとめて削除しますか？最終確認・投稿済みは残ります。' : `${ids.length}件の企画と生成動画を削除しますか？`;
  if (!window.confirm(message)) return;
  if (localIds.length) { const localIndexes = new Set(localIds.map(id => Number(id.slice(6))).filter(Number.isInteger)); for (let index = pipelineItems.length - 1; index >= 0; index -= 1) if (localIndexes.has(index)) pipelineItems.splice(index, 1); renderPipeline(); }
  const response = ids.length || scope ? await fetch('/api/projects/bulk-delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(scope ? { scope } : { ids }) }) : null;
  const result = response ? await response.json().catch(() => ({})) : { deleted: localIds.length };
  if (response && !response.ok) return showToast('一括削除できません', result.message || 'サーバーの状態を確認してください。');
  await hydrateProjects(); await hydrateAutomationActivity(); await hydrateDashboard(); await hydrateNotifications();
  showToast('企画を削除しました', `${result.deleted || 0}件を削除しました。`);
});

document.addEventListener('click', event => {
    if (event.target.classList.contains('review-tab')) {
        $$('.review-tab').forEach(t => t.classList.toggle('active', t === event.target));
        $$('.review-tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + event.target.dataset.tab));
    }
});

handleYoutubeCallback(); ensureStrategyTab(); renderPipeline(); renderAssets(); renderChannels(); renderOperationsSelectors(); hydrateProjects().then(() => { renderOperationsSelectors(); hydrateDashboard(); hydrateStrategies(); hydrateGrowth(); }); hydrateAssets(); hydrateChannels(); hydrateNotifications(); hydrateOwner().then(() => hydrateIntegrationConfig().then(setupIntegrations)); hydrateAutomationActivity(); hydrateMaterialRequests(); hydrateDashboard(); hydrateStrategies();
setInterval(() => hydrateProjects().then(() => { renderOperationsSelectors(); hydrateDashboard(); }), 10000);
setInterval(hydrateAutomationActivity, 10000);
setInterval(hydrateNotifications, 30000);
setInterval(() => { hydrateMaterialRequests(); hydrateDashboard(); hydrateStrategies(); hydrateGrowth(); }, 30000);
