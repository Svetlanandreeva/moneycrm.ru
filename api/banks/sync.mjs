import {
  decryptToken,
  encryptToken,
  everypayRefresh,
  everypayStatement,
  requireUser,
  serviceClient,
  toMinorAmount,
  transactionCounterparty,
} from '../../server/banks.mjs'

async function syncDemo(connection, user) {
  const admin = serviceClient()
  const now = new Date()
  const { data: links, error: linksError } = await admin
    .from('bank_account_links')
    .select('id,account_id,currency')
    .eq('connection_id', connection.id)
    .limit(1)
  if (linksError) throw linksError
  const link = links?.[0]
  if (!link) return { imported: 0, pendingStatements: 0 }

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('id,workspace_id')
    .eq('id', link.account_id)
    .single()
  if (accountError) throw accountError
  const { data: workspace, error: workspaceError } = await admin
    .from('workspaces')
    .select('id,kind')
    .eq('id', account.workspace_id)
    .single()
  if (workspaceError) throw workspaceError

  const hourKey = now.toISOString().slice(0, 13).replace(/[-T:]/g, '')
  const externalId = `demo-sync-${connection.id}-${hourKey}`
  const { data: existing, error: existingError } = await admin
    .from('transactions')
    .select('id')
    .eq('account_id', account.id)
    .eq('external_id', externalId)
    .eq('source', 'bank')
    .maybeSingle()
  if (existingError) throw existingError

  let imported = 0
  let transactionId = existing?.id || null
  if (!transactionId) {
    const { data: tx, error: txError } = await admin
      .from('transactions')
      .insert({
        workspace_id: account.workspace_id,
        account_id: account.id,
        amount_minor: -49900,
        currency: link.currency || 'RUB',
        transaction_type: 'expense',
        context: workspace.kind,
        counterparty: 'Тестовая покупка',
        note: 'Новая операция из браузерной синхронизации',
        occurred_at: now.toISOString(),
        source: 'bank',
        external_id: externalId,
        status: 'posted',
        created_by: user.id,
      })
      .select('id')
      .single()
    if (txError) throw txError
    transactionId = tx.id
    imported = 1
  }

  const { error: importError } = await admin
    .from('bank_transaction_imports')
    .upsert({
      bank_account_link_id: link.id,
      external_transaction_id: externalId,
      amount_minor: -49900,
      currency: link.currency || 'RUB',
      direction: 'debit',
      posted_at: now.toISOString(),
      description: 'Новая операция из браузерной синхронизации',
      merchant_name: 'Тестовая покупка',
      import_status: 'imported',
      matched_transaction_id: transactionId,
      raw_data: { demo: true, synced: true },
      updated_at: now.toISOString(),
    }, { onConflict: 'bank_account_link_id,external_transaction_id' })
  if (importError) throw importError

  await admin.from('bank_account_links').update({ last_synced_at: now.toISOString() }).eq('connection_id', connection.id)
  await admin.from('bank_connections').update({
    last_sync_started_at: now.toISOString(),
    last_synced_at: now.toISOString(),
    status: 'active',
    error_message: null,
  }).eq('id', connection.id)

  return { imported, pendingStatements: 0 }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { user, client } = await requireUser(req)
    const connectionId = String(req.body?.connectionId || '')
    if (!connectionId) {
      res.status(400).json({ error: 'connectionId is required' })
      return
    }

    const { data: connection, error: connectionError } = await client
      .from('bank_connections')
      .select('id,workspace_id,provider,status,connected_at,last_synced_at,provider_bank_code')
      .eq('id', connectionId)
      .single()
    if (connectionError) throw connectionError

    if (connection.provider === 'demo') {
      const result = await syncDemo(connection, user)
      res.status(200).json(result)
      return
    }
    if (connection.provider !== 'everypay') throw new Error('Unsupported bank provider')

    const admin = serviceClient()
    const { data: stored, error: storedError } = await admin
      .from('bank_connection_tokens')
      .select('access_token_encrypted,refresh_token_encrypted,expires_at')
      .eq('connection_id', connectionId)
      .single()
    if (storedError) throw storedError

    let accessToken = decryptToken(stored.access_token_encrypted)
    let refreshToken = stored.refresh_token_encrypted ? decryptToken(stored.refresh_token_encrypted) : null
    const expiring = !stored.expires_at || new Date(stored.expires_at).getTime() < Date.now() + 60_000
    if (expiring) {
      if (!refreshToken) throw new Error('Bank authorization expired. Reconnect the bank.')
      const refreshed = await everypayRefresh(refreshToken)
      accessToken = refreshed.access_token
      refreshToken = refreshed.refresh_token || refreshToken
      const expiresAt = refreshed.expires_in
        ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
        : null
      const { error } = await admin
        .from('bank_connection_tokens')
        .update({
          access_token_encrypted: encryptToken(accessToken),
          refresh_token_encrypted: refreshToken ? encryptToken(refreshToken) : null,
          expires_at: expiresAt,
          token_type: refreshed.token_type || 'Bearer',
          updated_at: new Date().toISOString(),
        })
        .eq('connection_id', connectionId)
      if (error) throw error
    }

    await admin
      .from('bank_connections')
      .update({ last_sync_started_at: new Date().toISOString(), status: 'active', error_message: null })
      .eq('id', connectionId)

    const { data: links, error: linksError } = await admin
      .from('bank_account_links')
      .select('id,account_id,external_account_id,last_synced_at,currency')
      .eq('connection_id', connectionId)
    if (linksError) throw linksError

    const accountIds = (links || []).map(link => link.account_id)
    const { data: accountRows, error: accountRowsError } = accountIds.length
      ? await admin.from('accounts').select('id,workspace_id').in('id', accountIds)
      : { data: [], error: null }
    if (accountRowsError) throw accountRowsError

    const workspaceIds = [...new Set((accountRows || []).map(account => account.workspace_id))]
    const { data: workspaceRows, error: workspaceRowsError } = workspaceIds.length
      ? await admin.from('workspaces').select('id,kind').in('id', workspaceIds)
      : { data: [], error: null }
    if (workspaceRowsError) throw workspaceRowsError

    const accountWorkspace = new Map((accountRows || []).map(account => [account.id, account.workspace_id]))
    const workspaceKind = new Map((workspaceRows || []).map(workspace => [workspace.id, workspace.kind]))

    let imported = 0
    let pendingStatements = 0
    const now = new Date()

    for (const link of links || []) {
      const currentWorkspaceId = accountWorkspace.get(link.account_id)
      const currentContext = currentWorkspaceId ? workspaceKind.get(currentWorkspaceId) : null
      if (!currentWorkspaceId || !currentContext) continue

      const from = link.last_synced_at
        ? new Date(link.last_synced_at)
        : connection.connected_at
          ? new Date(connection.connected_at)
          : new Date(Date.now() - 24 * 60 * 60 * 1000)
      from.setMinutes(from.getMinutes() - 10)

      const statement = await everypayStatement(accessToken, link.external_account_id, from.toISOString(), now.toISOString(), req)
      if (statement.pending) {
        pendingStatements += 1
        continue
      }

      for (const tx of statement.transactions) {
        const externalId = String(tx.transactionId || tx.documentNumber || '')
        if (!externalId) continue
        const rawMinor = Math.abs(toMinorAmount(tx?.Amount?.amount || 0))
        if (!rawMinor) continue
        const isCredit = String(tx.creditDebitIndicator || '').toLowerCase() === 'credit'
        const signedMinor = isCredit ? rawMinor : -rawMinor
        const occurredAt = tx.bookingDateTime || tx.valueDateTime || now.toISOString()
        const currency = tx?.Amount?.currency || link.currency || 'RUB'
        const counterparty = transactionCounterparty(tx)

        const { data: importRow, error: importError } = await admin
          .from('bank_transaction_imports')
          .upsert({
            bank_account_link_id: link.id,
            external_transaction_id: externalId,
            amount_minor: signedMinor,
            currency,
            direction: isCredit ? 'credit' : 'debit',
            posted_at: occurredAt,
            description: tx.description || null,
            merchant_name: counterparty,
            import_status: 'imported',
            raw_data: tx,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'bank_account_link_id,external_transaction_id' })
          .select('id,matched_transaction_id')
          .single()
        if (importError) throw importError

        let transactionId = importRow.matched_transaction_id
        if (!transactionId) {
          const { data: existingTx, error: existingTxError } = await admin
            .from('transactions')
            .select('id')
            .eq('account_id', link.account_id)
            .eq('external_id', externalId)
            .eq('source', 'bank')
            .maybeSingle()
          if (existingTxError) throw existingTxError

          if (existingTx) {
            transactionId = existingTx.id
          } else {
            const { data: createdTx, error: txError } = await admin
              .from('transactions')
              .insert({
                workspace_id: currentWorkspaceId,
                account_id: link.account_id,
                amount_minor: signedMinor,
                currency,
                transaction_type: isCredit ? 'income' : 'expense',
                context: currentContext,
                counterparty,
                note: tx.description || null,
                occurred_at: occurredAt,
                source: 'bank',
                external_id: externalId,
                status: 'posted',
                created_by: user.id,
              })
              .select('id')
              .single()
            if (txError) throw txError
            transactionId = createdTx.id
            imported += 1
          }

          const { error: matchError } = await admin
            .from('bank_transaction_imports')
            .update({ matched_transaction_id: transactionId, import_status: 'imported', updated_at: new Date().toISOString() })
            .eq('id', importRow.id)
          if (matchError) throw matchError
        }
      }

      const { error: linkUpdateError } = await admin
        .from('bank_account_links')
        .update({ last_synced_at: now.toISOString() })
        .eq('id', link.id)
      if (linkUpdateError) throw linkUpdateError
    }

    await admin
      .from('bank_connections')
      .update({
        last_synced_at: pendingStatements ? connection.last_synced_at : now.toISOString(),
        status: 'active',
        error_message: null,
      })
      .eq('id', connectionId)

    res.status(200).json({ imported, pendingStatements })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bank sync failed'
    res.status(message === 'Unauthorized' ? 401 : 500).json({ error: message })
  }
}
