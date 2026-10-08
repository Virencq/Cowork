import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CopyButton } from './CopyButton'
import { SpeechButton } from './SpeechButton'
import { Pencil, Trash2 } from 'lucide-react'

interface MessageActionBarProps {
  content?: string
  timestamp?: number
  align?: 'start' | 'end'
  speakable?: boolean
  editable?: boolean
  deletable?: boolean
  onEdit?: () => void
  onDelete?: () => void
}

function formatRelativeTime(ts: number, t: TFunction): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return t('chat.time.justNow')
  if (diff < 3600) return t('chat.time.minutesAgo', { n: Math.floor(diff / 60) })
  if (diff < 86400) return t('chat.time.hoursAgo', { n: Math.floor(diff / 3600) })
  return t('chat.time.daysAgo', { n: Math.floor(diff / 86400) })
}

export function MessageActionBar({
  content,
  timestamp,
  align = 'start',
  speakable = false,
  editable = false,
  deletable = false,
  onEdit,
  onDelete,
}: MessageActionBarProps) {
  const { t, i18n } = useTranslation()
  return (
    <div
      className={`flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
        align === 'end' ? 'justify-end' : 'justify-start'
      }`}
    >
      {timestamp && (
        <span className="text-[11px] text-(--color-text-tertiary)">
          {formatRelativeTime(timestamp, t)}
        </span>
      )}
      {content && <CopyButton text={content} />}
      {content && speakable && (
        <SpeechButton
          text={content}
          label={i18n.resolvedLanguage?.startsWith('zh') ? '朗读' : 'Speak'}
        />
      )}
      {editable && onEdit && (
        <button type="button" onClick={onEdit} className="message-action-button" aria-label={t('chat.actions.edit')} title={t('chat.actions.edit')}>
          <Pencil size={13} />
          <span>{t('chat.actions.edit')}</span>
        </button>
      )}
      {deletable && onDelete && (
        <button type="button" onClick={onDelete} className="message-action-button message-action-danger" aria-label={t('chat.actions.delete')} title={t('chat.actions.delete')}>
          <Trash2 size={13} />
          <span>{t('chat.actions.delete')}</span>
        </button>
      )}
    </div>
  )
}
