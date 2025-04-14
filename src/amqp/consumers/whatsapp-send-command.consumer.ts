// ./src/amqp/consumers/whatsapp-send-command.consumer.ts

import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpConnectionService } from '../amqp-connection.service';
import {
  IMessageSender,
  IMessageSender as IMessageSenderToken,
} from '../../common/interfaces/message-sender.interface';
import * as amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WhatsappSendCommandConsumer implements OnModuleInit {
  private readonly logger = new Logger(WhatsappSendCommandConsumer.name);
  private readonly sendQueue: string;
  private channel: amqp.Channel | null = null;
  private consumerTag: string | null = null; // Store consumer tag for potential cancellation

  constructor(
    private readonly configService: ConfigService,
    private readonly connectionService: AmqpConnectionService,
    @Inject(IMessageSenderToken)
    private readonly messageSender: IMessageSender,
  ) {
    this.sendQueue = this.configService.get<string>('amqp.queues.outgoing')!;
  }

  async onModuleInit() {
    // No initial delay needed, rely on connection check and retry
    if (this.connectionService.isConnected()) {
      this.logger.log('AMQP connected on init, starting consumer immediately.');
      await this.startConsuming();
    } else {
      this.logger.warn(
        'AMQP not connected on init, scheduling consumer start.',
      );
      this.scheduleConsumingStart(5000); // Start the retry scheduler
      // Consider listening to an 'amqp.connected' event from AmqpConnectionService for faster startup
    }
  }

  // Optional: Implement OnModuleDestroy to gracefully stop consuming
  async onModuleDestroy() {
    if (this.channel && this.consumerTag) {
      this.logger.log(
        `Stopping consumer for queue ${this.sendQueue} (Tag: ${this.consumerTag})`,
      );
      try {
        await this.channel.cancel(this.consumerTag);
        this.logger.log(
          `Consumer for ${this.sendQueue} cancelled successfully.`,
        );
      } catch (error) {
        this.logger.error(
          `Error cancelling consumer for ${this.sendQueue}`,
          error,
        );
      }
    }
    this.channel = null; // Ensure channel is cleared
  }

  private scheduleConsumingStart(delayMs = 5000, attempt = 1) {
    const maxAttempts = 5; // Limit retries for starting consumer
    if (attempt > maxAttempts) {
      this.logger.error(
        `Could not start consumer for ${this.sendQueue} after ${maxAttempts} attempts. Giving up.`,
      );
      return;
    }

    setTimeout(async () => {
      if (this.connectionService.isConnected()) {
        await this.startConsuming();
      } else {
        this.logger.warn(
          `AMQP still not connected, rescheduling consumer start for ${this.sendQueue} (Attempt ${attempt + 1})`,
        );
        // Simple exponential backoff for consumer start
        this.scheduleConsumingStart(
          Math.min(delayMs * 1.5, 30000),
          attempt + 1,
        );
      }
    }, delayMs);
  }

  private async startConsuming() {
    if (this.consumerTag) {
      this.logger.warn(
        `Consumer for ${this.sendQueue} already running (Tag: ${this.consumerTag}). Skipping start.`,
      );
      return;
    }
    try {
      this.channel = this.connectionService.getChannel();
      await this.connectionService.assertQueue(this.sendQueue); // Ensure queue exists

      this.logger.log(`Starting consumer for queue: ${this.sendQueue}`);

      // Store the consumer tag
      const reply = await this.channel.consume(
        this.sendQueue,
        (msg) => this.handleMessage(msg as InputHandleMessage), // Pass directly
        { noAck: false }, // Manual acknowledgement is crucial
      );
      this.consumerTag = reply.consumerTag;
      this.logger.log(
        `Consumer started for ${this.sendQueue} with tag ${this.consumerTag}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to start consumer for ${this.sendQueue}. Error: ${errorMessage}. Retrying connection logic may handle this, or check RabbitMQ permissions/status.`,
        errorStack,
      );
      this.channel = null; // Reset channel if setup failed
      this.consumerTag = null;
      // Rely on the connection service's reconnect logic to potentially allow restarting later
      // OR explicitly schedule a retry for startConsuming itself after a delay
      // For simplicity here, we assume connection issue is the primary blocker
    }
  }

  private async handleMessage(msg: InputHandleMessage) {
    if (msg === null) {
      this.logger.warn(
        `Received null message on ${this.sendQueue}. This is unusual.`,
      );
      // Cannot ACK/NACK null message, likely a broker issue or channel closed during consumption.
      return;
    }

    let content!: MessageContent;
    let correlationId!: string;
    let logPrefix = '[id-unknown] '; // Initialize with default value
    let errorSource = 'unknown';

    try {
      const uuid: string = uuidv4();
      // 1. Extract Correlation ID and Build Log Prefix
      // Try to parse first to get correlationId from content, fallback to generating one
      try {
        content = JSON.parse(msg.content.toString()) as MessageContent;
        correlationId = (content?.correlationId ||
          msg.properties?.correlationId ||
          `gen-${uuid}`) as string;
      } catch (parseError: unknown) {
        // If parsing fails, generate an ID based on AMQP message ID if possible
        correlationId = msg.properties?.messageId
          ? `amqp-${msg.properties.messageId}`
          : `gen-${uuid}`;
        logPrefix = `[${correlationId}] `;
        this.logger.error(
          `${logPrefix}Failed to parse message content from ${this.sendQueue}. Content (start): ${msg.content.toString().substring(0, 100)}...`,
          parseError,
        );
        errorSource = 'parsing';
        // Discard unparseable message
        this.channel?.nack(msg, false, false);
        return;
      }

      logPrefix = `[${correlationId}] `; // Build prefix now that we have ID
      this.logger.log(
        `${logPrefix}Received message from ${this.sendQueue}. AMQP Msg Id: ${msg.properties.messageId}`,
      );

      // 2. Check Channel State
      if (!this.channel) {
        this.logger.error(
          `${logPrefix}Channel not available when handling message from ${this.sendQueue}. Cannot process or NACK/ACK. Message will likely be redelivered after reconnect.`,
        );
        // Cannot NACK/ACK, broker should handle redelivery after channel recovery
        return;
      }

      // 3. Validate Message Content (after parsing)
      errorSource = 'validation';
      if (!content.to || !content.text) {
        this.logger.error(
          `${logPrefix}Invalid message format from ${this.sendQueue}. Missing 'to' or 'text'. Discarding.`,
          { payload: content }, // Log the invalid payload
        );
        this.channel.nack(msg, false, false); // Discard invalid format
        return;
      }

      // 4. Check WhatsApp Connection
      errorSource = 'whatsapp_connection_check';
      if (!this.messageSender.isConnected()) {
        this.logger.warn(
          `${logPrefix}WhatsApp not connected. Requeuing message from ${this.sendQueue} for recipient ${content.to}.`,
        );
        this.channel.nack(msg, false, true); // Requeue if WA is down
        return;
      }

      // 5. Format Recipient and Send
      errorSource = 'sending';
      // Ensure .net suffix, handle potential variations (e.g., group IDs ending in @g.us)
      const formattedTo = content.to.includes('@')
        ? content.to
        : `${content.to}@s.whatsapp.net`; // Default to standard chat ID

      this.logger.log(
        `${logPrefix}Attempting to send message to ${formattedTo} via MessageSender.`,
      );
      const sent = await this.messageSender.sendMessage(
        formattedTo,
        content.text,
        correlationId, // Pass correlation ID to sender
      );

      // 6. ACK/NACK based on send result
      if (sent) {
        this.logger.log(
          `${logPrefix}Message sent successfully to ${formattedTo}. ACKed from ${this.sendQueue}.`,
        );
        this.channel.ack(msg); // Acknowledge successful processing
      } else {
        // Sending failed (as reported by WhatsappSenderService)
        this.logger.warn(
          `${logPrefix}Failed to send WhatsApp message to ${formattedTo} (sender returned false). Discarding message from ${this.sendQueue} to prevent loops.`,
        );
        this.channel.nack(msg, false, false); // Discard if sending failed persistently
      }
    } catch (error) {
      // 7. Catch-all for unexpected errors during processing
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `${logPrefix}Unexpected error during message processing (Source: ${errorSource}) from ${this.sendQueue}. Discarding message. Error: ${errorMessage}`,
        errorStack, // Log stack trace
        {
          // Log relevant context if available
          amqpMessageId: msg?.properties?.messageId as string,
          parsedContent:
            errorSource !== 'parsing' ? content : '<parsing failed>', // Avoid logging if parsing failed
          errorSource: errorSource,
        },
      );

      // Ensure NACK happens even if channel becomes null mid-processing (less likely but possible)
      if (this.channel && msg) {
        try {
          this.channel.nack(msg, false, false); // Discard on unexpected error
        } catch (nackErr) {
          const nackErrorMessage =
            nackErr instanceof Error ? nackErr.message : String(nackErr);
          const nackErrorStack =
            nackErr instanceof Error ? nackErr.stack : undefined;
          this.logger.error(
            `${logPrefix}Failed to NACK message after processing error. Message might be redelivered or lost. NACK Error: ${nackErrorMessage}`,
            nackErrorStack, // Log stack trace
            {
              // Log relevant context if available
              amqpMessageId: msg?.properties?.messageId as string,
              parsedContent:
                errorSource !== 'parsing' ? content : '<parsing failed>', // Avoid logging if parsing failed
              errorSource: errorSource,
            },
          );
        }
      } else if (!this.channel) {
        this.logger.error(
          `${logPrefix}Channel became unavailable during error handling. Cannot NACK message. Redelivery likely.`,
        );
      }
    }
  }
}

type MessageContent = {
  to: string;
  text: string;
  correlationId?: string;
  messageId?: string;
};

type InputHandleMessage =
  | (amqp.ConsumeMessage & { properties?: MessageContent })
  | null;
