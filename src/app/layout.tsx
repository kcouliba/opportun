import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opportun - Freelance Pipeline Manager",
  description: "Leads come to you, filtered and ready. One click to apply. Never scramble again.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
