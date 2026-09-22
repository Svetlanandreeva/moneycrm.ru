import { listBankConnections, syncBankConnection } from './bankConnections'

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000
let running: Promise<AutoSyncResult> | null = null

export type AutoSyncResult = {
  checked: number
  synced: number
  imported: number
  pendingStatements: number
  failed: number
}

function isStale(lastSyncedAt: string | null, maxAgeMs: number) {
  if (!lastSyncedAt) return true
  const time = new Date(lastSyncedAt).getTime()
  return !Number.isFinite(time) || Date.now() - time >= maxAgeMs
}

export function syncStaleBankConnections(maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<AutoSyncResult> {
  if (running) return running

  running = (async () => {
    const state = await listBankConnections()
    const candidates = state.connections.filter(connection =>
      connection.status === 'active' && isStale(connection.last_synced_at, maxAgeMs),
    )

    const result: AutoSyncResult = {
      checked: state.connections.length,
      synced: 0,
      imported: 0,
      pendingStatements: 0,
      failed: 0,
    }

    for (const connection of candidates) {
      try {
        const sync = await syncBankConnection(connection.id)
        result.synced += 1
        result.imported += Number(sync.imported || 0)
        result.pendingStatements += Number(sync.pendingStatements || 0)
      } catch {
        result.failed += 1
      }
    }

    return result
  })().finally(() => {
    running = null
  })

  return running
}
