import OtpForm from '../../components/OtpForm'
import TelegramVincular from '../../components/TelegramVincular'
import { notifyToast } from '../../components/Toast'
import { Check, Mail, Pencil, Smartphone } from 'lucide-react'

const CAJA_OK = 'border-emerald-200 bg-emerald-50/40'
const CAJA_PENDIENTE = 'border-amber-200 bg-amber-50/40'
const INSIGNIA_OK = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300'
const INSIGNIA_PENDIENTE = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300'

function CorreoTarjeta({ perfil, onVerificado }) {
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${perfil?.email_verificado ? CAJA_OK : CAJA_PENDIENTE}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-navy-800 flex items-center gap-1.5"><Mail aria-hidden="true" className="w-4 h-4" /> Correo electrónico</p>
        {perfil?.email_verificado ? (
          <span className={INSIGNIA_OK}><Check aria-hidden="true" className="w-4 h-4" /> Correo verificado</span>
        ) : (
          <span className={INSIGNIA_PENDIENTE}>Pendiente</span>
        )}
      </div>
      <label htmlFor="perfil-correo" className="sr-only">Correo</label>
      <input id="perfil-correo" type="email" value={perfil?.email || ''} disabled className="input-field opacity-60" aria-describedby="correo-ayuda" />
      <p id="correo-ayuda" className="text-xs text-neutral-500">El correo identifica tu cuenta y no se puede cambiar.</p>
      {/* R1: verificación de correo centralizada aquí (antes en Avisos). */}
      {perfil && !perfil.email_verificado && (
        <div className="pt-1">
          <OtpForm email={perfil.email} proposito="email_verify" onVerificado={onVerificado} />
        </div>
      )}
    </div>
  )
}

function TelefonoTarjeta({ perfil, token, borrador, setPerfil }) {
  const estaVerificado = !!perfil?.telefono_verificado
  const bloqueado = estaVerificado && !borrador.telefonoEditando
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${estaVerificado ? CAJA_OK : CAJA_PENDIENTE}`}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="perfil-telefono" className="text-sm font-semibold text-navy-800">Teléfono WhatsApp</label>
        <span className="inline-flex items-center gap-2">
          {estaVerificado ? (
            <span className={INSIGNIA_OK}><Check aria-hidden="true" className="w-4 h-4" /> Verificado (+20 pts)</span>
          ) : (
            <span className={INSIGNIA_PENDIENTE}>Sin verificar (0 pts)</span>
          )}
          {/* R1: número verificado bloqueado; editar lo habilita (guardar resetea a sin verificar). */}
          {bloqueado && (
            <button
              type="button"
              onClick={() => borrador.setTelefonoEditando(true)}
              aria-label="Editar número de teléfono"
              title="Editar número (pierde la verificación)"
              className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] rounded-full border border-navy-200 text-navy-700 hover:bg-navy-50 active:bg-navy-100 transition"
            >
              <Pencil aria-hidden="true" className="w-4 h-4" />
            </button>
          )}
        </span>
      </div>
      <div className="flex">
        <span aria-hidden="true" className="inline-flex items-center gap-1 px-3 rounded-l-lg border border-r-0 border-neutral-200 bg-neutral-100 text-sm font-bold text-neutral-600 shrink-0">
          +57
        </span>
        <input
          id="perfil-telefono"
          type="tel"
          inputMode="numeric"
          value={borrador.telefono}
          disabled={bloqueado}
          onChange={e => borrador.setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="300 123 4567"
          aria-describedby="telefono-ayuda"
          className="input-field !rounded-l-none disabled:opacity-60"
        />
      </div>
      <p id="telefono-ayuda" className="text-xs text-neutral-500">
        {bloqueado
          ? (<>Número verificado y bloqueado. Pulsa <Pencil aria-hidden="true" className="w-3.5 h-3.5 inline" /> para cambiarlo (volverá a "Sin verificar").</>)
          : 'Solo los 10 dígitos de tu línea (el +57 ya va incluido). Vacío = sin vincular (no podrás publicar hasta vincularlo).'}
      </p>
      {/* R1: verificación vía Telegram unificada junto al teléfono. */}
      <div className="pt-1">
        <TelegramVincular
          token={token}
          vinculado={!!perfil?.telegram_vinculado}
          telefonoGuardado={!!(perfil?.telefono_whatsapp || '').trim()}
          telefonoVerificado={estaVerificado}
          onVinculado={() => {
            setPerfil((p) => (p ? { ...p, telegram_vinculado: true, telefono_verificado: true } : p))
            notifyToast('¡Número verificado con éxito en AlojaU! (+20 pts de confianza)')
          }}
          onDesvinculado={() => {
            setPerfil((p) => (p ? {
              ...p, telegram_vinculado: false,
              telefono_verificado: false, telefono_whatsapp: null,
            } : p))
            borrador.setTelefono('')
          }}
        />
      </div>
    </div>
  )
}

/** F3 Contacto en tarjetas de estado independientes (verde/ámbar claro). */
export default function ContactoSeccion({ perfil, token, borrador, setPerfil, onRecargarPerfil }) {
  return (
    <section aria-label="Contacto" className="card rounded-2xl p-4 sm:p-6 space-y-3 shadow-sm">
      <h3 className="text-sm font-bold text-navy-900 flex items-center gap-1.5"><Smartphone aria-hidden="true" className="w-4 h-4" /> Contacto</h3>
      <p className="text-xs text-neutral-500 -mt-2">Cómo te contactan los interesados. El teléfono verificado suma +20 de confianza.</p>
      <CorreoTarjeta perfil={perfil} onVerificado={onRecargarPerfil} />
      <TelefonoTarjeta perfil={perfil} token={token} borrador={borrador} setPerfil={setPerfil} />
    </section>
  )
}
