import { ImageResponse } from "next/og"

export const size = {
  width: 180,
  height: 180,
}

export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg
        width="180"
        height="180"
        viewBox="0 0 1024 1024"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="1024" height="1024" rx="224" fill="#1B2B49" />
        <rect x="6" y="6" width="1012" height="1012" rx="220" stroke="#2B3F62" strokeWidth="12" />
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00F58A" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#00F58A" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1024" height="1024" rx="224" fill="url(#glow)" />
        <circle cx="512" cy="512" r="420" stroke="#00F58A" strokeWidth="22" />
        <g stroke="#00F58A" strokeWidth="28" strokeLinecap="round">
          <line x1="340" y1="292" x2="340" y2="732" />
          <line x1="684" y1="292" x2="684" y2="732" />
          <line x1="340" y1="512" x2="684" y2="512" />
          <line x1="384" y1="724" x2="384" y2="850" />
          <line x1="448" y1="684" x2="448" y2="850" />
          <line x1="512" y1="632" x2="512" y2="850" />
          <line x1="576" y1="664" x2="576" y2="850" />
          <line x1="640" y1="704" x2="640" y2="850" />
        </g>
      </svg>
    ),
    size
  )
}
