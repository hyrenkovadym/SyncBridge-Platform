import type { Metadata } from 'next';
import { AppShell } from '../components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'SyncBridge Platform',
  description: 'API/Data Integration & Automation Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
