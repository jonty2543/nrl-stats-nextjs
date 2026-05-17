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
        <rect width="1024" height="1024" fill="#1B2B49" />
        <circle cx="512" cy="512" r="506" stroke="#2B3F62" strokeWidth="12" />
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00F58A" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#00F58A" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1024" height="1024" fill="url(#glow)" />
        <circle cx="512" cy="512" r="466" stroke="#00F58A" strokeWidth="30" />
        <g stroke="#00F58A" strokeWidth="42" strokeLinecap="round">
          <line x1="278" y1="176" x2="278" y2="724" />
          <line x1="746" y1="176" x2="746" y2="724" />
          <line x1="278" y1="464" x2="746" y2="464" />
          <line x1="340" y1="710" x2="340" y2="930" />
          <line x1="426" y1="654" x2="426" y2="930" />
          <line x1="512" y1="590" x2="512" y2="930" />
          <line x1="598" y1="630" x2="598" y2="930" />
          <line x1="684" y1="690" x2="684" y2="930" />
        </g>
      </svg>
    ),
    size
  )
}
