import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Account Deauthorized - Huntaze',
  description: 'Your account has been deauthorized',
};

export default function DeauthorizePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <svg className="w-16 h-16 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Account Deauthorized</h1>
        
        <p className="text-gray-600 mb-6">
          Your Instagram/Facebook account has been successfully disconnected from Huntaze.
        </p>
        
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700">
            Your data will be deleted according to our privacy policy. 
            If you wish to use Huntaze again, you can reconnect your account at any time.
          </p>
        </div>
        
        <div className="space-y-3">
          <Link 
            href="/" 
            className="block w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-lg font-semibold hover:from-pink-600 hover:to-purple-600 transition"
          >
            Return to Home
          </Link>
          
          <Link 
            href="/privacy" 
            className="block text-purple-600 hover:text-purple-700 font-medium"
          >
            View Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}