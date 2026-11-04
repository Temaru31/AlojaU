/** Etiqueta visible del rol de la cuenta. */
export function etiquetaRol(rol) {
  if (rol === 'ADMIN') return 'Administrador'
  if (rol === 'ARRENDADOR') return 'Arrendador'
  return 'Usuario Base'
}

export function esAdmin(user) {
  return (user?.rol || '').toUpperCase() === 'ADMIN'
}
