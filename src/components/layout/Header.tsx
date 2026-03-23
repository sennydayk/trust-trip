'use client';

import Link from 'next/link';

interface HeaderProps {
  showSearch?: boolean;
  userName?: string;
}

export default function Header({ showSearch = true, userName }: HeaderProps) {
  const initials = userName
    ? userName.slice(0, 2).toUpperCase()
    : 'U';

  return (
    <header className="border-b border-neutral-border bg-white">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4">
        {/* 로고 */}
        <Link href="/" className="text-primary text-base font-semibold tracking-tight">
          TrustTrip
        </Link>

        {/* 중앙 검색바 */}
        {showSearch && (
          <div className="mx-6 hidden flex-1 sm:block sm:max-w-[400px]">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-light"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
              <input
                type="text"
                placeholder="여행지 검색..."
                className="h-9 w-full rounded border border-neutral-border bg-neutral-surface pl-9 pr-3 text-xs font-normal text-neutral-dark placeholder:text-neutral-light focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* 우측 아바타 */}
        <Link
          href="/mypage"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
