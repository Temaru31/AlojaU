import { useState } from 'react'
import { telefonoAE164, telefonoALocal } from '../../utils/perfil'

function mismosPrefs(a, b) {
  const ka = Object.keys(a || {}).filter(k => a[k]).sort()
  const kb = Object.keys(b || {}).filter(k => b[k]).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i])
}

/**
 * Borrador editable de la pestaña Datos (nombre, teléfono, bio y etiquetas).
 * La foto va por POST /avatar, no en este formulario.
 */
export function useBorradorPerfil(perfil) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  // El teléfono verificado se bloquea hasta pulsar editar (editar resetea a sin verificar al guardar).
  const [telefonoEditando, setTelefonoEditando] = useState(false)
  const [bio, setBio] = useState('')
  const [tags, setTags] = useState({})
  // Etiquetas transaccionales: borrador local que se guarda con el formulario.
  const [tagsDirty, setTagsDirty] = useState(false)

  /** Copia al borrador lo que devolvió el backend (el nombre solo al cargar). */
  const cargarDesde = (data, { conNombre = true } = {}) => {
    setTelefono(telefonoALocal(data.telefono_whatsapp))
    setTelefonoEditando(false)
    if (conNombre) setNombre(data.nombre_completo || '')
    setBio(data.bio || '')
    setTags(data.preferencias || {})
    setTagsDirty(false)
  }

  const toggleTag = (key) => {
    const next = { ...tags, [key]: !tags[key] }
    setTags(next)
    setTagsDirty(!mismosPrefs(next, perfil?.preferencias || {}))
  }

  const cuerpo = () => ({
    nombre_completo: nombre,
    // Vacío -> el backend lo guarda NULL (desvincula). Con dígitos -> E.164.
    telefono_whatsapp: telefono.trim() === '' ? '' : telefonoAE164(telefono),
    bio: bio.trim(),
    preferencias: tags,
  })

  // Borrador sucio: nombre, teléfono, bio o etiquetas difieren de lo guardado.
  const sucio = !!perfil && (
    nombre !== (perfil.nombre_completo || '')
    || telefono !== telefonoALocal(perfil.telefono_whatsapp)
    || bio !== (perfil.bio || '')
    || tagsDirty
  )

  return {
    nombre, setNombre, telefono, setTelefono, telefonoEditando, setTelefonoEditando,
    bio, setBio, tags, tagsDirty, toggleTag, cargarDesde, cuerpo, sucio,
  }
}
