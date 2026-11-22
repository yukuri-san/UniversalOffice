// 設定まわりの localStorage キー一覧（設定アプリのリセットと、ロック画面のPIN復旧で共用）
export const SETTINGS_KEYS = [
  'ykr-theme', 'ykr-lang', 'webx-wp-preset', 'webx-wp-custom', 'webx-wp-use',
  'webx-ui-scale', 'webx-user-name', 'webx-timezone', 'webx-icon-size', 'webx-icon-click',
  'webx-installed-apps', 'webx-app-versions', 'webx-setup-done', 'webx-update-interval',
  'webx-update-notified', 'webx-clock-24h', 'webx-clock-sec', 'webx-reduce-motion',
  'webx-restore-win', 'webx-widget-agenda', 'webx-win-layout', 'webx-nightlight',
  'webx-mute-notes', 'webx-screensaver', 'webx-brightness', 'webx-clipboard',
  'webx-pin-hash', 'webx-pin-len', 'webx-widget-config', 'webx-widget-note', 'webx-widget-agenda',
  'webx-boot-delay', 'webx-safe-mode', 'webx-boot-target', 'webx-widget-weather',
  'webx-permit-hwinfo', 'webx-setup-version', 'webx-ui-mode', 'webx-android-winmove', 'webx-resize-mode',
  'webx-boot-default', 'webx-fast-boot', 'webx-dev-enabled', 'webx-bios-pin',
  'webx-edition', 'webx-pro-unlocked', 'webx-pro-apps',
]

/** 設定だけを初期化する（ドキュメントや予定などのデータは消えない。PINも消える） */
export function resetSettingsOnly(): void {
  for (const k of SETTINGS_KEYS) localStorage.removeItem(k)
}
