import { bankRuntimeConfigured, everypayEnvironment, everypayProviders } from '../../server/banks.mjs'

const ozonProvider = {
  type: 'statement',
  code: 'ozon_statement',
  name: 'Ozon Банк',
  description: 'Реальные операции из выписки · без передачи банковского пароля MoneyCRM',
}

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
      providers: [ozonProvider, demoProvider],
      supportedHint: ['Ozon Банк', 'Сбер', 'Т-Банк', 'Альфа-Банк'],
      mode: 'browser-demo',
    })
    return
  }

  try {
    const providers = await everypayProviders()
    res.status(200).json({
      configured: true,
      environment: everypayEnvironment().production ? 'production' : 'sandbox',
      providers: [ozonProvider, demoProvider, ...providers.filter(item => item?.type === 'bank')],
      mode: 'hybrid',
    })
  } catch (error) {
    res.status(200).json({
      configured: true,
      environment: 'sandbox',
      providers: [ozonProvider, demoProvider],
      supportedHint: ['Ozon Банк', 'Сбер', 'Т-Банк', 'Альфа-Банк'],
      mode: 'browser-demo',
      error: error instanceof Error ? error.message : 'Provider unavailable',
    })
  }
}
