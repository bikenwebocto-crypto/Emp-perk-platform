import { formatInTimeZone } from 'date-fns-tz'

function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export interface CalendarInviteOptions {
  title: string
  description: string
  startDate: Date
  endDate: Date
  location?: string
  meetingLink?: string
  organizerEmail?: string
  organizerName?: string
  attendeeEmail: string
  attendeeName: string
  uid: string
}

export function generateICalInvite(options: CalendarInviteOptions): string {
  const now = new Date()
  const organizerEmail = options.organizerEmail || 'hello@perksandmore.com'
  const organizerName = options.organizerName || 'Perks & More'
  const meetingUrl = options.meetingLink || ''
  
  const description = meetingUrl 
    ? `${options.description}\\n\\nJoin Meeting: ${meetingUrl}`
    : options.description

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Perks & More//Demo Booking//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${escapeICalText(options.uid)}@perksandmore.com
DTSTAMP:${formatICalDate(now)}
DTSTART:${formatICalDate(options.startDate)}
DTEND:${formatICalDate(options.endDate)}
SUMMARY:${escapeICalText(options.title)}
DESCRIPTION:${escapeICalText(description)}
${options.location ? `LOCATION:${escapeICalText(options.location)}` : meetingUrl ? `LOCATION:${escapeICalText(meetingUrl)}` : ''}
ORGANIZER;CN=${escapeICalText(organizerName)}:mailto:${organizerEmail}
ATTENDEE;CN=${escapeICalText(options.attendeeName)};RSVP=TRUE:mailto:${options.attendeeEmail}
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-PT24H
ACTION:DISPLAY
DESCRIPTION:Reminder: ${escapeICalText(options.title)}
END:VALARM
END:VEVENT
END:VCALENDAR`
}