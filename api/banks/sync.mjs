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
    if (connection.provider !== 'everypay') throw new Error('Unsupported bank provider')

    const { data: workspace, error: workspaceError } = await client
      .from('workspaces')
      .select('id,kind')
      .eq('id', connection.workspace_id)
      .single()
    if (workspaceError) throw workspaceError

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

    let imported = 0
    let pendingStatements = 0
    const now = new Date()

    for (const link of links || []) {
      const from = link.last_synced_at
        ? new Date(link.last_synced_at)
        : connection.connected_at
          ? new Date(connection.connected_at)
          : new Date(Date.now() - 24 * 60 * 60 * 1000)
      // A small overlap makes sync resilient to delayed booking; deduplication prevents repeats.
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
                workspace_id: connection.workspace_id,
                account_id: link.account_id,
                amount_minor: signedMinor,
                currency,
                transaction_type: isCredit ? 'income' : 'expense',
                context: workspace.kind,
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
