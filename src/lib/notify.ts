/** OS の通知センターへ通知を送る（App が受け取ってトースト＋履歴に表示）
 *  app を渡すと、通知をタップしたときにそのアプリが開き、通知は消える */
export function notifyOs(text: string, app?: string): void {
  window.dispatchEvent(new CustomEvent('webx-notify', { detail: { text, app } }))
}
