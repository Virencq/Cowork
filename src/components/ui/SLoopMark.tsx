interface SLoopMarkProps {
  className?: string
  size?: 'sm' | 'md' | 'hero'
}

const sizeClasses = {
  sm: 'h-7 w-7',
  md: 'h-16 w-16',
  hero: 'h-24 w-24',
}

/**
 * Theme-aware Cowork assistant mark.
 * The existing alpha asset is retained as a neutral visual mark; no S-Loop
 * product naming is exposed to the user.
 */
export function SLoopMark({ className = '', size = 'hero' }: SLoopMarkProps) {
  return (
    <div
      className={`relative shrink-0 ${sizeClasses[size]} ${className}`}
      role="img"
      aria-label="Cowork assistant"
    >
      {size === 'hero' && <span className="absolute inset-[14%] rounded-full bg-accent/12 blur-xl" />}
      <span
        aria-hidden="true"
        className={`s-loop-brand-mask absolute inset-0 bg-accent ${
          size === 'hero' ? 'drop-shadow-[0_8px_14px_rgb(var(--color-accent-rgb),0.16)]' : ''
        }`}
      />
    </div>
  )
}
