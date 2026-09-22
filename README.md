# STORYLINE / YouTube Studio OS

素材の準備と公開前の最終確認だけを人が担当し、それ以外のチャンネル運営を自動化するための制作管制室です。

## 起動方法

追加パッケージなしで動きます。ワークスペースのルートで次を実行してください。

```bash
npm start
```

ブラウザで `http://localhost:4173` を開きます。

4173番ポートが使用中の場合は、既存のStorylineをそのまま使うか、別ポートで起動します。

```bash
PORT=4174 npm start
```

## 現在使える機能

- 複数チャンネルの状態・登録者数・公開本数の確認
- 企画を制作キューへ追加
- 企画・素材準備・編集中・最終確認のパイプライン表示
- 画像・音声・動画素材の追加とブラウザ内保存
- 素材不足の通知と、素材追加後の制作再開導線
- 長期戦略、成長曲線、次の90日間の優先事項
- YouTube API / Irodori TTS / 提出通知の接続状態を確認する設定画面
- 受け取ったYouTube Client IDによるGoogle認証開始
- `http://localhost:7860` のIrodori TTS疎通確認
- 素材ファイルのサーバー保存（`data/assets`）と再起動後の復元
- アップロード済み画像と音声からのMP4生成
- 企画ごとの背景画像・音声素材の選択
- チャンネルの趣旨・雰囲気・尺からの企画、台本、概要欄、タグの自動生成
- チャンネル設定の一度だけの保存と長期戦略の自動生成
- 自動運転による定期的な次回企画の追加
- 素材が揃った自動企画のMP4自動生成と最終確認送り

## 本番連携について

YouTube認証は設定画面の「YouTubeで接続」から開始できます。Google Cloud Console側で、承認済みのJavaScript生成元とリダイレクトURIに、アプリの起動URL（例: `http://localhost:4173`）を登録してください。Client ID自体は公開情報ですが、アクセストークンはブラウザに永続保存しない構成にしてください。

Irodori TTSは設定画面の「疎通確認」から確認できます。確認はブラウザから直接 `http://localhost:7860` を見に行くため、StorylineをDev Containerで起動していてもWindows側のIrodoriを検出できます。

IrodoriはWindows PowerShellで次のコマンドのまま起動してください。

```powershell
uv run python gradio_app.py --server-name 0.0.0.0 --server-port 7860
```

先にIrodoriを `0.0.0.0` で待ち受けさせ、Storylineを実行している環境からIrodoriのURLへ到達できることを確認してください。StorylineとIrodoriが同じ環境なら `http://localhost:7860`、別のWindowsホストなら `http://host.docker.internal:7860` または到達可能なホストIPを `IRODORI_URL` に設定します。Dev ContainerやCodespacesでは、ブラウザで開ける `localhost` とコンテナ内の `localhost` は別物です。

企画は `data/state.json` に保存されます。「チャンネル」画面でチャンネル名、趣旨、視聴者、世界観、投稿頻度、標準尺を一度だけ入力すると、長期戦略と次の企画を自動生成します。以後はサーバーの自動運転が10分ごとに確認し、未処理の企画がないチャンネルへ次の企画を追加します。素材が足りない案件は素材待ちで停止し、画像・音声が揃った自動企画はカメラ移動を含むMP4を自動生成して最終確認へ送ります。公開前の最終確認は飛び越えません。

「新しい企画」から手動でテーマを指定することもできます。企画タイトル、台本、概要欄、ハッシュタグは自動生成されます。制作データ画面で背景画像と音声素材を選び、「動画を生成」を押すと、PNG・JPEG・WebP画像素材を背景に指定尺のMP4を生成します。音声素材がある場合は音声も合成します。

YouTubeの公開処理とIrodoriの音声生成は、API仕様とOAuth秘密情報を確認してからサーバー側ジョブとして接続します。現在の動画生成は、Irodoriで作成した音声ファイルを素材ライブラリに追加してから実行してください。

## 今すぐ使う手順

1. `npm install` を実行し、`npm start` で起動します。
2. ブラウザで [http://localhost:4173](http://localhost:4173) を開きます。
3. 「チャンネル」から、チャンネル名、目的、視聴者、世界観、投稿頻度、標準尺を一度だけ登録します。保存すると自動運転が有効になります。
4. 「運用データ」の「チャンネル別素材配置」で、表示されたフォルダ構成をPC側に作成します。フォルダ同期を使う場合は、ファイル名に含まれるカテゴリ名から自動判定できます。
5. Irodori TTSで音声を作成し、`04_Irodori音声` に保存してから素材ライブラリへ同期します。現在のIrodoriのAPI仕様が環境ごとに異なるため、音声生成そのものはIrodori側で行い、Storylineは生成済み音声を安全に取り込みます。
6. 画像と音声が揃うと、10分ごとの自動運転で動画を生成し「最終確認」へ送ります。通知ボタン、アプリ内トースト、ブラウザ通知で審査を知らせます。
なお、高品質生成では、対象チャンネルの `background`、`character`、Irodoriで作成した `voice`、`bgm` を必須にしています。キャラクター画像だけでは生成を開始せず、白背景の立ち絵だけの動画を作らないようにしています。生成時は背景をゆっくり動かし、キャラクターを画面上で浮遊させ、Irodori音声とBGMを音量調整して合成します。
7. 動画、概要欄、タグを確認してから「最終確認へ送る」を押してください。自動運転は公開処理を行いません。
8. YouTube公開後は「運用データ」で再生回数、視聴維持率、クリック率、メモを入力します。入力結果からチャンネル戦略と次の実験案を更新します。

## 素材フォルダと命名規則

チャンネルごとに `素材/<チャンネルの英数字slug>/` を作り、次の固定フォルダを使います。ファイル名は「チャンネルslug_種類_内容_v01.拡張子」の形式にし、修正版は上書きせず `v02`、`v03` として追加してください。

| 種類 | フォルダ | 例 |
| --- | --- | --- |
| キャラクター | `01_キャラクター` | `ai_idol_char_ren_v01.png` |
| 背景 | `02_背景` | `ai_idol_bg_studio_v01.jpg` |
| 小物 | `03_小物` | `ai_idol_obj_microphone_v01.png` |
| Irodori音声 | `04_Irodori音声` | `ai_idol_voice_ren_intro_v01.wav` |
| BGM | `05_BGM` | `ai_idol_bgm_lively_v01.mp3` |
| 効果音 | `06_効果音` | `ai_idol_sfx_applause_v01.wav` |
| サムネイル | `07_サムネイル` | `ai_idol_thumb_episode01_v01.jpg` |

日本語名も使用できますが、同じチャンネル内で表記を統一してください。素材の権利、Irodori音声の利用条件、BGMのライセンスは利用者が確認する必要があります。

## 自動運営の範囲と注意

このアプリは、チャンネル設定をもとに企画・台本・概要欄・タグを生成し、素材が揃った案件を動画化し、公開後の実績を次の戦略へ反映します。AIの品質やYouTubeの成長を保証するものではないため、最終審査、権利確認、YouTubeのポリシー確認は必ず人が行ってください。

YouTubeのOAuthアクセストークンや秘密鍵はコード・`data/state.json`・ブラウザのlocalStorageへ保存しないでください。現在はサーバー側のOAuth実装を使用し、トークンはGit管理外の `data/youtube-token.json` に保存します。公開処理は最終審査で承認した動画だけを非公開で投稿します。

## YouTube Client IDの入力場所

Client IDはブラウザ画面や `app.js` に貼り付けず、Storylineを起動するターミナルで設定します。Client Secretも同じ場所に設定してください。

`.env`を使う場合は、プロジェクト直下に作成してください。Storylineは起動時にこのファイルを自動で読み込みます。

```bash
cp .env.example .env
# .envを編集してClient ID、Client Secret、Irodori URLを入力
npm start
```

```bash
export YOUTUBE_CLIENT_ID='取得したClient ID.apps.googleusercontent.com'
export YOUTUBE_CLIENT_SECRET='Google Cloudで発行したClient Secret'
export YOUTUBE_REDIRECT_URI='http://localhost:4173/oauth2callback'
export IRODORI_URL='http://localhost:7860'
export IRODORI_API_NAME='predict'
npm start
```

Google Cloud ConsoleでYouTube Data API v3とYouTube Analytics APIを有効にし、OAuthクライアントの承認済みリダイレクトURIに次を登録してください。

```text
http://localhost:4173/oauth2callback
```

VS Codeの転送URLでアプリを開く場合は、転送URLの `/oauth2callback` も登録します。OAuth開始時にStorylineが現在のブラウザOriginを自動検出するため、`.env`の `YOUTUBE_REDIRECT_URI` は通常のlocalhost用のままで構いません。設定画面に表示されたRedirect URIとGoogle Cloudの登録値が完全一致していることを確認してください。認証中はStorylineの `npm start` を停止しないでください。設定画面の「YouTubeで接続」はサーバー側OAuthを開始し、認証後にトークンをサーバーへ保存します。
現在の既定設定は固定URIです。VS Code転送URLを使う場合だけ `.env` の `YOUTUBE_DYNAMIC_REDIRECT=true` に変更し、転送URLの `/oauth2callback` をGoogle Cloudへ登録してください。localhostで使う場合は `false` のままにし、`http://localhost:4173/oauth2callback` だけを登録します。認証中はStorylineの `npm start` を停止しないでください。

`localhost`でアプリを開いているのに認証後「接続が拒否されました」と出る場合は、認証中にStorylineサーバーを停止していないか確認してください。認証の最中も `npm start` を動かしたままにします。

今回の `redirect_uri_mismatch` は、Google Cloud ConsoleにこのURIが未登録、または `localhost` と `127.0.0.1`、末尾の `/` が異なる場合に発生します。Google CloudのOAuthクライアント種類は「ウェブアプリケーション」を使用してください。Client Secretを再発行した場合は、古いSecretを無効化してから `.env` を更新します。

### `Error 403: access_denied` の場合

Google Cloud Consoleで次を開きます。

`Google Auth Platform` → `Audience` → `Test users` → `Add users`

実際に「YouTubeで接続」を押すGoogleアカウントのメールアドレスを追加し、保存してください。OAuth同意画面が「Testing」の間は、登録したテストユーザーだけが接続できます。別のGoogleアカウントでログインしている場合は、そのアカウントを追加するか、ブラウザのGoogleアカウントを切り替えてください。反映後にStorylineを再起動する必要は通常ありませんが、OAuth画面を閉じてから再度接続してください。

同じPCのブラウザでStorylineを開き、同じPCのIrodoriへ接続する場合は、まず次を指定してください。

```bash
export IRODORI_URL='http://localhost:7860'
```

StorylineがDev ContainerやCodespacesで動いている場合、サーバー側の`localhost`はコンテナ自身を指します。今回のアプリは、サーバーから届かない場合にブラウザからIrodoriへ直接確認するフォールバックを使います。ブラウザでStorylineとIrodoriを同じPCの`localhost`から開いてください。

Dev ContainerからWindows側で起動したIrodoriへサーバーとして接続したい場合は、`host.docker.internal`またはWindowsのIPv4アドレスがコンテナから到達できる環境が必要です。名前解決やFirewallで失敗する場合、ブラウザ接続フォールバック以外に、StorylineをIrodoriと同じWindows環境で起動する方法が確実です。

Windows側のIrodoriが `http://localhost:7860` で開くだけで、Storyline側から接続できない場合は、Windows PowerShellを管理者権限で開き、Irodoriを次のように起動してください。

```powershell
uv run python gradio_app.py --server-name 0.0.0.0 --server-port 7860
```

それでも接続できない場合はWindows FirewallでTCP 7860の受信を許可する必要があります。Codespacesなどリモートコンテナから自宅PCのIrodoriへ接続する場合は、localhostやhost.docker.internalでは届かないため、Storylineを同じPCで起動するか、認証付きの安全なトンネルを用意してください。

入力例は [.env.example](.env.example) にあります。実際の秘密情報をこのファイルへ保存したり、Gitへコミットしたりしないでください。Client IDだけではYouTubeのサーバー側連携は完了せず、OAuthのClient Secretと承認済みリダイレクトURIも必要です。

### Irodori自動音声生成

IrodoriのGradio画面で「View API」を開き、台本テキストを受け取って音声ファイルを返すAPIの名前を確認します。通常は `predict` ですが、アプリごとに異なります。確認した名前を `IRODORI_API_NAME` に設定してください。引数の順番や音声URLの形式が独自の場合は、Gradio API仕様に合わせて `synthesizeIrodori` を調整します。

制作画面の「Irodoriで音声生成」は、現在の台本全体をGradioへ送り、返された音声を同じチャンネルのvoice素材として保存します。短いサンプル音声を動画へループすることはありません。