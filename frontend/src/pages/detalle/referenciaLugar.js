// Lugar de referencia del mapa y de la distancia en el detalle.
// Prioridad: `campus_ref` del backend > catálogo de lugares (`?campus_id=`) >
// sin lugar (modo inmueble único: un pin, sin distancia a un campus no elegido).

function nombreDeLugar(lugar) {
  const sede = lugar.nombre_sede && lugar.nombre_sede !== 'Sede Única' ? ` - ${lugar.nombre_sede}` : ''
  return `${lugar.institucion || ''}${sede}`.trim() || 'Lugar de referencia'
}

export function referenciaDeLugar(pub, lugares, campusId) {
  const refApi = pub.campus_ref || null
  if (refApi) {
    return {
      lugar: { lat: refApi.latitud, lng: refApi.longitud, nombre: `${refApi.institucion} - ${refApi.nombre_sede}` },
      distMapa: refApi.dist_m,
      etiquetaDist: `Distancia a ${refApi.nombre_sede}`,
    }
  }
  const lugarLista = campusId ? lugares.find(c => String(c.id) === String(campusId)) : null
  if (lugarLista) {
    const nombre = nombreDeLugar(lugarLista)
    // Distancia desconocida para el lugar pedido: "No informado", nunca la
    // distancia mínima a OTRO lugar bajo la etiqueta del pedido.
    return {
      lugar: { lat: lugarLista.latitud ?? lugarLista.lat, lng: lugarLista.longitud ?? lugarLista.lng, nombre },
      distMapa: null,
      etiquetaDist: `Distancia a ${nombre}`,
    }
  }
  return {
    lugar: null,
    distMapa: pub.distancia_geodesica_m ?? pub.dist_m,
    etiquetaDist: 'Distancia al campus',
  }
}
