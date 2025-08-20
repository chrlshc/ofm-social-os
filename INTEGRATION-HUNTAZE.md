# 🔗 Guide d'Intégration Social OS dans Huntaze

## Vue d'ensemble

Social OS est maintenant configuré pour s'intégrer directement avec l'authentification existante de Huntaze. Aucune page de login séparée n'est nécessaire.

## 1. Architecture d'intégration

### Authentification
- ✅ Utilise les sessions Huntaze existantes (cookie `huntaze_session`)
- ✅ Vérifie automatiquement le statut Stripe Connect
- ✅ Pas de duplication des comptes utilisateurs

### Points d'entrée
- **Widget Dashboard** : `/src/components/HuntazeSocialWidget.tsx`
- **Page de planification** : `/social/schedule`
- **API endpoints** : `/api/social/*`

## 2. Intégration dans le Dashboard Huntaze

### Ajouter le widget dans votre dashboard existant :

```tsx
// Dans votre page dashboard Huntaze
import HuntazeSocialWidget from '@/components/HuntazeSocialWidget';

export default function CreatorDashboard({ user }) {
  // Récupérer les stats (optionnel)
  const socialStats = {
    connected_platforms: 2,
    total_posts: 45,
    scheduled_posts: 3,
    last_post_date: '2025-01-19'
  };

  return (
    <div className="dashboard-grid">
      {/* Vos widgets existants */}
      <AnalyticsWidget />
      <RevenueWidget />
      
      {/* Widget Social OS */}
      <HuntazeSocialWidget 
        userId={user.id} 
        stats={socialStats}
      />
    </div>
  );
}
```

## 3. Configuration des sessions

### Adapter votre table sessions Huntaze :

```sql
-- Si votre table sessions n'a pas ces colonnes
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_valid BOOLEAN DEFAULT true;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
```

### Format attendu du cookie session :

```javascript
// Cookie name: huntaze_session
// Value: token unique (ex: "abc123...")
// HttpOnly: true
// Secure: true (production)
// SameSite: strict
```

## 4. Routes et navigation

### Routes Social OS disponibles :

- `/social/schedule` - Page principale de planification
- `/social/accounts` - Gestion des comptes sociaux (à créer si besoin)

### Liens depuis Huntaze :

```html
<!-- Dans votre menu Huntaze -->
<nav>
  <a href="/dashboard">Dashboard</a>
  <a href="/analytics">Analytics</a>
  <a href="/social/schedule">Social Publishing</a> <!-- Nouveau -->
</nav>
```

## 5. OAuth Flow modifié

Les URLs OAuth utilisent maintenant l'ID utilisateur depuis la session :

```javascript
// Ancien (avec user_id en paramètre)
/api/social/auth/reddit?user_id=1

// Nouveau (user_id depuis session)
/api/social/auth/reddit
```

## 6. Variables d'environnement additionnelles

Ajouter dans votre `.env` :

```env
# URL de base Huntaze (pour les retours)
HUNTAZE_URL=https://huntaze.com

# Si vous utilisez un domaine différent pour Social OS
SOCIAL_OS_URL=https://social.huntaze.com
```

## 7. Permissions et vérifications

Le système vérifie automatiquement :
1. ✅ Session Huntaze valide
2. ✅ Stripe Connect complété
3. ✅ Propriété des comptes sociaux

## 8. Styling et thème

Le widget utilise des classes Tailwind neutres. Pour matcher votre thème Huntaze :

```css
/* Remplacer les couleurs purple par votre thème */
.bg-purple-600 { background-color: var(--huntaze-primary); }
.text-purple-600 { color: var(--huntaze-primary); }
.hover\:bg-purple-700:hover { background-color: var(--huntaze-primary-dark); }
```

## 9. Exemple complet d'intégration

```tsx
// pages/dashboard/index.tsx (Huntaze)
import { useSession } from '@/hooks/useSession';
import HuntazeSocialWidget from '@/components/HuntazeSocialWidget';

export default function Dashboard() {
  const { user } = useSession();
  
  if (!user) return <Redirect to="/login" />;
  
  return (
    <Layout>
      <h1>Welcome back, {user.email}!</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Widgets existants */}
        <StatsWidget />
        <RevenueWidget />
        
        {/* Social OS Widget */}
        {user.stripe_onboarding_complete && (
          <HuntazeSocialWidget userId={user.id} />
        )}
      </div>
    </Layout>
  );
}
```

## 10. Migration des données (si applicable)

Si vous avez déjà des données sociales :

```sql
-- Migrer les comptes sociaux existants
INSERT INTO social_publisher.platform_accounts 
  (user_id, platform, username, access_token, created_at)
SELECT 
  user_id, 
  'instagram' as platform,
  instagram_username,
  instagram_token,
  NOW()
FROM your_existing_social_table
WHERE instagram_token IS NOT NULL;
```

---

**L'intégration est maintenant complète !** Social OS utilise l'authentification Huntaze existante pour une expérience fluide et unifiée. 🎉