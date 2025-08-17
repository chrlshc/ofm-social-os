import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politique de Confidentialité',
  description: 'Découvrez comment Huntaze collecte, utilise et protège vos données personnelles.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        <h1 className="text-3xl md:text-4xl font-bold mb-8">Politique de Confidentialité</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-neutral-700 mb-6">
            Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-neutral-700 mb-4">
              Chez Huntaze, nous prenons la protection de vos données personnelles très au sérieux. Cette politique de confidentialité explique comment nous collectons, utilisons, stockons et protégeons vos informations lorsque vous utilisez notre plateforme.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Données que nous collectons</h2>
            <p className="text-neutral-700 mb-4">Nous collectons les types de données suivants :</p>
            <ul className="list-disc pl-6 mb-4 text-neutral-700">
              <li>Informations de compte (nom, email, mot de passe chiffré)</li>
              <li>Données de profil créateur (pseudonyme, bio, préférences)</li>
              <li>Statistiques d'utilisation (interactions, performances)</li>
              <li>Données de paiement (traitées de manière sécurisée via nos partenaires)</li>
              <li>Communications avec le support</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Comment nous utilisons vos données</h2>
            <p className="text-neutral-700 mb-4">Vos données sont utilisées pour :</p>
            <ul className="list-disc pl-6 mb-4 text-neutral-700">
              <li>Fournir et améliorer nos services d'automatisation IA</li>
              <li>Personnaliser votre expérience sur la plateforme</li>
              <li>Traiter les paiements et gérer les abonnements</li>
              <li>Communiquer avec vous concernant votre compte</li>
              <li>Assurer la sécurité et prévenir la fraude</li>
              <li>Respecter nos obligations légales</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Protection des données</h2>
            <p className="text-neutral-700 mb-4">
              Nous utilisons des mesures de sécurité de pointe pour protéger vos données :
            </p>
            <ul className="list-disc pl-6 mb-4 text-neutral-700">
              <li>Chiffrement SSL/TLS pour toutes les communications</li>
              <li>Chiffrement des données sensibles au repos</li>
              <li>Accès restreint aux données personnelles</li>
              <li>Audits de sécurité réguliers</li>
              <li>Conformité RGPD</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Vos droits</h2>
            <p className="text-neutral-700 mb-4">Conformément au RGPD, vous avez le droit de :</p>
            <ul className="list-disc pl-6 mb-4 text-neutral-700">
              <li>Accéder à vos données personnelles</li>
              <li>Rectifier les données inexactes</li>
              <li>Demander la suppression de vos données</li>
              <li>Vous opposer au traitement de vos données</li>
              <li>Demander la portabilité de vos données</li>
              <li>Retirer votre consentement à tout moment</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Cookies</h2>
            <p className="text-neutral-700 mb-4">
              Nous utilisons des cookies essentiels pour le fonctionnement de notre plateforme et des cookies analytiques pour améliorer nos services. Vous pouvez gérer vos préférences de cookies à tout moment.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Contact</h2>
            <p className="text-neutral-700 mb-4">
              Pour toute question concernant cette politique de confidentialité ou vos données personnelles, contactez-nous :
            </p>
            <ul className="list-none text-neutral-700">
              <li>Email : privacy@huntaze.com</li>
              <li>Adresse : Huntaze SAS, Paris, France</li>
            </ul>
          </section>

          <div className="mt-12 pt-8 border-t border-gray-200">
            <Link href="/" className="text-purple-600 hover:text-purple-700 font-medium">
              ← Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}