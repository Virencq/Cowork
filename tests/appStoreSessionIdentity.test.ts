// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAllSessions = vi.fn()
const updateSession = vi.fn(async () => undefined)
const deleteDbSession = vi.fn(async () => undefined)
const deleteJCodeSession = vi.fn(async () => undefined)

vi.mock('../src/utils/database', () => ({
  getAllSessions,
  getMessages: vi.fn(async () => []),
  createSession: vi.fn(async () => undefined),
  updateSession,
  deleteSession: deleteDbSession,
  saveMessage: vi.fn(async () => undefined),
}))

vi.mock('../src/utils/jcodeClient', () => ({
  deleteSession: deleteJCodeSession,
}))

describe('app store session identity', () => {
  beforeEach(async () => {
    localStorage.clear()
    getAllSessions.mockReset()
    updateSession.mockClear()
    deleteDbSession.mockClear()
    deleteJCodeSession.mockClear()

    const { useAppStore } = await import('../src/stores/appStore')
    useAppStore.setState({
      sessions: [],
      activeSessionId: null,
      sessionMessages: {},
      streamingMessage: {},
      activeSessionId: null,
      codeActiveSessionId: null,
      codeSessionIds: [],
    })
  })

  it('restores the durable UI session identity from SQLite without reusing a stale ACP id', async () => {
    getAllSessions.mockResolvedValueOnce([{
      id: 'ui-session',
      title: 'Existing chat',
      model: 'deepseek-chat',
      pi_id: 'stale-acp-session',
      created_at: 1,
      updated_at: 2,
    }])
    const { useAppStore } = await import('../src/stores/appStore')

    await useAppStore.getState().loadFromDb()

    expect(useAppStore.getState().sessions[0]).toMatchObject({
      id: 'ui-session',
      title: 'Existing chat',
      model: 'deepseek-chat',
      createdAt: 1,
      updatedAt: 2,
    })
    // ACP session identifiers are process-scoped and must not be resumed after restart.
    expect(useAppStore.getState().sessions[0].piId).toBeUndefined()
  })

  it('updates the in-memory and SQLite ACP session id together', async () => {
    const { useAppStore } = await import('../src/stores/appStore')
    useAppStore.setState({
      sessions: [{
        id: 'ui-session', title: 'Chat', model: '', createdAt: 1, updatedAt: 1,
      }],
    })

    useAppStore.getState().setSessionPiId('ui-session', 'acp-session')

    expect(useAppStore.getState().sessions[0].piId).toBe('acp-session')
    expect(updateSession).toHaveBeenCalledWith('ui-session', { pi_id: 'acp-session' })
  })

  it('closes an active ACP session by its runtime id, not the durable UI id', async () => {
    const { useAppStore } = await import('../src/stores/appStore')
    useAppStore.setState({
      sessions: [{
        id: 'ui-session', piId: 'acp-session', title: 'Chat', model: '', createdAt: 1, updatedAt: 1,
      }],
    })

    useAppStore.getState().deleteSession('ui-session')
    await vi.waitFor(() => expect(deleteJCodeSession).toHaveBeenCalled())

    expect(deleteDbSession).toHaveBeenCalledWith('ui-session')
    expect(deleteJCodeSession).toHaveBeenCalledWith('acp-session')
    expect(deleteJCodeSession).not.toHaveBeenCalledWith('ui-session')
  })

  it('creates Code sessions without changing the active Cowork conversation', async () => {
    const { useAppStore } = await import('../src/stores/appStore')
    useAppStore.setState({
      activeSessionId: 'cowork-session',
      sessions: [{ id: 'cowork-session', title: 'Cowork', model: '', createdAt: 1, updatedAt: 1 }],
    })

    const codeSessionId = useAppStore.getState().createCodeSession()

    expect(useAppStore.getState().activeSessionId).toBe('cowork-session')
    expect(useAppStore.getState().codeActiveSessionId).toBe(codeSessionId)
    expect(useAppStore.getState().codeSessionIds).toContain(codeSessionId)
  })

  it('removes deleted Code sessions from Code-only state without changing Cowork selection', async () => {
    const { useAppStore } = await import('../src/stores/appStore')
    useAppStore.setState({
      sessions: [
        { id: 'cowork-session', title: 'Cowork', model: '', createdAt: 1, updatedAt: 1 },
        { id: 'code-session', title: 'Code', model: '', createdAt: 1, updatedAt: 1 },
      ],
      activeSessionId: 'cowork-session',
      codeActiveSessionId: 'code-session',
      codeSessionIds: ['code-session'],
      sessionMessages: { 'cowork-session': [], 'code-session': [] },
    })

    useAppStore.getState().deleteSession('code-session')

    expect(useAppStore.getState().activeSessionId).toBe('cowork-session')
    expect(useAppStore.getState().codeActiveSessionId).toBeNull()
    expect(useAppStore.getState().codeSessionIds).not.toContain('code-session')
    expect(useAppStore.getState().sessionMessages).not.toHaveProperty('code-session')
  })
})
