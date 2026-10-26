'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useCompany } from '@/lib/store';

const TABS = [
  { href: '/queue', label: 'Queue' },
  { href: '/rules', label: 'Rules' },
  { href: '/history', label: 'History' },
];

const CURRENCIES = [
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP (display only)' },
  { value: 'EUR', label: 'EUR (display only)' },
] as const;

function Nav() {
  const pathname = usePathname();
  // An invoice is opened from the queue, so the Queue tab stays lit there.
  const activeHref = pathname.startsWith('/invoice') ? '/queue' : pathname;
  return (
    <nav aria-label="Views" className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-card">
      {TABS.map((t) => {
        const active = activeHref === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-routine-tint hover:text-ink'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4.5 3 L7.5 6 L4.5 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A menu row with a submenu that opens on hover or click of the row (and on
 * keyboard focus), so the choices are one gesture away.
 */
function SubmenuRow({
  label,
  value,
  open,
  onOpen,
  children,
}: {
  label: string;
  value: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative" onMouseEnter={() => onOpen(true)} onMouseLeave={() => onOpen(false)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
        className="flex w-full items-center justify-between gap-6 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-routine-tint"
      >
        <span>
          {label} <span className="text-ink-muted">· {value}</span>
        </span>
        <Chevron />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-full top-0 z-30 min-w-56 whitespace-nowrap rounded-xl bg-surface p-1.5 shadow-card ring-1 ring-ink/10"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-routine-tint"
    >
      <span className="w-3 text-ink">{selected ? '✓' : ''}</span>
      {children}
    </button>
  );
}

function SettingsMenu() {
  const { company, currentUserId, setCurrentUser, reset, displayCurrency, setDisplayCurrency } = useCompany();
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<'currency' | 'role' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!company) return null;
  const user = company.users.find((u) => u.id === currentUserId);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setSub(null);
        }}
        className="rounded-md p-1.5 text-ink hover:bg-routine-tint"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div role="menu" className="absolute left-0 top-full z-20 mt-2 w-60 rounded-xl bg-surface p-1.5 shadow-card ring-1 ring-ink/10">
          <SubmenuRow
            label="Currency"
            value={displayCurrency}
            open={sub === 'currency'}
            onOpen={(o) => setSub(o ? 'currency' : null)}
          >
            {CURRENCIES.map((c) => (
              <Option
                key={c.value}
                selected={displayCurrency === c.value}
                onClick={() => {
                  setDisplayCurrency(c.value);
                  setOpen(false);
                }}
              >
                {c.label}
              </Option>
            ))}
          </SubmenuRow>
          <SubmenuRow
            label="Role"
            value={user ? user.role : '—'}
            open={sub === 'role'}
            onOpen={(o) => setSub(o ? 'role' : null)}
          >
            {company.users.map((u) => (
              <Option
                key={u.id}
                selected={u.id === currentUserId}
                onClick={() => {
                  setCurrentUser(u.id);
                  setOpen(false);
                }}
              >
                {u.name} <span className="text-ink-muted">· {u.role}</span>
              </Option>
            ))}
          </SubmenuRow>
          <div className="my-1 border-t border-ink/10" />
          <button
            type="button"
            role="menuitem"
            title="Start the demo over: re-seed the synthetic company and discard every decision made in this browser."
            onClick={() => {
              setOpen(false);
              void reset();
            }}
            className="w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-routine-tint"
          >
            Reset demo
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Top bar: menu and wordmark (home) on the left, AI status on the right,
 * view tabs centred. The menu holds the role switcher (brief section 8):
 * switching roles changes what the interface offers, and demonstrates that
 * the guards — not the UI — are what refuse.
 */
export function Header() {
  const { company, liveMode } = useCompany();

  return (
    <header className="mb-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <SettingsMenu />
          <Link href="/" className="font-display text-xl font-semibold hover:underline">
            AProve
          </Link>
        </div>
        {company ? (
          <span
            className="whitespace-nowrap rounded-full border border-ink-muted/30 px-2 py-0.5 text-[11px] text-ink-muted"
            title={liveMode ? 'Genuine fixtures run against the live model.' : 'No live model configured; AI results are authored and labelled Staged.'}
          >
            {liveMode ? 'AI: live' : 'AI: staged only'}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex justify-center">
        <Nav />
      </div>
    </header>
  );
}
