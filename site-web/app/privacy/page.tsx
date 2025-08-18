import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy - Huntaze',
  description: 'Privacy Policy for Huntaze - AI Platform for Content Creators',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">Huntaze Privacy Policy</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-neutral-700 mb-6">
            Last updated: 17 Aug 2025
          </p>

          <div className="bg-white rounded-lg shadow-sm p-6 mb-8 space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-3">Data we process</h2>
              <p className="text-neutral-700">
                Account info, content you upload, OAuth tokens for connected platforms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Purpose</h2>
              <p className="text-neutral-700">
                Scheduling/publishing content you request, analytics, support, security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Storage</h2>
              <p className="text-neutral-700">
                Tokens are encrypted at rest (KMS/Secrets Manager); access is restricted.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Sharing</h2>
              <p className="text-neutral-700">
                We share data only with service providers necessary to run Huntaze (e.g., hosting, analytics) and the platforms you connect (e.g., TikTok) to perform your actions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Retention</h2>
              <p className="text-neutral-700">
                Data is retained while your account is active; you can request deletion at any time.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Your rights (GDPR)</h2>
              <p className="text-neutral-700">
                Access, rectification, deletion, portability, objection.
              </p>
            </section>
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