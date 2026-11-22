import { useEffect, useState } from 'react'
import { EDITIONS, PRO_PRODUCT_KEY, getEdition, isProUnlocked, setEdition, unlockPro, type EditionId } from '../lib/edition'
import { notifyOs } from '../lib/notify'
import { useLang } from '../lib/i18n'

/**
 * エディション選択ポップアップ（v1.51.0）。
 * エディション未設定の人がデスクトップを初めて開いたときに1回だけ表示する。
 * 表示した時点で localStorage の webx-edition-prompted を立て、二度と出ない。
 * （エディション設定済み＝webx-edition がある人には App 側で表示しない）
 */

export const EDITION_PROMPTED_KEY = 'webx-edition-prompted'

export function shouldShowEditionPrompt(): boolean {
  try {
    return !localStorage.getItem('webx-edition') && !localStorage.getItem(EDITION_PROMPTED_KEY)
  } catch {
    return false
  }
}

export default function EditionPrompt({ onDone }: { onDone: () => void }) {
  const { t } = useLang()
  const [selected, setSelected] = useState<EditionId>(() => getEdition())
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState(false)

  // 表示した時点でフラグを立てる（選び終わらなくても二度と出ない）
  useEffect(() => {
    try { localStorage.setItem(EDITION_PROMPTED_KEY, '1') } catch { /* ignore */ }
  }, [])

  const desc = (id: EditionId) => (id === 'lite' ? t('editionLiteDesc') : id === 'pro' ? t('editionProDesc') : t('editionStdDesc'))
  const needsKey = selected === 'pro' && !isProUnlocked()

  const choose = () => {
    if (needsKey) {
      if (keyInput.trim() !== PRO_PRODUCT_KEY) {
        setKeyError(true)
        notifyOs(t('editionKeyWrong'))
        return
      }
      unlockPro()
    }
    setEdition(selected)
    notifyOs(t('editionSwitched'))
    onDone()
  }

  return (
    <div className="editionprompt-overlay">
      <div className="editionprompt-card">
        <h3>👑 {t('editionSection')}</h3>
        <p className="editionprompt-intro">{t('editionPromptIntro')}</p>
        <div className="editionprompt-list">
          {EDITIONS.map((e) => (
            <button key={e.id} className={`editionprompt-item ${selected === e.id ? 'on' : ''}`} onClick={() => { setSelected(e.id); setKeyError(false) }}>
              <span className="editionprompt-name">{e.label}</span>
              <span className="editionprompt-desc">{desc(e.id)}</span>
            </button>
          ))}
        </div>
        {needsKey && (
          <div className="editionprompt-key">
            <label>{t('productKey')}</label>
            <input
              type="text"
              value={keyInput}
              onChange={(e) => { setKeyInput(e.target.value); setKeyError(false) }}
              placeholder={t('productKeyPh')}
              className={keyError ? 'error' : ''}
            />
            {keyError && <span className="editionprompt-error">{t('editionKeyWrong')}</span>}
          </div>
        )}
        <div className="editionprompt-actions">
          <button className="btn" onClick={onDone}>{t('editionPromptSkip')}</button>
          <button className="btn accent" onClick={choose}>{needsKey ? t('editionUnlockBtn') : t('editionPromptUse')}</button>
        </div>
      </div>
    </div>
  )
}
