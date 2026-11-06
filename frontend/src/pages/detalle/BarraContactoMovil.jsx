// Barra fija inferior en móvil: precio y botón de WhatsApp.
import IconoWhatsApp from '../../components/IconoWhatsApp'
















export default function BarraContactoMovil({ canon, deposito, zona, wa, handleWhatsAppClick }) {
  return (
    <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-neutral-150 bg-white/95 backdrop-blur px-4 py-3" role="region" aria-label="Contacto rápido">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold text-navy-900 leading-tight truncate">
            {canon != null ? `$${Number(canon).toLocaleString('es-CO')}` : 'No informado'}
            <span className="text-[11px] font-normal text-neutral-500"> COP/mes</span>
          </p>
          <p className="text-xs text-neutral-600 truncate">
            {zona}{deposito != null && deposito > 0 ? ` · +depósito $${Number(deposito).toLocaleString('es-CO')}` : ''}
          </p>
        </div>
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleWhatsAppClick}
            aria-label="Abrir chat de WhatsApp"
            className="shrink-0 inline-flex items-center gap-1.5 px-5 py-3 min-h-[48px] rounded-xl bg-emerald-700 text-white text-sm font-bold shadow-lg active:bg-emerald-800 transition"
          >
            <IconoWhatsApp className="w-4 h-4" /> WhatsApp
          </a>
        ) : (
          <span className="shrink-0 inline-flex items-center px-4 py-3 min-h-[48px] rounded-xl bg-neutral-100 text-neutral-600 border border-neutral-200 text-xs font-semibold">
            Sin contacto
          </span>
        )}
      </div>
    </div>
  )
}
