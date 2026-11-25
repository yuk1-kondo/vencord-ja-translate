# NOTES — 開発メモ（API の根拠と未検証事項）

調査日: 2026-11-24

## 実機で判明した2つの落とし穴（2026-11-25 解決）

1. **PLaMo のエンドポイント誤り**: 当初 `https://plamo.preferredai.jp/api/chat/completions` に POST していたが、そのホストは Web サイト側で、どのパスでも SPA の HTML が 200 で返るため JSON パースに失敗し、無言で Google フォールバックに落ちていた。正しくは公式ドキュメント記載の **`https://api.platform.preferredai.jp/v1/chat/completions`**。モデル ID は `plamo-3.1-prime` で正しい。
2. **Discord の CSP でレンダラ fetch が全滅**: エンドポイント修正後も翻訳が出ず、DevTools コンソールで確定。Discord ページの CSP `connect-src` 許可リストに `api.platform.preferredai.jp` も `translate.googleapis.com` も無く、両エンジンとも "Refused to connect because it violates the document's Content Security Policy" で遮断されていた（プラグイン自体は正常に動作し、リクエストだけが弾かれていた）。
   - 対策: 公式 Translate プラグインと同じく、HTTP リクエストを **Electron メインプロセス側（`native.ts`）** で実行する。userplugins でも `native.ts` はビルド対象（`scripts/build/build.mjs` の glob-natives が userplugins を含む）で、レンダラからは `VencordNative.pluginHelpers.JaTranslate.makeHttpRequest(url, method, headers, body)` として呼ぶ。native 側のコードは `patcher.js` に入るので、配布時は renderer だけでなく **patcher.js の差し替えも必須**。
   - なお CSP 許可リストには `translate-pa.googleapis.com`（公式プラグインの Google 経路）と `localhost:*` が含まれることもログから確認した。

## 採用した API と根拠

### プラグインの基本構造
- 置き場所は `src/userplugins/<camelCase フォルダ>/index.tsx`。公式プラグインと違い git 管理外（private）になるのが userplugins。
- 本体は `export default definePlugin({ name, description, authors, ... })`。`definePlugin` は `@utils/types` から import。
- authors の id は BigInt リテラル。公開したくない場合は `0n` でよい（本プラグインは `0n` を使用）。
- 根拠:
  - https://docs.vencord.dev/plugins/ （Basic Plugin Setup）
  - https://github.com/Vencord/Docs/blob/HEAD/src/content/docs/plugins/index.mdx

### メッセージ下への表示 = Message Accessories（採用）
- 「原文の下に訳文を出す」には **Message Accessories** が正解。プラグイン定義に `renderMessageAccessory(props)` を書くと、埋め込み（embed）等と同じ位置＝メッセージ下部に任意の React 要素を出せる。docs は "This is the easiest way to add custom elements to messages" と明記。
- props には `message` が入り、公式 Translate プラグインは `props.message` と `props.isMessageSnapshot` を参照している。本プラグインもそれに倣った。
- **Message Decorations は不採用**：こちらはユーザー名の横（クランタグやロールアイコンの並び）に出るもので、訳文を置く場所ではない。docs の Plugin API ページで両者の違いを確認。
- 根拠:
  - https://docs.vencord.dev/plugins/common/ （Plugin API: Message Accessories / Message Decorations）
  - https://github.com/Vendicated/Vencord/blob/main/src/plugins/translate/index.tsx （公式 Translate の `renderMessageAccessory` 実装）
  - https://github.com/Vendicated/Vencord/blob/main/src/plugins/translate/TranslationAccessory.tsx （useState/useEffect で非同期結果を表示する型）

### 依存 API プラグイン
- `dependencies: ["MessageAccessoriesAPI"]` を宣言した。Decorations 系では `dependencies: ["MessageDecorationsAPI"]` と宣言するのが実プラグインの慣例（DmReadReceipt 等）で、それに倣った。
- ただし公式 Translate プラグインの定義（GitHub 表示上）では dependencies の明示が見当たらなかった。宣言して害はないはずだが、**実機ビルドで要確認**（下記）。

### 設定 API
- `definePluginSettings` は `@api/Settings`、`OptionType` は `@utils/types` から import。
- `settings.store.<key>` で読み書き、`settings.use([...])` で React 内リアクティブ購読。プラグイン定義に `settings` を含めないとエラーになる（docs 明記）。
- SELECT の options は `{ label, value, default?: true }` の配列で、default は1つに付ける。
- 根拠:
  - https://docs.vencord.dev/plugins/common/ （Plugin Settings の節）
  - https://venpm.dev/author/your-first-plugin.html （Step 4: Settings の実装例）

### HTTP リクエスト（fetch）
- プラグインはブラウザ（Electron レンダラ）上で動くため、素の `fetch` が使える。
- 公式 Translate プラグインは Google 翻訳を素の fetch で叩いている（`src/plugins/translate/utils.ts` の `googleTranslate`）。一方 DeepL / Kagi は CORS 回避のため native ヘルパー経由。本プラグインの2エンジン（Google gtx / Gemini）はどちらも CORS 許可済みのはずなので fetch で完結させた。
- Google 翻訳は指示どおりキー不要の `translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dt=t` を使用。レスポンス形式: `data[0]` が文ごとの `[訳文, 原文, ...]` 配列、`data[2]` が検出言語。
  - 参考: 公式プラグインの現行実装は `translate-pa.googleapis.com/v1/translate`（埋め込みキー付き）に移行している。gtx エンドポイントが将来塞がれた場合の代替候補。
- Gemini は `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<APIキー>`、`contents[].parts[].text` 形式。応答は `candidates[0].content.parts[].text`。

### Gemini のモデル名について（要注意）
- 2026年後半はモデルの入れ替わりが激しい。調査時点で「gemini-2.5-flash の無料枠は既存ユーザー限定・2026-12-01 で終了予定」「後継は Gemini 3.x Flash 系」という第三者情報が複数ある（公式ドキュメントでの直接確認はできていない）。
- そのためモデル名はコードに固定せず **設定項目（既定: gemini-2.5-flash）** にして、Discord の設定画面から書き換えられるようにした。使えない場合は AI Studio のモデル一覧で使える Flash 系を確認して差し替えること。
- 参考:
  - https://ai.google.dev/gemini-api/docs/pricing （公式の無料枠一覧で最終確認すべき）
  - https://note.com/shiina_note_life/n/n3e4c5f52c989 （2.5-flash が新規ユーザーに 404 になる事例、2026-07 時点）

### インストール / ビルド
- 公式手順: `git clone https://github.com/Vendicated/Vencord` → `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm inject`（Discord Desktop の場合）。pnpm 以外のマネージャは不可（docs 明記）。
- 根拠: https://docs.vencord.dev/installing/

### 自分のメッセージ判定
- `UserStore.getCurrentUser()?.id` を `@webpack/common` から取得し、`message.author.id` と比較。DmReadReceipt 等の実プラグインと同じ取得方法。

## 実装上の判断

- 言語判定はヒューリスティック（日本語文字数 vs ラテン文字数の比較＋ノイズ除去）。言語検出ライブラリは入れず軽量化した。誤判定パターンが出たら閾値（ラテン文字10文字以上）で調整可能。
- キャッシュは message.id → Promise<string|null> の Map。再レンダリング時の再翻訳・二重リクエストを両方防ぐ。上限1000件で最古を削除。
- 失敗は全て null に倒し、訳文欄を出さない（静かに失敗）。Gemini 失敗時のみ Google へフォールバック。

## 検証済み / 未検証

検証済み（この VM 上）:
- 3ファイルとも esbuild でトランスパイル成功（構文エラーなし）。※ import 先（@api/... 等）は Vencord 本体側のモジュールなので、この VM では型チェック・解決まではできていない。

未検証（実機 MBP でのインストール時に確認が必要）:
1. `pnpm build` が通るか（特に `dependencies: ["MessageAccessoriesAPI"]` の要否と、`@vencord/discord-types` の Message 型に `channel_id` が無い場合の型エラー有無。コード側は `(message as any).channel_id ?? props.channel?.id` とフォールバック済みだが、型チェックで弾かれる可能性は残る）
2. `renderMessageAccessory` の props に実際に何が入るか（`channel` の有無、`isMessageSnapshot` の有無）
3. gtx エンドポイントが Discord レンダラの fetch から叩けるか（CORS / レート制限）。塞がれていたら translate-pa 方式への切替を検討
4. Gemini エンドポイントの CORS と、既定モデル `gemini-2.5-flash` がユーザーの API キーで実際に使えるか
5. Discord のアップデート後に MessageAccessoriesAPI のパッチが生きているか（Vencord 本体の追随待ちになる場合がある）
6. 訳文のスタイル（`var(--text-muted)` 等の CSS 変数がそのコンテキストで有効か）

## 2026-11-25 変更：PLaMo エンジンを追加

- ユーザーの希望（無料LLMで翻訳したい／PLaMo）により、エンジン選択肢に `plamo` を追加。
- 実装：`settings.ts` に `plamoApiKey` / `plamoModel`（初期値 `plamo-3.1-prime`）を追加。`translate.ts` に `plamoTranslate()` を追加し、`POST https://plamo.preferredai.jp/api/chat/completions`（OpenAI 互換、Bearer 認証、翻訳用 system プロンプト）で訳す。失敗時は既存どおり Google 翻訳へフォールバック。
- 根拠：PLaMo API には Free プラン（¥0、PLaMo 3.0/3.1 Prime、利用量・レート制限あり）があり、API は OpenAI ライブラリ互換（出典：thetrail.jp の PLaMo 解説、apis.io の Preferred Networks 料金ページ、いずれも 2026-11-24 検索で確認）。
- 未検証事項：正確なモデル名文字列（コンソール上の表記と一致するか）、Free プランのレート制限の実効値、Discord レンダラからの CORS 可否。これらは MBP 実機インストール時に確認する。モデル名は設定で変更可能にしてある。
- 注意：Free プランは入出力が学習に利用される（同上出典）。README に明記済み。
