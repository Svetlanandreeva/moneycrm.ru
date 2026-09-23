import { importOzonStatement, type OzonAccountMeta } from './ozonStatement'
import { syncOzonAccountMetadata, type OzonDiscoveredAccountMeta } from './ozonAccounts'

export async function importOzonBridgeText(input: {
  workspaceId: string
  text: string
  accountName?: string
  fromDate?: string | null
  accountMeta?: (OzonAccountMeta & { accounts?: OzonDiscoveredAccountMeta[]; apiVerified?: boolean }) | null
}) {
  const discoveredAccounts = Array.isArray(input.accountMeta?.accounts)
    ? input.accountMeta!.accounts!.filter(account => account?.apiVerified === true)
    : []

  const metadata = discoveredAccounts.length
    ? await syncOzonAccountMetadata({
        workspaceId: input.workspaceId,
        accounts: discoveredAccounts,
        fromDate: input.fromDate,
      })
    : { synced: 0 }

  const requestedMask = input.accountMeta?.accountMask?.replace(/\D/g, '').slice(-4) || null
  const requestedId = input.accountMeta?.externalAccountId?.trim() || null
  const verifiedCurrent = discoveredAccounts.find(account =>
    (requestedId && account.externalAccountId === requestedId) ||
    (requestedMask && account.accountMask?.replace(/\D/g, '').slice(-4) === requestedMask)
  ) || (discoveredAccounts.length === 1 ? discoveredAccounts[0] : null)

  if (!input.text.trim() || !verifiedCurrent) {
    return {
      imported: 0,
      duplicates: 0,
      total: 0,
      accountType: verifiedCurrent?.accountType || 'bank',
      accountName: verifiedCurrent?.accountName || 'Ozon Банк',
      syncedAccounts: metadata.synced,
    }
  }

  const file = new File([input.text], `ozon-live-${new Date().toISOString().slice(0, 10)}.txt`, {
    type: 'text/plain',
  })

  const result = await importOzonStatement({
    workspaceId: input.workspaceId,
    file,
    accountName: verifiedCurrent.accountName || input.accountName,
    fromDate: input.fromDate,
    accountMeta: verifiedCurrent,
  })

  return { ...result, syncedAccounts: metadata.synced }
}
