'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';

import { getStoredSession } from '../lib/auth';
import { api } from '../lib/api';
import { navLinks } from '../lib/navigation';

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    setUserEmail(session?.user?.email ?? null);
  }, [pathname]);

  const handleLogout = async () => {
    await api.logout();
    setUserEmail(null);
    router.push('/login');
  };

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
        <div className="session-row">
          <span>{userEmail ? `Signed in: ${userEmail}` : 'Not authenticated'}</span>
          <button type="button" onClick={handleLogout} disabled={!userEmail}>
            Logout
          </button>
        </div>
      </header>

      <main className="content">{children}</main>
    </div>
  );
}
