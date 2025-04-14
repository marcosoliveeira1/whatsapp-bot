import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config(); // carrega o .env na mão

export const configSchema = z.object({
  amqp: z.object({
    url: z
      .string()
      .url({
        message:
          'AMQP_URL must be a valid URL (e.g., amqp://user:pass@host:5672)',
      })
      .refine((val) => val !== '', { message: 'AMQP_URL cannot be empty' }),
    queues: z.object({
      incoming: z
        .string()
        .min(1, { message: 'QUEUE_RECEIVED_MESSAGES cannot be empty' })
        .default('message_received'),
      outgoing: z
        .string()
        .min(1, { message: 'QUEUE_SEND_MESSAGES cannot be empty' })
        .default('message_send'),
    }),
  }),

  whatsapp: z.object({
    sessionPath: z
      .string()
      .min(1, { message: 'WHATSAPP_SESSION_PATH cannot be empty' })
      .default('auth'),
  }),

  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),

  app: z.object({
    port: z.coerce.number().int().positive().default(3000),
  }),
});

export type ConfigSchema = z.infer<typeof configSchema>;

export function validateConfig(): ConfigSchema {
  const config = {
    amqp: {
      url: process.env.AMQP_URL,
      queues: {
        incoming: process.env.QUEUE_RECEIVED_MESSAGES,
        outgoing: process.env.QUEUE_SEND_MESSAGES,
      },
    },
    whatsapp: {
      sessionPath: process.env.WHATSAPP_SESSION_PATH,
    },
    logging: {
      level: process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error',
    },
    app: {
      port: process.env.APP_PORT,
    },
  };

  try {
    return configSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const header = `\n❌ Environment variable validation failed:\n`;

      const lines = error.errors.map((e) => {
        const path = e.path.join('.');
        const message = e.message;
        return `🔴 ${path.padEnd(40)} → ${message}`;
      });

      const footer = `\n📄 Tip: Check your .env file for missing or invalid entries.\n`;

      console.error(header + lines.join('\n') + footer);

      throw new Error('Invalid environment configuration');
    }

    throw error;
  }
}
