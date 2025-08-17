'use client';

import Link from 'next/link';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { CheckCircle2, MessageSquare, BarChart3, Shield, Zap, Users, TrendingUp, Bot, DollarSign, Lock, Sparkles, HeartHandshake } from 'lucide-react';
import { AnimatedSection, AnimatedCard, FadeIn } from '../components/animated-section';

export default function HomePageAnimated() {
  return (
    <div>
      {/* Hero Section - Above the fold */}
      <section className="hero-gradient min-h-[90vh] flex items-center py-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <FadeIn>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent leading-tight">
              Transformez votre OnlyFans en business 6 chiffres sur autopilote
            </h1>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="text-lg md:text-2xl mb-8 text-gray-700 max-w-3xl mx-auto">
              L'IA qui gère vos fans 24/7 et automatise votre marketing pendant que vous créez du contenu
            </p>
          </FadeIn>
          <FadeIn delay={0.4}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button asChild variant="gradient" size="lg" className="text-lg px-8 py-6">
                <Link href="/join">Essai Gratuit - Sans carte requise</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6">
                <Link href="#demo">Voir une démo →</Link>
              </Button>
            </div>
          </FadeIn>
          
          {/* Social Proof */}
          <FadeIn delay={0.6}>
            <div className="flex flex-wrap justify-center gap-8 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <span>+300% de revenus en moyenne</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-500" />
                <span>500+ créatrices actives</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                <span>100% conforme RGPD</span>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Section Offres - Nos Services */}
      <section id="offres" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Nos Services & Fonctionnalités IA</h2>
            <p className="text-xl text-gray-600 text-center mb-12 max-w-3xl mx-auto">
              Une plateforme tout-en-un propulsée par l'IA pour gérer et faire croître votre OnlyFans
            </p>
          </AnimatedSection>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Agent Conversationnel 24/7 */}
            <AnimatedCard delay={0.1}>
              <Card className="p-6 hover:shadow-xl transition-all gradient-border h-full">
                <div className="flex items-center gap-3 mb-4">
                  <Bot className="w-8 h-8 text-purple-500" />
                  <h3 className="text-xl font-bold">Agent Conversationnel 24/7</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  IA entraînée sur votre personnalité unique qui chatte avec vos fans jour et nuit
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                    <span>Réponses personnalisées et authentiques</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                    <span>Upsells automatiques intelligents</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                    <span>Engagement accru des fans</span>
                  </li>
                </ul>
              </Card>
            </AnimatedCard>

            {/* Marketing Automatisé */}
            <AnimatedCard delay={0.2}>
              <Card className="p-6 hover:shadow-xl transition-all gradient-border h-full">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingUp className="w-8 h-8 text-pink-500" />
                  <h3 className="text-xl font-bold">Marketing Multi-plateformes</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  80% du travail marketing automatisé sur tous les réseaux sociaux
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                    <span>Publications sur TikTok/Instagram/Reddit</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                    <span>DM de bienvenue automatiques</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
                    <span>Optimisation IA des hashtags</span>
                  </li>
                </ul>
              </Card>
            </AnimatedCard>

            {/* Continue with other cards... */}
          </div>
        </div>
      </section>

      {/* Rest of the sections would follow the same pattern */}
    </div>
  );
}