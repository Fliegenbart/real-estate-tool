import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../components/AppShell";

export const metadata: Metadata = {
  title: "Acquisition Desk",
  description: "Residential acquisition and underwriting MVP for a German holding company"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
