import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

let nextId = 1

export function notifyToast(message, href) {
  try {
    window.dispatchEvent(new CustomEvent('alojau:toast', { detail: { message, href } }))
  } catch { /* jsdom sin CustomEvent: noop */ }
}

export default function Toaster() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const onToast = (e) => {
      const { message, href } = e.detail || {}
      if (!message) return
      const id = nextId++
      setItems(prev => [...prev.slice(-2), { id, message, href }])
      window.setTimeout(() => {
        setItems(prev => prev.filter(t => t.id !== id))
      }, 3500)
    }
    window.addEventListener('alojau:toast', onToast)
    return () => window.removeEventListener('alojau:toast', onToast)
  }, [])

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[2100] w-[calc(100%-2rem)] max-w-md space-y-2" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className="flex items-center justify-between gap-3 bg-navy-900 text-white text-xs rounded-lg px-4 py-3 shadow-xl border border-navy-700" role="status">
          <span className="leading-snug">{t.message}</span>
          {t.href && (
            <Link to={t.href} className="font-semibold text-gold-400 hover:text-gold-500 shrink-0">
              Ver →
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
