// 匿名の利用統計（テレメトリ）。
// アプリ起動時に1回だけ、利用環境の概要を開発者の Discord Webhook へ送信する。
// 送信する項目は UserAgent、PWAとして利用しているかどうか、WebX のバージョン＋ビルド、
// エディションのみで、個人を特定する情報（名前・ドキュメントの内容など）は含まない。
// 設定（localStorage 'webx-telemetry-enabled'）でオフにでき、オフの場合は一切送信しない。
// この仕組みは設定画面にも明記している（公表型）。

import { APP_BUILD, APP_VERSION } from './version'
import { editionLabel } from './edition'

const TELEMETRY_KEY = 'webx-telemetry-enabled'
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1574932814862884965/gidxhb6Njr6Sd1lCS_vrFlsyhjk0GlzjsUHNj5Aei8Jvmny3MSaCK59F1u0To0a2Xm-w'

/** 利用統計の送信が有効か（既定はオン。'off' のときだけ無効）。 */
export function isTelemetryEnabled(): boolean {
  try {
    return localStorage.getItem(TELEMETRY_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setTelemetryEnabled(v: boolean): void {
  try {
    localStorage.setItem(TELEMETRY_KEY, v ? 'on' : 'off')
  } catch { /* ignore */ }
}

/** PWA（ホーム画面アプリ等）として起動しているか。 */
function isPwa(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
  } catch { /* ignore */ }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

let sent = false

/**
 * 起動時に1回だけ利用統計を送信する。
 * 起動をブロックしないよう非同期で送り、失敗時は静かに無視する。
 * オフライン時・設定オフのときは送信しない。
 */
export function sendStartupTelemetry(): void {
  if (sent) return
  sent = true
  if (!isTelemetryEnabled()) return
  if (!navigator.onLine) return
  const content = [
    '📊 WebX 起動ログ（匿名の利用統計）',
    `バージョン: v${APP_VERSION} (build ${APP_BUILD})`,
    `エディション: ${editionLabel()}`,
    `PWA利用: ${isPwa() ? 'はい' : 'いいえ（ブラウザ）'}`,
    `UserAgent: ${navigator.userAgent}`,
  ].join('\n')
  void (async () => {
    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        keepalive: true,
      })
    } catch { /* 送信に失敗しても起動には影響させない */ }
  })()
}
