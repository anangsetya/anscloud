import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "AnsCloud — Multi-Cloud Storage Aggregator",
  description: "Satukan kapasitas beberapa akun Google Drive menjadi satu cloud storage virtual. Upload otomatis terdistribusi ke drive dengan ruang kosong terbanyak, atau pilih drive tujuan secara manual.",
  keywords: ["Google Drive", "cloud storage", "multi-account", "aggregator", "AnsCloud"],
  authors: [{ name: "AnsCloud" }],
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "AnsCloud",
    description: "Multi-cloud storage aggregator dengan auto-distribution & manual drive selection",
    siteName: "AnsCloud",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AnsCloud",
    description: "Multi-cloud storage aggregator",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>{children}</Providers>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
