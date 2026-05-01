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
          background: "#12100f",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: "20px",
          padding: "170px 120px 120px",
        }}
      >
        <div style={{ width: "44px", height: "150px", background: "#E0BC87", borderRadius: "10px" }} />
        <div style={{ width: "44px", height: "215px", background: "#C9A06A", borderRadius: "10px" }} />
        <div style={{ width: "44px", height: "115px", background: "#9FB3A4", borderRadius: "10px" }} />
        <div style={{ width: "44px", height: "185px", background: "#E0BC87", borderRadius: "10px" }} />
      </div>
    ),
    { ...size }
  );
}
