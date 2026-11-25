/*
 * JaTranslate
 * 英語のメッセージを自動で日本語に翻訳し、原文の下に薄い色で表示する Vencord ユーザープラグイン。
 *
 * 置き場所: Vencord チェックアウトの src/userplugins/jaTranslate/
 * 表示には Message Accessories API（renderMessageAccessory）を使う。
 * これは公式 Translate プラグインと同じ仕組み。
 */

import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { useEffect, useState, UserStore } from "@webpack/common";

import { settings } from "./settings";
import { getTranslation, shouldTranslate } from "./translate";

// 原文の下に出る訳文コンポーネント。翻訳が終わるまでは何も表示しない。
function TranslationAccessory({ message }: { message: Message; }) {
    const [text, setText] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getTranslation(message.id, message.content).then(t => {
            if (!cancelled) setText(t);
        });
        return () => { cancelled = true; };
    }, []);

    // 翻訳失敗時、または訳文が原文と同一（固有名詞だけ等）の時は何も出さない
    if (!text || text === message.content) return null;

    return (
        <div
            style={{
                color: "var(--text-muted)",
                fontSize: "0.9em",
                marginTop: "2px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
            }}
        >
            訳：{text}
        </div>
    );
}

export default definePlugin({
    name: "JaTranslate",
    description: "英語のメッセージを自動で日本語訳して、原文の下に表示します",
    authors: [{ name: "yukilab", id: 0n }],
    settings,
    dependencies: ["MessageAccessoriesAPI"],

    renderMessageAccessory(props) {
        const { message } = props;
        if (!settings.store.autoTranslate) return null;
        if (!message?.content) return null;
        // 転送スナップショット等は対象外（公式プラグインと同じ扱い）
        if ((props as any).isMessageSnapshot) return null;

        // 自分のメッセージは既定で対象外
        if (!settings.store.includeOwnMessages
            && message.author?.id === UserStore.getCurrentUser()?.id) return null;

        // 「翻訳しないチャンネル」リスト（カンマ区切りのチャンネルID）
        const channelId = (message as any).channel_id ?? (props as any).channel?.id;
        const disabled = settings.store.disabledChannels
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
        if (channelId && disabled.includes(channelId)) return null;

        // 英語優勢でないメッセージは翻訳しない
        if (!shouldTranslate(message.content)) return null;

        return <TranslationAccessory message={message} />;
    },
});
