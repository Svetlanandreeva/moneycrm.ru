import {
  appOrigin,
  bankRuntimeConfigured,
  createPkce,
  encryptJson,
  everypayAuthorizeUrl,
  everypayThirdPartyCode,
  requireUser,
} from '../../server/banks.mjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!bankRuntimeConfigured()) {
    res.status(503).json({ error: 'Bank provider credentials are not configured yet' })
    return
  }

  try {
    const { user, client } = await requireUser(req)
    const { workspaceId, bankCode } = req.body || {}
    if (!workspaceId || !bankCode) {
      res.status(400).json({ error: 'workspaceId and bankCode are required' })
      return
    }

    const { data: membership, error: membershipError } = await client
      .from('workspace_members')
      .select('workspace_id,role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership) {
      res.status(403).json({ error: 'No access to this money space' })
      return
    }

    const { verifier, challenge } = createPkce()
    const thirdPartyCode = await everypayThirdPartyCode(user.id)
    const origin = appOrigin(req)
    const redirectUri = `${origin}/api/banks/callback`
    const state = encryptJson({
      userId: user.id,
      workspaceId,
      bankCode,
      verifier,
      redirectUri,
      exp: Date.now() + 10 * 60 * 1000,
    })

    const authorizeUrl = everypayAuthorizeUrl({
      bankCode,
      thirdPartyCode,
      challenge,
      state,
      redirectUri,
    })

    res.status(200).json({ authorizeUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start bank connection'
    res.status(message === 'Unauthorized' ? 401 : 500).json({ error: message })
  }
}
