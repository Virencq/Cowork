import { lazy, Suspense, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, FileText, FileCode, FileImage, FileSpreadsheet, Loader2 } from 'lucide-react'
import { useFilePreviewStore } from '../../stores/filePreviewStore'
// Preview implementations are split into separate chunks so PDF, Office and
// image parsers are downloaded only when the corresponding file type is opened.
const TextPreview = lazy(() => import('./TextPreview').then((module) => ({ default: module.TextPreview })))
const MarkdownPreview = lazy(() => import('./MarkdownPreview').then((module) => ({ default: module.MarkdownPreview })))
const ImagePreview = lazy(() => import('./ImagePreview').then((module) => ({ default: module.ImagePreview })))
const ExcelPreview = lazy(() => import('./ExcelPreview').then((module) => ({ default: module.ExcelPreview })))
const PdfPreview = lazy(() => import('./PdfPreview').then((module) => ({ default: module.PdfPreview })))
const DocxPreview = lazy(() => import('./DocxPreview').then((module) => ({ default: module.DocxPreview })))
const PptxPreview = lazy(() => import('./PptxPreview').then((module) => ({ default: module.PptxPreview })))
const BinaryPreview = lazy(() => import('./BinaryPreview').then((module) => ({ default: module.BinaryPreview })))
import type { FileCategory } from '../../types/filePreview'

function getCategoryIcon(category: FileCategory) {
  switch (category) {
    case 'code': return FileCode
    case 'markdown': return FileText
    case 'image': return FileImage
    case 'excel': return FileSpreadsheet
    default: return FileText
  }
}

function PreviewContent({ category, filePath }: { category: FileCategory; filePath: string }) {
  const { t } = useTranslation()
  const setError = useFilePreviewStore((s) => s.setError)
  const setLoading = useFilePreviewStore((s) => s.setLoading)
  const error = useFilePreviewStore((s) => s.error)

  const handleError = useCallback((msg: string) => {
    setError(msg)
  }, [setError])

  const handleLoaded = useCallback(() => {
    setLoading(false)
  }, [setLoading])

  useEffect(() => {
    setLoading(true)
    setError(null)
  }, [filePath, setLoading, setError])

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="text-red-500 text-sm font-bold">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-text-tertiary hover:text-accent transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  switch (category) {
    case 'text':
    case 'code':
      return <TextPreview filePath={filePath} onLoaded={handleLoaded} onError={handleError} />
    case 'markdown':
      return <MarkdownPreview filePath={filePath} onLoaded={handleLoaded} onError={handleError} />
    case 'image':
      return <ImagePreview filePath={filePath} onLoaded={handleLoaded} onError={handleError} />
    case 'excel':
      return <ExcelPreview filePath={filePath} onLoaded={handleLoaded} onError={handleError} />
    case 'pdf':
      return <PdfPreview filePath={filePath} onLoaded={handleLoaded} onError={handleError} />
    case 'docx':
      return <DocxPreview filePath={filePath} onLoaded={handleLoaded} onError={handleError} />
    case 'pptx':
      return <PptxPreview filePath={filePath} onLoaded={handleLoaded} onError={handleError} />
    case 'binary':
      return <BinaryPreview />
    default:
      return <BinaryPreview />
  }
}

export function FilePreviewPanel() {
  const { t } = useTranslation()
  const preview = useFilePreviewStore((s) => s.preview)
  const loading = useFilePreviewStore((s) => s.loading)
  const closePreview = useFilePreviewStore((s) => s.closePreview)

  if (!preview) return null

  const Icon = getCategoryIcon(preview.category)

  return (
    <div className="h-full flex flex-col border-l border-border-light/50 bg-surface/95 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-light/50 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-accent/10 text-accent shrink-0">
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold tracking-tight text-text">
            {preview.fileName}
          </div>
          <div className="truncate text-[10px] text-text-quaternary font-mono mt-0.5">
            {preview.filePath}
          </div>
        </div>
        <button
          onClick={closePreview}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-secondary/60 text-text-tertiary hover:text-text hover:bg-surface-secondary transition-all shrink-0"
          title={t('common.close')}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/80 z-10">
            <div className="flex items-center gap-3 text-text-tertiary">
              <Loader2 size={18} className="animate-spin text-accent" />
              <span className="text-[12px] font-bold">{t('filePreview.loading')}</span>
            </div>
          </div>
        )}
        <Suspense fallback={
          <div className="flex h-full items-center justify-center text-[12px] text-text-tertiary">
            {t('filePreview.loading')}
          </div>
        }>
          <PreviewContent category={preview.category} filePath={preview.filePath} />
        </Suspense>
      </div>
    </div>
  )
}
