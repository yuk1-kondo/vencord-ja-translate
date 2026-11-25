/*
 * JaTranslate - ネイティブ側（Electron メインプロセスで実行される）
 *
 * Discord のページには CSP（Content Security Policy）があり、レンダラからの
 * fetch は許可リストにあるドメインにしか繋げない。PLaMo や Google 翻訳の
 * エンドポイントはそのリストに無いため、レンダラから直接叩くと必ずブロックされる
 * （2026-11-25 のコンソールログで確認済み）。
 * 公式 Translate プラグインと同じく、HTTP リクエストは CSP の効かない
 * メインプロセス側で実行し、結果だけをレンダラに返す。
 */

import { IpcMainInvokeEvent } from "electron";

// 汎用 HTTP リクエスト。戻り値は { status, data }（data はレスポンス本文の文字列）。
// ネットワークエラー時は status: -1 で data にエラー文字列が入る。
export async function makeHttpRequest(
    _: IpcMainInvokeEvent,
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | null,
) {
    try {
        const res = await fetch(url, {
            method,
            headers,
            body: body ?? undefined,
        });

        const data = await res.text();
        return { status: res.status, data };
    } catch (e) {
        return { status: -1, data: String(e) };
    }
}
