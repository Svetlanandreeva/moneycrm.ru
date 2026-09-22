import {
  accountDisplayName,
  appOrigin,
  decryptJson,
  encryptToken,
  everypayAccounts,
  everypayBalance,
  everypayExchangeCode,
  maskAccountIdentification,
  serviceClient,
} from '../../server/banks.mjs'

function redirect(res, origin, params) {
  const url = new URL(origin)
  url.search = new URLSearchParams(params).toString()
  res.writeHead(302, { Location: url.toString() })
  res.end()
}

export default async function handler(req, res) {
  const origin = appOrigin(req)
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed')
    return
  }

  try {
    if (req.query?.error) throw new Error(String(req.query.error_description || req.query.error))
    const code = String(req.query?.code || '')
    const encryptedState = String(req.query?.state || '')
    if (!code || !encryptedState) throw new Error('Bank authorization response is incomplete')

    const state = decryptJson(encryptedState)
    if (!state?.userId || !state?.workspaceId || !state?.bankCode || !state?.verifier || !state?.redirectUri) {
      throw new Error('Invalid bank authorization state')
    }
    if (Number(state.exp || 0) < Date.now()) throw new Error('Bank authorization expired. Please connect again.')

    const token = await everypayExchangeCode({
      code,
      verifier: state.verifier,
      redirectUri: state.redirectUri,
    })
    const admin = serviceClient()

    const { data: membership, error: membershipError } = await admin
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', state.workspaceId)
      .eq('user_id', state.userId)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership) throw new Error('Family/personal money space access changed during connection')

    const { data: workspace, error: workspaceError } = await admin
      .from('workspaces')
      .select('id,kind')
      .eq('id', state.workspaceId)
      .single()
    if (workspaceError) throw workspaceError

    const { data: existing, error: existingError } = await admin
      .from('bank_connections')
      .select('id')
      .eq('workspace_id', state.workspaceId)
      .eq('provider', 'everypay')
      .eq('provider_bank_code', state.bankCode)
      .neq('status', 'revoked')
      .maybeSingle()
    if (existingError) throw existingError

    let connectionId = existing?.id
    if (connectionId) {
      const { error } = await admin
        .from('bank_connections')
        .update({
          status: 'active',
          institution_name: state.bankCode,
          connected_at: new Date().toISOString(),
          error_message: null,
          created_by: state.userId,
        })
        .eq('id', connectionId)
      if (error) throw error
    } else {
      const { data, error } = await admin
        .from('bank_connections')
        .insert({
          workspace_id: state.workspaceId,
          provider: 'everypay',
          provider_bank_code: state.bankCode,
          institution_name: state.bankCode,
          status: 'active',
          connected_at: new Date().toISOString(),
          created_by: state.userId,
        })
        .select('id')
        .single()
      if (error) throw error
      connectionId = data.id
    }

    const expiresAt = token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null
    const { error: tokenError } = await admin
      .from('bank_connection_tokens')
      .upsert({
        connection_id: connectionId,
        access_token_encrypted: encryptToken(token.access_token),
        refresh_token_encrypted: token.refresh_token ? encryptToken(token.refresh_token) : null,
        expires_at: expiresAt,
        token_type: token.token_type || 'Bearer',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'connection_id' })
    if (tokenError) throw tokenError

    const accounts = await everypayAccounts(token.access_token, req)
    for (const external of accounts) {
      const externalAccountId = String(external.accountId || '')
      if (!externalAccountId) continue

      const balance = await everypayBalance(token.access_token, externalAccountId, req).catch(() => ({
        amountMinor: 0,
        currency: external.currency || 'RUB',
      }))
      const displayName = accountDisplayName(external, state.bankCode)
      const mask = maskAccountIdentification(external)

      const { data: link, error: linkError } = await admin
        .from('bank_account_links')
        .select('id,account_id')
        .eq('connection_id', connectionId)
        .eq('external_account_id', externalAccountId)
        .maybeSingle()
      if (linkError) throw linkError

      if (link) {
        const { error } = await admin
          .from('bank_account_links')
          .update({
            external_name: displayName,
            account_mask: mask,
            currency: external.currency || balance.currency || 'RUB',
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', link.id)
        if (error) throw error
        continue
      }

      const { data: moneyAccount, error: accountError } = await admin
        .from('accounts')
        .insert({
          workspace_id: state.workspaceId,
          name: displayName,
          account_type: workspace.kind === 'business' ? 'business' : 'bank',
          currency: external.currency || balance.currency || 'RUB',
          opening_balance_minor: balance.amountMinor,
          institution: state.bankCode,
          created_by: state.userId,
        })
        .select('id')
        .single()
      if (accountError) throw accountError

      const { error: newLinkError } = await admin
        .from('bank_account_links')
        .insert({
          connection_id: connectionId,
          account_id: moneyAccount.id,
          external_account_id: externalAccountId,
          external_name: displayName,
          account_mask: mask,
          currency: external.currency || balance.currency || 'RUB',
          last_synced_at: new Date().toISOString(),
        })
      if (newLinkError) throw newLinkError
    }

    await admin
      .from('bank_connections')
      .update({ last_synced_at: new Date().toISOString(), status: 'active', error_message: null })
      .eq('id', connectionId)

    redirect(res, `${origin}/`, { bank: 'connected', bankCode: state.bankCode })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bank connection failed'
    redirect(res, `${origin}/`, { bank: 'error', reason: message.slice(0, 180) })
  }
}
