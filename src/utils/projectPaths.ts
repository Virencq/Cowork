/**
 * Normalize a user-selected project path for comparison only.
 * The original path is still stored and passed to filesystem APIs.
 *
 * Windows drive and UNC paths are case-insensitive. POSIX paths remain
 * case-sensitive. Separators and redundant trailing separators are normalized.
 */
export function normalizeProjectPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''

  const withForwardSlashes = trimmed.replace(/\\/g, '/')
  const isWindowsPath = /^[a-zA-Z]:\//.test(withForwardSlashes) || withForwardSlashes.startsWith('//')
  const withoutTrailingSeparators = withForwardSlashes.replace(/\/+$/, '')
  const normalized = withoutTrailingSeparators || (withForwardSlashes.startsWith('/') ? '/' : withForwardSlashes)

  return isWindowsPath ? normalized.toLowerCase() : normalized
}

export function projectPathsEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false
  return normalizeProjectPath(left) === normalizeProjectPath(right)
}
