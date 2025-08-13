import { ContentPlan, ContentPlanStatus } from '../../models/ContentPlan';
import { ContentPlanItem, markContentAsPosted } from '../../services/contentPlanning';
import { logger } from '../../utils/logger';
import { publishToInstagram } from '../../integrations/instagram';
import { publishToTikTok } from '../../integrations/tiktok';
import { publishToTwitter } from '../../integrations/twitter';
import { publishToReddit } from '../../integrations/reddit';
import { Platform } from '../../models/ContentPlan';

/**
 * Validates that a content item is still valid for publishing
 */
export async function validateContentItem(itemId: string): Promise<boolean> {
  try {
    const item = await ContentPlan.findByPk(itemId);
    
    if (!item) {
      logger.error(`Content item ${itemId} not found`);
      return false;
    }
    
    // Check if status is appropriate for publishing
    if (item.status !== ContentPlanStatus.SCHEDULED && 
        item.status !== ContentPlanStatus.APPROVED) {
      logger.warn(`Content item ${itemId} has invalid status: ${item.status}`);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error(`Error validating content item ${itemId}:`, error);
    return false;
  }
}

/**
 * Publishes content to the specified platform
 */
export async function publishContent(contentPlanItem: ContentPlanItem): Promise<void> {
  const { id, platform, caption, hashtags, contentId, userId } = contentPlanItem;
  
  logger.info(`Publishing content ${id} to ${platform} for user ${userId}`);
  
  try {
    // Get the actual content (media files, etc.)
    // This is a placeholder - in real implementation, fetch from content storage
    const contentData = await getContentData(contentId);
    
    // Prepare the full text with hashtags
    const fullCaption = caption + (hashtags?.length ? '\n\n' + hashtags.map(tag => `#${tag}`).join(' ') : '');
    
    // Publish to the appropriate platform
    switch (platform) {
      case Platform.INSTAGRAM:
        await publishToInstagram({
          userId,
          caption: fullCaption,
          mediaUrl: contentData.mediaUrl,
          mediaType: contentData.mediaType,
        });
        break;
        
      case Platform.TIKTOK:
        await publishToTikTok({
          userId,
          caption: fullCaption,
          videoUrl: contentData.mediaUrl,
        });
        break;
        
      case Platform.TWITTER:
        await publishToTwitter({
          userId,
          text: fullCaption,
          mediaUrls: contentData.mediaUrl ? [contentData.mediaUrl] : undefined,
        });
        break;
        
      case Platform.REDDIT:
        await publishToReddit({
          userId,
          title: caption?.split('\n')[0] || 'New Content',
          text: fullCaption,
          mediaUrl: contentData.mediaUrl,
        });
        break;
        
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    
    // Mark as successfully posted
    await markContentAsPosted(id, true);
    
    logger.info(`Successfully published content ${id} to ${platform}`);
    
  } catch (error) {
    logger.error(`Failed to publish content ${id} to ${platform}:`, error);
    
    // Mark as failed
    await markContentAsPosted(id, false, error.message);
    
    throw error;
  }
}

/**
 * Mock function to get content data
 * In real implementation, this would fetch from S3 or content storage
 */
async function getContentData(contentId?: string): Promise<{
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
}> {
  // Placeholder implementation
  return {
    mediaUrl: `https://storage.example.com/content/${contentId}`,
    mediaType: 'image',
  };
}