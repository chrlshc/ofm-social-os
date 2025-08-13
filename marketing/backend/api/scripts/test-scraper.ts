#!/usr/bin/env ts-node

import { scrapeProfiles } from '../src/scraper';
import { logger } from '../src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function testScraper() {
  logger.info('Starting scraper test...');

  try {
    // Test with a small set of profiles
    const testProfiles = {
      instagram: ['instagram'],  // Official Instagram account
      tiktok: ['tiktok'],       // Official TikTok account
      reddit: ['reddit'],       // Reddit account
    };

    const result = await scrapeProfiles({
      platforms: testProfiles,
      options: {
        delayMs: 1000,
        timeout: 15000,
      },
      saveToDb: false, // Don't save during test
    });

    logger.info('Scraping test completed', {
      successful: result.successful.length,
      failed: result.failed.length,
    });

    // Log successful scrapes
    for (const profile of result.successful) {
      logger.info('Successfully scraped:', {
        platform: profile.platform,
        username: profile.username,
        followers: profile.followersCount,
        bio: profile.bio?.substring(0, 100) + '...',
      });
    }

    // Log failures
    for (const failure of result.failed) {
      logger.error('Failed to scrape:', failure);
    }

  } catch (error) {
    logger.error('Test failed:', error);
  }

  process.exit(0);
}

testScraper();