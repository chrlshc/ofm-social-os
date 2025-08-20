// API unifiée : route l'appel vers le bon handler plateforme + logging + tokens valides
import { pool } from '../db';
import { PlatformAccount } from '../types';
import { RedditAdapter } from '../platforms/reddit';
import { InstagramAdapter } from '../platforms/instagram';
import { TikTokAdapter } from '../platforms/tiktok';
import { ensureValidAccessToken } from '../oauth/manager';
import { logPostEvent } from '../../lib/observability';
import { decrypt } from '../../lib/crypto';

type BaseArgs = {
  scheduled_post_id?: number;
  owner_id: number;
  platform: 'reddit' | 'instagram' | 'tiktok';
  caption?: string;
  media_url?: string;
  meta?: Record<string, unknown>;
};

// Platform adapters instances
const adapters = {
  reddit: new RedditAdapter(),
  instagram: new InstagramAdapter(),
  tiktok: new TikTokAdapter(),
};

export async function publishPost(args: BaseArgs) {
  const { account, accessToken } = await ensureValidAccessToken({
    pool,
    ownerId: args.owner_id,
    platform: args.platform
  });

  const started = Date.now();
  
  try {
    let result: { success: boolean; externalId?: string; externalUrl?: string; error?: string };

    const adapter = adapters[args.platform];
    if (!adapter) {
      throw new Error(`No adapter found for platform: ${args.platform}`);
    }

    // Platform-specific handling
    switch (args.platform) {
      case 'reddit': {
        const subreddit = String(args.meta?.subreddit ?? 'test');
        const title = String(args.meta?.title ?? args.caption?.slice(0, 300) ?? 'Post');
        const isLink = !!args.media_url;
        
        result = await adapter.publishPost({
          accessToken,
          caption: args.caption || '',
          mediaUrl: args.media_url,
          platformSpecific: {
            subreddit,
            title,
            kind: isLink ? 'link' : 'self'
          }
        });
        break;
      }

      case 'instagram': {
        if (!args.media_url) {
          throw new Error('Instagram requires a media URL');
        }
        
        const igUserId = account.meta_json?.ig_user_id ?? 
                        process.env.IG_TEST_USER_ID ?? '';
        
        if (!igUserId) {
          throw new Error('Instagram user ID not found');
        }
        
        result = await adapter.publishPost({
          accessToken,
          caption: args.caption || '',
          mediaUrl: args.media_url,
          platformSpecific: {
            ig_user_id: igUserId,
            media_type: 'REELS' // Default to REELS for video
          }
        });
        break;
      }

      case 'tiktok': {
        if (!args.media_url) {
          throw new Error('TikTok requires a media URL');
        }
        
        result = await adapter.publishPost({
          accessToken,
          caption: args.caption || '',
          mediaUrl: args.media_url,
          platformSpecific: {
            title: args.caption?.slice(0, 150) || 'Post',
            privacy_level: 'PUBLIC'
          }
        });
        break;
      }
    }

    if (result.success) {
      await logPostEvent(pool, {
        scheduled_post_id: args.scheduled_post_id,
        level: 'info',
        message: 'publish_succeeded',
        details: {
          platform: args.platform,
          external_id: result.externalId,
          external_url: result.externalUrl,
          latency_ms: Date.now() - started,
          account_id: account.id
        }
      });

      return { 
        ok: true as const, 
        externalId: result.externalId || '',
        externalUrl: result.externalUrl
      };
    } else {
      throw new Error(result.error || 'Unknown publishing error');
    }

  } catch (e: any) {
    await logPostEvent(pool, {
      scheduled_post_id: args.scheduled_post_id,
      level: 'error',
      message: 'publish_failed',
      details: {
        platform: args.platform,
        error: String(e?.message ?? e),
        latency_ms: Date.now() - started,
        retryable: isRetryableError(e),
        account_id: account.id
      }
    });
    
    return { 
      ok: false as const, 
      error: String(e?.message ?? e) 
    };
  }
}

function isRetryableError(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNREFUSED' || 
      error.code === 'ETIMEDOUT' || 
      error.code === 'ENOTFOUND') {
    return true;
  }
  
  // Rate limits
  if (error.message?.includes('rate limit') || 
      error.message?.includes('429')) {
    return true;
  }
  
  // Temporary errors
  if (error.message?.includes('temporary') || 
      error.message?.includes('timeout')) {
    return true;
  }
  
  return false;
}