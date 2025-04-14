// ./src/whatsapp/handlers/messages-upsert.handler.ts

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IMessagePublisher,
  IMessagePublisher as IMessagePublisherToken,
} from '../../common/interfaces/message-publisher.interface';
import {
  IWhatsAppEventHandler,
  BaileysEvent,
} from '../interfaces/whatsapp-event-handler.interface';
import { WAMessage, WASocket } from 'baileys';
import { v4 as uuidv4 } from 'uuid';

// Define the expected payload structure more accurately based on Baileys types
type MessagesUpsertPayload = {
  messages: WAMessage[];
  type: string;
};

@Injectable()
export class MessagesUpsertHandler
  implements IWhatsAppEventHandler<MessagesUpsertPayload>
{
  private readonly logger = new Logger(MessagesUpsertHandler.name);
  private readonly receivedQueue: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(IMessagePublisherToken)
    private readonly messagePublisher: IMessagePublisher,
  ) {
    this.receivedQueue = this.configService.get<string>(
      'amqp.queues.incoming',
    )!;
    this.logger.log(
      `MessagesUpsertHandler initialized. Publishing to queue: ${this.receivedQueue}`,
    );
  }

  get eventName(): BaileysEvent {
    return 'messages.upsert';
  }

  async handle(
    payload: MessagesUpsertPayload,
    socket?: WASocket,
  ): Promise<void> {
    // Iterate through messages, although often it's just one per event
    for (const message of payload.messages) {
      const msgId = message.key.id || 'unknown-wa-id';
      // Generate a correlation ID for this specific incoming message flow
      const correlationId = `wa-in-${msgId}-${uuidv4().substring(0, 8)}`;
      const logPrefix = `[${correlationId}] `;

      // Enhanced Filtering Logic
      if (
        message.key?.fromMe || // Ignore messages sent by self
        payload.type !== 'notify' || // Only handle new message notifications
        !message.key?.remoteJid || // Ensure sender JID exists
        message.key?.remoteJid === 'status@broadcast' || // Ignore status updates
        message.messageStubType || // Ignore message stubs (call logs, group changes etc.)
        message.broadcast // Ignore broadcast list messages (can be noisy)
      ) {
        this.logger.debug(
          `${logPrefix}Ignoring message based on filter criteria (fromMe, type, stub, broadcast, status). Msg ID: ${msgId}`,
        );
        continue; // Skip to the next message if any
      }

      const sender = message.key.remoteJid;
      // Extract text reliably from different message types
      const messageText =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.buttonsResponseMessage?.selectedDisplayText || // For button replies
        message.message?.listResponseMessage?.title; // For list replies (might need more context)

      if (
        !sender ||
        typeof messageText !== 'string' ||
        messageText.trim() === ''
      ) {
        this.logger.debug(
          `${logPrefix}Ignoring non-text/empty/unparseable message from ${sender || 'unknown'}. Msg ID: ${msgId}`,
          { messageContent: message.message }, // Log content for debug
        );
        continue;
      }

      this.logger.log(
        `${logPrefix}Handler received message from ${sender}. Msg ID: ${msgId}. Text: "${messageText.substring(0, 50)}..."`, // Truncate long messages in logs
      );

      // Prepare data for the AMQP queue
      const messageData = {
        correlationId: correlationId, // Pass the generated ID
        waMessageId: msgId,
        waTimestamp: message.messageTimestamp, // Use number/Long type from Baileys
        from: sender,
        pushName: message.pushName || 'Unknown', // Sender's display name
        text: messageText, // The extracted text
        // Add other potentially useful info if needed
        // isGroupMessage: sender.includes('@g.us'),
        // fullMessage: process.env.NODE_ENV !== 'production' ? message : undefined // Avoid logging full message in prod
      };

      try {
        await this.messagePublisher.publish(this.receivedQueue, messageData);
        this.logger.log(
          `${logPrefix}Message from ${sender} (Msg ID: ${msgId}) published to queue ${this.receivedQueue}`,
        );
        // Optional: Mark message as read using the socket instance if passed
        if (socket && message.key) {
          // socket.readMessages([message.key]).catch(err => {
          //     this.logger.warn(`${logPrefix}Failed to mark message ${msgId} as read`, err);
          // });
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `${logPrefix}Failed to publish message from ${sender} (Msg ID: ${msgId}) to queue ${this.receivedQueue}. Error: ${errorMessage}`,
          errorStack,
        );
        // Decide on error handling: retry? dead-letter? For now, just log.
      }
    } // End of loop through messages
  }
}
