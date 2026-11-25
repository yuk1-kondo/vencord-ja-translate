/*
 * JaTranslate - 翻訳まわりのロジック
 * 言語判定、翻訳結果のキャッシュ、Google 翻訳 / PLaMo / Gemini へのリクエスト。
 * ネットワークエラー時は例外を投げず null を返す（＝原文だけ表示、静かに失敗）。
 */

import { PluginNative } from "@utils/types";

import { settings } from "./settings";

// HTTP リクエストは Electron メインプロセス側（native.ts）で実行する。
// Discord の CSP により、レンダラからの fetch は許可リスト外のドメインに繋げないため。
// 公式 Translate プラグインと同じ方式。
const Native = VencordNative.pluginHelpers.JaTranslate as PluginNative<typeof import("./native")>;

// JSON を返す HTTP リクエスト。失敗時は null。
async function httpJson(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string; },
): Promise<any | null> {
    if (Native?.makeHttpRequest) {
        const { status, data } = await Native.makeHttpRequest(
            url,
            init.method ?? "GET",
            init.headers ?? {},
            init.body ?? null,
        );
        if (status < 200 || status >= 300) return null;
        try {
            return JSON.parse(data);
        } catch {
            return null;
        }
    }
    // Native が無い環境（Web 版など）では通常の fetch にフォールバック
    const res = await fetch(url, {
        method: init.method ?? "GET",
        headers: init.headers,
        body: init.body,
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
}

// ---- 言語判定 ---------------------------------------------------------------

// コードブロック・インラインコード・URL・メンション等は判定から除外する
function stripNoise(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, " ") // コードブロック
        .replace(/`[^`\n]*`/g, " ") // インラインコード
        .replace(/https?:\/\/\S+/g, " ") // URL
        .replace(/<(?:@[!&]?|#|a?:\w+:)\d+>/g, " ") // メンション / チャンネル / カスタム絵文字
        .replace(/:\w+:/g, " "); // :emoji: 形式
}

// 日本語（ひらがな・カタカナ・漢字）の文字数
function countJapanese(text: string): number {
    return (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
}

// ラテン文字（英語など）の文字数
function countLatin(text: string): number {
    return (text.match(/[A-Za-z]/g) ?? []).length;
}

/**
 * 翻訳すべきメッセージかどうか。
 * - 英語が優勢な文章だけを対象にする（日本語優勢なら対象外）
 * - リンクだけ・コードだけのメッセージは、noise を除いた後に何も残らなければ対象外
 * - 短すぎる文章（相づち等）は対象外
 */
export function shouldTranslate(rawText: string): boolean {
    const text = stripNoise(rawText).trim();
    if (!text) return false;

    const latin = countLatin(text);
    const japanese = countJapanese(text);

    if (latin < 10) return false; // 英語として短すぎる
    if (japanese >= latin) return false; // 日本語優勢なら翻訳しない
    return true;
}

// ---- 翻訳API ------------------------------------------------------------------

// Google 翻訳のキー不要エンドポイント（client=gtx）。
// リクエスト自体は httpJson 経由でメインプロセスから送る（Discord の CSP 回避）。
async function googleTranslate(text: string): Promise<string | null> {
    const url = "https://translate.googleapis.com/translate_a/single?" + new URLSearchParams({
        client: "gtx",
        sl: "auto",
        tl: "ja",
        dt: "t",
        q: text,
    });

    const data = await httpJson(url, {});
    if (!data) return null;
    // 既に日本語と判定された場合は翻訳しない
    if (data?.[2] === "ja") return null;
    // data[0] は文ごとの [訳文, 原文, ...] の配列
    const translated = (data?.[0] ?? [])
        .map((seg: any) => seg?.[0] ?? "")
        .join("")
        .trim();
    return translated || null;
}

// Gemini API（generateContent）。キーが設定されている時だけ使う。
async function geminiTranslate(text: string, apiKey: string, model: string): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const data = await httpJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: "次の Discord メッセージを自然な日本語に翻訳してください。"
                        + "翻訳結果の文章だけを出力し、説明・前置き・引用符は付けないでください。\n\n"
                        + text,
                }],
            }],
            generationConfig: { temperature: 0.2 },
        }),
    });
    if (!data) return null;
    const translated = (data?.candidates?.[0]?.content?.parts ?? [])
        .map((part: any) => part?.text ?? "")
        .join("")
        .trim();
    return translated || null;
}

// PLaMo API（OpenAI 互換の chat completions）。キーが設定されている時だけ使う。
// エンドポイントは公式ドキュメント（docs.plamo.preferredai.jp）の
// https://api.platform.preferredai.jp/v1/chat/completions。
// ※ plamo.preferredai.jp は Web サイト側で、API を叩いても SPA の HTML が返るだけ（2026-11-25 実測で判明）。
// Free プランでも利用できるが、Free では入出力が学習に使われる点に注意（公開チャンネルの閲覧用途想定）。
async function plamoTranslate(text: string, apiKey: string, model: string): Promise<string | null> {
    const data = await httpJson("https://api.platform.preferredai.jp/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: "system",
                    content: "あなたは翻訳者です。ユーザーの Discord メッセージを自然な日本語に翻訳し、翻訳結果の文章だけを出力してください。説明・前置き・引用符は付けないでください。",
                },
                { role: "user", content: text },
            ],
            temperature: 0.2,
        }),
    });
    if (!data) return null;
    const translated = (data?.choices?.[0]?.message?.content ?? "").trim();
    return translated || null;
}

async function doTranslate(text: string): Promise<string | null> {
    const { engine, geminiApiKey, geminiModel, plamoApiKey, plamoModel } = settings.store;

    // PLaMo 選択＆キーありなら PLaMo を試し、失敗したら Google にフォールバック
    if (engine === "plamo" && plamoApiKey) {
        const viaPlamo = await plamoTranslate(text, plamoApiKey, plamoModel).catch(() => null);
        if (viaPlamo) return viaPlamo;
    }
    // Gemini 選択＆キーありなら Gemini を試し、失敗したら Google にフォールバック
    if (engine === "gemini" && geminiApiKey) {
        const viaGemini = await geminiTranslate(text, geminiApiKey, geminiModel).catch(() => null);
        if (viaGemini) return viaGemini;
    }
    return googleTranslate(text);
}

// ---- キャッシュ ---------------------------------------------------------------

// メッセージID → 翻訳Promise。再レンダリングで再翻訳・再リクエストしない。
const cache = new Map<string, Promise<string | null>>();
const CACHE_LIMIT = 1000;

export function getTranslation(messageId: string, rawText: string): Promise<string | null> {
    let pending = cache.get(messageId);
    if (!pending) {
        // 長すぎるメッセージは先頭だけ翻訳する（APIエラー回避）
        const text = rawText.length > 1800 ? rawText.slice(0, 1800) : rawText;
        pending = doTranslate(text).catch(() => null);
        if (cache.size >= CACHE_LIMIT) {
            // 一番古いエントリを捨ててメモリ肥大を防ぐ
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(messageId, pending);
    }
    return pending;
}
