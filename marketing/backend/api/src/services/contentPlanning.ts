import { ContentPlan, ContentPlanAttributes, ContentPlanStatus, Platform } from '../models/ContentPlan';
import { logger } from '../utils/logger';
import { addDays, setHours, setMinutes, startOfWeek } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

interface OptimalPostingTime {
  hour: number;
  minute: number;
}

// Research-based optimal posting times per platform
const OPTIMAL_POSTING_TIMES: Record<Platform, OptimalPostingTime[]> = {
  [Platform.INSTAGRAM]: [
    { hour: 6, minute: 0 },   // 6 AM - Early morning
    { hour: 12, minute: 0 },  // Noon - Lunch break
    { hour: 18, minute: 0 },  // 6 PM - After work
  ],
  [Platform.TIKTOK]: [
    { hour: 6, minute: 0 },   // 6 AM - Morning routine
    { hour: 10, minute: 0 },  // 10 AM - Mid-morning
    { hour: 16, minute: 0 },  // 4 PM - After school/work
  ],
  [Platform.TWITTER]: [
    { hour: 8, minute: 0 },   // 8 AM - Morning commute
    { hour: 12, minute: 0 },  // Noon - Lunch break
    { hour: 17, minute: 0 },  // 5 PM - End of workday
  ],
  [Platform.REDDIT]: [
    { hour: 9, minute: 0 },   // 9 AM - Start of work
    { hour: 13, minute: 0 },  // 1 PM - After lunch
    { hour: 20, minute: 0 },  // 8 PM - Evening browsing
  ],
};

export interface ContentPlanOptions {
  userId: string;
  originalsPerWeek: number;
  platforms?: Platform[];
  startDate?: Date;
  requireApproval?: boolean;
}

export interface ContentPlanItem extends ContentPlanAttributes {
  originalContentIndex?: number;
}

/**
 * Generates a weekly content plan with optimal scheduling and cross-platform repurposing
 */
export async function generateWeeklyContentPlan(
  options: ContentPlanOptions
): Promise<ContentPlanItem[]> {
  const {
    userId,
    originalsPerWeek,
    platforms = [Platform.INSTAGRAM, Platform.TIKTOK, Platform.TWITTER],
    startDate = new Date(),
    requireApproval = true,
  } = options;

  // Validate inputs
  if (originalsPerWeek < 1 || originalsPerWeek > 21) {
    throw new Error('originalsPerWeek must be between 1 and 21');
  }

  logger.info(`Generating content plan for user ${userId}: ${originalsPerWeek} originals/week`);

  const planItems: ContentPlanItem[] = [];
  const weekStart = startOfWeek(startDate, { weekStartsOn: 1 }); // Monday start

  // Distribute original content across the week
  const daysForOriginals = distributeContentDays(originalsPerWeek);
  
  // For each original content piece
  for (let i = 0; i < originalsPerWeek; i++) {
    const contentDay = daysForOriginals[i];
    const contentId = uuidv4(); // Mock content ID for now
    
    // Schedule the same content across all platforms with optimal timing
    for (const platform of platforms) {
      const optimalTimes = OPTIMAL_POSTING_TIMES[platform];
      const timeSlot = optimalTimes[i % optimalTimes.length]; // Rotate through optimal times
      
      // Add some variance to avoid exact same-time posting
      const minuteOffset = platforms.indexOf(platform) * 15; // 15-minute stagger
      
      const scheduledTime = setMinutes(
        setHours(addDays(weekStart, contentDay), timeSlot.hour),
        timeSlot.minute + minuteOffset
      );

      const planItem: ContentPlanItem = {
        id: uuidv4(),
        userId,
        contentId,
        contentRef: `original-${i + 1}`,
        platform,
        scheduledTime,
        caption: generatePlatformCaption(platform, i + 1),
        hashtags: generatePlatformHashtags(platform),
        status: requireApproval ? ContentPlanStatus.PENDING_APPROVAL : ContentPlanStatus.SCHEDULED,
        metadata: {
          originalContentIndex: i,
          isRepurposed: true,
          weekNumber: getWeekNumber(weekStart),
        },
        originalContentIndex: i,
      };

      planItems.push(planItem);
    }
  }

  // Save all items to database
  try {
    await ContentPlan.bulkCreate(planItems as ContentPlanAttributes[]);
    logger.info(`Created ${planItems.length} content plan items for user ${userId}`);
  } catch (error) {
    logger.error('Failed to save content plan to database:', error);
    throw new Error('Failed to create content plan');
  }

  return planItems;
}

/**
 * Distributes content days evenly across the week
 */
function distributeContentDays(count: number): number[] {
  const days: number[] = [];
  const interval = Math.floor(7 / count);
  
  for (let i = 0; i < count; i++) {
    // Prefer weekdays (Mon-Fri) for better engagement
    let day = i * interval;
    if (day === 5 || day === 6) { // Skip weekends if possible
      day = Math.min(day, 4); // Move to Friday
    }
    days.push(day);
  }
  
  return days;
}

/**
 * Generates platform-specific caption templates
 */
function generatePlatformCaption(platform: Platform, contentIndex: number): string {
  const captions: Record<Platform, string[]> = {
    [Platform.INSTAGRAM]: [
      `✨ New content drop! Check out today's special feature #content${contentIndex}`,
      `Behind the scenes of creating amazing content 📸 #bts #content${contentIndex}`,
      `Your daily dose of inspiration 💫 #motivation #content${contentIndex}`,
    ],
    [Platform.TIKTOK]: [
      `POV: You're about to see something amazing 🎬 #fyp #content${contentIndex}`,
      `Wait for it... 👀 #viral #content${contentIndex}`,
      `This took hours to create! #behindthescenes #content${contentIndex}`,
    ],
    [Platform.TWITTER]: [
      `New content alert! 🚨 Thread below ⬇️ #content${contentIndex}`,
      `Just dropped something special for you all 💎 #content${contentIndex}`,
      `RT if you're ready for this! #content${contentIndex}`,
    ],
    [Platform.REDDIT]: [
      `[OC] My latest creation - thoughts? #content${contentIndex}`,
      `Spent weeks perfecting this, hope you enjoy! #content${contentIndex}`,
      `First time sharing this here! #content${contentIndex}`,
    ],
  };

  const platformCaptions = captions[platform];
  return platformCaptions[(contentIndex - 1) % platformCaptions.length];
}

/**
 * Generates platform-specific hashtags
 */
function generatePlatformHashtags(platform: Platform): string[] {
  const hashtags: Record<Platform, string[]> = {
    [Platform.INSTAGRAM]: ['instagood', 'photooftheday', 'instadaily', 'igdaily', 'instamood'],
    [Platform.TIKTOK]: ['fyp', 'foryoupage', 'viral', 'trending', 'tiktok'],
    [Platform.TWITTER]: ['TwitterContent', 'ContentCreator', 'ThreadAlert'],
    [Platform.REDDIT]: ['OC', 'OriginalContent', 'RedditContent'],
  };

  return hashtags[platform] || [];
}

/**
 * Gets the week number for a given date
 */
function getWeekNumber(date: Date): string {
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

/**
 * Retrieves content plan for a specific week
 */
export async function getWeeklyContentPlan(
  userId: string,
  weekStart?: Date
): Promise<ContentPlanItem[]> {
  const startDate = weekStart || startOfWeek(new Date(), { weekStartsOn: 1 });
  const endDate = addDays(startDate, 7);

  const items = await ContentPlan.findAll({
    where: {
      userId,
      scheduledTime: {
        $gte: startDate,
        $lt: endDate,
      },
    },
    order: [['scheduledTime', 'ASC']],
  });

  return items.map(item => item.toJSON() as ContentPlanItem);
}

/**
 * Approves a content plan item and schedules it
 */
export async function approveContentPlanItem(
  itemId: string,
  userId: string
): Promise<ContentPlanItem> {
  const item = await ContentPlan.findOne({
    where: { id: itemId, userId },
  });

  if (!item) {
    throw new Error('Content plan item not found');
  }

  if (item.status !== ContentPlanStatus.PENDING_APPROVAL) {
    throw new Error('Item is not pending approval');
  }

  item.status = ContentPlanStatus.SCHEDULED;
  await item.save();

  logger.info(`Approved content plan item ${itemId} for user ${userId}`);
  
  return item.toJSON() as ContentPlanItem;
}

/**
 * Updates the status of a content plan item after posting
 */
export async function markContentAsPosted(
  itemId: string,
  success: boolean,
  error?: string
): Promise<void> {
  const item = await ContentPlan.findByPk(itemId);
  
  if (!item) {
    throw new Error('Content plan item not found');
  }

  item.status = success ? ContentPlanStatus.POSTED : ContentPlanStatus.FAILED;
  if (error) {
    item.error = error;
  }
  
  await item.save();
  
  logger.info(`Marked content plan item ${itemId} as ${item.status}`);
}