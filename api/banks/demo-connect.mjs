import { requireUser } from '../../server/banks.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { user, client } = await requireUser(req)
    const { connectionId, token } = req.body || {}
    if (!connectionId || !token) throw new Error('Тестовое подключение устарело. Запустите его ещё раз из MoneyCRM.')

    const { data: connection, error: connectionError } = await client
      .from('bank_connections')
      .select('id,workspace_id,provider_connection_id,status,created_by,created_at')
      .eq('id', connectionId)
      .eq('provider', 'demo')
      .eq('created_by', user.id)
      .single()
    if (connectionError) throw connectionError
    if (connection.provider_connection_id !== token) throw new Error('Неверный код тестового подключения')
    if (connection.status === 'revoked') throw new Error('Тестовое подключение уже отключено')

    const { data: workspace, error: workspaceError } = await client.from('workspaces').select('id,kind').eq('id', connection.workspace_id).single()
    if (workspaceError) throw workspaceError

    const { data: existingLinks, error: existingLinksError } = await client.from('bank_account_links').select('id').eq('connection_id', connectionId).limit(1)
    if (existingLinksError) throw existingLinksError

    const now = new Date()
    if (!(existingLinks || []).length) {
      const accountType = workspace.kind === 'business' ? 'business' : 'bank'
      const defs = [
        { name: 'Тестовая карта •• 4242', external: 'demo-card-4242', mask: '•••• 4242' },
        { name: 'Тестовый накопительный •• 8080', external: 'demo-save-8080', mask: '•••• 8080' },
      ]
      const created = []
      for (const item of defs) {
        const { data: account, error: accountError } = await client.from('accounts').insert({ workspace_id: workspace.id, name: item.name, account_type: accountType, currency: 'RUB', opening_balance_minor: 0, institution: 'Тестовый банк', created_by: user.id }).select('id').single()
        if (accountError) throw accountError
        const { data: link, error: linkError } = await client.from('bank_account_links').insert({ connection_id: connectionId, account_id: account.id, external_account_id: item.external, external_name: item.name, account_mask: item.mask, currency: 'RUB', last_synced_at: now.toISOString() }).select('id').single()
        if (linkError) throw linkError
        created.push({ ...item, accountId: account.id, linkId: link.id })
      }
      const seed = [
        { account: 0, amount: 12000000, type: 'income', who: 'Тестовое поступление', note: 'Импорт из тестового банка', days: 3 },
        { account: 0, amount: -935000, type: 'expense', who: 'Супермаркет', note: 'Покупка по карте', days: 2 },
        { account: 0, amount: -249000, type: 'expense', who: 'Кофейня', note: 'Покупка по карте', days: 1 },
        { account: 1, amount: 3000000, type: 'income', who: 'Пополнение накоплений', note: 'Импорт из тестового банка', days: 1 },
      ]
      for (let i = 0; i < seed.length; i += 1) {
        const item = seed[i], target = created[item.account]
        const occurredAt = new Date(now.getTime() - item.days * 86400000).toISOString()
        const externalId = `demo-seed-${connectionId}-${i + 1}`
        const { data: tx, error: txError } = await client.from('transactions').insert({ workspace_id: workspace.id, account_id: target.accountId, amount_minor: item.amount, currency: 'RUB', transaction_type: item.type, context: workspace.kind, counterparty: item.who, note: item.note, occurred_at: occurredAt, source: 'bank', external_id: externalId, status: 'posted', created_by: user.id }).select('id').single()
        if (txError) throw txError
        const { error: importError } = await client.from('bank_transaction_imports').insert({ bank_account_link_id: target.linkId, external_transaction_id: externalId, amount_minor: item.amount, currency: 'RUB', direction: item.amount > 0 ? 'credit' : 'debit', posted_at: occurredAt, description: item.note, merchant_name: item.who, import_status: 'imported', matched_transaction_id: tx.id, raw_data: { demo: true } })
        if (importError) throw importError
      }
    }

    const { error: updateError } = await client.from('bank_connections').update({ status: 'active', institution_name: 'Тестовый банк', connected_at: now.toISOString(), last_synced_at: now.toISOString(), error_message: null }).eq('id', connectionId)
    if (updateError) throw updateError
    res.status(200).json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось подключить тестовый банк'
    res.status(message === 'Unauthorized' ? 401 : 500).json({ error: message })
  }
}
