import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Conditions Générales d\'Utilisation',
  description: 'Consultez les conditions générales d\'utilisation de la plateforme Huntaze.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        <h1 className="text-3xl md:text-4xl font-bold mb-8">Conditions Générales d'Utilisation</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-neutral-700 mb-6">
            Date d'entrée en vigueur : {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptation des conditions</h2>
            <p className="text-neutral-700 mb-4">
              En accédant et en utilisant la plateforme Huntaze, vous acceptez d'être lié par les présentes conditions générales d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser nos services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Description des services</h2>
            <p className="text-neutral-700 mb-4">
              Huntaze est une plateforme d'automatisation alimentée par l'IA destinée aux créateurs de contenu. Nos services incluent :
            </p>
            <ul className="list-disc pl-6 mb-4 text-neutral-700">
              <li>Automatisation de la messagerie avec les fans</li>
              <li>Planification intelligente de contenu</li>
              <li>Analyses et insights sur l'engagement</li>
              <li>Outils d'optimisation des revenus</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Conditions d'utilisation</h2>
            <p className="text-neutral-700 mb-4">En utilisant Huntaze, vous vous engagez à :</p>
            <ul className="list-disc pl-6 mb-4 text-neutral-700">
              <li>Fournir des informations exactes et à jour</li>
              <li>Maintenir la sécurité de votre compte</li>
              <li>Utiliser la plateforme conformément aux lois applicables</li>
              <li>Ne pas utiliser la plateforme à des fins illégales ou non autorisées</li>
              <li>Respecter les droits de propriété intellectuelle</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Tarification et paiement</h2>
            <p className="text-neutral-700 mb-4">
              Huntaze fonctionne sur un modèle de commission basé sur vos revenus mensuels. Les détails de notre structure tarifaire sont disponibles sur notre page de tarification. Les commissions sont automatiquement déduites de vos revenus.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Propriété intellectuelle</h2>
            <p className="text-neutral-700 mb-4">
              Tout le contenu et les matériaux sur Huntaze, y compris les textes, graphiques, logos et logiciels, sont la propriété de Huntaze SAS ou de ses concédants de licence et sont protégés par les lois sur la propriété intellectuelle.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Limitation de responsabilité</h2>
            <p className="text-neutral-700 mb-4">
              Huntaze n'est pas responsable des dommages indirects, accessoires, spéciaux ou consécutifs résultant de l'utilisation ou de l'impossibilité d'utiliser nos services. Notre responsabilité totale ne dépassera pas le montant des commissions payées au cours des 12 derniers mois.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Résiliation</h2>
            <p className="text-neutral-700 mb-4">
              Vous pouvez résilier votre compte à tout moment. Nous nous réservons le droit de suspendre ou de résilier votre accès en cas de violation de ces conditions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Modifications des conditions</h2>
            <p className="text-neutral-700 mb-4">
              Nous pouvons modifier ces conditions à tout moment. Les modifications entrent en vigueur dès leur publication. Votre utilisation continue de la plateforme constitue votre acceptation des conditions modifiées.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Droit applicable</h2>
            <p className="text-neutral-700 mb-4">
              Ces conditions sont régies par le droit français. Tout litige sera soumis à la juridiction exclusive des tribunaux français.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Contact</h2>
            <p className="text-neutral-700 mb-4">
              Pour toute question concernant ces conditions, contactez-nous :
            </p>
            <ul className="list-none text-neutral-700">
              <li>Email : legal@huntaze.com</li>
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