import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from '../activities/contentPublishing';
import { ContentPlanItem } from '../../services/contentPlanning';

const { publishContent, validateContentItem } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '30s',
    backoffCoefficient: 2,
    maximumInterval: '5m',
    maximumAttempts: 3,
  },
});

export interface PublishContentWorkflowParams {
  contentPlanItem: ContentPlanItem;
}

/**
 * Workflow to publish content at the scheduled time
 */
export async function PublishContentWorkflow(
  params: PublishContentWorkflowParams
): Promise<void> {
  const { contentPlanItem } = params;
  
  // Calculate delay until scheduled time
  const now = new Date();
  const scheduledTime = new Date(contentPlanItem.scheduledTime);
  const delayMs = scheduledTime.getTime() - now.getTime();
  
  // If scheduled time is in the future, wait
  if (delayMs > 0) {
    await sleep(delayMs);
  }
  
  // Validate the content item is still valid
  const isValid = await validateContentItem(contentPlanItem.id);
  if (!isValid) {
    throw new Error(`Content item ${contentPlanItem.id} is no longer valid for publishing`);
  }
  
  // Publish the content
  await publishContent(contentPlanItem);
}

export interface BatchPublishWorkflowParams {
  contentPlanItems: ContentPlanItem[];
}

/**
 * Workflow to publish multiple content items
 */
export async function BatchPublishContentWorkflow(
  params: BatchPublishWorkflowParams
): Promise<void> {
  const { contentPlanItems } = params;
  
  // Group items by scheduled time to optimize
  const itemsByTime = new Map<string, ContentPlanItem[]>();
  
  for (const item of contentPlanItems) {
    const timeKey = new Date(item.scheduledTime).toISOString();
    if (!itemsByTime.has(timeKey)) {
      itemsByTime.set(timeKey, []);
    }
    itemsByTime.get(timeKey)!.push(item);
  }
  
  // Process each time group
  for (const [timeKey, items] of itemsByTime) {
    const scheduledTime = new Date(timeKey);
    const now = new Date();
    const delayMs = scheduledTime.getTime() - now.getTime();
    
    // Wait until scheduled time if needed
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    
    // Publish all items for this time slot in parallel
    await Promise.all(
      items.map(item => publishContent(item))
    );
  }
}