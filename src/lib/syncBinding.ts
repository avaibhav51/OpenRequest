export interface SyncWorkspaceBinding {
  id: 'primary'
  localWorkspaceId: string
  ownerId: string
  remoteWorkspaceId: string
  state: 'active'
  createdAt: number
  updatedAt: number
}

export const createSyncWorkspaceBinding = (
  localWorkspaceId: string,
  ownerId: string,
  remoteWorkspaceId: string,
  now = Date.now(),
): SyncWorkspaceBinding => {
  if (!localWorkspaceId.trim() || !ownerId.trim() || !remoteWorkspaceId.trim()) throw new Error('A local workspace, remote workspace, and signed-in owner are required.')
  return { id: 'primary', localWorkspaceId, ownerId, remoteWorkspaceId, state: 'active', createdAt: now, updatedAt: now }
}

export const assertSyncWorkspaceOwner = (binding: SyncWorkspaceBinding | undefined, currentOwnerId: string | undefined) => {
  if (!binding) throw new Error('Synchronization has not been explicitly prepared for this local workspace.')
  if (!currentOwnerId || binding.ownerId !== currentOwnerId) {
    throw new Error('This local workspace is bound to a different account. Synchronization remains paused.')
  }
  return binding
}
