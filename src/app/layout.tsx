import type { Metadata } from "next";
import { Lora, Alegreya_Sans } from "next/font/google";
import "./globals.css";

const lora = Lora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const alegreya = Alegreya_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Firm Document Assistant",
  description: "Ask questions about your firm's documents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${lora.variable} ${alegreya.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
