import { bankRuntimeConfigured, everypayEnvironment, everypayProviders } from '../../server/banks.mjs'

const demoProvider = {
  type: 'demo',
  code: 'demo',
  name: 'Тестовый банк',
  description: 'Браузерный тест подключения без реальных банковских реквизитов',
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!bankRuntimeConfigured()) {
    res.status(200).json({
      configured: true,
      environment: 'sandbox',
      providers: [demoProvider],
      supportedHint: ['Сбер', 'Т-Банк', 'Альфа-Банк', 'Ozon Банк'],
      mode: 'browser-demo',
    })
    return
  }

  try {
    const providers = await everypayProviders()
    res.status(200).json({
      configured: true,
      environment: everypayEnvironment().production ? 'production' : 'sandbox',
      providers: [demoProvider, ...providers.filter(item => item?.type === 'bank')],
      mode: 'hybrid',
    })
  } catch (error) {
    res.status(200).json({
      configured: true,
      environment: 'sandbox',
      providers: [demoProvider],
      supportedHint: ['Сбер', 'Т-Банк', 'Альфа-Банк', 'Ozon Банк'],
      mode: 'browser-demo',
      error: error instanceof Error ? error.message : 'Provider unavailable',
    })
  }
}
