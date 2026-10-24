import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Control Room',
  description:
    'A supervision layer for AI-run accounts payable. Portfolio concept and working simulation; all data is synthetic.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
