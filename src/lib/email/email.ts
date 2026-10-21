import nodemailer from 'nodemailer';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function getEmailConfig(): EmailConfig {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error(
      'Email configuration missing. Required environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS'
    );
  }

  return {
    host,
    port: parseInt(port, 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user,
      pass,
    },
  };
}

function createTransporter() {
  const config = getEmailConfig();

  console.log('[EMAIL_PROVIDER] Transporter created', {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.auth.user,
  });

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    // Callers await sendEmail inside API requests; without these, nodemailer's
    // defaults let a slow or refusing SMTP server hold a request for ~1 minute.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  console.log('[EMAIL_PROVIDER] Sending email', {
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    htmlLength: options.html.length,
  });

  try {
    const transporter = createTransporter();

    const from = options.from || process.env.SMTP_FROM || process.env.SMTP_USER;

    if (!from) {
      throw new Error('From address not specified. Set SMTP_FROM or SMTP_USER environment variable.');
    }

    const mailOptions = {
      from,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
      replyTo: options.replyTo,
      attachments: options.attachments,
    };

    console.log('[EMAIL_PROVIDER] Calling transporter.sendMail');

    const info = await transporter.sendMail(mailOptions);

    console.log('[EMAIL_PROVIDER] Success', {
      to: mailOptions.to,
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorCode = error instanceof Error && 'code' in error ? (error as any).code : undefined;

    console.error('[EMAIL_PROVIDER] Failed', {
      error: errorMessage,
      code: errorCode,
      name: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

async function verifyConfiguration(): Promise<boolean> {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('[EMAIL_PROVIDER] Configuration verified successfully');
    return true;
  } catch (error) {
    console.error('[EMAIL_PROVIDER] Configuration verification failed:', error);
    return false;
  }
}

export const emailService = {
  sendEmail,
  verifyConfiguration,
};

export type { SendEmailOptions, SendEmailResult, EmailConfig };
