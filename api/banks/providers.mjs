import { bankRuntimeConfigured, everypayEnvironment, everypayProviders } from '../../server/banks.mjs'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!bankRuntimeConfigured()) {
    res.status(200).json({
      configured: false,
      environment: everypayEnvironment().production ? 'production' : 'sandbox',
      providers: [],
      supportedHint: ['Сбер', 'Т-Банк', 'Альфа-Банк', 'Точка', 'Модульбанк'],
    })
    return
  }

  try {
    const providers = await everypayProviders()
    res.status(200).json({
      configured: true,
      environment: everypayEnvironment().production ? 'production' : 'sandbox',
      providers: providers.filter(item => item?.type === 'bank'),
    })
  } catch (error) {
    res.status(502).json({ configured: true, providers: [], error: error instanceof Error ? error.message : 'Provider unavailable' })
  }
}
