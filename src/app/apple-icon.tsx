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
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="256" cy="256" r="252" fill="#1B2B49" />
        <circle cx="256" cy="256" r="248" stroke="#2B3F62" strokeWidth="8" />
        <circle cx="256" cy="256" r="228" stroke="#00F58A" strokeWidth="16" />
        <g stroke="#00F58A" strokeWidth="16" strokeLinecap="round">
          <line x1="170" y1="146" x2="170" y2="366" />
          <line x1="342" y1="146" x2="342" y2="366" />
          <line x1="170" y1="256" x2="342" y2="256" />
          <line x1="192" y1="362" x2="192" y2="425" />
          <line x1="224" y1="342" x2="224" y2="425" />
          <line x1="256" y1="316" x2="256" y2="425" />
          <line x1="288" y1="332" x2="288" y2="425" />
          <line x1="320" y1="352" x2="320" y2="425" />
        </g>
      </svg>
    ),
    size
  )
}
