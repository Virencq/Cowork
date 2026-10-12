import type { CSSProperties } from 'react'

interface CoworkLogoProps {
  isWorking?: boolean
  size?: number
  className?: string
}

/** Round Cowork mark. It rotates only while the selected session is actively streaming. */
export function CoworkLogo({ isWorking = false, size = 22, className = '' }: CoworkLogoProps) {
  const style: CSSProperties = { width: size, height: size }
  return (
    <span className={`cowork-logo ${isWorking ? 'cowork-logo--working' : ''} ${className}`.trim()}
      style={style} role="img" aria-label={isWorking ? 'Cowork is working' : 'Cowork is idle'}
      title={isWorking ? 'Agent is working' : 'Agent is idle'}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="cowork-mark-gradient" x1="4" y1="5" x2="36" y2="35" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffb36d" />
            <stop offset="0.52" stopColor="#f0784d" />
            <stop offset="1" stopColor="#c83d32" />
          </linearGradient>
        </defs>
        <circle className="cowork-logo-ring" cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeOpacity=".24" strokeWidth="1.5" />
        <path d="M27.5 11.5H18.2a8.5 8.5 0 0 0 0 17h9.3a3.2 3.2 0 0 0 0-6.4h-9.3a2.1 2.1 0 0 1 0-4.2h9.3a3.2 3.2 0 0 0 0-6.4Z" fill="url(#cowork-mark-gradient)" />
      </svg>
    </span>
  )
}
