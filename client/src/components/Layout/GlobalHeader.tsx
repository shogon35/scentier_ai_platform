import React from 'react';

interface GlobalHeaderProps {
  className?: string;
}

interface LinkItem {
  href: string;
  label: string;
  external?: boolean;
}

export default function GlobalHeader({ className }: GlobalHeaderProps) {
  // ナビゲーションリンク
  const navigationLinks: LinkItem[] = [
    { href: '/', label: 'ホーム', external: false },
    { href: 'https://app-web-stg-877303585254.asia-northeast1.run.app/sign-in', label: 'Scentier Creative', external: true },
    { href: 'https://support.scentier.com', label: 'サポート', external: true },
    { href: 'https://about.scentier.com', label: '会社情報', external: true },
  ];

  // お知らせリンク（アイコン付き）
  const notificationLink = {
    href: 'https://news.scentier.com',
    label: 'お知らせ',
    hasNew: true, // 新着通知の表示フラグ
  };

  return (
    <div 
      className={className || "sticky top-0 z-50 w-full border-b border-border-light bg-surface-primary"}
      role="banner"
    >
      <div className="mx-auto flex h-10 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* ロゴセクション */}
        <div className="flex items-center">
          <a href="/" className="flex items-center gap-2 text-text-primary hover:opacity-80 transition-opacity">
            <img 
              src="/assets/favicon-32x32.png" 
              alt="Scentier" 
              className="h-6 w-6"
            />
            <span className="text-sm font-semibold hidden sm:inline-block">Scentier</span>
          </a>
        </div>

        {/* 中央のナビゲーション */}
        <nav className="hidden md:flex items-center gap-6" role="navigation">
          {navigationLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* 右側のアクション */}
        <div className="flex items-center gap-4">
          {/* お知らせアイコン */}
          <a
            href={notificationLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="relative p-1 text-text-secondary hover:text-text-primary transition-colors"
            aria-label={notificationLink.label}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {notificationLink.hasNew && (
              <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-500" />
            )}
          </a>

          {/* モバイルメニューボタン */}
          <button
            className="md:hidden p-1 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="メニューを開く"
            onClick={() => {
              // TODO: モバイルメニューの実装
              console.log('Mobile menu clicked');
            }}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
