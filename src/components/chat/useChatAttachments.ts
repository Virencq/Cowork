import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { isTauriRuntime } from '../../utils/voiceInput'

export interface FileAttachment {
  path: string
  name: string
  data?: string
  mimeType?: string
  isDir?: boolean
}

interface UseChatAttachmentsOptions {
  disabled: boolean
  isStreaming: boolean
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function revokeBlobUrl(path: string | undefined) {
  if (path?.startsWith('blob:')) URL.revokeObjectURL(path)
}

export function useChatAttachments({ disabled, isStreaming }: UseChatAttachmentsOptions) {
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const attachmentsRef = useRef(attachments)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => () => {
    for (const attachment of attachmentsRef.current) revokeBlobUrl(attachment.path)
  }, [])

  const removeAttachment = useCallback((index: number) => {
    const removed = attachments[index]
    revokeBlobUrl(removed?.path)
    setAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
  }, [attachments])

  const clearAttachments = useCallback(() => {
    for (const attachment of attachments) revokeBlobUrl(attachment.path)
    setAttachments([])
  }, [attachments])

  const pickFolder = useCallback(async () => {
    if (!isTauriRuntime() || disabled || isStreaming) return
    try {
      const selected = await openFileDialog({
        directory: true,
        multiple: false,
        title: 'Choose project folder',
      })
      if (typeof selected !== 'string' || !selected) return
      const name = selected.split(/[/\\\\]/).filter(Boolean).pop() || selected
      setAttachments((previous) => {
        if (previous.some((attachment) => attachment.path === selected)) return previous
        return [...previous, { path: selected, name, isDir: true }]
      })
    } catch (error) {
      console.warn('[ChatInput] folder picker failed:', error)
    }
  }, [disabled, isStreaming])

  const pickFiles = useCallback(async () => {
    if (!isTauriRuntime() || disabled || isStreaming) return
    try {
      const selected = await openFileDialog({
        multiple: true,
        directory: false,
        title: 'Attach files',
      })
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
      if (paths.length === 0) return
      setAttachments((previous) => {
        const existing = new Set(previous.map((attachment) => attachment.path))
        const fresh = paths.filter((path) => !existing.has(path))
        return [
          ...previous,
          ...fresh.map((path) => ({
            path,
            name: path.split(/[/\\\\]/).filter(Boolean).pop() || path,
          })),
        ]
      })
    } catch (error) {
      console.warn('[ChatInput] file picker failed:', error)
    }
  }, [disabled, isStreaming])

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)

    const incoming: FileAttachment[] = []
    const fileData = event.dataTransfer.getData('application/x-s-loop-file')
    if (fileData) {
      try {
        const parsed = JSON.parse(fileData) as { path?: unknown; name?: unknown }
        if (typeof parsed.path === 'string' && parsed.path) {
          incoming.push({
            path: parsed.path,
            name: typeof parsed.name === 'string' && parsed.name ? parsed.name : parsed.path,
          })
        }
      } catch {
        // Ignore malformed internal file-drag payloads.
      }
    } else {
      for (const file of Array.from(event.dataTransfer.files)) {
        if (
          file.name.endsWith('.zip') ||
          file.type === 'application/zip' ||
          file.type === 'application/x-zip-compressed'
        ) continue
        incoming.push({ path: file.name, name: file.name })
      }
    }

    if (incoming.length > 0) {
      setAttachments((previous) => {
        const existing = new Set(previous.map((attachment) => attachment.path))
        return [...previous, ...incoming.filter((attachment) => !existing.has(attachment.path))]
      })
    }
  }, [])

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    const incoming: FileAttachment[] = []
    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (!file) continue

      const extension = item.type.split('/')[1] || 'png'
      const name = file.name || 'paste-' + Date.now() + '.' + extension
      const path = URL.createObjectURL(file)
      try {
        const data = arrayBufferToBase64(await file.arrayBuffer())
        incoming.push({ path, name, data, mimeType: item.type })
      } catch (error) {
        URL.revokeObjectURL(path)
        console.warn('[ChatInput] clipboard image could not be read:', error)
      }
    }

    if (incoming.length > 0) {
      event.preventDefault()
      setAttachments((previous) => [...previous, ...incoming])
    }
  }, [])

  return {
    attachments,
    isDragOver,
    removeAttachment,
    clearAttachments,
    pickFolder,
    pickFiles,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handlePaste,
  }
}
