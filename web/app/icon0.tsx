import { ImageResponse } from "next/og";

// 512x512 PNG, maskable-safe (inner ~70% has the content)
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon0() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#101215",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "72px",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 256 256"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="14" y="14" width="228" height="228" rx="56" fill="#101215" />
          <rect
            x="16.5"
            y="16.5"
            width="223"
            height="223"
            rx="53.5"
            fill="none"
            stroke="#2C3138"
            strokeWidth="5"
          />

          <g fill="#FFF7EA">
            <ellipse cx="128" cy="62" rx="20" ry="38" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(30 128 128)" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(60 128 128)" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(90 128 128)" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(120 128 128)" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(150 128 128)" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(180 128 128)" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(210 128 128)" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(240 128 128)" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(270 128 128)" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(300 128 128)" />
            <ellipse cx="128" cy="62" rx="20" ry="38" transform="rotate(330 128 128)" />
          </g>

          <circle cx="128" cy="128" r="36" fill="#F7B941" />
          <circle cx="128" cy="128" r="16" fill="#DE9430" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
