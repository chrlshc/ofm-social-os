import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About - Huntaze',
  description: 'Learn about Huntaze - AI Platform for Content Creators',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white">
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-12">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent mb-6">
            About Huntaze
          </h1>
          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            Empowering content creators with AI-driven automation tools to scale their business.
          </p>
        </div>

        <section className="space-y-8">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Mission</h2>
            <p className="text-gray-700 leading-relaxed">
              Huntaze is built by creators, for creators. We understand the challenges of managing multiple 
              social media platforms while trying to create quality content. Our mission is to automate the 
              repetitive tasks so you can focus on what you do best - creating amazing content.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">What We Do</h2>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start">
                <span className="text-purple-500 mr-3">✓</span>
                <span>Automate content scheduling across TikTok, Instagram, and other platforms</span>
              </li>
              <li className="flex items-start">
                <span className="text-purple-500 mr-3">✓</span>
                <span>AI-powered fan engagement and message automation</span>
              </li>
              <li className="flex items-start">
                <span className="text-purple-500 mr-3">✓</span>
                <span>Advanced analytics to optimize your content strategy</span>
              </li>
              <li className="flex items-start">
                <span className="text-purple-500 mr-3">✓</span>
                <span>Revenue optimization tools with transparent commission structure</span>
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Values</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-lg text-purple-600 mb-2">Transparency</h3>
                <p className="text-gray-700">Clear pricing, no hidden fees. You know exactly what you pay.</p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-purple-600 mb-2">Privacy First</h3>
                <p className="text-gray-700">Your data is yours. We never share it without your consent.</p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-purple-600 mb-2">Creator Success</h3>
                <p className="text-gray-700">We only succeed when you succeed. Your growth is our priority.</p>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-purple-600 mb-2">Innovation</h3>
                <p className="text-gray-700">Constantly evolving based on creator feedback and needs.</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Join Our Community</h2>
            <p className="text-gray-700 mb-6">
              Be part of a growing community of successful content creators who are scaling their business with Huntaze.
            </p>
            <Link 
              href="/join" 
              className="inline-block bg-gradient-to-r from-pink-500 to-purple-500 text-white px-8 py-3 rounded-lg font-semibold hover:from-pink-600 hover:to-purple-600 transition"
            >
              Get Early Access
            </Link>
          </div>
        </section>

        <div className="text-center pt-8">
          <Link href="/" className="text-purple-600 hover:text-purple-700 font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}