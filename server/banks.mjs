import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://drsatwounoiqrenkhcze.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_HZnlzAaWdNlOpARiJql6Uw_4W5QErAX'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function bankRuntimeConfigured() {
  return Boolean(
    process.env.EVERYPAY_CLIENT_ID &&
    process.env.EVERYPAY_CLIENT_SECRET &&
    process.env.BANK_ENCRYPTION_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export function everypayEnvironment() {
  const production = process.env.EVERYPAY_ENV === 'production'
  return {
    production,
    idBase: production ? 'https://id.everypay.io' : 'https://id-beta.everypay.io',
    apiBase: production ? 'https://iapi.everypay.io' : 'https://iapi-beta.everypay.io',
  }
}

export function appOrigin(req) {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`.replace(/\/$/, '')
}

export function serviceClient() {
  return createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function userClient(jwt) {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
}

export async function requireUser(req) {
  const auth = String(req.headers.authorization || '')
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!jwt) throw new Error('Unauthorized')
  const client = userClient(jwt)
  const { data, error } = await client.auth.getUser(jwt)
  if (error || !data.user) throw new Error('Unauthorized')
  return { user: data.user, jwt, client }
}

function secretKey() {
  return crypto.createHash('sha256').update(required('BANK_ENCRYPTION_KEY')).digest()
}

function sealRaw(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, ciphertext].map(part => part.toString('base64url')).join('.')
}

function openRaw(token) {
  const [iv64, tag64, data64] = String(token).split('.')
  if (!iv64 || !tag64 || !data64) throw new Error('Invalid encrypted payload')
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(data64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function encryptJson(value) {
  return sealRaw(JSON.stringify(value))
}

export function decryptJson(value) {
  return JSON.parse(openRaw(value))
}

export function encryptToken(value) {
  return sealRaw(value)
}

export function decryptToken(value) {
  return openRaw(value)
}

export function createPkce() {
  const verifier = crypto.randomBytes(48).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

async function jsonOrText(response) {
  const text = await response.text()
  try { return JSON.parse(text) } catch { return { message: text } }
}

export async function everypayPartnerToken() {
  const { idBase } = everypayEnvironment()
  const clientId = required('EVERYPAY_CLIENT_ID')
  const clientSecret = required('EVERYPAY_CLIENT_SECRET')
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'iapi/third-parties',
  })
  const response = await fetch(`${idBase}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await jsonOrText(response)
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || payload.message || 'Everypay client authorization failed')
  return payload.access_token
}

export async function everypayProviders() {
  const token = await everypayPartnerToken()
  const { apiBase } = everypayEnvironment()
  const response = await fetch(`${apiBase}/api/parties`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const payload = await jsonOrText(response)
  if (!response.ok) throw new Error(payload.error_description || payload.error || payload.message || 'Could not load banks')
  return Array.isArray(payload) ? payload : []
}

export async function everypayThirdPartyCode(userId) {
  const { idBase } = everypayEnvironment()
  const basic = Buffer.from(`${required('EVERYPAY_CLIENT_ID')}:${required('EVERYPAY_CLIENT_SECRET')}`).toString('base64')
  const response = await fetch(`${idBase}/oauth/third-party-code`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'content-type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ type: 'external', user_id: userId }),
  })
  const payload = await jsonOrText(response)
  if (!response.ok || !payload.code) throw new Error(payload.error_description || payload.error || payload.message || 'Could not start bank authorization')
  return payload.code
}

export function everypayAuthorizeUrl({ bankCode, thirdPartyCode, challenge, state, redirectUri }) {
  const { idBase } = everypayEnvironment()
  const url = new URL(`${idBase}/oauth/authorize`)
  url.searchParams.set('client_id', required('EVERYPAY_CLIENT_ID'))
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'third_party_code')
  url.searchParams.set('scope', 'iapi/third-parties iapi/accounts')
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  url.searchParams.set('third_party', bankCode)
  url.searchParams.set('code', thirdPartyCode)
  return url.toString()
}

export async function everypayExchangeCode({ code, verifier, redirectUri }) {
  const { idBase } = everypayEnvironment()
  const body = new URLSearchParams({
    grant_type: 'third_party_authorization_code',
    client_id: required('EVERYPAY_CLIENT_ID'),
    client_secret: required('EVERYPAY_CLIENT_SECRET'),
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })
  const response = await fetch(`${idBase}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  const payload = await jsonOrText(response)
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || payload.message || 'Could not exchange bank authorization code')
  return payload
}

export async function everypayRefresh(refreshToken) {
  const { idBase } = everypayEnvironment()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: required('EVERYPAY_CLIENT_ID'),
    client_secret: required('EVERYPAY_CLIENT_SECRET'),
    refresh_token: refreshToken,
  })
  const response = await fetch(`${idBase}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  const payload = await jsonOrText(response)
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || payload.message || 'Could not refresh bank token')
  return payload
}

function everypayHeaders(accessToken, req) {
  const ip = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'x-fapi-auth-date': new Date().toUTCString(),
    'x-fapi-interaction-id': crypto.randomUUID(),
    'x-customer-user-agent': String(req?.headers?.['user-agent'] || 'MoneyCRM/1.0'),
  }
  if (ip) headers['x-fapi-customer-ip-address'] = ip
  return headers
}

export async function everypayAccounts(accessToken, req) {
  const { apiBase } = everypayEnvironment()
  const response = await fetch(`${apiBase}/api/accounts`, { headers: everypayHeaders(accessToken, req) })
  const payload = await jsonOrText(response)
  if (!response.ok) throw new Error(payload.error_description || payload.error || payload.message || 'Could not load bank accounts')
  return payload?.Data?.Account || []
}

export async function everypayBalance(accessToken, externalAccountId, req) {
  const { apiBase } = everypayEnvironment()
  const response = await fetch(`${apiBase}/api/accounts/${encodeURIComponent(externalAccountId)}/balances`, {
    headers: everypayHeaders(accessToken, req),
  })
  const payload = await jsonOrText(response)
  if (!response.ok) throw new Error(payload.error_description || payload.error || payload.message || 'Could not load bank balance')
  const balances = payload?.Data?.Balance || []
  const preferred = balances.find(item => item.Type === 'OpeningAvailable') || balances[0]
  if (!preferred?.Amount) return { amountMinor: 0, currency: 'RUB' }
  const amount = Math.round(Number(preferred.Amount.amount || 0) * 100)
  const signed = preferred.CreditDebitIndicator === 'Debit' ? -Math.abs(amount) : amount
  return { amountMinor: signed, currency: preferred.Amount.currency || 'RUB' }
}

export async function everypayStatement(accessToken, externalAccountId, fromIso, toIso, req) {
  const { apiBase } = everypayEnvironment()
  const headers = {
    ...everypayHeaders(accessToken, req),
    'content-type': 'application/json',
    'x-idempotency-key': crypto.randomUUID(),
  }
  const initResponse = await fetch(`${apiBase}/api/statements/${encodeURIComponent(externalAccountId)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      Data: { Statement: { accountId: externalAccountId, fromBookingDateTime: fromIso, toBookingDateTime: toIso } },
      Risk: {},
    }),
  })
  const initPayload = await jsonOrText(initResponse)
  if (!initResponse.ok) throw new Error(initPayload.error_description || initPayload.error || initPayload.message || 'Could not request bank statement')
  const statementId = initPayload?.Data?.Statement?.statementId
  if (!statementId) return { pending: true, transactions: [] }

  const response = await fetch(`${apiBase}/api/accounts/${encodeURIComponent(externalAccountId)}/statements/${encodeURIComponent(statementId)}`, {
    headers: everypayHeaders(accessToken, req),
  })
  if (response.status === 202) return { pending: true, transactions: [] }
  const payload = await jsonOrText(response)
  if (!response.ok) throw new Error(payload.error_description || payload.error || payload.message || 'Could not load bank statement')
  const statements = payload?.Data?.Statement || []
  return {
    pending: false,
    transactions: statements.flatMap(statement => statement.Transaction || []),
  }
}

export function maskAccountIdentification(account) {
  const identification = String(account?.AccountDetails?.[0]?.identification || '')
  if (!identification) return null
  const last4 = identification.slice(-4)
  return last4 ? `•••• ${last4}` : null
}

export function accountDisplayName(account, bankName) {
  return account?.accountDescription || account?.AccountDetails?.[0]?.name || `${bankName || 'Банк'} ${maskAccountIdentification(account) || 'счёт'}`
}

export function transactionCounterparty(tx) {
  if (tx.creditDebitIndicator === 'Credit') return tx?.DebtorParty?.name || null
  return tx?.CreditorParty?.name || null
}

export function toMinorAmount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
