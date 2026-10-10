import { useTaskStore } from '../../stores'
import { Plus, Trash2, Play, Pause, Zap, Search, Calendar, Eye, Info, Sun, Inbox, ListChecks, ChevronDown } from 'lucide-react'
import { useState, useMemo } from 'react'
import { TaskDetailModal } from './TaskDetailModal'
import type { ScheduledTask } from '../../types/task'

interface TaskListProps {
  onCreateTask: () => void;
}

function formatNextRun(timestamp: number | null): string {
  if (!timestamp) return '—'
  const diff = timestamp - Date.now()
  if (diff < 0) return 'Overdue'
  if (diff < 60000) return 'in less than a minute'
  if (diff < 3600000) return `in ${Math.floor(diff / 60000)} min`
  if (diff < 86400000) return `in ${Math.floor(diff / 3600000)} hr`
  return new Date(timestamp).toLocaleString()
}

function statusLabel(task: ScheduledTask) {
  if (!task.enabled) return 'Paused'
  if (task.lastStatus === 'running') return 'Running'
  if (task.lastStatus === 'failed') return 'Failed'
  return task.schedule.display
}

export function TaskList({ onCreateTask }: TaskListProps) {
  const { tasks, toggleTask, removeTask, triggerRun } = useTaskStore()
  const [detailTask, setDetailTask] = useState<ScheduledTask | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sortNewest, setSortNewest] = useState(true)

  const filtered = useMemo(() => {
    const result = tasks.filter(t =>
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.prompt.toLowerCase().includes(query.toLowerCase())
    )
    return [...result].sort((a,b) => sortNewest
      ? (b.nextRunAt || 0) - (a.nextRunAt || 0)
      : (a.name || '').localeCompare(b.name || ''))
  }, [tasks, query, sortNewest])

  const templates = [
    { icon: Sun, name: 'Daily briefing', desc: 'What needs your attention today across calendar, email, and messages.', when: 'Weekdays at 8:00 AM' },
    { icon: Inbox, name: 'Inbox triage', desc: 'Categorize your inbox and draft replies to anything urgent.', when: 'Weekdays at 8:00 AM' },
    { icon: Calendar, name: 'Meeting prep', desc: 'A short brief before each meeting on your calendar, covering attendees, context, and agenda.', when: 'Weekdays at 8:00 AM' },
    { icon: ListChecks, name: 'Weekly review', desc: 'A Friday summary of what happened this week.', when: 'Every Friday at 4:00 PM' },
  ]

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg)] pt-11 text-[var(--color-text)]">
      <div className="mx-auto max-w-[1100px] px-10 py-9">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="font-serif text-[32px] tracking-[-0.03em] text-[var(--color-text)]">Scheduled tasks</h1>
            <p className="mt-2 max-w-3xl text-[15px] leading-6 text-[var(--color-text-secondary)]">Run tasks on a schedule or whenever you need them. Type <span className="font-mono text-[13px] text-[var(--color-text)]">/schedule</span> in any existing task to set one up.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSearchOpen(v => !v)} className="h-10 w-10 grid place-items-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text)]" title="Search"><Search size={18}/></button>
            <button onClick={() => setSortNewest(v => !v)} className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[14px] text-[var(--color-text)] inline-flex items-center gap-2">Sort by {sortNewest ? 'Next run' : 'Name'} <ChevronDown size={14}/></button>
            <button onClick={onCreateTask} className="h-10 rounded-lg bg-[var(--color-surface-tertiary)] px-4 text-[14px] font-semibold text-[var(--color-text)] inline-flex items-center gap-2 hover:bg-[var(--color-surface-hover)]"><Plus size={15}/> New task <ChevronDown size={14}/></button>
          </div>
        </div>

        {searchOpen && (
          <div className="mt-4 relative max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"/>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search scheduled tasks" className="w-full h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-9 text-[14px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-tertiary)]"/>
          </div>
        )}

        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-[14px] text-[var(--color-text)]"><Info size={16} className="text-[var(--color-text-secondary)]"/><span>Scheduled tasks only run while your computer is awake and online.</span></div>
          <span className="text-[12px] text-[var(--color-text-secondary)]">Cowork checks the schedule while the app is running.</span>
        </div>

        {filtered.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-5">
            {filtered.map(task => (
              <div key={task.id} className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 ${!task.enabled ? 'opacity-70' : ''}`}>
                <div className="text-[16px] font-semibold text-[var(--color-text)]">{task.name}</div>
                <div className="mt-2 text-[14px] leading-6 text-[var(--color-text-secondary)] line-clamp-3">{task.prompt}</div>
                <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
                  <span className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium ${task.enabled ? 'bg-[#24412d] text-[#b5e6bf]' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]'}`}>
                    {task.enabled ? task.schedule.display : 'Paused'}
                  </span>
                  <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                    <span className="text-[12px]">{formatNextRun(task.nextRunAt)}</span>
                    <button onClick={() => setDetailTask(task)} className="p-2 hover:bg-[var(--color-surface-tertiary)] rounded-md" title="History"><Eye size={13}/></button>
                    <button onClick={() => toggleTask(task.id)} className="p-2 hover:bg-[var(--color-surface-tertiary)] rounded-md" title={task.enabled ? 'Pause' : 'Resume'}>{task.enabled ? <Pause size={13}/> : <Play size={13}/>}</button>
                    <button onClick={() => triggerRun(task.id)} className="p-2 hover:bg-[var(--color-surface-tertiary)] rounded-md" title="Run now"><Zap size={13}/></button>
                    <button onClick={() => removeTask(task.id)} className="p-2 hover:bg-[#492b2b] rounded-md text-[#e58a7d]" title="Delete"><Trash2 size={13}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="mt-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-20 text-center">
            <Calendar size={34} className="mx-auto text-[var(--color-text-secondary)]"/>
            <h2 className="mt-4 text-[20px] font-semibold text-[var(--color-text)]">No scheduled tasks</h2>
            <p className="mt-2 text-[14px] text-[var(--color-text-secondary)]">Create a recurring task and let JCode run it on schedule.</p>
            <button onClick={onCreateTask} className="mt-6 rounded-lg bg-[var(--color-surface-tertiary)] px-4 py-3 text-[14px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"><Plus size={14} className="inline mr-2"/>Create your first task</button>
          </div>
        )}

        <div className="mt-10 border-t border-[var(--color-border)] pt-8">
          <div className="grid grid-cols-2 gap-x-12 gap-y-7">
            {templates.map(t => {
              const Icon = t.icon
              return (
                <button key={t.name} onClick={onCreateTask} className="text-left flex items-start gap-4 group">
                  <span className="h-11 w-11 shrink-0 rounded-xl bg-[var(--color-surface-tertiary)] grid place-items-center text-[var(--color-text)] group-hover:bg-[var(--color-surface-hover)]"><Icon size={18}/></span>
                  <span>
                    <span className="block text-[16px] font-semibold text-[var(--color-text)]">{t.name}</span>
                    <span className="block mt-1 text-[14px] leading-6 text-[var(--color-text-secondary)]">{t.desc}</span>
                    <span className="block mt-1.5 text-[12px] text-[var(--color-text-tertiary)]">◷ {t.when}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {detailTask && <TaskDetailModal task={detailTask} onClose={() => setDetailTask(null)} />}
    </div>
  )
}
