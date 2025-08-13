#!/usr/bin/env ts-node

import { sequelize } from '../src/database';
import { TopProfile } from '../src/models/TopProfile';
import { logger } from '../src/utils/logger';

// Example seed data
const seedProfiles = [
  {
    platform: 'instagram',
    username: 'fitness_guru',
    fullName: 'Sarah Fitness',
    bio: 'Certified Personal Trainer 💪 | Nutrition Coach | Transform your body and mind | Daily workouts & meal plans',
    profilePicUrl: 'https://example.com/profile1.jpg',
    followersCount: 150000,
    followingCount: 500,
    postsCount: 1200,
    category: 'Fitness',
  },
  {
    platform: 'tiktok',
    username: 'travel_vibes',
    fullName: 'Alex Wanderer',
    bio: '✈️ Travel blogger | 50+ countries | Budget travel tips | Next: Bali 🌴',
    profilePicUrl: 'https://example.com/profile2.jpg',
    followersCount: 85000,
    followingCount: 200,
    likesCount: 2500000,
    category: 'Travel',
  },
  {
    platform: 'instagram',
    username: 'fashionista_daily',
    fullName: 'Emma Style',
    bio: 'Fashion blogger 👗 | Daily outfit inspiration | Sustainable fashion advocate | Collab: email@example.com',
    profilePicUrl: 'https://example.com/profile3.jpg',
    followersCount: 200000,
    followingCount: 800,
    postsCount: 2500,
    category: 'Fashion',
  },
  {
    platform: 'tiktok',
    username: 'gamer_pro',
    fullName: 'Mike Gaming',
    bio: '🎮 Pro Gamer | Streaming daily | Tips & tricks | Tournament winner',
    profilePicUrl: 'https://example.com/profile4.jpg',
    followersCount: 500000,
    followingCount: 100,
    likesCount: 10000000,
    category: 'Gaming',
  },
  {
    platform: 'instagram',
    username: 'lifestyle_queen',
    fullName: 'Jessica Life',
    bio: 'Lifestyle blogger ✨ | Mom of 2 | Home decor | Daily vlogs | Living my best life',
    profilePicUrl: 'https://example.com/profile5.jpg',
    followersCount: 120000,
    followingCount: 600,
    postsCount: 1800,
    category: 'Lifestyle',
  },
];

async function seed() {
  try {
    await sequelize.authenticate();
    logger.info('Database connected');

    // Clear existing data
    await TopProfile.destroy({ where: {} });
    logger.info('Cleared existing profiles');

    // Insert seed data
    for (const profile of seedProfiles) {
      await TopProfile.create({
        ...profile,
        scrapedAt: new Date(),
      });
    }

    logger.info(`Seeded ${seedProfiles.length} profiles`);

    // Add some random variations
    const platforms = ['instagram', 'tiktok', 'twitter', 'reddit'];
    const categories = ['Fitness', 'Travel', 'Fashion', 'Gaming', 'Lifestyle', 'Food', 'Tech'];
    
    for (let i = 0; i < 20; i++) {
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      
      await TopProfile.create({
        platform,
        username: `user_${i}_${platform}`,
        fullName: `Test User ${i}`,
        bio: `${category} enthusiast | Creating amazing content | Follow for daily updates`,
        followersCount: Math.floor(Math.random() * 500000) + 10000,
        followingCount: Math.floor(Math.random() * 1000) + 100,
        postsCount: Math.floor(Math.random() * 5000) + 100,
        category: Math.random() > 0.5 ? category : null, // Some without category for training
        scrapedAt: new Date(),
      });
    }

    logger.info('Added 20 random profiles');
    
    process.exit(0);
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();