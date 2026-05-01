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
          background: "#12100f",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: "8px",
          padding: "46px 36px 38px",
        }}
      >
        <div style={{ width: "22px", height: "62px", background: "#E0BC87", borderRadius: "5px" }} />
        <div style={{ width: "22px", height: "88px", background: "#C9A06A", borderRadius: "5px" }} />
        <div style={{ width: "22px", height: "48px", background: "#9FB3A4", borderRadius: "5px" }} />
        <div style={{ width: "22px", height: "74px", background: "#E0BC87", borderRadius: "5px" }} />
      </div>
    ),
    { ...size }
  );
}
