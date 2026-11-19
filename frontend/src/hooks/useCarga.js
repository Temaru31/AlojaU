import { useCallback, useEffect, useState } from 'react'

// Pide datos al montar y cada vez que cambian `deps`. Ignora respuestas que
// llegan tarde (el usuario ya cambió de aviso/filtro) y, al empezar cada
// carga, vuelve a `inicial` para no mostrar datos de la anterior.
// `activo: false` no pide nada y deja `datos = inicial`.
export default function useCarga(cargar, deps, { inicial = null, activo = true } = {}) {
  const [estado, setEstado] = useState({ datos: inicial, cargando: activo, error: null })

  useEffect(() => {
    if (!activo) {
      setEstado({ datos: inicial, cargando: false, error: null })
      return undefined
    }
    let vivo = true
    setEstado({ datos: inicial, cargando: true, error: null })
    cargar()
      .then(datos => { if (vivo) setEstado({ datos, cargando: false, error: null }) })
      .catch(error => { if (vivo) setEstado({ datos: inicial, cargando: false, error }) })
    return () => { vivo = false }
  }, [activo, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps

  const setDatos = useCallback((cambio) => {
    setEstado(e => ({ ...e, datos: typeof cambio === 'function' ? cambio(e.datos) : cambio }))
  }, [])

  return { ...estado, setDatos }
}
