import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PlayerProvider } from "@/context/PlayerContext";
import { AuthProvider } from "@/context/AuthContext";
import AppShell from "@/components/AppShell";
import RegisterPWA from "@/components/RegisterPWA";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Caleta Music",
  description: "Caleta Music – La caleta que suena en todos lados",
  manifest: "/manifest.json",
  appleWebApp: {
    title: "Caleta Music",
    statusBarStyle: "black-translucent",
    capable: true,
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  }
};

export const viewport: Viewport = {
  themeColor: "#0a0f1e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

import { Toaster } from "react-hot-toast";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('theme') === 'light') {
                  document.body.classList.add('light-mode');
                }
              } catch (_) {}
            `,
          }}
        />
        <AuthProvider>
          <PlayerProvider>
            <AppShell>
              {children}
            </AppShell>
            <RegisterPWA />
            <Toaster position="bottom-center" />
          </PlayerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
