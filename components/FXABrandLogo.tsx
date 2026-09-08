type FXABrandLogoProps = {
  className?: string;
  priority?: boolean;
  variant?: 'horizontal' | 'mark';
  label?: string;
};

const goldGradientId = 'fxaGoldGradient';
const goldGlowId = 'fxaGoldGlow';

export default function FXABrandLogo({
  className = '',
  priority: _priority = false,
  variant = 'horizontal',
  label = 'FXA FITNESS',
}: FXABrandLogoProps) {
  if (variant === 'mark') {
    return (
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 256 256"
        className={`shrink-0 ${className}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`${goldGradientId}-mark`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffd45a" />
            <stop offset="48%" stopColor="#f5b21f" />
            <stop offset="100%" stopColor="#c98816" />
          </linearGradient>
          <filter id={`${goldGlowId}-mark`} x="-35%" y="-35%" width="170%" height="170%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#f5b21f" floodOpacity="0.35" />
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#ffffff" floodOpacity="0.18" />
          </filter>
        </defs>
        <rect width="256" height="256" rx="34" fill="#020202" />
        <g filter={`url(#${goldGlowId}-mark)`} fill={`url(#${goldGradientId}-mark)`}>
          <text
            x="128"
            y="146"
            textAnchor="middle"
            fontFamily="Arial Black, Impact, sans-serif"
            fontSize="92"
            fontWeight="900"
            letterSpacing="-10"
          >
            FXA
          </text>
        </g>
      </svg>
    );
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 900 156"
      className={`shrink-0 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={goldGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd45a" />
          <stop offset="42%" stopColor="#f7b620" />
          <stop offset="100%" stopColor="#b97710" />
        </linearGradient>
        <filter id={goldGlowId} x="-18%" y="-45%" width="136%" height="190%">
          <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#f5b21f" floodOpacity="0.22" />
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#ffffff" floodOpacity="0.18" />
        </filter>
      </defs>
      <rect width="900" height="156" rx="20" fill="#020202" />
      <g filter={`url(#${goldGlowId})`} fill={`url(#${goldGradientId})`}>
        <text
          x="28"
          y="103"
          fontFamily="Arial Black, Impact, sans-serif"
          fontSize="108"
          fontWeight="900"
          letterSpacing="-12"
        >
          FXA
        </text>
        <text
          x="330"
          y="92"
          fontFamily="Arial Black, Impact, sans-serif"
          fontSize="88"
          fontWeight="900"
          letterSpacing="-3"
        >
          FITNESS
        </text>
        <text
          x="334"
          y="132"
          fontFamily="Arial Black, Impact, sans-serif"
          fontSize="32"
          fontWeight="900"
          letterSpacing="4"
        >
          FREQUENCY x ATTENTION
        </text>
      </g>
    </svg>
  );
}
