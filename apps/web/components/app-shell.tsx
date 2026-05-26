import Link from 'next/link';
import { ReactNode } from 'react';

import { navLinks } from '../lib/navigation';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SyncBridge Platform</p>
          <h1>API/Data Integration &amp; Automation Platform</h1>
        </div>
        <nav>
          {navLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="content">{children}</main>
    </div>
  );
}
