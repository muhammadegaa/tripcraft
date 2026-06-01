import { ImageResponse } from "next/og";
import { config } from "@/lib/config";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#faf7f2",
          color: "#15110c",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#e8643c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700 }}>{config.brandName.charAt(0)}</div>
          <div style={{ fontSize: 30, fontWeight: 700 }}>{config.brandName}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, maxWidth: 980 }}>
            Your whole trip, planned to the minute.
          </div>
          <div style={{ fontSize: 30, color: "#15110c", opacity: 0.6, maxWidth: 900 }}>
            Stays in the right spots · no exhausting travel days · on your budget · anywhere in the world.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {["Booked in-app", "Constraint-perfect", "Live daily guide"].map((t) => (
            <div key={t} style={{ fontSize: 24, color: "#1f9d6b", background: "rgba(31,157,107,0.1)", padding: "10px 20px", borderRadius: 999 }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
