/** OS の通知センターへ通知を送る（App が受け取ってトースト＋履歴に表示） */
export function notifyOs(text: string): void {
  window.dispatchEvent(new CustomEvent('webx-notify', { detail: text }))
}
