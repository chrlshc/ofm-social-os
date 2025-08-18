import React from 'react';
import Link from 'next/link';
import { Button } from '../components/ui/button';
import { ArrowRight, BarChart3, Shield, Zap, Users, Globe, Heart, Sparkles, Crown, CheckCircle, DollarSign, Star, Trophy, TrendingUp } from 'lucide-react';

export default function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="py-12 px-4 md:py-20 lg:py-24 bg-gradient-to-br from-purple-50 via-white to-pink-50 overflow-hidden relative">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-200 rounded-full filter blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-pink-200 rounded-full filter blur-3xl opacity-20 translate-y-1/2 -translate-x-1/2"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <h1 className="text-3xl md:text-5xl lg:text-6xl mb-4 md:mb-6 animate-fade-in leading-tight">
                All-in-One AI Platform for{' '}
                <span className="text-gradient">Content Creators</span>
              </h1>
              <p className="text-lg md:text-xl mb-6 md:mb-8 text-neutral-700">
                Transform your OnlyFans into a 6-figure automated business. Our AI handles messaging, content scheduling, and fan engagement 24/7 while you focus on creating.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild className="btn-primary w-full sm:w-auto" aria-label="Démarrer votre essai gratuit de Huntaze">
                  <Link href="/join">
                    Get Early Access
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild className="btn-secondary w-full sm:w-auto" aria-label="Découvrir les solutions Huntaze">
                  <Link href="#solutions">View Solutions</Link>
                </Button>
              </div>
              <div className="mt-8 md:mt-12 grid grid-cols-3 gap-4 md:gap-8">
                <div className="text-center">
                  <div className="text-2xl md:text-4xl font-bold text-gradient">500+</div>
                  <div className="text-xs md:text-sm text-neutral-700">6-Figure Creators</div>
                </div>
                <div className="text-center border-x border-purple-200">
                  <div className="text-2xl md:text-4xl font-bold text-gradient">$50M+</div>
                  <div className="text-xs md:text-sm text-neutral-700">Revenue Generated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl md:text-4xl font-bold text-gradient">24/7</div>
                  <div className="text-xs md:text-sm text-neutral-700">AI Automation</div>
                </div>
              </div>
            </div>
            <div className="relative order-first lg:order-last">
              <div className="relative">
                {/* Phone mockup */}
                <div className="mx-auto max-w-sm">
                  <div className="relative bg-gradient-to-br from-purple-600 to-pink-600 rounded-[2.5rem] p-2">
                    <div className="bg-black rounded-[2.25rem] p-4">
                      <div className="bg-white rounded-[1.75rem] h-[500px] flex flex-col">
                        {/* Phone header */}
                        <div className="bg-gray-100 rounded-t-[1.75rem] p-4 border-b">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full"></div>
                            <div>
                              <div className="font-semibold text-sm">AI Assistant</div>
                              <div className="text-xs text-green-500">● Active now</div>
                            </div>
                          </div>
                        </div>
                        {/* Chat messages */}
                        <div className="flex-1 p-4 space-y-3">
                          <div className="bg-purple-100 text-purple-900 p-3 rounded-2xl rounded-tl-sm max-w-[80%]">
                            <p className="text-sm">Hello! Thank you for subscribing to my exclusive content. What type of content interests you most?</p>
                          </div>
                          <div className="bg-gray-100 p-3 rounded-2xl rounded-tr-sm max-w-[80%] ml-auto">
                            <p className="text-sm">I really enjoy your artistic photography</p>
                          </div>
                          <div className="bg-purple-100 text-purple-900 p-3 rounded-2xl rounded-tl-sm max-w-[80%]">
                            <p className="text-sm">Wonderful! I've just released a new artistic collection. I'll send you a preview link with special subscriber pricing.</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                            <Sparkles className="w-3 h-3" />
                            <span>AI is handling this conversation</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Floating stats */}
                <div className="absolute -top-4 -right-4 bg-white rounded-lg shadow-lg p-3 hidden md:block">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    <div>
                      <div className="text-xs text-gray-500">Revenue</div>
                      <div className="font-bold">+285%</div>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-4 -left-4 bg-white rounded-lg shadow-lg p-3 hidden md:block">
                  <div className="flex items-center gap-2">
                    <Heart className="w-5 h-5 text-pink-500" />
                    <div>
                      <div className="text-xs text-gray-500">Active Fans</div>
                      <div className="font-bold">2,847</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="py-12 md:py-16 px-4 bg-gradient-to-r from-purple-50 to-pink-50 border-t border-b border-purple-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3">Trusted Partners</h3>
            <p className="text-sm md:text-base text-neutral-700">Officially partnered with leading creator platforms</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 items-center">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient mb-1">OnlyFans</div>
              <div className="text-xs text-neutral-600">Official Partner</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient mb-1">Fansly</div>
              <div className="text-xs text-neutral-600">Verified Agency</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient mb-1">LoyalFans</div>
              <div className="text-xs text-neutral-600">Top Performer</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient mb-1">FanCentro</div>
              <div className="text-xs text-neutral-600">Elite Status</div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 md:py-24 lg:py-32 relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-pink-50">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-pink-50 to-purple-50 opacity-30"></div>
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-purple-300 rounded-full filter blur-[100px] opacity-20"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-pink-300 rounded-full filter blur-[100px] opacity-20"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12 md:mb-16">
            <span className="inline-block text-sm font-semibold text-purple-600 uppercase tracking-wider mb-2">Transparent Pricing</span>
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-4">Tiered <span className="text-gradient">Commission</span></h2>
            <p className="text-base md:text-xl text-neutral-700 max-w-3xl mx-auto px-4">
              Zero monthly fees. Zero setup costs. We take a commission based on your total monthly earnings. The more you earn, the lower your commission rate!
            </p>
          </div>
          
          <div className="max-w-6xl mx-auto">
            {/* Hero Commission Box */}
            <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 mb-12 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-200 to-pink-200 rounded-full filter blur-3xl opacity-30"></div>
              <div className="relative z-10">
                <h3 className="text-2xl md:text-3xl font-bold text-center mb-8">Our <span className="text-gradient">Unique Commission</span> System</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Free Tier */}
                  <div className="relative bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 rounded-2xl p-6 border-2 border-green-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3">
                      <span className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">FREE</span>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Under</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">$2,000/month</p>
                      <p className="text-5xl font-bold text-green-600">0%</p>
                      <p className="text-sm text-gray-500 mt-2">commission</p>
                    </div>
                  </div>
                  
                  {/* 25% Tier */}
                  <div className="relative bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 rounded-2xl p-6 border-2 border-teal-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Between</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">$2k - $5k</p>
                      <p className="text-5xl font-bold text-teal-600">25%</p>
                      <p className="text-sm text-gray-500 mt-2">commission</p>
                    </div>
                  </div>
                  
                  {/* 20% Tier */}
                  <div className="relative bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-6 border-2 border-blue-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Between</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">$5k - $10k</p>
                      <p className="text-5xl font-bold text-blue-600">20%</p>
                      <p className="text-sm text-gray-500 mt-2">commission</p>
                    </div>
                  </div>
                  
                  {/* 15% Tier */}
                  <div className="relative bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 rounded-2xl p-6 border-2 border-purple-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Between</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">$10k - $20k</p>
                      <p className="text-5xl font-bold text-purple-600">15%</p>
                      <p className="text-sm text-gray-500 mt-2">commission</p>
                    </div>
                  </div>
                  
                  {/* 10% Tier */}
                  <div className="relative bg-gradient-to-br from-pink-50 via-rose-50 to-orange-50 rounded-2xl p-6 border-2 border-pink-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Between</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">$20k - $30k</p>
                      <p className="text-5xl font-bold text-pink-600">10%</p>
                      <p className="text-sm text-gray-500 mt-2">commission</p>
                    </div>
                  </div>
                  
                  {/* 5% Tier - Premium Black/Gold */}
                  <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-6 border-2 border-yellow-500/50 shadow-2xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:scale-105 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-yellow-500/10 via-transparent to-transparent"></div>
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-yellow-500/20 rounded-full blur-3xl"></div>
                    <div className="absolute -top-3 -right-3">
                      <span className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-gray-900 text-xs font-bold px-3 py-1 rounded-full shadow-md">Soon...</span>
                    </div>
                    <div className="text-center relative z-10">
                      <p className="text-yellow-400 text-sm mb-2">Above</p>
                      <p className="text-3xl font-bold text-white mb-2">$30k</p>
                      <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500">5%</p>
                      <p className="text-sm text-gray-400 mt-2">commission</p>
                    </div>
                  </div>
                </div>
                
                {/* Example Calculation */}
                <div className="mt-8 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-200">
                  <h4 className="font-semibold text-lg mb-3 text-center">💡 Example: If you earn $15,000/month</h4>
                  <div className="text-center">
                    <p className="text-gray-600 mb-2">You're in the $10k - $20k tier</p>
                    <p className="text-3xl font-bold text-purple-600">You only pay 15%</p>
                    <p className="text-lg text-gray-600 mt-2">Total commission: <span className="font-bold">$2,250</span></p>
                    <p className="text-sm text-gray-500 mt-1">(15% of $15,000)</p>
                  </div>
                  <div className="mt-4 p-4 bg-white rounded-lg">
                    <p className="text-sm text-gray-600 text-center">
                      <span className="font-semibold">Comparison:</span> Other agencies take 30-50% of ALL your revenue.
                      <br />
                      With them, you'd pay <span className="line-through text-red-500">€4,500 to €7,500</span>!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Call to action */}
            <div className="text-center mt-12">
              <p className="text-lg text-gray-700 mb-6">
                Want to see the full breakdown of our commission structure?
              </p>
              <Button asChild className="btn-primary">
                <Link href="/pricing">
                  View Detailed Pricing
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-12 text-center">
              <p className="text-lg text-gray-700 font-medium mb-4">
                <Star className="inline-block w-5 h-5 text-yellow-500 mr-2" />
                Commission based on your total monthly revenue
              </p>
              <p className="text-gray-600 max-w-2xl mx-auto">
                The more you earn, the less commission you pay. Simple and transparent!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Section */}
      <section id="solutions" className="py-20 px-4 md:py-24 lg:py-32 bg-white relative overflow-hidden border-t border-gray-100">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-3">
          <div className="absolute inset-0" style={{backgroundImage: `repeating-linear-gradient(45deg, #9333ea 0, #9333ea 1px, transparent 1px, transparent 15px)`, backgroundSize: '20px 20px'}}></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl lg:text-5xl mb-4">Everything You Need to <span className="text-gradient">Scale Your OnlyFans</span></h2>
            <p className="text-base md:text-xl text-neutral-700 max-w-3xl mx-auto px-4">
              One platform, endless possibilities. Automate your entire OnlyFans business with our AI-powered suite designed specifically for content creators.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {/* AI Messaging */}
            <div className="girly-card p-6 md:p-8">
              <Sparkles className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" aria-hidden="true" />
              <h3 className="mb-3">AI Messaging Assistant</h3>
              <p className="mb-4">
                Never miss a message again. Our AI learns your personality to engage fans 24/7, increasing tips and PPV sales by up to 300%.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Personalized fan conversations</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Smart tip suggestions</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">PPV sales optimization</span>
                </li>
              </ul>
            </div>

            {/* Content Scheduling */}
            <div className="girly-card p-6 md:p-8">
              <Crown className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" aria-hidden="true" />
              <h3 className="mb-3">Smart Content Scheduler</h3>
              <p className="mb-4">
                Post at the perfect time, every time. Our AI analyzes your audience to schedule content when engagement is highest, boosting your visibility.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Optimal posting times</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Multi-platform posting</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Content performance tracking</span>
                </li>
              </ul>
            </div>

            {/* Fan Analytics */}
            <div className="girly-card p-6 md:p-8">
              <BarChart3 className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" aria-hidden="true" />
              <h3 className="mb-3">Advanced Fan Analytics</h3>
              <p className="mb-4">
                Know your fans better than ever. Track spending patterns, engagement rates, and preferences to maximize revenue from every subscriber.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Detailed fan insights</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Revenue predictions</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Churn prevention alerts</span>
                </li>
              </ul>
            </div>


            {/* PPV Management */}
            <div className="girly-card p-6 md:p-8">
              <DollarSign className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" aria-hidden="true" />
              <h3 className="mb-3">PPV & Tip Optimizer</h3>
              <p className="mb-4">
                Maximize your pay-per-view sales and tips with AI-driven pricing strategies. Our system learns what content sells best at what price.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Dynamic pricing optimization</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Automated tip menus</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Revenue maximization</span>
                </li>
              </ul>
            </div>

            {/* Creator Support */}
            <div className="girly-card p-6 md:p-8">
              <Star className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" aria-hidden="true" />
              <h3 className="mb-3">VIP Creator Support</h3>
              <p className="mb-4">
                You're never alone on your journey. Get 24/7 support from our team of OnlyFans experts who understand the creator economy.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Personal success manager</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">24/7 live chat support</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-800">Growth strategy sessions</span>
                </li>
              </ul>
            </div>
            
            {/* Next Features - Card 6 */}
            <div className="girly-card p-6 md:p-8">
              <Sparkles className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" aria-hidden="true" />
              <h3 className="mb-3">Community Driven</h3>
              <p className="mb-4">
                Every Monday, we ask our community to vote on new features. The most requested features get built within 7 days.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-purple-600">🎥</span>
                  <span className="text-neutral-800">AI Video Scripts <span className="text-sm text-neutral-600">(Week 2)</span></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600">📱</span>
                  <span className="text-neutral-800">TikTok Integration <span className="text-sm text-neutral-600">(Week 3)</span></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600">💳</span>
                  <span className="text-neutral-800">Crypto Payments <span className="text-sm text-neutral-600">(Week 4)</span></span>
                </li>
              </ul>
              <div className="mt-4 pt-4 border-t border-purple-100">
                <p className="text-sm font-medium text-purple-700 text-center">🗳️ Vote Every Monday</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community-Driven Features Section */}
      <section className="py-20 px-4 md:py-24 lg:py-32 bg-gradient-to-r from-purple-50 via-pink-50 to-purple-50 relative overflow-hidden">
        <div className="absolute inset-0 bg-white opacity-50"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <span className="inline-block text-sm font-semibold text-purple-700 uppercase tracking-wider mb-2">Built by Creators, For Creators</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900">Continuous <span className="text-gradient bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">Innovation</span></h2>
            <p className="text-lg md:text-xl text-gray-800 max-w-3xl mx-auto">
              Our platform evolves continuously based on feedback from our community of successful creators.
            </p>
          </div>
          
          
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-purple-200">
            <h3 className="text-2xl font-bold mb-6 text-center text-gray-900">Recently Added Features</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-xl">✓</span>
                <div>
                  <h4 className="font-semibold mb-1 text-gray-900">Auto Voice Messages</h4>
                  <p className="text-sm text-gray-700">Send personalized voice notes automatically</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-xl">✓</span>
                <div>
                  <h4 className="font-semibold mb-1 text-gray-900">Smart Price Testing</h4>
                  <p className="text-sm text-gray-700">A/B test your content prices for max revenue</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-xl">✓</span>
                <div>
                  <h4 className="font-semibold mb-1 text-gray-900">Fan Loyalty Rewards</h4>
                  <p className="text-sm text-gray-700">Automated rewards for your most loyal subscribers</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-500 text-xl">✓</span>
                <div>
                  <h4 className="font-semibold mb-1 text-gray-900">Content Performance AI</h4>
                  <p className="text-sm text-gray-700">Predict which content will perform best</p>
                </div>
              </div>
            </div>
            <div className="mt-8 text-center">
              <p className="text-gray-700 mb-4">Join our community and help shape the future of the platform!</p>
              <Button asChild className="btn-primary">
                <Link href="/join">Get Early Access</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ROI Section */}
      <section className="py-20 px-4 md:py-24 lg:py-32 bg-gradient-to-br from-purple-50 via-pink-50 to-white border-t border-purple-100">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="mb-6">Real Results from <span className="text-gradient">Real Creators</span></h2>
              <p className="text-xl text-neutral-700 mb-8">
                Join hundreds of creators who have transformed their OnlyFans into sustainable 6-figure businesses with our AI platform.
              </p>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">Average Revenue Growth</span>
                    <span className="text-blue-600 font-bold">+285%</span>
                  </div>
                  <div className="w-full bg-neutral-200 rounded-full h-3">
                    <div className="bg-blue-600 h-3 rounded-full" style={{width: '85%'}}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">Time Saved Daily</span>
                    <span className="text-blue-600 font-bold">+78%</span>
                  </div>
                  <div className="w-full bg-neutral-200 rounded-full h-3">
                    <div className="bg-blue-600 h-3 rounded-full" style={{width: '78%'}}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">Fan Engagement Rate</span>
                    <span className="text-pink-600 font-bold">+92%</span>
                  </div>
                  <div className="w-full bg-neutral-200 rounded-full h-3">
                    <div className="bg-pink-500 h-3 rounded-full" style={{width: '92%'}}></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-8">
              <Sparkles className="w-16 h-16 text-purple-600 mb-6" />
              <h3 className="mb-4">Why Creators Choose Us</h3>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span>Zero technical skills required</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span>Set up in under 5 minutes</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span>100% secure & private</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span>Cancel anytime, no lock-in</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Case Studies */}
      <section id="testimonials" className="py-20 px-4 md:py-24 lg:py-32 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl lg:text-5xl mb-4">Real <span className="text-gradient">Creator Success</span> Stories</h2>
            <p className="text-base md:text-xl text-neutral-700 max-w-3xl mx-auto px-4">
              From part-time creators to 6-figure earners. See how our AI platform transformed their OnlyFans journey.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            <div className="testimonial-card p-6 md:p-8">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full"></div>
                  <div>
                    <p className="font-semibold">Bella Rose</p>
                    <p className="text-sm text-neutral-700">@bellarose • Top 0.5%</p>
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-bold text-purple-600 mb-2">$45k/month</p>
                <p className="text-neutral-700">From $3k in 3 months</p>
              </div>
              <blockquote className="text-neutral-800 italic mb-4">
                <p>"I was spending 8 hours a day messaging fans. Now the AI handles everything perfectly while I create content. My income went 15x!"</p>
              </blockquote>
              <div className="flex gap-2 text-xs">
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">AI Messaging</span>
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">PPV Strategy</span>
              </div>
            </div>
            
            <div className="testimonial-card p-6 md:p-8">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full"></div>
                  <div>
                    <p className="font-semibold">Luna Sky</p>
                    <p className="text-sm text-neutral-700">@lunasky • Top 1%</p>
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-bold text-purple-600 mb-2">6 hrs → 30 min</p>
                <p className="text-neutral-700">Daily work time</p>
              </div>
              <blockquote className="text-neutral-800 italic mb-4">
                <p>"I'm a single mom and time is precious. The AI responds exactly like I would, handles all my DMs, and I just check in once a day!"</p>
              </blockquote>
              <div className="flex gap-2 text-xs">
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Time Freedom</span>
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">AI Assistant</span>
              </div>
            </div>
            
            <div className="testimonial-card p-6 md:p-8">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full"></div>
                  <div>
                    <p className="font-semibold">Mia Diamond</p>
                    <p className="text-sm text-neutral-700">@miadiamond • Top 0.1%</p>
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-bold text-purple-600 mb-2">$127k/month</p>
                <p className="text-neutral-700">Consistent earnings</p>
              </div>
              <blockquote className="text-neutral-800 italic mb-4">
                <p>"The mass messaging and PPV optimizer doubled my income. I send one campaign and the AI personalizes it for each fan's spending habits!"</p>
              </blockquote>
              <div className="flex gap-2 text-xs">
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Mass DMs</span>
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Smart Pricing</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 md:py-24 lg:py-32 bg-gradient-to-r from-purple-900 to-pink-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-black opacity-10"></div>
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <h2 className="text-2xl md:text-4xl lg:text-5xl mb-4 md:mb-6 text-white">Ready to Transform Your OnlyFans?</h2>
          <p className="text-base md:text-xl mb-6 md:mb-8 text-neutral-200 max-w-3xl mx-auto px-4">
            Join hundreds of creators already using our AI platform to automate their business and multiply their income.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild variant="ghost" className="bg-white !text-black hover:bg-neutral-100 hover:!text-black px-6 md:px-8 py-3 md:py-4 text-base md:text-lg font-semibold">
              <Link href="/join">
                Get Early Access
                <ArrowRight className="ml-2 h-4 md:h-5 w-4 md:w-5" />
              </Link>
            </Button>
            <Button asChild className="bg-transparent text-white border-2 border-white hover:bg-white hover:text-purple-600 px-6 md:px-8 py-3 md:py-4 text-base md:text-lg">
              <Link href="/contact">Contact Sales</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}