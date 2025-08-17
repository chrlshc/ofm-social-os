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
              <p className="text-lg md:text-xl mb-6 md:mb-8 text-neutral-600">
                Transform your OnlyFans into a 6-figure automated business. Our AI handles messaging, content scheduling, and fan engagement 24/7 while you focus on creating.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild className="btn-primary w-full sm:w-auto">
                  <Link href="/join">
                    Request Demo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild className="btn-secondary w-full sm:w-auto">
                  <Link href="#solutions">View Solutions</Link>
                </Button>
              </div>
              <div className="mt-8 md:mt-12 grid grid-cols-3 gap-4 md:gap-8">
                <div className="text-center">
                  <div className="text-2xl md:text-4xl font-bold text-gradient">500+</div>
                  <div className="text-xs md:text-sm text-neutral-600">6-Figure Creators</div>
                </div>
                <div className="text-center border-x border-purple-200">
                  <div className="text-2xl md:text-4xl font-bold text-gradient">$50M+</div>
                  <div className="text-xs md:text-sm text-neutral-600">Revenue Generated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl md:text-4xl font-bold text-gradient">24/7</div>
                  <div className="text-xs md:text-sm text-neutral-600">AI Automation</div>
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
                            <p className="text-sm">Hey babe! 😘 Thanks for subscribing! What kind of content do you love most?</p>
                          </div>
                          <div className="bg-gray-100 p-3 rounded-2xl rounded-tr-sm max-w-[80%] ml-auto">
                            <p className="text-sm">I love your lingerie pics!</p>
                          </div>
                          <div className="bg-purple-100 text-purple-900 p-3 rounded-2xl rounded-tl-sm max-w-[80%]">
                            <p className="text-sm">Perfect! I just posted a new set you'll love 💜 Check your DMs for an exclusive preview!</p>
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
      <section className="py-8 md:py-12 px-4 bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-6 md:mb-8">
            <p className="text-sm md:text-base text-neutral-600 font-medium">Trusted by top 1% creators on OnlyFans, Fansly, and other platforms</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 items-center">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient mb-1">OnlyFans</div>
              <div className="text-xs text-neutral-500">Official Partner</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient mb-1">Fansly</div>
              <div className="text-xs text-neutral-500">Verified Agency</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient mb-1">LoyalFans</div>
              <div className="text-xs text-neutral-500">Top Performer</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient mb-1">FanCentro</div>
              <div className="text-xs text-neutral-500">Elite Status</div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 px-4 md:py-20 lg:py-24 relative overflow-hidden">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-pink-50 to-purple-50 opacity-70"></div>
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-purple-300 rounded-full filter blur-[100px] opacity-20"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-pink-300 rounded-full filter blur-[100px] opacity-20"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12 md:mb-16">
            <span className="inline-block text-sm font-semibold text-purple-600 uppercase tracking-wider mb-2">Transparent Pricing</span>
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-4">Commission <span className="text-gradient">par Palier</span></h2>
            <p className="text-base md:text-xl text-neutral-600 max-w-3xl mx-auto px-4">
              Zero monthly fees. Zero setup costs. We take a commission based on your total monthly earnings. The more you earn, the lower your commission rate!
            </p>
          </div>
          
          <div className="max-w-6xl mx-auto">
            {/* Hero Commission Box */}
            <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 mb-12 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-200 to-pink-200 rounded-full filter blur-3xl opacity-30"></div>
              <div className="relative z-10">
                <h3 className="text-2xl md:text-3xl font-bold text-center mb-8">Notre Système de <span className="text-gradient">Commission Unique</span></h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Free Tier */}
                  <div className="relative bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 border-2 border-green-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3">
                      <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">FREE</span>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Moins de</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">2 000€/mois</p>
                      <p className="text-5xl font-bold text-green-600">0%</p>
                      <p className="text-sm text-gray-500 mt-2">GRATUIT</p>
                    </div>
                  </div>
                  
                  {/* 25% Tier */}
                  <div className="relative bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border-2 border-purple-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Entre</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">2k€ - 5k€</p>
                      <p className="text-5xl font-bold text-purple-600">25%</p>
                      <p className="text-sm text-gray-500 mt-2">commission</p>
                    </div>
                  </div>
                  
                  {/* 20% Tier */}
                  <div className="relative bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border-2 border-purple-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Entre</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">5k€ - 10k€</p>
                      <p className="text-5xl font-bold text-purple-600">20%</p>
                      <p className="text-sm text-gray-500 mt-2">commission</p>
                    </div>
                  </div>
                  
                  {/* 15% Tier */}
                  <div className="relative bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border-2 border-purple-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Entre</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">10k€ - 20k€</p>
                      <p className="text-5xl font-bold text-purple-600">15%</p>
                      <p className="text-sm text-gray-500 mt-2">commission</p>
                    </div>
                  </div>
                  
                  {/* 10% Tier */}
                  <div className="relative bg-gradient-to-br from-pink-50 to-pink-100 rounded-2xl p-6 border-2 border-pink-300 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Entre</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">20k€ - 30k€</p>
                      <p className="text-5xl font-bold text-pink-600">10%</p>
                      <p className="text-sm text-gray-500 mt-2">commission</p>
                    </div>
                  </div>
                  
                  {/* 5% Tier */}
                  <div className="relative bg-gradient-to-br from-purple-100 via-pink-100 to-purple-100 rounded-2xl p-6 border-2 border-purple-400 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                    <div className="absolute -top-3 -right-3">
                      <span className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">BEST</span>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-2">Plus de</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">30k€</p>
                      <p className="text-5xl font-bold text-gradient">5%</p>
                      <p className="text-sm text-gray-500 mt-2">commission</p>
                    </div>
                  </div>
                </div>
                
                {/* Example Calculation */}
                <div className="mt-8 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-200">
                  <h4 className="font-semibold text-lg mb-3 text-center">💡 Exemple: Si vous gagnez 15 000€/mois</h4>
                  <div className="text-center">
                    <p className="text-gray-600 mb-2">Vous êtes dans la tranche 10k€ - 20k€</p>
                    <p className="text-3xl font-bold text-purple-600">Vous ne payez que 15%</p>
                    <p className="text-lg text-gray-600 mt-2">Commission totale: <span className="font-bold">2 250€</span></p>
                    <p className="text-sm text-gray-500 mt-1">(15% de 15 000€)</p>
                  </div>
                  <div className="mt-4 p-4 bg-white rounded-lg">
                    <p className="text-sm text-gray-600 text-center">
                      <span className="font-semibold">Comparaison:</span> Les autres agences prennent 30-50% sur TOUS vos revenus.
                      <br />
                      Avec eux, vous paieriez <span className="line-through text-red-500">4 500€ à 7 500€</span> !
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Three Plans */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              {/* Starter Plan */}
              <div className="relative bg-white rounded-3xl p-6 md:p-8 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2">Starter</h3>
                  <p className="text-gray-600 mb-4">Perfect for new creators</p>
                  <div className="mb-6">
                    <p className="text-sm text-gray-500 mb-1">Best for €0-10k/month</p>
                    <div className="text-4xl font-bold text-purple-600">20%</div>
                    <p className="text-sm text-gray-500">commission</p>
                  </div>
                  <div className="flex flex-col gap-2 mb-4 text-sm">
                    <div className="bg-purple-50 text-purple-700 rounded-lg px-3 py-2 text-center font-medium">
                      Commission par palier
                    </div>
                    <div className="text-gray-600 text-center">
                      &lt; 2k€: <span className="font-bold text-green-600">0%</span>
                    </div>
                    <div className="text-gray-600 text-center">
                      2k€ - 5k€: <span className="font-bold">25%</span>
                    </div>
                    <div className="text-gray-600 text-center">
                      5k€ - 10k€: <span className="font-bold">20%</span>
                    </div>
                  </div>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">AI messaging for up to 500 fans</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Basic content scheduling</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Fan analytics dashboard</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Email support</span>
                  </li>
                </ul>
                <Button asChild className="w-full bg-purple-100 text-purple-700 hover:bg-purple-200 font-semibold py-3">
                  <Link href="/join">Start Free Trial</Link>
                </Button>
              </div>

              {/* Pro Plan */}
              <div className="relative bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-6 md:p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:-translate-y-2 border-2 border-purple-300 scale-105">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg">
                    MOST POPULAR
                  </span>
                </div>
                <div className="mb-6 mt-2">
                  <h3 className="text-2xl font-bold mb-2">Pro</h3>
                  <p className="text-gray-600 mb-4">For growing creators</p>
                  <div className="mb-6">
                    <p className="text-sm text-gray-500 mb-1">Best for €10k-30k/month</p>
                    <div className="text-4xl font-bold text-gradient">15%</div>
                    <p className="text-sm text-gray-500">commission</p>
                  </div>
                  <div className="flex flex-col gap-2 mb-4 text-sm">
                    <div className="bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-lg px-3 py-2 text-center font-medium">
                      Commission par palier
                    </div>
                    <div className="text-gray-600 text-center">
                      10k€ - 20k€: <span className="font-bold text-purple-600">15%</span>
                    </div>
                    <div className="text-gray-600 text-center">
                      20k€ - 30k€: <span className="font-bold text-pink-600">10%</span>
                    </div>
                  </div>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">AI messaging for unlimited fans</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Advanced content scheduler</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">PPV & tip optimization</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Mass messaging campaigns</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Priority support</span>
                  </li>
                </ul>
                <Button asChild className="w-full btn-primary font-semibold py-3">
                  <Link href="/join">Start Free Trial</Link>
                </Button>
              </div>

              {/* Elite Plan */}
              <div className="relative bg-white rounded-3xl p-6 md:p-8 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2">Elite</h3>
                  <p className="text-gray-600 mb-4">For top creators</p>
                  <div className="mb-6">
                    <p className="text-sm text-gray-500 mb-1">Best for €30k+/month</p>
                    <div className="text-4xl font-bold text-pink-600">10%</div>
                    <p className="text-sm text-gray-500">commission</p>
                  </div>
                  <div className="flex flex-col gap-2 mb-4 text-sm">
                    <div className="bg-pink-50 text-pink-700 rounded-lg px-3 py-2 text-center font-medium">
                      Commission par palier
                    </div>
                    <div className="text-gray-600 text-center">
                      30k€+: <span className="font-bold text-gradient">5%</span>
                    </div>
                    <div className="text-sm text-gray-500 text-center mt-2">
                      Le taux le plus bas du marché!
                    </div>
                  </div>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Everything in Pro</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Custom AI voice training</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Dedicated success manager</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">Custom integrations</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">White-glove onboarding</span>
                  </li>
                </ul>
                <Button asChild className="w-full bg-pink-100 text-pink-700 hover:bg-pink-200 font-semibold py-3">
                  <Link href="/join">Contact Sales</Link>
                </Button>
              </div>
            </div>

            <div className="mt-12 text-center">
              <p className="text-lg text-gray-700 font-medium mb-4">
                <Star className="inline-block w-5 h-5 text-yellow-500 mr-2" />
                Commission basée sur vos revenus totaux mensuels
              </p>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Plus vous gagnez, moins vous payez de commission. C'est simple et transparent!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Section */}
      <section id="solutions" className="py-16 px-4 md:py-20 lg:py-24 bg-white relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{backgroundImage: `repeating-linear-gradient(45deg, #9333ea 0, #9333ea 1px, transparent 1px, transparent 15px)`, backgroundSize: '20px 20px'}}></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl lg:text-5xl mb-4">Everything You Need to <span className="text-gradient">Scale Your OnlyFans</span></h2>
            <p className="text-base md:text-xl text-neutral-600 max-w-3xl mx-auto px-4">
              One platform, endless possibilities. Automate your entire OnlyFans business with our AI-powered suite designed specifically for content creators.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {/* AI Messaging */}
            <div className="girly-card p-6 md:p-8">
              <Sparkles className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" />
              <h3 className="mb-3">AI Messaging Assistant</h3>
              <p className="mb-4">
                Never miss a message again. Our AI learns your voice and personality to engage fans 24/7, increasing tips and PPV sales by up to 300%.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Personalized fan conversations</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Smart tip suggestions</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">PPV sales optimization</span>
                </li>
              </ul>
            </div>

            {/* Content Scheduling */}
            <div className="girly-card p-6 md:p-8">
              <Crown className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" />
              <h3 className="mb-3">Smart Content Scheduler</h3>
              <p className="mb-4">
                Post at the perfect time, every time. Our AI analyzes your audience to schedule content when engagement is highest, boosting your visibility.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Optimal posting times</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Multi-platform posting</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Content performance tracking</span>
                </li>
              </ul>
            </div>

            {/* Fan Analytics */}
            <div className="girly-card p-6 md:p-8">
              <BarChart3 className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" />
              <h3 className="mb-3">Advanced Fan Analytics</h3>
              <p className="mb-4">
                Know your fans better than ever. Track spending patterns, engagement rates, and preferences to maximize revenue from every subscriber.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Detailed fan insights</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Revenue predictions</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Churn prevention alerts</span>
                </li>
              </ul>
            </div>

            {/* Mass Messaging */}
            <div className="girly-card p-6 md:p-8">
              <Zap className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" />
              <h3 className="mb-3">Mass Message Campaigns</h3>
              <p className="mb-4">
                Send personalized mass messages that convert. Segment your audience and create targeted campaigns that feel personal to every fan.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Smart audience segmentation</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Personalized templates</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Campaign performance tracking</span>
                </li>
              </ul>
            </div>

            {/* PPV Management */}
            <div className="girly-card p-6 md:p-8">
              <DollarSign className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" />
              <h3 className="mb-3">PPV & Tip Optimizer</h3>
              <p className="mb-4">
                Maximize your pay-per-view sales and tips with AI-driven pricing strategies. Our system learns what content sells best at what price.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Dynamic pricing optimization</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Automated tip menus</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Revenue maximization</span>
                </li>
              </ul>
            </div>

            {/* Creator Support */}
            <div className="girly-card p-6 md:p-8">
              <Star className="w-10 h-10 md:w-12 md:h-12 text-purple-600 mb-4" />
              <h3 className="mb-3">VIP Creator Support</h3>
              <p className="mb-4">
                You're never alone on your journey. Get 24/7 support from our team of OnlyFans experts who understand the creator economy.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Personal success manager</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">24/7 live chat support</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <span className="text-neutral-700">Growth strategy sessions</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ROI Section */}
      <section className="py-16 px-4 md:py-20 lg:py-24 bg-gradient-to-br from-purple-50 via-pink-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="mb-6">Real Results from <span className="text-gradient">Real Creators</span></h2>
              <p className="text-xl text-neutral-600 mb-8">
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
      <section id="testimonials" className="py-16 px-4 md:py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl lg:text-5xl mb-4">Real <span className="text-gradient">Creator Success</span> Stories</h2>
            <p className="text-base md:text-xl text-neutral-600 max-w-3xl mx-auto px-4">
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
                    <p className="text-sm text-neutral-600">@bellarose • Top 0.5%</p>
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-bold text-purple-600 mb-2">$45k/month</p>
                <p className="text-neutral-600">From $3k in 3 months</p>
              </div>
              <p className="text-neutral-700 italic mb-4">
                "I was spending 8 hours a day messaging fans. Now the AI handles everything perfectly while I create content. My income went 15x!"
              </p>
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
                    <p className="text-sm text-neutral-600">@lunasky • Top 1%</p>
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-bold text-purple-600 mb-2">6 hrs → 30 min</p>
                <p className="text-neutral-600">Daily work time</p>
              </div>
              <p className="text-neutral-700 italic mb-4">
                "I'm a single mom and time is precious. The AI responds exactly like I would, handles all my DMs, and I just check in once a day!"
              </p>
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
                    <p className="text-sm text-neutral-600">@miadiamond • Top 0.1%</p>
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-bold text-purple-600 mb-2">$127k/month</p>
                <p className="text-neutral-600">Consistent earnings</p>
              </div>
              <p className="text-neutral-700 italic mb-4">
                "The mass messaging and PPV optimizer doubled my income. I send one campaign and the AI personalizes it for each fan's spending habits!"
              </p>
              <div className="flex gap-2 text-xs">
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Mass DMs</span>
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Smart Pricing</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 md:py-20 lg:py-24 bg-section-dark text-white">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl lg:text-5xl mb-4 md:mb-6 text-white">Ready to Transform Your OnlyFans?</h2>
          <p className="text-base md:text-xl mb-6 md:mb-8 text-neutral-300 max-w-3xl mx-auto px-4">
            Join hundreds of creators already using our AI platform to automate their business and multiply their income.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild className="bg-white text-purple-600 hover:bg-neutral-100 px-6 md:px-8 py-3 md:py-4 text-base md:text-lg">
              <Link href="/join">
                Start Free Trial
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