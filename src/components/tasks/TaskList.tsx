import { useTaskStore } from '../../stores'
import { Plus, Trash2, Play, Pause, Zap, Search, Calendar, Eye, Bot, Info, Sun, Inbox, ClipboardList, ListChecks, ChevronDown } from 'lucide-react'
import { useState, useMemo } from 'react'
import { TaskDetailModal } from './TaskDetailModal'
import type { ScheduledTask } from '../../types/task'
import { PLATFORM_PRESETS } from '../../types/platform'

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
  const [keepAwake, setKeepAwake] = useState(true)
  const platformNameMap = Object.fromEntries(PLATFORM_PRESETS.map(p => [p.id, p.name]))

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
    <div className="h-full overflow-auto bg-white pt-11">
      <div className="mx-auto max-w-[980px] px-10 py-9">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="font-serif text-[30px] tracking-[-0.03em] text-[#171411]">Scheduled tasks</h1>
            <p className="mt-1 text-[13px] text-[#8a837c]">Run tasks on a schedule or whenever you need them. Type <span className="font-mono text-[12px] text-[#625b54]">/schedule</span> in any existing task to set one up.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSearchOpen(v => !v)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-[#f3f1ee]" title="Search"><Search size={18}/></button>
            <button onClick={() => setSortNewest(v => !v)} className="h-9 rounded-lg border border-[#dfd9d3] px-3 text-[12px] text-[#5f5851] inline-flex items-center gap-2">Sort by {sortNewest ? 'Next run' : 'Name'} <ChevronDown size={14}/></button>
            <button onClick={onCreateTask} className="h-9 rounded-lg bg-[#171717] px-4 text-[13px] font-semibold text-white inline-flex items-center gap-2"><Plus size={15}/> New task <ChevronDown size={14}/></button>
          </div>
        </div>

        {searchOpen && (
          <div className="mt-4 relative max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b948d]"/>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search scheduled tasks" className="w-full h-9 rounded-lg border border-[#ded8d2] px-9 text-[12px] outline-none"/>
          </div>
        )}

        <div className="mt-6 rounded-xl border border-[#e1ddd8] bg-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[13px] text-[#332e29]"><Info size={16} className="text-[#706960]"/><span>Scheduled tasks only run while your computer is awake and online.</span></div>
          <button onClick={() => setKeepAwake(v => !v)} className="flex items-center gap-2 text-[12px] text-[#6f6861]">
            <span>☼</span> Keep awake
            <span className={`relative h-5 w-9 rounded-full transition ${keepAwake ? 'bg-[#2f80ed]' : 'bg-[#c8c3bd]'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${keepAwake ? 'left-[18px]' : 'left-0.5'}`}/></span>
          </button>
        </div>

        {filtered.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-5">
            {filtered.map(task => (
              <div key={task.id} className={`rounded-xl border border-[#e2ddd7] bg-white p-4 ${!task.enabled ? 'opacity-70' : ''}`}>
                <div className="text-[14px] font-semibold text-[#201b17]">{task.name}</div>
                <div className="mt-2 text-[12px] leading-5 text-[#675f58] line-clamp-2">{task.prompt}</div>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <span className={`rounded-md px-2 py-1 text-[10px] font-medium ${task.enabled ? 'bg-[#d9f0d5] text-[#3f703b]' : 'bg-[#eeeae6] text-[#716a63]'}`}>
                    {task.enabled ? task.schedule.display : 'Paused'}
                  </span>
                  <div className="flex items-center gap-1 text-[#837b73]">
                    <span className="text-[10px]">{formatNextRun(task.nextRunAt)}</span>
                    <button onClick={() => setDetailTask(task)} className="p-1.5 hover:bg-[#f1eeeb] rounded-md" title="History"><Eye size={13}/></button>
                    <button onClick={() => toggleTask(task.id)} className="p-1.5 hover:bg-[#f1eeeb] rounded-md" title={task.enabled ? 'Pause' : 'Resume'}>{task.enabled ? <Pause size={13}/> : <Play size={13}/>}</button>
                    <button onClick={() => triggerRun(task.id)} className="p-1.5 hover:bg-[#f1eeeb] rounded-md" title="Run now"><Zap size={13}/></button>
                    <button onClick={() => removeTask(task.id)} className="p-1.5 hover:bg-[#f8e9e6] rounded-md text-[#a35a4c]" title="Delete"><Trash2 size={13}/></button>
                  </div>
                </div>
                {platformNameMap[task.deliver] && <div className="mt-2 text-[10px] text-[#9a928a]">{platformNameMap[task.deliver]}</div>}
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="mt-10 rounded-xl border border-[#e5dfd9] py-20 text-center">
            <Calendar size={34} className="mx-auto text-[#c7c0b9]"/>
            <h2 className="mt-4 text-[18px] font-semibold text-[#28231f]">No scheduled tasks</h2>
            <p className="mt-1 text-[12px] text-[#8d857d]">Create a recurring task and let JCode run it on schedule.</p>
            <button onClick={onCreateTask} className="mt-6 rounded-lg bg-[#171717] px-4 py-2.5 text-[12px] font-semibold text-white"><Plus size={14} className="inline mr-2"/>Create your first task</button>
          </div>
        )}

        <div className="mt-10 border-t border-[#eee9e4] pt-8">
          <div className="grid grid-cols-2 gap-x-12 gap-y-7">
            {templates.map(t => {
              const Icon = t.icon
              return (
                <button key={t.name} onClick={onCreateTask} className="text-left flex items-start gap-4 group">
                  <span className="h-10 w-10 shrink-0 rounded-xl bg-[#f2f0ed] grid place-items-center text-[#6f6861] group-hover:bg-[#ece9e5]"><Icon size={18}/></span>
                  <span>
                    <span className="block text-[14px] font-semibold text-[#24201c]">{t.name}</span>
                    <span className="block mt-1 text-[12px] leading-5 text-[#706861]">{t.desc}</span>
                    <span className="block mt-1.5 text-[11px] text-[#827a72]">◷ {t.when}</span>
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
