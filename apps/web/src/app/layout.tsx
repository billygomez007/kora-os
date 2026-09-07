import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-kora",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://koraafric.com"),
  title: "Kora OS | Run Your Business Beautifully",
  description:
    "Bookings, staff, queues, payments and insights connected in one powerful platform for modern service businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-scroll-behavior="smooth" lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
