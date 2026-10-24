'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { useCompany } from '@/lib/store';

/**
 * Top bar with the role switcher (brief section 8): switching roles changes
 * what the interface offers, and demonstrates that the guards — not the UI —
 * are what refuse.
 */
export function Header() {
  const { company, currentUserId, setCurrentUser, reset, displayCurrency, setDisplayCurrency, liveMode } = useCompany();
  if (!company) return null;

  return (
    <header className="mb-8 flex items-baseline justify-between gap-4">
      <div>
        <div className="flex items-baseline gap-4">
          <Link href="/" className="font-display text-xl font-semibold hover:underline">
            Control Room
          </Link>
          <nav className="flex gap-3 text-xs text-ink-muted">
            <Link href="/queue" className="hover:text-ink">
              Queue
            </Link>
            <Link href="/rules" className="hover:text-ink">
              Rules
            </Link>
            <Link href="/history" className="hover:text-ink">
              History
            </Link>
          </nav>
        </div>
        <p className="text-xs text-ink-muted">
          Harbourline Supply Co. · concept &amp; working simulation · all data synthetic
        </p>
      </div>
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
    </header>
  );
}
