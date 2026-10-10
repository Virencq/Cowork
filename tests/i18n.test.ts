import { describe, expect, it } from 'vitest'
import i18n from '../src/i18n'

function flattenLeafValues(value: unknown): unknown[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).flatMap(flattenLeafValues)
  }
  return [value]
}

describe('English-only i18n configuration', () => {
  const resources = i18n.options.resources as Record<string, { translation: Record<string, unknown> }>
  const english = resources.en.translation

  it('registers English as the only application locale', () => {
    expect(i18n.options.lng).toBe('en')
    expect(i18n.options.fallbackLng).toBe('en')
    expect(i18n.options.supportedLngs).toContain('en')
    expect(i18n.options.supportedLngs).not.toContain('zh')
    expect(Object.keys(resources)).toEqual(['en'])
  })

  it('contains only non-empty English translation strings', () => {
    const values = flattenLeafValues(english)
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) {
      expect(typeof value).toBe('string')
      expect((value as string).trim().length).toBeGreaterThan(0)
    }
    expect(JSON.stringify(english)).not.toMatch(/[\u3400-\u9fff]/)
  })
})
