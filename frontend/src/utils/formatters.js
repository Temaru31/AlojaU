export const formatCOP = (n) => n?.toLocaleString('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0})
export const formatDistancia = (m) => m < 1000 ? `${m} m` : `${(m/1000).toFixed(1)} km`
export const getColorIndice = (i) => i>=80?'green':i>=50?'yellow':'orange'
export const getLabelIndice = (i) => i>=80?'Alto':i>=50?'Medio':'Básico'
