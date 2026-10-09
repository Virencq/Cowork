import { useRef, useMemo, useState, useEffect } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { ArrowDown } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
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
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [atBottom, setAtBottom] = useState(true)

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

    // Merge consecutive assistant messages into one visual bubble
    const result: KiloMessage[] = []
    for (const msg of rawMessages) {
      const last = result[result.length - 1]
      if (last && last.info.role === 'assistant' && msg.info.role === 'assistant') {
        // Create a new object to avoid mutating store data
        result[result.length - 1] = {
          ...last,
          parts: [...last.parts, ...msg.parts],
          // Keep the latest info/stats
          info: {
            ...msg.info,
            time: last.info.time, // Keep original start time
          }
        }
      } else {
        result.push({ ...msg })
      }
    }
    return result
  }, [messages, streamingMessage, sessionId])


  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({
      index: Math.max(0, groupedMessages.length - 1),
      align: 'end',
      behavior: 'auto',
    })
  }

  // Always follow a newly-sent user message. Once the user deliberately scrolls
  // upward, streaming output will no longer yank the viewport away from them.
  useEffect(() => {
    const last = groupedMessages[groupedMessages.length - 1]
    if (last?.info.role === 'user') {
      requestAnimationFrame(scrollToBottom)
    }
  }, [groupedMessages.length])

  if (groupedMessages.length === 0) {
    return null
  }

  return (
    <div className="relative flex-1 overflow-hidden pt-4">
      <Virtuoso
        ref={virtuosoRef}
        data={groupedMessages}
        followOutput={() => 'auto'}
        alignToBottom
        atBottomThreshold={24}
        atBottomStateChange={setAtBottom}
        initialTopMostItemIndex={groupedMessages.length - 1}
        className="flex-1 h-full chat-scroll-area"
        components={{
          Footer: () => <div className="h-2" />
        }}
        itemContent={(index, message) => {
          const isStreaming = 
            streamingMessage?.isStreaming && 
            index === groupedMessages.length - 1 && 
            message.info.role === 'assistant'

          return (
            <div className="px-8">
              <MessageItem
                message={message}
                isStreaming={isStreaming}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          )
        }}
      />
      {!atBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
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
