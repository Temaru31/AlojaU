// Detalle en móvil: título, carrusel táctil, chips y acciones rápidas.

import { Check, Heart, Plus } from 'lucide-react'
import Icono from '../../components/Icono'
import BotonCompartir from '../../components/BotonCompartir'
import CarruselFotos from '../../components/CarruselFotos'
import { fotosOrdenadas } from '../../utils/portada'






export default function CabeceraMovilDetalle({ pub, zona, tipoHumano, servicios, mensajeWa, acciones }) {
  const { esDueno, isFav, isComp, handleToggleFav, handleToggleComp, setEditando } = acciones
  return (
    <div className="sm:hidden space-y-3 mb-4">
      <div>
        <h1 className="font-display text-xl font-bold text-navy-900 tracking-tight leading-snug">
          {pub.titulo}
        </h1>
        <p className="text-xs text-neutral-600 mt-1 truncate">{zona} · {tipoHumano}</p>
      </div>
      <CarruselFotos
        fotos={fotosOrdenadas(pub)}
        titulo={pub.titulo}
        acciones={
          <>
            <button
              type="button"
              onClick={handleToggleFav}
              aria-pressed={isFav}
              aria-label={isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
              title={isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
              className={`w-11 h-11 rounded-full text-lg flex items-center justify-center backdrop-blur-sm border border-white/20 active:scale-95 transition ${isFav ? 'bg-red-500 text-white' : 'bg-black/60 text-white'}`}
            >
              {isFav ? <Heart aria-hidden="true" className="w-5 h-5 fill-current" /> : <Heart aria-hidden="true" className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={handleToggleComp}
              aria-pressed={isComp}
              aria-label={isComp ? 'Quitar de comparar' : 'Agregar a comparar'}
              title={isComp ? 'Quitar de comparar' : 'Agregar a comparar'}
              className={`w-11 h-11 rounded-full text-lg font-bold flex items-center justify-center backdrop-blur-sm border border-white/20 active:scale-95 transition ${isComp ? 'bg-indigo-600 text-white' : 'bg-black/60 text-white'}`}
            >
              {isComp ? <Check aria-hidden="true" className="w-5 h-5" /> : <Plus aria-hidden="true" className="w-5 h-5" />}
            </button>
            <BotonCompartir
              titulo={`${pub.titulo} en AlojaU`}
              texto={mensajeWa}
              url={typeof window !== 'undefined' ? window.location.href : `/publicacion/${pub.id}`}
              etiqueta="Compartir esta publicación"
              variante="flotante"
            />
            {esDueno && (
              <button
                type="button"
                onClick={() => setEditando(true)}
                aria-label="Editar publicación"
                title="Editar publicación"
                className="w-11 h-11 rounded-full text-white flex items-center justify-center backdrop-blur-sm border border-white/20 active:scale-95 transition bg-navy-800/85"
              >
                <Icono nombre="lapiz" className="w-5 h-5" />
              </button>
            )}
          </>
        }
      />
      {/* focus-within quita la máscara para no recortar el anillo de foco en bordes. */}
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap no-scrollbar fade-x focus-within:[mask-image:none] focus-within:[-webkit-mask-image:none] pb-1" role="list" aria-label="Características">
        {[tipoHumano, zona, ...servicios].map((c, i) => (
          <span key={`${c}-${i}`} role="listitem" className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
            {c}
          </span>
        ))}
      </div>
    </div>
  )
}
