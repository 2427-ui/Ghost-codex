import { contextBridge, ipcRenderer } from 'electron'
import type { GhostApi, StudioEvent } from '../shared/types'

const invoke = (method: string, ...args: unknown[]) => ipcRenderer.invoke(`ghost:${method}`, ...args)
const api: GhostApi = {
  snapshot: () => invoke('snapshot'), settings: patch => invoke('settings', patch),
  chooseCodex: () => invoke('chooseCodex'), connect: () => invoke('connect'),
  login: () => invoke('login'), cancelLogin: () => invoke('cancelLogin'), refreshAccount: () => invoke('refreshAccount'),
  addProject: () => invoke('addProject'), createSession: id => invoke('createSession', id), history: id => invoke('history', id),
  syncHistory: () => invoke('syncHistory'),
  send: (id, text, options) => invoke('send', id, text, options), interrupt: () => invoke('interrupt'), decide: (id, decision) => invoke('decide', id, decision),
  chooseAttachments: () => invoke('chooseAttachments'), capability: (method, params) => invoke('capability', method, params),
  tree: (id, path) => invoke('tree', id, path), read: (id, path) => invoke('read', id, path), save: (id, doc) => invoke('save', id, doc),
  git: id => invoke('git', id), diff: (id, path, staged) => invoke('diff', id, path, staged), draft: (id, text) => invoke('draft', id, text),
  editorDirty: value => invoke('editorDirty', value),
  petLayout: expanded => invoke('petLayout', expanded), petInteractive: value => invoke('petInteractive', value),
  petDrag: phase => invoke('petDrag', phase), petSend: text => invoke('petSend', text),
  window: action => invoke('window', action), openExternal: url => invoke('openExternal', url),
  subscribe(callback) {
    const listener = (_event: Electron.IpcRendererEvent, value: StudioEvent) => callback(value)
    ipcRenderer.on('ghost:event', listener)
    const collapse = () => callback({ type: 'pet-collapse' })
    ipcRenderer.on('ghost:pet-collapse', collapse)
    return () => { ipcRenderer.removeListener('ghost:event', listener); ipcRenderer.removeListener('ghost:pet-collapse', collapse) }
  }
}
contextBridge.exposeInMainWorld('ghost', api)
