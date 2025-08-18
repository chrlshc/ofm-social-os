import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import Navigation from '../components/navigation';

export const metadata: Metadata = {
  metadataBase: new URL('https://huntaze.com'),
  applicationName: 'Huntaze',
  title: {
    default: 'Huntaze - AI Platform for Content Creators | Automate & Scale',
    template: '%s | Huntaze',
  },
  description:
    'Transform your OnlyFans into a 6-figure automated business. AI handles messaging, content scheduling, and fan engagement 24/7 while you focus on creating.',
  keywords: ['content creators', 'OnlyFans', 'automation', 'AI', 'automated messaging', 'creator revenue', 'fan engagement'],
  authors: [{ name: 'Huntaze' }],
  creator: 'Huntaze',
  publisher: 'Huntaze',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: 'Huntaze - All-in-One AI Platform for Creators',
    description:
      'Transform your OnlyFans into a 6-figure automated business. 24/7 AI, smart messaging, advanced analytics.',
    url: 'https://huntaze.com',
    siteName: 'Huntaze',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Huntaze - AI Automation for Content Creators',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Huntaze - Automate & Multiply Your Revenue',
    description:
      'AI platform for content creators. Automate messaging, scheduling and fan engagement.',
    images: ['/twitter-image.jpg'],
    creator: '@huntaze',
  },
  alternates: {
    canonical: 'https://huntaze.com',
    languages: {
      'en-US': 'https://huntaze.com/en',
      'fr-FR': 'https://huntaze.com/fr',
    },
  },
  verification: {
    google: 'google-site-verification-code',
    yandex: 'yandex-verification-code',
    other: {
      'facebook-domain-verification': 'your-facebook-verification-code',
      'tiktok-developers-site-verification': 'MnLkAMx3uMy5eObGAi2sU6zlg3Tm0e4k',
    },
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const year = new Date().getFullYear();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/logo.svg" />
      </head>
      <body>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 md:px-6 md:py-4">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2" aria-label="Huntaze - Accueil">
                <img src="/logo.svg" alt="Logo Huntaze" className="w-8 h-8 md:w-10 md:h-10" width="40" height="40" />
                <span className="text-xl md:text-2xl font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Huntaze</span>
              </Link>
              <Navigation />
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-gray-900 text-gray-300">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
              <div>
                <h4 className="text-white font-semibold mb-4">Solutions</h4>
                <ul className="space-y-2">
                  <li><Link href="#" className="hover:text-white transition-colors">AI Automation</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Revenue Optimization</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Analytics Platform</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Professional Services</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-4">Platform</h4>
                <ul className="space-y-2">
                  <li><Link href="#" className="hover:text-white transition-colors">Security</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Integrations</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">API Documentation</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">System Status</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-4">Company</h4>
                <ul className="space-y-2">
                  <li><Link href="#" className="hover:text-white transition-colors">About Us</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Careers</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Press</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Contact</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-4">Resources</h4>
                <ul className="space-y-2">
                  <li><Link href="#" className="hover:text-white transition-colors">Documentation</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Case Studies</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Webinars</Link></li>
                  <li><Link href="#" className="hover:text-white transition-colors">Blog</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-gray-800 pt-8">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-sm">
                  © {year} Huntaze Corporation. All rights reserved.
                </div>
                <div className="flex gap-6 text-sm">
                  <Link href="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                  <Link href="/terms" className="hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                  <Link href="#" className="hover:text-white transition-colors">
                    Security
                  </Link>
                  <Link href="#" className="hover:text-white transition-colors">
                    Compliance
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}