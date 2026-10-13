export function shouldUseDocumentLayout(content: string): boolean {
  if (!content) return false
  const hasCodeFence = content.includes('```')
  const hasHeading = /^#{1,6}\s/m.test(content)
  const hasBlockElements = /^\s*[-*>]|\|\s|^\d+\.\s/m.test(content)
  const lineCount = content.split('\n').length
  const paragraphCount = content.split(/\n\s*\n/).length
  return hasCodeFence || hasHeading || (hasBlockElements && paragraphCount >= 2) || lineCount >= 8
}
