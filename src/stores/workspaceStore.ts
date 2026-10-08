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
  createdAt: number
  updatedAt: number
}

interface WorkspaceLibraryState {
  projects: CoworkProject[]
  artifacts: CoworkArtifact[]
  addProject: (project: Omit<CoworkProject, 'id' | 'createdAt' | 'updatedAt'>) => void
  upsertProject: (project: CoworkProject) => void
  updateProject: (id: string, updates: Partial<Omit<CoworkProject, 'id' | 'createdAt'>>) => void
  addArtifact: (artifact: Omit<CoworkArtifact, 'id' | 'createdAt' | 'updatedAt'>) => void
  upsertArtifact: (artifact: CoworkArtifact) => void
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
      addArtifact: (artifact) => set((s) => {
        const now = Date.now()
        return { artifacts: [...s.artifacts, { ...artifact, id: id(), createdAt: now, updatedAt: now }] }
      }),
      upsertArtifact: (artifact) => set((s) => ({
        artifacts: s.artifacts.some((a) => a.id === artifact.id)
          ? s.artifacts.map((a) => a.id === artifact.id ? artifact : a)
          : [...s.artifacts, artifact],
      })),
      importBundle: (bundle) => {
        const now = Date.now()
        const projects = (bundle.projects || []).map((p) => ({
          id: p.id || id(), name: p.name || 'Imported project', path: p.path,
          instructions: p.instructions, createdAt: p.createdAt || now, updatedAt: p.updatedAt || now,
        }))
        const artifacts = (bundle.artifacts || []).map((a) => ({
          id: a.id || id(), name: a.name || 'Imported artifact', type: a.type,
          path: a.path, content: a.content, createdAt: a.createdAt || now, updatedAt: a.updatedAt || now,
        }))
        set((s) => ({
          projects: [...s.projects.filter((p) => !projects.some((x) => x.id === p.id)), ...projects],
          artifacts: [...s.artifacts.filter((a) => !artifacts.some((x) => x.id === a.id)), ...artifacts],
        }))
        return { projects: projects.length, artifacts: artifacts.length }
      },
    }),
    { name: 'cowork-workspace-library' },
  ),
)
