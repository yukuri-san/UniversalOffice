/* テーマ別エラーウインドウ API
 *  任意のコードから showErrorDialog(title, message, detail?) を呼ぶと、
 *  'webx-error-dialog' カスタムイベントが飛び、シェル常駐の ErrorDialogHost が
 *  現在の UI モード／テーマに応じた見た目でポップアップ表示する（notify.ts の notifyOs と同じ流儀）。
 *
 *  見た目の対応：
 *    MXUI-Classic → Android のエラーダイアログ風（Material）
 *    MXUI-Liquid  → iOS のアラート風
 *    DXUI         → テーマが macos / ipados なら macOS のアラート風、それ以外は Windows 風
 *    判定できない場合は Windows 風にフォールバック */

export interface ErrorDialogRequest {
  title: string
  message: string
  detail?: string
}

export const ERROR_DIALOG_EVENT = 'webx-error-dialog'

/** エラーウインドウを出す（複数回呼ぶとキューに入り、1つずつ表示される） */
export function showErrorDialog(title: string, message: string, detail?: string): void {
  window.dispatchEvent(new CustomEvent<ErrorDialogRequest>(ERROR_DIALOG_EVENT, { detail: { title, message, detail } }))
}

export type ErrorDialogStyle = 'android' | 'ios' | 'windows' | 'macos'

/** 現在の UI モード（App の resolvedUi）とテーマ ID からエラーウインドウの見た目を決める */
export function errorDialogStyle(ui: string, theme: string): ErrorDialogStyle {
  if (ui === 'mxui-classic') return 'android'
  if (ui === 'mxui-liquid') return 'ios'
  if (ui === 'dxui') return theme === 'macos' || theme === 'ipados' ? 'macos' : 'windows'
  return 'windows'
}
