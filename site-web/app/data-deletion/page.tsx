import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Data Deletion - Huntaze',
  description: 'Request deletion of your data from Huntaze',
};

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
          Data Deletion Request
        </h1>
        
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4">How to Delete Your Data</h2>
          
          <p className="text-gray-700 mb-6">
            We respect your privacy and provide you with full control over your data. 
            You can request deletion of your data at any time.
          </p>

          <div className="space-y-6">
            <section>
              <h3 className="text-xl font-semibold mb-3">What data will be deleted:</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Your account information (name, email)</li>
                <li>Connected social media accounts (Instagram, TikTok)</li>
                <li>Scheduled posts and content</li>
                <li>Analytics and usage data</li>
                <li>OAuth tokens and authentication data</li>
              </ul>
            </section>

            <section>
              <h3 className="text-xl font-semibold mb-3">To request data deletion:</h3>
              <ol className="list-decimal pl-6 text-gray-700 space-y-2">
                <li>Send an email to <a href="mailto:privacy@huntaze.com" className="text-purple-600 hover:text-purple-700">privacy@huntaze.com</a></li>
                <li>Include your account email address</li>
                <li>Specify if you want full deletion or partial deletion</li>
                <li>We will process your request within 30 days</li>
              </ol>
            </section>

            <section>
              <h3 className="text-xl font-semibold mb-3">Alternative methods:</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700 mb-2">
                  <strong>From your dashboard:</strong> Go to Settings → Privacy → Delete Account
                </p>
                <p className="text-gray-700">
                  <strong>Contact support:</strong> charles@huntaze.com
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-xl font-semibold mb-3">Important notes:</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Data deletion is permanent and cannot be undone</li>
                <li>Some data may be retained for legal compliance (max 90 days)</li>
                <li>Active subscriptions must be cancelled before deletion</li>
              </ul>
            </section>
          </div>

          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 text-sm">
              <strong>Note:</strong> This deletion request applies to data stored by Huntaze. 
              Content already published to your social media accounts will not be affected.
            </p>
          </div>
        </div>

        <div className="text-center">
          <Link href="/" className="text-purple-600 hover:text-purple-700 font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}