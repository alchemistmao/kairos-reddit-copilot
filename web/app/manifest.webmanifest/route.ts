import { NextResponse } from 'next/server';

/** PWA: instalável no celular para aprovar em 30 segundos (spec 3.4). */
export function GET() {
  return NextResponse.json({
    name: 'Kairós Reddit Copilot',
    short_name: 'Kairós',
    description: 'Fila de aprovação de respostas no Reddit.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f1115',
    theme_color: '#0f1115',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
  });
}
