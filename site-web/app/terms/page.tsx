import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service - Huntaze',
  description: 'Terms of Service for Huntaze - AI Platform for Content Creators',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">Huntaze Terms of Service</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-neutral-700 mb-6">
            Last updated: 17 Aug 2025
          </p>

          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <p className="text-neutral-700 mb-4">
              Huntaze provides a web platform for creators to manage and publish social content. By using Huntaze, you agree:
            </p>
            
            <ul className="list-disc pl-6 mb-4 text-neutral-700 space-y-2">
              <li>You own or have rights to the content you upload.</li>
              <li>You authorize Huntaze to publish content to your connected accounts only after your explicit action.</li>
              <li>Fees, billing, and refunds follow the policies shown at checkout.</li>
              <li>Prohibited uses: illegal content, IP infringement, harassment, spam.</li>
              <li>TikTok integration: usage is subject to TikTok's Developer and Platform Policies. We may suspend access if policies are violated.</li>
              <li>Termination: you can disconnect and close your account at any time.</li>
            </ul>
          </div>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Contact</h2>
            <p className="text-neutral-700">
              Email: <a href="mailto:charles@huntaze.com" className="text-purple-600 hover:text-purple-700">charles@huntaze.com</a>
            </p>
          </section>

          <div className="mt-12 pt-8 border-t border-gray-200">
            <Link href="/" className="text-purple-600 hover:text-purple-700 font-medium">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}