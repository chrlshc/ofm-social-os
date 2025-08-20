// Admin configuration
export const adminConfig = {
  defaultAdminEmail: 'charles@huntaze.com',
  adminName: 'Charles',
  companyName: 'Huntaze',
  supportEmail: 'charles@huntaze.com',
  notificationEmail: 'charles@huntaze.com',
  
  // OAuth application contact
  oauthContact: {
    reddit: 'charles@huntaze.com',
    instagram: 'charles@huntaze.com',
    tiktok: 'charles@huntaze.com',
  },
  
  // Default settings for new users
  defaultSettings: {
    timezone: 'America/New_York',
    language: 'en',
    emailNotifications: true,
    adminUser: true,
  }
};

// Check if current user is admin
export function isAdmin(email: string): boolean {
  return email === adminConfig.defaultAdminEmail;
}

// Get admin contact for platform
export function getAdminContactForPlatform(platform: string): string {
  return adminConfig.oauthContact[platform as keyof typeof adminConfig.oauthContact] || adminConfig.defaultAdminEmail;
}