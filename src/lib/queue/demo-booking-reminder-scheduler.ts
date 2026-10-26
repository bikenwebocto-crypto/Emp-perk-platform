/**
 * Demo Booking Reminder Scheduler
 *
 * Sends a 24-hour reminder for confirmed demo bookings with duplicate prevention.
 * Handles cancellation/rescheduling by only sending reminders for confirmed bookings
 * that haven't been cancelled/rescheduled.
 */

import { prisma } from '@/lib/prisma';
import { emailService } from '@/lib/email/email';
import { formatInTimeZone } from '@/lib/demo-bookings/availability';
import { generateICalInvite } from '@/lib/email/calendar';

const HOUR_MS = 60 * 60 * 1000;

class DemoBookingReminderScheduler {
  private lastRunAt = 0;
  private running = false;

  shouldRun(): boolean {
    return Date.now() - this.lastRunAt >= HOUR_MS;
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.lastRunAt = Date.now();

    try {
      await this.sendReminders();
    } catch (error) {
      console.error('[DemoBookingReminderScheduler] Failed:', error);
    } finally {
      this.running = false;
    }
  }

  private async sendReminders(): Promise<void> {
    const now = new Date();
    // Send reminders for bookings starting in 23-25 hours (24h window with some buffer)
    const windowStart = new Date(now.getTime() + 23 * HOUR_MS);
    const windowEnd = new Date(now.getTime() + 25 * HOUR_MS);

    // Find confirmed bookings in the 24h window that haven't had a reminder sent
    const bookings = await prisma.demoBooking.findMany({
      where: {
        status: 'CONFIRMED',
        startsAt: {
          gte: windowStart,
          lt: windowEnd,
        },
      },
      include: {
        lead: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
          },
        },
      },
    });

    for (const booking of bookings) {
      try {
        // Check if reminder already sent (use audit log as tracking)
        const existingReminder = await prisma.auditLog.findFirst({
          where: {
            entityType: 'demo_booking',
            entityId: booking.id,
            action: 'demo_booking.reminder_sent',
          },
        });

        if (existingReminder) {
          continue; // Already sent reminder
        }

        if (!booking.lead.email) {
          continue;
        }

        const when = formatInTimeZone(booking.startsAt, booking.timezone);
        const meetingLink = booking.meetingLink ?? undefined;
        const endTime = new Date(booking.startsAt.getTime() + booking.durationMinutes * 60 * 1000);

        // Generate ICS attachment
        const icsContent = generateICalInvite({
          title: `Demo Meeting - ${booking.lead.companyName}`,
          description: `Demo meeting with ${booking.lead.firstName} ${booking.lead.lastName} from ${booking.lead.companyName}. Reference: ${booking.reference}`,
          startDate: booking.startsAt,
          endDate: endTime,
          meetingLink,
          attendeeEmail: booking.lead.email,
          attendeeName: `${booking.lead.firstName} ${booking.lead.lastName}`,
          uid: booking.reference,
        });

        const html = `
<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Hello ${booking.lead.firstName},
</p>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  This is a reminder that your demo with <strong>Perks &amp; More</strong> is coming up tomorrow!
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0; width: 100%; background-color: #f9fafb; border-radius: 6px;">
  <tr>
    <td style="padding: 20px;">
      <p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 600; margin: 0 0 16px 0;">Meeting Details</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
        <tr>
          <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; width: 100px;">Reference:</td>
          <td style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0;">${booking.reference}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0;">When (Cyprus Time):</td>
          <td style="color: #61549A; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0; font-weight: 600;">${when}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0;">Duration:</td>
          <td style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0;">${booking.durationMinutes} minutes</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0;">Company:</td>
          <td style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0;">${booking.lead.companyName}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

${meetingLink ? `
<div style="margin: 32px 0; text-align: center;">
  <a href="${meetingLink}" style="background-color: #61549A; color: #ffffff; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; display: inline-block;">
    Join Microsoft Teams Meeting
  </a>
</div>
` : ''}

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 24px 0 16px 0;">
  We've attached a calendar invite (.ics) to this email so you can add it to your calendar.
</p>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 32px 0 0 0;">
  If you have any questions or need to reschedule, please reply to this email at <a href="mailto:hello@perksandmore.com" style="color: #61549A;">hello@perksandmore.com</a>.<br/><br/>
  Best regards,<br/>
  <strong>The Perks &amp; More Team</strong>
</p>`;

        const { renderTemplate } = await import('@/emails/renderer');
        const fullHtml = renderTemplate('Demo Reminder - Tomorrow', html);

        const result = await emailService.sendEmail({
          to: booking.lead.email,
          subject: `Reminder: Your Perks & More Demo Tomorrow (${booking.reference})`,
          html: fullHtml,
          attachments: [
            {
              filename: `demo-booking-${booking.reference}.ics`,
              content: icsContent,
              contentType: 'text/calendar; method=REQUEST',
            },
          ],
        });

        if (result.success) {
          await prisma.auditLog.create({
            data: {
              actorType: 'system',
              action: 'demo_booking.reminder_sent',
              entityType: 'demo_booking',
              entityId: booking.id,
              metadata: { reference: booking.reference, sentAt: new Date().toISOString() },
            },
          });
          console.log(`[DemoBookingReminderScheduler] Sent reminder for ${booking.reference}`);
        }
      } catch (error) {
        console.error(`[DemoBookingReminderScheduler] Failed to send reminder for booking ${booking.id}:`, error);
      }
    }
  }
}

export { DemoBookingReminderScheduler };
