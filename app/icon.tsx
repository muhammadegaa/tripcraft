import { ImageResponse } from "next/og";
import { config } from "@/lib/config";

export const runtime = "edge";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Favicon (the logo in the browser tab): brand initial on the coral mark.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e8643c",
          color: "#fff",
          fontSize: 42,
          fontWeight: 700,
          borderRadius: 14,
          fontFamily: "sans-serif",
        }}
      >
        {config.brandName.charAt(0)}
      </div>
    ),
    { ...size }
  );
}
