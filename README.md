# JaTranslate

Discord デスクトップアプリの英語メッセージを、自動で日本語に翻訳して原文の下に薄く表示する [Vencord](https://vencord.dev/) 用ユーザープラグインです。

海外サーバーの英語チャットを「読むだけ」の用途で想定しています。翻訳は表示だけに使われ、メッセージを送信したり書き換えたりすることはありません。

## 特徴

- 英語のメッセージの下に「訳：……」と日本語訳を表示
- 翻訳エンジンは3種類から選択
  - **Google 翻訳**（無料・APIキー不要、そのまま動きます）
  - **PLaMo API**（日本語に強い。無料プランのキーで利用可）
  - **Gemini API**（高品質。Google AI Studio のキーが必要）
- PLaMo / Gemini で失敗した場合は自動で Google 翻訳にフォールバック
- 自分の投稿・日本語のメッセージ・短い文・コードブロックなどは自動でスキップ
- チャンネル単位で翻訳を無効化できる（ID指定）

## 必要なもの

- Discord デスクトップアプリ（Windows / macOS）
- Vencord（ソースコード版をビルドできる環境：Git、Node.js、pnpm）

> Vencord の導入自体が初めての場合は、先に [Vencord 公式サイト](https://vencord.dev/) の案内で Vencord を入れられる状態にしてください。本プラグインは「ユーザープラグイン」として、Vencord のソースツリーに追加してビルドする形で配布しています。

## インストール

1. Vencord のソースを取得（済んでいる場合は不要）

   ```
   git clone https://github.com/Vendicated/Vencord
   cd Vencord
   ```

2. このリポジトリの `jaTranslate` フォルダを、Vencord の `src/userplugins/` の中に入れる

   ```
   src/userplugins/jaTranslate/
   ├── index.tsx
   ├── settings.ts
   ├── translate.ts
   └── native.ts
   ```

3. ビルドして Discord に適用する（Discord は終了しておく）

   ```
   pnpm install
   pnpm build
   pnpm inject
   ```

   `pnpm inject` では適用先として使っている Discord（Stable など）を選んでください。

4. Discord を起動し、設定 → Vencord → Plugins で **JaTranslate** をオンにする

5. 英語のチャンネルを開くと、メッセージの下に日本語訳が出ます

## 設定

Discord の設定 → Vencord → Plugins → JaTranslate から変更できます。

| 項目 | 説明 | 既定値 |
|---|---|---|
| 自動翻訳 | オン/オフの切り替え | オン |
| 自分のメッセージも翻訳対象にする | 自分の英語投稿も訳すかどうか | オフ |
| 翻訳エンジン | Google / PLaMo / Gemini | Google |
| PLaMo API キー | [PLaMo API](https://plamo.preferredai.jp/) で発行したキー | 未設定 |
| PLaMo のモデル名 | Free プランで使える Prime 系モデル | `plamo-3.1-prime` |
| Gemini API キー | Google AI Studio で発行したキー | 未設定 |
| Gemini のモデル名 | 使用する Gemini モデル | `gemini-2.5-flash` |
| 翻訳しないチャンネルの ID | カンマ区切り。チャンネルを右クリック →「IDをコピー」で取得 | 未設定 |

API キーは Discord の設定ファイル内にのみ保存され、このプラグインが外部に送信するのは「翻訳対象のメッセージ文」と「翻訳 API へのリクエスト」だけです。

## 仕組みのメモ

Discord のページには CSP（Content Security Policy）があり、画面側のコードからは許可リストにあるドメインにしか通信できません。翻訳 API はそのリストに無いため、本プラグインは公式 Translate プラグインと同じく、HTTP リクエストを Electron のメインプロセス側（`native.ts`）で実行しています。詳しくは [NOTES.md](NOTES.md) を参照してください。

## 注意

- **Vencord は Discord 公式の仕組みではありません。** クライアントの改変は Discord の利用規約との関係でグレーな領域です。利用は自己責任でお願いします（本プラグインは読み取り専用で、投稿やアカウント操作は行いません）。
- **PLaMo 無料プランについて**: Free プランでは、API への入出力がモデル改善（学習）に利用される場合があります。公開チャンネルの閲覧など、学習利用されても困らない用途での利用を想定しています。機密性の高い会話には Google / Gemini エンジンか、PLaMo の有料プランの利用を検討してください。
- 翻訳結果の正確性は保証されません。大事な内容は原文も確認してください。

## ライセンス

GPL-3.0（土台である Vencord と同じライセンスです）。詳細は [LICENSE](LICENSE) を参照してください。
