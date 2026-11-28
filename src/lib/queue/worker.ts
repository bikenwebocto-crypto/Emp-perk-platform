/**
 * Background Queue Worker
 *
 * Architecture:
 * - Uses PostgreSQL LISTEN/NOTIFY via pgmq or Supabase Realtime
 * - Processes action queue items, CSV imports, analytics aggregation
 * - Runs as a long-lived Node.js process
 *
 * Event types processed:
 * - csv.import          -> Process CSV file
 * - analytics.aggregate -> Aggregate daily analytics
 * - notification.send   -> Send queued notifications
 * - merchant.expire     -> Expire stale merchant offers
 *
 * The polling loop also gates the hourly OfferExpiryScheduler, which checks
 * for offers expiring within 24h, expiring today, and recently expired.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/services/audit-log.service';
import { reportAuditAlert } from '@/lib/monitoring/audit-health';
import { OfferExpiryScheduler } from './offer-expiry-scheduler';
import { DemoBookingReminderScheduler } from './demo-booking-reminder-scheduler';

interface QueueMessage {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  scheduledAt: Date;
  retryCount: number;
}

class QueueWorker {
  private isRunning = false;
  private pollIntervalMs = 5000;
  private offerExpiryScheduler = new OfferExpiryScheduler();
  private demoBookingReminderScheduler = new DemoBookingReminderScheduler();

  async start(): Promise<void> {
    this.isRunning = true;
    console.log('[QueueWorker] Started');

    while (this.isRunning) {
      await this.processNextBatch();
      await this.runScheduledJobs();
      await this.sleep(this.pollIntervalMs);
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log('[QueueWorker] Stopped');
  }

  private async runScheduledJobs(): Promise<void> {
    // Hourly offer-expiry checks (deduplicated + idempotent by design).
    if (this.offerExpiryScheduler.shouldRun()) {
      await this.offerExpiryScheduler.run();
    }
    // Hourly demo booking reminders (24h before confirmed bookings)
    if (this.demoBookingReminderScheduler.shouldRun()) {
      await this.demoBookingReminderScheduler.run();
    }
  }

  private async processNextBatch(): Promise<void> {
    try {
      // Fetch pending action queue items (simplified queue mechanism)
      const items = await prisma.actionQueueItem.findMany({
        where: { status: 'PENDING' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        take: 10,
      });

      for (const item of items) {
        await this.processItem(item);
      }
    } catch (error) {
      console.error('[QueueWorker] Error processing batch:', error);
    }
  }

  private async processItem(item: any): Promise<void> {
    const startTime = Date.now();

    try {
      // Mark as in-progress
      await this.transition(item, 'IN_PROGRESS');

      switch (item.type) {
        case 'NEW_MERCHANT_APPLICATION':
          // Handled by admin action; worker just ensures expiry
          break;

        case 'CSV_IMPORT': {
          // Trigger edge function to process CSV
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-csv`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ jobId: item.referenceId }),
            }
          );

          if (!response.ok) throw new Error('CSV processing failed');
          break;
        }

        case 'ISSUE_REVIEW':
          // Notify admin if issue hasn't been reviewed in 24h
          break;

        default:
          break;
      }

      // Mark as completed
      await this.transition(item, 'COMPLETED', { completedAt: new Date() }, {
        durationMs: Date.now() - startTime,
      });

      console.log(
        `[QueueWorker] Processed ${item.type}:${item.id} in ${Date.now() - startTime}ms`
      );
    } catch (error) {
      console.error(`[QueueWorker] Failed to process ${item.type}:${item.id}:`, error);
      reportAuditAlert('queue_backlog', {
        reason: 'item_failed',
        itemId: item.id,
        itemType: item.type,
        error: error instanceof Error ? error.message : String(error),
      });

      // Mark as failed
      await this.transition(item, 'FAILED', {}, {
        error: error instanceof Error ? error.message : String(error),
      }).catch((auditErr) =>
        console.error(`[QueueWorker] Could not record failure for ${item.id}:`, auditErr),
      );
    }
  }

  /**
   * Move an item to a new status and record the transition in the same
   * transaction, so the worker never changes queue state without evidence.
   */
  private async transition(
    item: { id: string; type: string; status?: string; referenceId?: string | null; referenceType?: string | null },
    to: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED',
    extra: Record<string, unknown> = {},
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const from = item.status ?? null;
    await prisma.$transaction(async (tx) => {
      await tx.actionQueueItem.update({
        where: { id: item.id },
        data: { status: to, ...extra } as any,
      });
      await createAuditLog({
        actorType: 'system',
        action: `ACTION_QUEUE_${to}`,
        entityType: 'action_queue_item',
        entityId: item.id,
        changes: { status: { from, to } },
        metadata: {
          source: 'queue-worker',
          itemType: item.type,
          referenceType: item.referenceType ?? null,
          referenceId: item.referenceId ?? null,
          ...metadata,
        },
      }, tx);
    });
    item.status = to;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Start the worker when run directly
if (require.main === module) {
  const worker = new QueueWorker();
  worker.start().catch(console.error);

  process.on('SIGINT', () => {
    worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    worker.stop();
    process.exit(0);
  });
}

export { QueueWorker };
