type CurrencyNumberInputProps = {
  value: string
  onChange: (value: string) => void
  onEnter: () => void
  ariaLabel: string
  placeholder?: string
  className?: string
}

const formatWholePart = (whole: string) => {
  const numeric = whole.replace(/^0+(?=\d)/, '') || '0'
  return new Intl.NumberFormat('en-US').format(Number(numeric))
}

const formatForDisplay = (raw: string) => {
  if (!raw) return ''
  const [wholeRaw, fractional] = raw.split('.')
  const formattedWhole = formatWholePart(wholeRaw || '0')
  return fractional !== undefined ? `${formattedWhole}.${fractional}` : formattedWhole
}

const normalizeFromInput = (value: string) => {
  const stripped = value.replace(/[^\d.]/g, '')
  const firstDot = stripped.indexOf('.')
  if (firstDot === -1) return stripped
  const whole = stripped.slice(0, firstDot)
  const fractional = stripped.slice(firstDot + 1).replace(/\./g, '')
  return `${whole}.${fractional}`
}

export function CurrencyNumberInput({
  value,
  onChange,
  onEnter,
  ariaLabel,
  placeholder = '0',
  className,
}: CurrencyNumberInputProps) {
  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      value={formatForDisplay(value)}
      onChange={(event) => onChange(normalizeFromInput(event.target.value))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
          onEnter()
        }
      }}
      className={className}
      placeholder={placeholder}
    />
  )
}
