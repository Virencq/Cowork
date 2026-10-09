import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CoworkProject {
  id: string
  name: string
  path?: string
  instructions?: string
  createdAt: number
  updatedAt: number
}

export interface CoworkArtifact {
  id: string
  name: string
  type?: string
  path?: string
  content?: string
  sessionId?: string
  createdAt: number
  updatedAt: number
}

interface WorkspaceLibraryState {
  projects: CoworkProject[]
  artifacts: CoworkArtifact[]
  pinnedProjectIds: string[]
  pinnedArtifactIds: string[]
  addProject: (project: Omit<CoworkProject, 'id' | 'createdAt' | 'updatedAt'>) => void
  upsertProject: (project: CoworkProject) => void
  updateProject: (id: string, updates: Partial<Omit<CoworkProject, 'id' | 'createdAt'>>) => void
  removeProject: (id: string) => void
  addArtifact: (artifact: Omit<CoworkArtifact, 'id' | 'createdAt' | 'updatedAt'>) => string
  upsertArtifact: (artifact: CoworkArtifact) => void
  removeArtifact: (id: string) => void
  toggleProjectPin: (id: string) => void
  toggleArtifactPin: (id: string) => void
  importBundle: (bundle: {
    projects?: Partial<CoworkProject>[]
    artifacts?: Partial<CoworkArtifact>[]
  }) => { projects: number; artifacts: number }
}

const id = () => Math.random().toString(36).slice(2, 12)

export const useWorkspaceStore = create<WorkspaceLibraryState>()(
  persist(
    (set) => ({
      projects: [],
      artifacts: [],
      pinnedProjectIds: [],
      pinnedArtifactIds: [],
      addProject: (project) => set((s) => {
        const now = Date.now()
        return { projects: [...s.projects, { ...project, id: id(), createdAt: now, updatedAt: now }] }
      }),
      upsertProject: (project) => set((s) => ({
        projects: s.projects.some((p) => p.id === project.id)
          ? s.projects.map((p) => p.id === project.id ? project : p)
          : [...s.projects, project],
      })),
      updateProject: (id, updates) => set((s) => ({
        projects: s.projects.map((p) => p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p),
      })),
      removeProject: (id) => set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        pinnedProjectIds: s.pinnedProjectIds.filter((item) => item !== id),
      })),
      addArtifact: (artifact) => {
        const artifactId = id()
        const now = Date.now()
        set((s) => ({ artifacts: [...s.artifacts, { ...artifact, id: artifactId, createdAt: now, updatedAt: now }] }))
        return artifactId
      },
      upsertArtifact: (artifact) => set((s) => ({
        artifacts: s.artifacts.some((a) => a.id === artifact.id)
          ? s.artifacts.map((a) => a.id === artifact.id ? artifact : a)
          : [...s.artifacts, artifact],
      })),
      removeArtifact: (id) => set((s) => ({
        artifacts: s.artifacts.filter((a) => a.id !== id),
        pinnedArtifactIds: s.pinnedArtifactIds.filter((item) => item !== id),
      })),
      toggleProjectPin: (id) => set((s) => ({
        pinnedProjectIds: s.pinnedProjectIds.includes(id)
          ? s.pinnedProjectIds.filter((item) => item !== id)
          : [...s.pinnedProjectIds, id],
      })),
      toggleArtifactPin: (id) => set((s) => ({
        pinnedArtifactIds: s.pinnedArtifactIds.includes(id)
          ? s.pinnedArtifactIds.filter((item) => item !== id)
          : [...s.pinnedArtifactIds, id],
      })),
      importBundle: (bundle) => {
        const now = Date.now()
        const projects = (bundle.projects || []).map((p) => ({
          id: p.id || id(), name: p.name || 'Imported project', path: p.path,
          instructions: p.instructions, createdAt: p.createdAt || now, updatedAt: p.updatedAt || now,
        }))
        const artifacts = (bundle.artifacts || []).map((a) => ({
          id: a.id || id(), name: a.name || 'Imported artifact', type: a.type,
          path: a.path, content: a.content, sessionId: a.sessionId, createdAt: a.createdAt || now, updatedAt: a.updatedAt || now,
        }))
        set((s) => ({
          projects: [...s.projects.filter((p) => !projects.some((x) => x.id === p.id)), ...projects],
          artifacts: [...s.artifacts.filter((a) => !artifacts.some((x) => x.id === a.id)), ...artifacts],
          pinnedProjectIds: s.pinnedProjectIds.filter((id) => !projects.some((p) => p.id === id)).concat(projects.filter((p) => s.pinnedProjectIds.includes(p.id)).map((p) => p.id)),
          pinnedArtifactIds: s.pinnedArtifactIds.filter((id) => !artifacts.some((a) => a.id === id)).concat(artifacts.filter((a) => s.pinnedArtifactIds.includes(a.id)).map((a) => a.id)),
        }))
        return { projects: projects.length, artifacts: artifacts.length }
      },
    }),
    {
      name: 'cowork-workspace-library',
      partialize: (state) => ({
        projects: state.projects,
        artifacts: state.artifacts,
        pinnedProjectIds: state.pinnedProjectIds,
        pinnedArtifactIds: state.pinnedArtifactIds,
      }),
    },
  ),
)
