import { describe, expect, it } from 'vitest'
import { normalizeProjectPath, projectPathsEqual } from '../src/utils/projectPaths'

describe('project path comparison', () => {
  it('treats Windows drive paths as case-insensitive and separator-independent', () => {
    expect(projectPathsEqual('C:\\Work\\JCode\\', 'c:/work/jcode')).toBe(true)
  })

  it('treats UNC paths as case-insensitive', () => {
    expect(projectPathsEqual('\\\\SERVER\\Share\\Repo\\', '//server/share/repo')).toBe(true)
  })

  it('preserves POSIX case sensitivity', () => {
    expect(projectPathsEqual('/work/JCode', '/work/jcode')).toBe(false)
  })

  it('preserves filesystem roots when trimming trailing separators', () => {
    expect(normalizeProjectPath('/')).toBe('/')
    expect(projectPathsEqual('C:\\', 'c:/')).toBe(true)
  })

  it('rejects missing paths rather than treating two empty values as equal', () => {
    expect(projectPathsEqual('', '')).toBe(false)
    expect(projectPathsEqual(undefined, '/work/repo')).toBe(false)
  })
})
