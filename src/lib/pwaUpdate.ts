let available = false
let updater: (() => Promise<void>) | undefined
const listeners = new Set<() => void>()
export const updateAvailable = () => available
export const subscribeUpdates = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const configureUpdater = (action: () => Promise<void>) => { updater = action }
export const markUpdateAvailable = () => { available = true; listeners.forEach((listener) => listener()) }
export const applyAppUpdate = async () => { if (!updater) throw new Error('Update is not ready.'); await updater() }
