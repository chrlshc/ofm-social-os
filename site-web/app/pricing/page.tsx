import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Discover the transparent commission system of OFM Social OS. No monthly fees, just a fair commission that decreases as your revenue grows.',
};

// Définition des paliers de commission.
const tiers = [
  { range: '< €2k/month', rate: '0%', badge: 'FREE' },
  { range: '€2k – €5k', rate: '25%', badge: null },
  { range: '€5k – €10k', rate: '20%', badge: null },
  { range: '€10k – €20k', rate: '15%', badge: null },
  { range: '€20k – €30k', rate: '10%', badge: null },
  { range: 'Above €30k', rate: '5%', badge: 'BEST' },
];

export default function PricingPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16 space-y-24">
      {/* Commission System */}
      <section className="space-y-8">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
            Our Unique Commission System
          </h1>
          <p className="mt-4 text-gray-700 max-w-2xl mx-auto">
            Zero monthly fees. Zero setup costs. We take a commission based on your
            total monthly earnings. The more you earn, the lower your commission
            rate!
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {tiers.map((tier, index) => (
            <div
              key={index}
              className="relative p-6 rounded-2xl shadow-md border border-purple-200 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 text-center overflow-hidden"
            >
              {tier.badge && (
                <span className="absolute top-3 right-3 text-xs font-semibold text-white bg-gradient-to-r from-pink-500 to-purple-500 rounded-full px-3 py-1">
                  {tier.badge}
                </span>
              )}
              <div className="text-lg font-medium text-gray-700 mb-1">
                {tier.range}
              </div>
              <div className="text-5xl font-extrabold text-purple-600 mb-1">
                {tier.rate}
              </div>
              <div className="text-sm text-gray-500">
                Commission
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why Creators Choose Us */}
      <section className="space-y-8 bg-gradient-to-b from-purple-50 via-pink-50 to-white rounded-2xl p-10">
        <h2 className="text-3xl sm:text-4xl font-bold text-center text-purple-700">
          Why Creators Choose Us
        </h2>
        <p className="text-center text-gray-700 max-w-2xl mx-auto">
          We've designed our platform to be accessible, secure and flexible. Here are
          just a few reasons why hundreds of creators trust OFM Social OS to grow
          their businesses.
        </p>
        <ul className="max-w-3xl mx-auto space-y-4 text-gray-700">
          <li className="flex items-start">
            <span className="flex-shrink-0 mt-1 mr-3 text-purple-500">✔</span>
            <span>Zero technical skills required — focus on your craft, we handle the rest.</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 mt-1 mr-3 text-purple-500">✔</span>
            <span>Set up in under 5 minutes — our onboarding process is quick and seamless.</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 mt-1 mr-3 text-purple-500">✔</span>
            <span>100% secure & private — built with GDPR in mind and official APIs only.</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 mt-1 mr-3 text-purple-500">✔</span>
            <span>Cancel anytime, no long‑term lock‑in — you're in control of your career.</span>
          </li>
        </ul>
        <div className="text-center mt-8">
          <Link
            href="/join"
            className="inline-block bg-gradient-to-r from-pink-500 to-purple-500 text-white px-6 py-3 rounded-md shadow hover:from-pink-600 hover:to-purple-600 transition-colors"
          >
            Join the waitlist
          </Link>
        </div>
      </section>
    </div>
  );
}