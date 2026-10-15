// AdSlot - espacio reservado para banners externos (AdSense, fase 2).
// En v1 renderiza null: reserva el slot sin reescribir cuando llegue la fase 2.
// Uso: <AdSlot id="home-top" />.
export default function AdSlot({ id }) {
  void id
  return null
}
