import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kairós Reddit Copilot',
  description: 'Fila de aprovação de respostas no Reddit.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Kairós', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0f1115',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
          <header className="sticky top-0 z-10 border-b border-edge bg-ink/90 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between">
              <Link href="/" className="text-sm font-semibold tracking-tight">
                Kairós <span className="text-muted">Reddit Copilot</span>
              </Link>
              <nav className="flex gap-3 text-xs text-muted">
                <Link href="/">Fila</Link>
                <Link href="/historico">Histórico</Link>
                <Link href="/dashboard">Dados</Link>
                <Link href="/configuracoes">Config</Link>
              </nav>
            </div>
          </header>
          <main className="flex-1 px-4 py-4 pb-24">{children}</main>
        </div>
      </body>
    </html>
  );
}
