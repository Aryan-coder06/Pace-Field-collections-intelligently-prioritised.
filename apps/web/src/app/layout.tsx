import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
export const metadata: Metadata = {
  title: "Pace — Field collections, intelligently prioritised",
  description: "Field collections operating system",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f6f8",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
