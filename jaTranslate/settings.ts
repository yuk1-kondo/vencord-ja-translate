/*
 * JaTranslate - 設定定義
 * Vencord の definePluginSettings を使い、Discord の設定画面に項目を出す。
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    autoTranslate: {
        type: OptionType.BOOLEAN,
        description: "自動翻訳：英語のメッセージを日本語訳して原文の下に表示する",
        default: true,
    },
    includeOwnMessages: {
        type: OptionType.BOOLEAN,
        description: "自分のメッセージも翻訳対象にする（ふつうはオフでOK）",
        default: false,
    },
    engine: {
        type: OptionType.SELECT,
        description: "翻訳エンジン。PLaMo / Gemini は API キー設定時のみ有効で、失敗したら Google 翻訳に自動で切り替わります",
        options: [
            { label: "Google 翻訳（無料・キー不要）", value: "google", default: true },
            { label: "PLaMo（日本語特化・無料プランのAPIキー）", value: "plamo" },
            { label: "Gemini（高品質・APIキー必要）", value: "gemini" },
        ],
    },
    plamoApiKey: {
        type: OptionType.STRING,
        description: "PLaMo API キー（plamo.preferredai.jp で無料発行できます）。未設定なら Google 翻訳を使います",
        default: "",
    },
    plamoModel: {
        type: OptionType.STRING,
        description: "PLaMo のモデル名（Free プランで使える Prime 系モデル名を入れてください）",
        default: "plamo-3.1-prime",
    },
    geminiApiKey: {
        type: OptionType.STRING,
        description: "Gemini API キー（Google AI Studio で無料発行できます）。未設定なら Google 翻訳を使います",
        default: "",
    },
    geminiModel: {
        type: OptionType.STRING,
        description: "Gemini のモデル名（使えなくなったら新しい Flash 系モデル名に書き換えてください）",
        default: "gemini-2.5-flash",
    },
    disabledChannels: {
        type: OptionType.STRING,
        description: "翻訳しないチャンネルの ID（カンマ区切り。チャンネルを右クリック→「IDをコピー」で取得）",
        default: "",
    },
});
