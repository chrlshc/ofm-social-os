import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Discover the transparent commission system of OFM Social OS. No monthly fees, just a fair commission that decreases as your revenue grows.',
};

// Définition des paliers de commission avec design progressif
const tiers = [
  { range: 'Under', amount: '$2,000/month', rate: '0%', badge: 'FREE', color: 'green' },
  { range: 'Between', amount: '$2k - $5k', rate: '25%', badge: null, color: 'teal' },
  { range: 'Between', amount: '$5k - $10k', rate: '20%', badge: null, color: 'blue' },
  { range: 'Between', amount: '$10k - $20k', rate: '15%', badge: null, color: 'purple' },
  { range: 'Between', amount: '$20k - $30k', rate: '10%', badge: null, color: 'pink' },
  { range: 'Above', amount: '$30k', rate: '5%', badge: null, color: 'gold', isPremium: true },
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
          {tiers.map((tier, index) => {
            const getCardStyles = () => {
              if (tier.isPremium) {
                return "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-2 border-yellow-500/50 shadow-2xl transform hover:scale-105 transition-all duration-300";
              }
              
              const colorMap: Record<string, string> = {
                green: "bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 border-green-200",
                teal: "bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 border-teal-200",
                blue: "bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-blue-200",
                purple: "bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 border-purple-200",
                pink: "bg-gradient-to-br from-pink-50 via-rose-50 to-orange-50 border-pink-200",
              };
              
              return colorMap[tier.color || ''] || "bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 border-purple-200";
            };

            const getTextStyles = () => {
              if (tier.isPremium) {
                return {
                  range: "text-yellow-400",
                  amount: "text-white",
                  rate: "text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500",
                  commission: "text-gray-400",
                };
              }

              const colorTextMap: Record<string, { rate: string }> = {
                green: { rate: "text-green-600" },
                teal: { rate: "text-teal-600" },
                blue: { rate: "text-blue-600" },
                purple: { rate: "text-purple-600" },
                pink: { rate: "text-pink-600" },
              };

              return {
                range: "text-gray-600",
                amount: "text-gray-900",
                rate: colorTextMap[tier.color || '']?.rate || "text-purple-600",
                commission: "text-gray-500",
              };
            };

            const styles = getTextStyles();

            return (
              <div
                key={index}
                className={`relative p-6 rounded-2xl shadow-md border text-center overflow-hidden ${getCardStyles()}`}
              >
                {tier.badge && (
                  <span className="absolute top-3 right-3 text-xs font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-500 rounded-full px-3 py-1">
                    {tier.badge}
                  </span>
                )}
                {tier.isPremium && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-t from-yellow-500/10 via-transparent to-transparent"></div>
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-yellow-500/20 rounded-full blur-3xl"></div>
                    <span className="absolute top-3 right-3 text-xs font-semibold text-gray-900 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full px-3 py-1">
                      Soon...
                    </span>
                  </>
                )}
                <div className={`text-sm font-medium mb-1 ${styles.range}`}>
                  {tier.range}
                </div>
                <div className={`text-lg font-bold mb-3 ${styles.amount}`}>
                  {tier.amount}
                </div>
                <div className={`text-5xl font-extrabold mb-1 ${styles.rate}`}>
                  {tier.rate}
                </div>
                <div className={`text-sm ${styles.commission}`}>
                  commission
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Why Creators Choose Us */}
      <section className="space-y-8 bg-gradient-to-b from-purple-50 via-pink-50 to-purple-50/30 rounded-2xl p-10">
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