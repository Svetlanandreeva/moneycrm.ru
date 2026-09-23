import { importOzonStatement, type OzonAccountMeta } from './ozonStatement'
import { syncOzonAccountMetadata, type OzonDiscoveredAccountMeta } from './ozonAccounts'

export async function importOzonBridgeText(input: {
  workspaceId: string
  text: string
  accountName?: string
  fromDate?: string | null
  accountMeta?: (OzonAccountMeta & { accounts?: OzonDiscoveredAccountMeta[] }) | null
}) {
  const discoveredAccounts = Array.isArray(input.accountMeta?.accounts)
    ? input.accountMeta!.accounts!
    : []

  if (discoveredAccounts.length) {
    await syncOzonAccountMetadata({
      workspaceId: input.workspaceId,
      accounts: discoveredAccounts,
      fromDate: input.fromDate,
    })
  }

  const currentMeta = input.accountMeta
    ? Object.fromEntries(Object.entries(input.accountMeta).filter(([key]) => key !== 'accounts')) as OzonAccountMeta
    : null

  const file = new File([input.text], `ozon-live-${new Date().toISOString().slice(0, 10)}.txt`, {
    type: 'text/plain',
  })

  return importOzonStatement({
    workspaceId: input.workspaceId,
    file,
    accountName: input.accountName,
    fromDate: input.fromDate,
    accountMeta: currentMeta,
  })
}
