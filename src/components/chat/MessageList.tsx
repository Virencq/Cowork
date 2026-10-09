import { useRef, useMemo, useState, useEffect, useCallback } from 'react'
import { ArrowDown } from 'lucide-react'
import { useAppStore } from '../../stores'
import { MessageItem } from './MessageItem'
import type { KiloMessage } from '../../types'

const EMPTY_MESSAGES: never[] = []

interface MessageListProps {
  sessionId: string
  onEdit?: (message: KiloMessage) => void
  onDelete?: (message: KiloMessage) => void
}

export function MessageList({ sessionId, onEdit, onDelete }: MessageListProps) {
  const messages = useAppStore((state) => state.sessionMessages[sessionId]) ?? EMPTY_MESSAGES
  const streamingMessage = useAppStore((state) => state.streamingMessage[sessionId])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const wasAtBottomRef = useRef(true)
  const previousMessageCountRef = useRef(0)

  const groupedMessages = useMemo(() => {
    const rawMessages = [...messages]
    if (streamingMessage?.isStreaming && streamingMessage.parts.length > 0) {
      rawMessages.push({
        info: {
          id: streamingMessage.messageID,
          sessionID: sessionId,
          role: 'assistant' as const,
          time: { created: Date.now() },
        },
        parts: streamingMessage.parts,
      })
    }

    if (rawMessages.length === 0) return []

    // Merge consecutive assistant messages into one visual bubble.
    const result: KiloMessage[] = []
    for (const msg of rawMessages) {
      const last = result[result.length - 1]
      if (last && last.info.role === 'assistant' && msg.info.role === 'assistant') {
        result[result.length - 1] = {
          ...last,
          parts: [...last.parts, ...msg.parts],
          info: { ...msg.info, time: last.info.time },
        }
      } else {
        result.push({ ...msg })
      }
    }
    return result
  }, [messages, streamingMessage, sessionId])

  const updateBottomState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 32
    wasAtBottomRef.current = isBottom
    setAtBottom(isBottom)
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
    wasAtBottomRef.current = true
    setAtBottom(true)
  }, [])

  // Only jump when a new user message is added. While reading older messages,
  // normal mouse-wheel scrolling stays entirely under the user's control.
  useEffect(() => {
    const previousCount = previousMessageCountRef.current
    previousMessageCountRef.current = groupedMessages.length
    const last = groupedMessages[groupedMessages.length - 1]
    if (groupedMessages.length > previousCount && last?.info.role === 'user') {
      requestAnimationFrame(() => scrollToBottom('auto'))
    }
  }, [groupedMessages, scrollToBottom])

  // When switching conversations, start at the bottom without intercepting wheel input.
  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom('auto'))
  }, [sessionId, scrollToBottom])

  if (groupedMessages.length === 0) {
    return null
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden pt-4">
      <div
        ref={scrollRef}
        onScroll={updateBottomState}
        className="h-full w-full overflow-y-auto overscroll-y-contain chat-scroll-area"
        style={{ overflowAnchor: 'auto', scrollbarGutter: 'stable' }}
      >
        {groupedMessages.map((message, index) => {
          const isStreaming =
            !!streamingMessage?.isStreaming &&
            index === groupedMessages.length - 1 &&
            message.info.role === 'assistant'

          return (
            <div key={message.info.id} className="px-8">
              <MessageItem
                message={message}
                isStreaming={isStreaming}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          )
        })}
        <div aria-hidden="true" className="h-2" />
      </div>
      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          aria-label="Scroll to bottom"
          title="Scroll to bottom"
          className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border bg-surface px-3 py-2 shadow-lg transition-all hover:bg-surface-secondary"
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  )
}
