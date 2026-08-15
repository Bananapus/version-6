import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { PwaRegistration } from "@/components/PwaRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Juicebox Messaging",
  description: "Private purchase support and project community messaging.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await connection();

  return (
    <html lang="en" data-brand="juicebox">
      <body>
        {children}
        <PwaRegistration
          requiresTrustedScriptUrl={
            process.env.JUICEBOX_MESSAGING_WEB_SECURITY_MODE === "production"
          }
        />
      </body>
    </html>
  );
}
