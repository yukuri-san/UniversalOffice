import { useLang, type Lang } from '../lib/i18n'

export type AppId = 'word' | 'sheet' | 'note' | 'calendar'

export interface BackstageAction {
  label: string
  hint?: string
  onClick: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  current: AppId
  onSwitch: (app: AppId) => void
  actions: BackstageAction[]
  fileManager?: React.ReactNode
}

const APPS: { id: AppId; icon: string; cls: string }[] = [
  { id: 'word', icon: 'W', cls: 'word' },
  { id: 'sheet', icon: 'S', cls: 'sheet' },
  { id: 'note', icon: 'メ', cls: 'note' },
  { id: 'calendar', icon: 'カ', cls: 'calendar' },
]

const DESCS: Record<AppId, Record<Lang, string>> = {
  word: { ja: '文書を作る（Word 風）', en: 'Documents, Word-style', zh: '制作文档（Word 风格）', ko: '문서 작성 (Word 스타일)', th: 'สร้างเอกสาร (สไตล์ Word)' },
  sheet: { ja: '表と数式（CSV 対応）', en: 'Tables & formulas (CSV)', zh: '表格与公式（支持 CSV）', ko: '표와 수식 (CSV 지원)', th: 'ตารางและสูตร (รองรับ CSV)' },
  note: { ja: 'プレーンテキストのメモ', en: 'Plain-text notes', zh: '纯文本笔记', ko: '일반 텍스트 메모', th: 'บันทึกข้อความธรรมดา' },
  calendar: { ja: '予定の管理', en: 'Manage events', zh: '管理日程', ko: '일정 관리', th: 'จัดการกิจกรรม' },
}

export default function Backstage({ open, onClose, current, onSwitch, actions, fileManager }: Props) {
  const { lang, t } = useLang()
  if (!open) return null
  return (
    <div className="backstage" role="dialog" aria-label="ホーム">
      <div className="backstage-side">
        <button className="backstage-back" onClick={onClose}>←</button>
        <h2>{t('home')}</h2>
        
        <div className="backstage-apps">
          {APPS.map((app) => (
            <button
              key={app.id}
              className={current === app.id ? 'app-card active' : 'app-card'}
              onClick={() => { onSwitch(app.id); onClose() }}
            >
              <span className={`app-icon ${app.cls}`}>{app.icon}</span>
              <span>
                <strong>{t(app.id)}</strong>
                <small>{DESCS[app.id][lang]}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="backstage-main">
        <h3>{t('sectionFile')}</h3>
        <div className="backstage-actions">
          {actions.map((a) => (
            <button key={a.label} className="file-action" onClick={() => { a.onClick(); onClose() }}>
              <strong>{a.label}</strong>
              {a.hint && <small>{a.hint}</small>}
            </button>
          ))}
        </div>
        <p className="backstage-note">{t('dataLocal')}</p>
        {fileManager}
      </div>
    </div>
  )
}
