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

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
function renderPipeline() {
  $('#pipeline-list').innerHTML = pipelineItems.map((item, index) => `<button class="pipeline-row pipeline-row-button" data-project-id="${item.id || ''}"><span class="pipeline-number">0${index + 1}</span><div class="pipeline-copy"><strong>${item.title}</strong><span>${item.channel}</span><div class="progress-track"><div class="progress-bar" style="width:${item.progress}%"></div></div></div><span class="pipeline-stage ${item.stageClass}">${item.stage}</span></button>`).join('');
  $('#kanban').innerHTML = [['企画・構成', pipelineItems.slice(1, 2)], ['素材準備', pipelineItems.slice(2, 3)], ['編集中', pipelineItems.slice(1, 2)], ['最終確認', pipelineItems.slice(0, 1)]].map(([name, items]) => `<div class="kanban-column"><div class="kanban-head"><strong>${name}</strong><span>0${items.length}</span></div>${items.map(item => `<button class="kanban-card kanban-card-button" data-project-id="${item.id || ''}"><strong>${item.title}</strong><small>${item.channel}</small><div class="card-foot"><span>${item.stage}</span><span class="mini-avatar">Y</span></div></button>`).join('')}</div>`).join('');
}
function renderAssets() {
  const customAssets = JSON.parse(localStorage.getItem('storyline-assets') || '[]');
  const visibleAssets = activeAssetCategory === 'all' ? serverAssets : serverAssets.filter(asset => asset.category === activeAssetCategory);
  const persistedAssets = visibleAssets.map(asset => [asset.name, asset.mimeType.startsWith('audio') ? 'audio' : asset.mimeType.startsWith('video') ? 'sound' : 'character', asset.category || 'サーバー保存済み', asset.channel || '共通素材']);
  const allAssets = [...persistedAssets, ...customAssets];
  $('#asset-count').textContent = activeAssetCategory === 'all' ? serverAssets.length : visibleAssets.length;
  $('#asset-grid').innerHTML = allAssets.map(([name, type, label, channel = 'デモ素材']) => `<article class="asset-card"><div class="asset-preview ${type}"><span class="asset-type">${label}</span>${type === 'audio' || type === 'sound' ? '● )))' : 'VISUAL ASSET'}</div><div class="asset-card-body"><strong>${name}</strong><small>${channel} / 使用可能</small></div></article>`).join('');
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
  $('#channel-grid').innerHTML = visibleChannels.map((channel, index) => `<article class="channel-card"><div class="channel-banner ${channel.banner}"><div class="channel-symbol">${index === 0 ? '夜' : index === 1 ? '発' : '+'}</div></div><div class="channel-card-body"><h2>${channel.name}</h2><span class="channel-handle">${channel.handle}</span><p class="heading-note" style="margin-top:13px;line-height:1.6">${channel.desc}</p><div class="channel-stats"><div><strong>${channel.subscribers}</strong><small>登録者</small></div><div><strong>${channel.videos}</strong><small>状態</small></div></div></div><div class="channel-card-footer"><span>${configured.length ? '戦略・制作を自動運転中' : '設定を始める'}</span><span>→</span></div></article>`).join('');
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
function switchView(view) { $$('.view').forEach(section => section.classList.toggle('active', section.id === `${view}-view`)); $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view)); const active = $(`.nav-item[data-view="${view}"]`); $('#page-name').textContent = active ? active.textContent.trim() : view === 'settings' ? '設定・連携' : view; }
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
  const sameChannel = asset => asset.channel === project.channel || asset.channel === '共通素材';
  const imageOptions = serverAssets.filter(asset => sameChannel(asset) && ['character', 'background', 'object'].includes(asset.category) && ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType));
  const audioOptions = serverAssets.filter(asset => sameChannel(asset) && ['voice', 'sfx'].includes(asset.category) && asset.mimeType.startsWith('audio/'));
  $('#production-image').innerHTML = '<option value="">自動選択（背景とキャラを別々に使用）</option>' + imageOptions.map(asset => `<option value="${asset.id}">${asset.category} / ${asset.name}</option>`).join('');
  $('#production-audio').innerHTML = '<option value="">チャンネルのIrodori音声を自動選択</option>' + audioOptions.map(asset => `<option value="${asset.id}">${asset.category} / ${asset.name}</option>`).join('');
  $('#production-image').value = project.imageAssetId || '';
  $('#production-audio').value = project.audioAssetId || '';
  $('#production-modal').classList.add('open');
  const actions = document.querySelector('.production-actions');
  if (actions && !$('#approve-review')) actions.insertAdjacentHTML('beforeend', '<button class="outline-button" id="generate-irodori">Irodoriで音声生成</button><button class="new-project" id="approve-review">承認してYouTubeへ非公開投稿</button><button class="outline-button" id="revise-review">修正を依頼</button>');
  $('#generate-irodori')?.addEventListener('click', async () => {
    const response = await fetch('/api/irodori/synthesize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: $('#production-script').value, channel: activeProject.channel }) });
    const result = await response.json();
    if (!response.ok) return showToast('Irodori音声を生成できません', result.message || result.error || 'IRODORI_API_NAMEを確認してください。');
    serverAssets.unshift(result);
    activeProject.audioAssetId = result.id;
    showToast('Irodori音声を追加しました', 'この企画の音声として保存しました。');
  });
  $('#approve-review')?.addEventListener('click', () => submitReviewDecision('approve'));
  $('#revise-review')?.addEventListener('click', () => submitReviewDecision('revise'));
}
async function submitReviewDecision(decision) {
  if (!activeProject?.id) return;
  const note = decision === 'revise' ? window.prompt('修正内容を入力してください') : '';
  if (decision === 'revise' && note === null) return;
  const response = await fetch(`/api/projects/${activeProject.id}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, note }) });
  const result = await response.json();
  if (!response.ok) return showToast('審査処理に失敗しました', result.message || result.error || 'サーバーの状態を確認してください。');
  if (decision === 'approve') showToast('承認しました', 'YouTubeへ非公開で投稿しました。');
  else showToast('修正依頼を保存しました', '次回生成時に修正内容を反映します。');
  closeProduction();
}
function closeProduction() { $('#production-modal').classList.remove('open'); activeProject = null; }
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
async function renderProjectVideo() {
  if (!activeProject?.id) return showToast('先に企画を保存してください', 'サーバー保存済みの企画を選択してください。');
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
      $('#render-result').innerHTML = `<a href="${result.url}" target="_blank" rel="noreferrer">生成した動画を確認する →</a>`;
      showToast('動画を生成しました', '生成結果を確認してから最終確認へ送ってください。');
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
      $('#render-result').innerHTML = `<a href="${job.video.url}" target="_blank" rel="noreferrer">生成した動画を確認する →</a>`;
      showToast('動画を生成しました', '生成結果を確認してから最終確認へ送ってください。');
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
function setupIntegrations() {
  const settingsView = $('#settings-view');
  settingsView.querySelector('.settings-list').innerHTML = `<div class="setting-row"><div class="setting-icon">▶</div><div><strong>YouTube API</strong><span>${integrationConfig.youtubeClientId ? `Client ID: ${integrationConfig.youtubeClientId.slice(0, 18)}... / ${youtubeConfigured ? 'OAuth設定済み' : 'Client Secret未設定'}` : 'Client ID未設定。サーバーの.envまたは環境変数を確認してください。'}<br>Redirect URI: ${youtubeRedirectUri || `${window.location.origin}/`}</span></div><span class="connected" id="youtube-state">${youtubeConfigured ? '設定済み' : integrationConfig.youtubeClientId ? 'Client Secret未設定' : '未設定'}</span><button class="outline-button small" id="youtube-connect" ${integrationConfig.youtubeClientId ? '' : 'disabled'}>YouTubeで接続</button><button class="outline-button small" id="youtube-sync">実績同期</button></div><div class="setting-row"><div class="setting-icon voice">◉</div><div><strong>Irodori TTS</strong><span>接続先: ${integrationConfig.irodoriBaseUrl}</span></div><span class="connected" id="irodori-state">未確認</span><button class="outline-button small" id="irodori-check">疎通確認</button></div><div class="setting-row"><div class="setting-icon">✉</div><div><strong>提出通知</strong><span>動画・サムネイル・概要欄の確認依頼</span></div><span class="connected">オン</span><button class="outline-button small">設定</button></div>`;
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
      showToast('最終審査が必要です', notification.title);
      if ('Notification' in window && Notification.permission === 'granted') new Notification('STORYLINE 最終審査', { body: notification.title });
    }
  } catch (error) { /* 通知はアプリ本体を停止させない */ }
}
async function hydrateMaterialRequests() {
  const target = $('#material-request-list');
  if (!target) return;
  try {
    const response = await fetch('/api/material-requests');
    const requests = await response.json();
    target.innerHTML = requests.length ? requests.map(item => `<article class="material-request panel"><div><p class="eyebrow">${item.status.toUpperCase()}</p><h2>${item.title}</h2><p>${item.rationale}</p><small>保存先: ${item.folder}<br>ファイル名: ${item.naming}</small></div><div class="request-actions">${item.status === 'pending' ? `<button class="new-project request-decision" data-request-id="${item.id}" data-status="approved">承認する</button><button class="outline-button request-decision" data-request-id="${item.id}" data-status="rejected">却下</button>` : `<span class="connected">${item.status === 'approved' ? '承認済み。素材をアップロードしてください。' : '却下済み'}</span>`}</div></article>`).join('') : '<div class="panel empty-state">現在、承認待ちの素材提案はありません。</div>';
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
$$('.nav-item, .settings-link, [data-view]').forEach(button => button.addEventListener('click', () => { if (button.dataset.view) switchView(button.dataset.view); }));
$('#new-project').addEventListener('click', openModal); $('#pipeline-new').addEventListener('click', openModal); $('#modal-close').addEventListener('click', closeModal); $('#modal').addEventListener('click', (event) => { if (event.target.id === 'modal') closeModal(); });
$('#create-project').addEventListener('click', async () => { const channel = $('#project-channel').value; const purpose = $('#project-purpose').value.trim(); if (!purpose) { $('#project-purpose').focus(); showToast('趣旨を入力してください', '自動で台本を作るため、チャンネルのテーマが必要です。'); return; } try { const response = await fetch('/api/automation/create-project', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, purpose, tone: $('#project-tone').value, duration: $('#project-duration').value }) }); if (!response.ok) throw new Error('create failed'); const project = await response.json(); pipelineItems.unshift({ ...project, stageClass: '' }); renderPipeline(); closeModal(); showToast('企画と台本を自動生成しました', '素材を選ぶと動画生成へ進めます。'); $('#project-purpose').value = ''; switchView('pipeline'); } catch (error) { showToast('自動生成できませんでした', 'Storylineサーバーの状態を確認してください。'); } });
$('#asset-upload').addEventListener('change', event => uploadAssetFiles([...event.target.files], $('#asset-category-select').value).catch(() => showToast('素材を追加できません', 'ファイル形式とサーバーの状態を確認してください。')));
$('#asset-folder-upload').addEventListener('change', event => uploadAssetFiles([...event.target.files], $('#asset-category-select').value).catch(() => showToast('フォルダを同期できません', '選択したカテゴリのファイル形式とサーバーの状態を確認してください。')));
$('#asset-filters').addEventListener('click', event => { const filter = event.target.closest('.filter'); if (!filter) return; activeAssetCategory = filter.dataset.category; $$('.filter').forEach(item => item.classList.toggle('active', item === filter)); renderAssets(); });
$$('[data-review]').forEach(button => button.addEventListener('click', () => showToast('最終確認を開きます', `${button.dataset.review} の提出物を準備しています。`)));
$('#request-detail').addEventListener('click', () => { switchView('assets'); showToast('素材リクエスト', 'キャラボイスの追加を待っています。'); }); $('#add-channel').addEventListener('click', openChannelModal); $$('.filter').forEach(filter => filter.addEventListener('click', () => { $$('.filter').forEach(item => item.classList.remove('active')); filter.classList.add('active'); }));
$('#channel-close').addEventListener('click', closeChannelModal);
$('#channel-modal').addEventListener('click', event => { if (event.target.id === 'channel-modal') closeChannelModal(); });
$('#notification-button')?.addEventListener('click', openNotifications);
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
$('#submit-review').addEventListener('click', () => saveProduction('最終確認').then(closeProduction).catch(() => showToast('送信できませんでした', '台本と公開情報を確認してください。')));
document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-project-id]');
  if (!trigger?.dataset.projectId) return;
  const project = pipelineItems.find(item => item.id === trigger.dataset.projectId);
  if (project) openProduction(project);
});
handleYoutubeCallback(); renderPipeline(); renderAssets(); renderChannels(); renderOperationsSelectors(); hydrateProjects().then(renderOperationsSelectors); hydrateAssets(); hydrateChannels(); hydrateNotifications(); hydrateIntegrationConfig().then(setupIntegrations);
  hydrateMaterialRequests();
setInterval(hydrateNotifications, 30000);
