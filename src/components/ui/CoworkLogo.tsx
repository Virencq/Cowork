import type { CSSProperties } from 'react'

interface CoworkLogoProps {
  isWorking?: boolean
  size?: number
  className?: string
}

/** Orbito orbital mark. The core stays still while the orange orbit segment moves during agent work. */
export function CoworkLogo({ isWorking = false, size = 22, className = '' }: CoworkLogoProps) {
  const style: CSSProperties = { width: size, height: size }
  return (
    <span className={`cowork-logo ${isWorking ? 'cowork-logo--working' : ''} ${className}`.trim()}
      style={style} role="img" aria-label={isWorking ? 'Orbito agent is working' : 'Orbito agent is idle'}
      title={isWorking ? 'Agent is working' : 'Agent is idle'}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="orbito-mark-gradient" x1="4" y1="3" x2="36" y2="37" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffb66e" />
            <stop offset=".52" stopColor="#f47b42" />
            <stop offset="1" stopColor="#e34b32" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="18" fill="#171513" fillOpacity=".18" />
        <circle className="cowork-logo-ring" cx="20" cy="20" r="17" fill="none" stroke="url(#orbito-mark-gradient)" strokeWidth="3.8" strokeOpacity=".28" />
        <path d="M31.7 14.1A13.4 13.4 0 1 0 32.2 25" fill="none" stroke="url(#orbito-mark-gradient)" strokeWidth="4.4" strokeLinecap="round" />
        <path d="M27.8 10.5A13.4 13.4 0 0 0 10.4 12" fill="none" stroke="url(#orbito-mark-gradient)" strokeWidth="4.4" strokeLinecap="round" />
        <circle cx="20" cy="20" r="4.5" fill="url(#orbito-mark-gradient)" />
      </svg>
    </span>
  )
}
