// BrandMark - logo AlojaU (símbolo casa+birrete).
// Uso: <BrandMark size="md" /> en Nav/Footer/Login. Ej: <BrandMark size="sm" />.
const SIZES = {
  sm: 'w-7 h-7',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
}

export default function BrandMark({ size = 'md', withText = false }) {
  return (
    <span className="flex items-center gap-2.5">
      <img
        src="/favicon-32x32.png"
        alt="AlojaU"
        className={`${SIZES[size] ?? SIZES.md} rounded-md object-cover bg-white`}
        loading="eager"
        decoding="async"
      />
      {withText && (
        <span className="font-display font-bold text-lg text-navy-900 tracking-tight">
          Aloja<span className="text-gold-500">U</span>
        </span>
      )}
    </span>
  )
}
