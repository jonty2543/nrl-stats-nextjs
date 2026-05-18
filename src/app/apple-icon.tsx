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
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00F58A" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#00F58A" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="512" cy="512" r="512" fill="#00F58A" />
        <circle cx="512" cy="512" r="474" fill="#1B2B49" />
        <circle cx="512" cy="512" r="474" fill="url(#glow)" />
        <g stroke="#00F58A" strokeWidth="58" strokeLinecap="round">
          <line x1="246" y1="136" x2="246" y2="730" />
          <line x1="778" y1="136" x2="778" y2="730" />
          <line x1="246" y1="448" x2="778" y2="448" />
          <line x1="318" y1="696" x2="318" y2="950" />
          <line x1="415" y1="632" x2="415" y2="950" />
          <line x1="512" y1="558" x2="512" y2="950" />
          <line x1="609" y1="606" x2="609" y2="950" />
          <line x1="706" y1="674" x2="706" y2="950" />
        </g>
      </svg>
    ),
    size
  )
}
