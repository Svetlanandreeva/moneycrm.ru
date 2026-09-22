import { useEffect, useState } from 'react'
import { CheckCircle2, Download, Share, Smartphone } from 'lucide-react'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

function isStandalone() {
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function PwaInstallCard() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandalone())
  const [ios] = useState(() => isIos())

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }

    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  async function install() {
    if (!promptEvent) return
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setPromptEvent(null)
  }

  return (
    <section style={{ background: '#14161c', border: '1px solid #22252e', borderRadius: 20, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: '#e4f03010', border: '1px solid #e4f03022', display: 'grid', placeItems: 'center' }}>
          <Smartphone size={17} color="#e4f030" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 850 }}>MoneyCRM как приложение</p>
          <p style={{ margin: '3px 0 0', color: '#59616f', fontSize: 9, lineHeight: 1.4 }}>Установите на главный экран — откроется без браузерной панели.</p>
        </div>
      </div>

      {installed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 11px', borderRadius: 11, background: '#34d3990d', border: '1px solid #34d39925', color: '#86efac', fontSize: 9 }}>
          <CheckCircle2 size={14} /> MoneyCRM уже запущен как приложение.
        </div>
      ) : promptEvent ? (
        <button onClick={() => void install()} style={{ width: '100%', minHeight: 42, marginTop: 12, borderRadius: 11, border: 0, background: '#e4f030', color: '#0c0d10', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 10, fontWeight: 850, cursor: 'pointer' }}>
          <Download size={14} /> Установить MoneyCRM
        </button>
      ) : ios ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 11px', borderRadius: 11, background: '#0f1116', border: '1px solid #232731' }}>
          <Share size={14} color="#60a5fa" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, color: '#7b8491', fontSize: 9, lineHeight: 1.5 }}>В Safari нажмите «Поделиться» → «На экран Домой» → «Добавить».</p>
        </div>
      ) : (
        <div style={{ marginTop: 12, padding: '10px 11px', borderRadius: 11, background: '#0f1116', border: '1px solid #232731', color: '#6b7280', fontSize: 9, lineHeight: 1.5 }}>
          Если кнопка установки не появилась, откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».
        </div>
      )}
    </section>
  )
}
