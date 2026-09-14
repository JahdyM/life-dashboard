import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#241A13",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "22px",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 256 256"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="14" y="14" width="228" height="228" rx="56" fill="#241A13" />
          <rect
            x="16.5"
            y="16.5"
            width="223"
            height="223"
            rx="53.5"
            fill="none"
            stroke="#A77445"
            strokeWidth="6"
          />
          <path d="M48 74c29-8 55-1 80 18v112c-24-17-51-23-80-16V74Z" fill="#F4E4C4" />
          <path d="M208 74c-29-8-55-1-80 18v112c24-17 51-23 80-16V74Z" fill="#E9CF9E" />
          <path d="M128 92v112M63 99c18-2 34 2 49 12M63 124c18-2 34 2 49 12M193 99c-18-2-34 2-49 12M193 124c-18-2-34 2-49 12" fill="none" stroke="#7A5132" strokeWidth="6" strokeLinecap="round" />
          <path d="M154 53c34-20 57-9 55 25-29 10-49 2-55-25Z" fill="#7F8C5E" />
          <path d="M154 53c16 9 27 17 38 28" fill="none" stroke="#405039" strokeWidth="5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
