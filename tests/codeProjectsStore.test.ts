// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from '../src/stores/workspaceStore'

describe('Code project library', () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkspaceStore.setState({
      projects: [],
      codeProjects: [],
      activeCodeProjectId: null,
      artifacts: [],
      pinnedProjectIds: [],
      pinnedArtifactIds: [],
    })
  })

  it('creates an independent Code project and selects it', () => {
    const id = useWorkspaceStore.getState().addCodeProject({
      name: 'JCode',
      path: 'C:\\work\\jcode',
    })
    const state = useWorkspaceStore.getState()

    expect(state.activeCodeProjectId).toBe(id)
    expect(state.codeProjects).toHaveLength(1)
    expect(state.codeProjects[0]).toMatchObject({
      id,
      name: 'JCode',
      path: 'C:\\work\\jcode',
    })
    expect(state.projects).toEqual([])
  })

  it('renames a Code project without changing its folder or chat identity', () => {
    const id = useWorkspaceStore.getState().addCodeProject({
      name: 'Old name',
      path: 'C:\\work\\repo',
      sessionId: 'code-session',
    })
    const before = useWorkspaceStore.getState().codeProjects[0]

    useWorkspaceStore.getState().updateCodeProject(id, { name: 'New name' })

    expect(useWorkspaceStore.getState().codeProjects[0]).toMatchObject({
      id,
      name: 'New name',
      path: before.path,
      sessionId: 'code-session',
    })
  })

  it('selects another project when the active project is removed', () => {
    const store = useWorkspaceStore.getState()
    const firstId = store.addCodeProject({ name: 'First', path: 'C:\\work\\first' })
    const secondId = useWorkspaceStore.getState().addCodeProject({ name: 'Second', path: 'C:\\work\\second' })

    useWorkspaceStore.getState().removeCodeProject(secondId)

    expect(useWorkspaceStore.getState().activeCodeProjectId).toBe(firstId)
    expect(useWorkspaceStore.getState().codeProjects.map((project) => project.id)).toEqual([firstId])
  })
})
