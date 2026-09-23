import { importOzonStatement } from './ozonStatement'

export async function importOzonBridgeText(input: {
  workspaceId: string
  text: string
  accountName?: string
}) {
  const file = new File([input.text], `ozon-live-${new Date().toISOString().slice(0, 10)}.txt`, {
    type: 'text/plain',
  })

  return importOzonStatement({
    workspaceId: input.workspaceId,
    file,
    accountName: input.accountName,
  })
}
