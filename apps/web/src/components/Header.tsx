'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatDate } from '@/lib/format';
import { useCompany } from '@/lib/store';

/**
 * Top bar with the role switcher (brief section 8): switching roles changes
 * what the interface offers, and demonstrates that the guards — not the UI —
 * are what refuse.
 */
const TABS = [
  { href: '/queue', label: 'Queue' },
  { href: '/rules', label: 'Rules' },
  { href: '/history', label: 'History' },
];

function Nav() {
  const pathname = usePathname();
  // An invoice is opened from the queue, so the Queue tab stays lit there.
  const activeHref = pathname.startsWith('/invoice') ? '/queue' : pathname;
  const pill = (active: boolean) =>
    `inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-routine-tint hover:text-ink'
    }`;
  return (
    <nav aria-label="Views" className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-card">
      <Link href="/" aria-label="Home" aria-current={pathname === '/' ? 'page' : undefined} className={pill(pathname === '/')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M2 7.5 8 2.5l6 5M3.5 6.5V13h3V9.5h3V13h3V6.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={activeHref === t.href ? 'page' : undefined} className={pill(activeHref === t.href)}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Header() {
  const { company, currentUserId, setCurrentUser, reset, displayCurrency, setDisplayCurrency, liveMode } = useCompany();

  return (
    <header className="mb-8 flex items-baseline justify-between gap-4">
      <div>
        <div className="flex items-center gap-4">
          <Link href="/" className="font-display text-xl font-semibold hover:underline">
            Control Room
          </Link>
          <Nav />
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          Harbourline Supply Co. · concept &amp; working simulation · all data synthetic
        </p>
      </div>
      {company ? (
      <div className="flex items-center gap-3 text-xs">
        <span
          className="whitespace-nowrap rounded-full border border-ink-muted/30 px-2 py-0.5 text-[11px] text-ink-muted"
          title={liveMode ? 'Genuine fixtures run against the live model.' : 'No live model configured; AI results are authored and labelled Staged.'}
        >
          {liveMode ? 'AI: live' : 'AI: staged only'}
        </span>
        <span className="text-ink-muted">Demo today: {formatDate(company.settings.demoToday)} 2025</span>
        <select
          aria-label="Display currency"
          className="rounded-md border border-routine-tint bg-surface px-2 py-1"
          value={displayCurrency}
          onChange={(e) => setDisplayCurrency(e.target.value as 'USD' | 'GBP' | 'EUR')}
        >
          <option value="USD">USD</option>
          <option value="GBP">GBP (display only)</option>
          <option value="EUR">EUR (display only)</option>
        </select>
        <select
          aria-label="Acting as"
          className="rounded-md border border-routine-tint bg-surface px-2 py-1"
          value={currentUserId}
          onChange={(e) => setCurrentUser(e.target.value)}
        >
          {company.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.role}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void reset()}
          title="Start the demo over: re-seed the synthetic company and discard every decision made in this browser."
          className="rounded-md border border-routine-tint bg-surface px-2 py-1 text-ink-muted hover:text-ink"
        >
          Reset demo
        </button>
      </div>
      ) : null}
    </header>
  );
}
