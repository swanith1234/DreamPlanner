// // src/modules/notification/providers/email.provider.ts
// import nodemailer, { Transporter } from 'nodemailer';
// import { env } from '../../../config/env';
// import { logger } from '../../../utils/logger';
// import { NotificationType } from '@prisma/client';

// export interface EmailPayload {
//   to: string;
//   userName: string;
//   taskTitle?: string;
//   dreamTitle?: string;
//   message: string;
//   scheduledAt: Date;
//   userTimezone: string;
//   notificationType: NotificationType;
// }

// /**
//  * Email provider with support for:
//  * - Ethereal (test SMTP for local development)
//  * - Production SMTP (SendGrid, AWS SES, etc.)
//  */
// export class EmailProvider {
//   private transporter: Transporter | null = null;
//   private testAccount: any = null;

//   async initialize(): Promise<void> {
//     try {
//       if (env.email.provider === 'ethereal') {
//         // Create Ethereal test account
//         this.testAccount = await nodemailer.createTestAccount();
//         this.transporter = nodemailer.createTransport({
//           host: 'smtp.ethereal.email',
//           port: 587,
//           secure: false,
//           auth: {
//             user: this.testAccount.user,
//             pass: this.testAccount.pass,
//           },
//         });
//         await logger.info('email', 'Ethereal email provider initialized');
//       } else if (env.email.provider === 'smtp') {
//         // Production SMTP
//         this.transporter = nodemailer.createTransport({
//           host: env.email.smtp.host,
//           port: env.email.smtp.port,
//           secure: env.email.smtp.secure,
//           auth: {
//             user: env.email.smtp.user,
//             pass: env.email.smtp.pass,
//           },
//         });
//         await logger.info('email', 'Production SMTP email provider initialized');
//       } else {
//         throw new Error(`Unknown email provider: ${env.email.provider}`);
//       }
//     } catch (error: any) {
//       await logger.error('email', 'Failed to initialize email provider', {
//         error: error.message,
//       });
//       throw error;
//     }
//   }

//   /**
//    * Send email notification
//    */
//   async send(payload: EmailPayload): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
//     try {
//       if (!this.transporter) {
//         throw new Error('Email transporter not initialized');
//       }

//       const { html, text, subject } = this.buildEmailTemplate(payload);

//       const info = await this.transporter.sendMail({
//         from: env.email.from,
//         to: payload.to,
//         subject,
//         text,
//         html,
//       });

//       await logger.info(
//         'email',
//         'Email sent successfully',
//         {
//           messageId: info.messageId,
//           to: payload.to,
//           notificationType: payload.notificationType,
//         },
//         undefined
//       );

//       // For Ethereal, log preview URL
//       if (this.testAccount) {
//         const previewUrl = nodemailer.getTestMessageUrl(info);
//         if (previewUrl) {
//           console.log(`📧 Ethereal preview: ${previewUrl}`);
//           return { success: true, previewUrl };
//         }
//       }

//       return { success: true };
//     } catch (error: any) {
//       await logger.error('email', 'Failed to send email', {
//         error: error.message,
//         to: payload.to,
//       });
//       return { success: false, error: error.message };
//     }
//   }

//   /**
//    * Build email template based on notification type
//    */
//   private buildEmailTemplate(
//     payload: EmailPayload
//   ): { html: string; text: string; subject: string } {
//     const scheduledTime = this.formatTimeInTimezone(
//       payload.scheduledAt,
//       payload.userTimezone
//     );

//     switch (payload.notificationType) {
//       case 'REMINDER':
//         return this.buildReminderEmail(payload, scheduledTime);
//       case 'MOTIVATIONAL':
//         return this.buildMotivationalEmail(payload, scheduledTime);
//       case 'SYSTEM':
//         return this.buildSystemEmail(payload, scheduledTime);
//       default:
//         return this.buildDefaultEmail(payload, scheduledTime);
//     }
//   }

//   /**
//    * REMINDER email template
//    */
//   private buildReminderEmail(
//     payload: EmailPayload,
//     scheduledTime: string
//   ): { html: string; text: string; subject: string } {
//     const taskInfo = payload.taskTitle ? `<strong>${payload.taskTitle}</strong>` : 'Your task';
//     const dreamInfo = payload.dreamTitle ? `<em>${payload.dreamTitle}</em>` : '';

//     const html = `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <style>
//           body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
//           .header { background: #007bff; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
//           .content { background: white; padding: 20px; }
//           .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
//           .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin-top: 15px; }
//           .info-box { background: #e7f3ff; padding: 15px; border-left: 4px solid #007bff; margin: 15px 0; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>📋 Task Reminder</h1>
//           </div>
//           <div class="content">
//             <p>Hi <strong>${payload.userName}</strong>,</p>
//             <p>You have a reminder for ${taskInfo}${dreamInfo ? ` under dream: ${dreamInfo}` : ''}.</p>
//             <div class="info-box">
//               <p><strong>Message:</strong> ${payload.message}</p>
//               <p><strong>Scheduled Time:</strong> ${scheduledTime}</p>
//             </div>
//             <p>Keep making progress towards your goals! 💪</p>
//             <a href="#" class="button">Open DreamPlanner</a>
//           </div>
//           <div class="footer">
//             <p>&copy; 2026 DreamPlanner. All rights reserved.</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;

//     const text = `
//       Task Reminder
      
//       Hi ${payload.userName},
      
//       You have a reminder for your task: ${payload.taskTitle || 'Unnamed Task'}${payload.dreamTitle ? ` (Dream: ${payload.dreamTitle})` : ''}
      
//       Message: ${payload.message}
//       Scheduled Time: ${scheduledTime}
      
//       Keep making progress towards your goals!
//     `;

//     return {
//       html,
//       text,
//       subject: '[DreamPlanner] Task Reminder',
//     };
//   }

//   /**
//    * MOTIVATIONAL email template
//    */
//   private buildMotivationalEmail(
//     payload: EmailPayload,
//     scheduledTime: string
//   ): { html: string; text: string; subject: string } {
//     const html = `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <style>
//           body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
//           .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
//           .content { background: white; padding: 20px; }
//           .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
//           .motivational-box { background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%); padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 4px; }
//           .emoji { font-size: 24px; margin-right: 10px; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>✨ Keep Going!</h1>
//             <p>You're making great progress</p>
//           </div>
//           <div class="content">
//             <p>Hi <strong>${payload.userName}</strong>,</p>
//             <div class="motivational-box">
//               <p><span class="emoji">💫</span><strong>${payload.message}</strong></p>
//             </div>
//             <p>Every step counts. You're doing amazing! Keep the momentum going! 🚀</p>
//             <p><small>Scheduled at: ${scheduledTime}</small></p>
//           </div>
//           <div class="footer">
//             <p>&copy; 2026 DreamPlanner. Dream big, achieve bigger!</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;

//     const text = `
//       Keep Going!
      
//       Hi ${payload.userName},
      
//       ${payload.message}
      
//       Every step counts. You're doing amazing! Keep the momentum going!
      
//       Scheduled at: ${scheduledTime}
//     `;

//     return {
//       html,
//       text,
//       subject: '[DreamPlanner] 💪 Motivation Boost',
//     };
//   }

//   /**
//    * SYSTEM email template
//    */
//   private buildSystemEmail(
//     payload: EmailPayload,
//     scheduledTime: string
//   ): { html: string; text: string; subject: string } {
//     const html = `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <style>
//           body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
//           .header { background: #28a745; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
//           .content { background: white; padding: 20px; }
//           .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
//           .system-box { background: #f0f9ff; padding: 15px; border-left: 4px solid #28a745; margin: 15px 0; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>🔔 System Notification</h1>
//           </div>
//           <div class="content">
//             <p>Hi <strong>${payload.userName}</strong>,</p>
//             <div class="system-box">
//               <p>${payload.message}</p>
//             </div>
//             <p><small>Sent at: ${scheduledTime}</small></p>
//           </div>
//           <div class="footer">
//             <p>&copy; 2026 DreamPlanner. All rights reserved.</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;

//     const text = `
//       System Notification
      
//       Hi ${payload.userName},
      
//       ${payload.message}
      
//       Sent at: ${scheduledTime}
//     `;

//     return {
//       html,
//       text,
//       subject: '[DreamPlanner] System Notification',
//     };
//   }

//   /**
//    * Default email template (fallback)
//    */
//   private buildDefaultEmail(
//     payload: EmailPayload,
//     scheduledTime: string
//   ): { html: string; text: string; subject: string } {
//     const html = `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <style>
//           body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
//           .header { background: #6c757d; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
//           .content { background: white; padding: 20px; }
//           .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>📬 DreamPlanner Notification</h1>
//           </div>
//           <div class="content">
//             <p>Hi <strong>${payload.userName}</strong>,</p>
//             <p>${payload.message}</p>
//             <p><small>Sent at: ${scheduledTime}</small></p>
//           </div>
//           <div class="footer">
//             <p>&copy; 2026 DreamPlanner. All rights reserved.</p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;

//     const text = `
//       DreamPlanner Notification
      
//       Hi ${payload.userName},
      
//       ${payload.message}
      
//       Sent at: ${scheduledTime}
//     `;

//     return {
//       html,
//       text,
//       subject: '[DreamPlanner] Notification',
//     };
//   }

//   /**
//    * Format time in user's timezone
//    * Using the same approach from earlier conversation
//    */
//   private formatTimeInTimezone(date: Date, timezone: string): string {
//     try {
//       const formatter = new Intl.DateTimeFormat('en-US', {
//         timeZone: timezone,
//         year: 'numeric',
//         month: '2-digit',
//         day: '2-digit',
//         hour: '2-digit',
//         minute: '2-digit',
//         second: '2-digit',
//         hour12: false,
//       });

//       const parts = formatter.formatToParts(date);
//       const partsObj: any = {};

//       for (const part of parts) {
//         if (part.type !== 'literal') {
//           partsObj[part.type] = part.value;
//         }
//       }

//       const year = partsObj.year;
//       const month = partsObj.month;
//       const day = partsObj.day;
//       const hour = partsObj.hour;
//       const minute = partsObj.minute;
//       const second = partsObj.second;

//       return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
//     } catch (error) {
//       // Fallback to ISO string
//       return date.toISOString();
//     }
//   }
// }

// export const emailProvider = new EmailProvider();

// src/modules/notification/providers/email.provider.ts
import axios from 'axios';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { NotificationType } from '@prisma/client';

export interface EmailPayload {
  to: string;
  userName: string;
  taskTitle?: string;
  dreamTitle?: string;
  message: string;
  scheduledAt: Date;
  userTimezone: string;
  notificationType: NotificationType;
}

/**
 * Email provider updated to use Brevo HTTP API to bypass Render SMTP restrictions.
 */
export class EmailProvider {
  private readonly BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

  async initialize(): Promise<void> {
    try {
      await logger.info('email', `Email provider initialized with mode: ${env.email.provider}`);
    } catch (error: any) {
      await logger.error('email', 'Failed to initialize email provider', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send email notification via Brevo HTTP API
   */
  async send(payload: EmailPayload): Promise<{ success: boolean; error?: string }> {
    try {
      const { html, subject } = this.buildEmailTemplate(payload);

      // Construct Brevo API Request Body
      const data = {
        sender: { 
          name: "Dream Planner", 
          email: "swanithpidugu@gmail.com" 
        },
        to: [{ email: payload.to, name: payload.userName }],
        subject: subject,
        htmlContent: html,
      };

      const response = await axios.post(this.BREVO_API_URL, data, {
        headers: {
          'api-key': env.email.brevoApiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      await logger.info('email', 'Email sent successfully via Brevo API', {
        messageId: response.data.messageId,
        to: payload.to,
        notificationType: payload.notificationType,
      });

      return { success: true };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      await logger.error('email', 'Failed to send email via Brevo', {
        error: errorMessage,
        to: payload.to,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Build email template based on notification type
   */
  private buildEmailTemplate(
    payload: EmailPayload
  ): { html: string; text: string; subject: string } {
    const scheduledTime = this.formatTimeInTimezone(
      payload.scheduledAt,
      payload.userTimezone
    );

    switch (payload.notificationType) {
      case 'REMINDER':
        return this.buildReminderEmail(payload, scheduledTime);
      case 'MOTIVATIONAL':
        return this.buildMotivationalEmail(payload, scheduledTime);
      case 'SYSTEM':
        return this.buildSystemEmail(payload, scheduledTime);
      default:
        return this.buildDefaultEmail(payload, scheduledTime);
    }
  }

  /**
   * REMINDER email template
   */
  private buildReminderEmail(
    payload: EmailPayload,
    scheduledTime: string
  ): { html: string; text: string; subject: string } {
    const taskInfo = payload.taskTitle ? `<strong>${payload.taskTitle}</strong>` : 'Your task';
    const dreamInfo = payload.dreamTitle ? `<em>${payload.dreamTitle}</em>` : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
          .header { background: #007bff; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: white; padding: 20px; }
          .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin-top: 15px; }
          .info-box { background: #e7f3ff; padding: 15px; border-left: 4px solid #007bff; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 Task Reminder</h1>
          </div>
          <div class="content">
            <p>Hi <strong>${payload.userName}</strong>,</p>
            <p>You have a reminder for ${taskInfo}${dreamInfo ? ` under dream: ${dreamInfo}` : ''}.</p>
            <div class="info-box">
              <p><strong>Message:</strong> ${payload.message}</p>
              <p><strong>Scheduled Time:</strong> ${scheduledTime}</p>
            </div>
            <p>Keep making progress towards your goals! 💪</p>
            <a href="#" class="button">Open DreamPlanner</a>
          </div>
          <div class="footer">
            <p>&copy; 2026 DreamPlanner. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Task Reminder
      
      Hi ${payload.userName},
      
      You have a reminder for your task: ${payload.taskTitle || 'Unnamed Task'}${payload.dreamTitle ? ` (Dream: ${payload.dreamTitle})` : ''}
      
      Message: ${payload.message}
      Scheduled Time: ${scheduledTime}
      
      Keep making progress towards your goals!
    `;

    return {
      html,
      text,
      subject: '[DreamPlanner] Task Reminder',
    };
  }

  /**
   * MOTIVATIONAL email template
   */
  private buildMotivationalEmail(
    payload: EmailPayload,
    scheduledTime: string
  ): { html: string; text: string; subject: string } {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: white; padding: 20px; }
          .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
          .motivational-box { background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%); padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 4px; }
          .emoji { font-size: 24px; margin-right: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✨ Keep Going!</h1>
            <p>You're making great progress</p>
          </div>
          <div class="content">
            <p>Hi <strong>${payload.userName}</strong>,</p>
            <div class="motivational-box">
              <p><span class="emoji">💫</span><strong>${payload.message}</strong></p>
            </div>
            <p>Every step counts. You're doing amazing! Keep the momentum going! 🚀</p>
            <p><small>Scheduled at: ${scheduledTime}</small></p>
          </div>
          <div class="footer">
            <p>&copy; 2026 DreamPlanner. Dream big, achieve bigger!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Keep Going!
      
      Hi ${payload.userName},
      
      ${payload.message}
      
      Every step counts. You're doing amazing! Keep the momentum going!
      
      Scheduled at: ${scheduledTime}
    `;

    return {
      html,
      text,
      subject: '[DreamPlanner] 💪 Motivation Boost',
    };
  }

  /**
   * SYSTEM email template
   */
  private buildSystemEmail(
    payload: EmailPayload,
    scheduledTime: string
  ): { html: string; text: string; subject: string } {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
          .header { background: #28a745; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: white; padding: 20px; }
          .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
          .system-box { background: #f0f9ff; padding: 15px; border-left: 4px solid #28a745; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 System Notification</h1>
          </div>
          <div class="content">
            <p>Hi <strong>${payload.userName}</strong>,</p>
            <div class="system-box">
              <p>${payload.message}</p>
            </div>
            <p><small>Sent at: ${scheduledTime}</small></p>
          </div>
          <div class="footer">
            <p>&copy; 2026 DreamPlanner. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      System Notification
      
      Hi ${payload.userName},
      
      ${payload.message}
      
      Sent at: ${scheduledTime}
    `;

    return {
      html,
      text,
      subject: '[DreamPlanner] System Notification',
    };
  }

  /**
   * Default email template (fallback)
   */
  private buildDefaultEmail(
    payload: EmailPayload,
    scheduledTime: string
  ): { html: string; text: string; subject: string } {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
          .header { background: #6c757d; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: white; padding: 20px; }
          .footer { background: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📬 DreamPlanner Notification</h1>
          </div>
          <div class="content">
            <p>Hi <strong>${payload.userName}</strong>,</p>
            <p>${payload.message}</p>
            <p><small>Sent at: ${scheduledTime}</small></p>
          </div>
          <div class="footer">
            <p>&copy; 2026 DreamPlanner. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      DreamPlanner Notification
      
      Hi ${payload.userName},
      
      ${payload.message}
      
      Sent at: ${scheduledTime}
    `;

    return {
      html,
      text,
      subject: '[DreamPlanner] Notification',
    };
  }

  /**
   * Format time in user's timezone
   */
  private formatTimeInTimezone(date: Date, timezone: string): string {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(date);
      const partsObj: any = {};

      for (const part of parts) {
        if (part.type !== 'literal') {
          partsObj[part.type] = part.value;
        }
      }

      const year = partsObj.year;
      const month = partsObj.month;
      const day = partsObj.day;
      const hour = partsObj.hour;
      const minute = partsObj.minute;
      const second = partsObj.second;

      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    } catch (error) {
      return date.toISOString();
    }
  }
}

export const emailProvider = new EmailProvider();