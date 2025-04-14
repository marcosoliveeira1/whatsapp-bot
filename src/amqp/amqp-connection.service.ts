// ./src/amqp/amqp-connection.service.ts

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

// Define constants for backoff strategy
const INITIAL_RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_DELAY = 60000; // 60 seconds
const RECONNECT_FACTOR = 2; // Double the delay each time

@Injectable()
export class AmqpConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AmqpConnectionService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private isConnecting = false;
  private readonly amqpUrl: string;
  private reconnectAttempts = 0; // Track attempts for backoff
  private reconnectTimeout: NodeJS.Timeout | null = null; // Store timeout handle

  constructor(private readonly configService: ConfigService) {
    this.amqpUrl = this.configService.get<string>('amqp.url')!;
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.clearReconnectTimeout(); // Clear any scheduled reconnect on shutdown
    await this.close();
  }

  public getChannel(): amqp.Channel {
    if (!this.channel) {
      this.logger.error('AMQP Channel is not available.');
      throw new Error('AMQP Channel not initialized');
    }
    return this.channel;
  }

  public isConnected(): boolean {
    // Channel is a better indicator than just connection for usability
    return !!this.channel;
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) {
      // Removed isConnected() check here to allow connect attempt even if temporarily connected but user wants to force it (less relevant here but good pattern)
      this.logger.warn('Connection attempt already in progress.');
      return;
    }
    this.isConnecting = true;
    this.clearReconnectTimeout(); // Clear any pending reconnect from previous failures

    this.logger.log(
      `Attempting to connect to RabbitMQ (Attempt ${this.reconnectAttempts + 1})...`,
    );
    try {
      this.connection = await amqp.connect(this.amqpUrl);
      this.channel = await this.connection.createChannel();
      this.logger.log('Successfully connected to RabbitMQ and channel created');

      // Reset reconnect attempts on successful connection
      this.reconnectAttempts = 0;

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', (err as Error).message);
        this.handleDisconnect();
      });
      this.connection.on('close', () => {
        // Only handle close if we weren't deliberately closing or already handling an error/reconnect
        if (!this.isConnecting && this.connection) {
          this.logger.warn('RabbitMQ connection closed unexpectedly.');
          this.handleDisconnect();
        }
      });

      this.isConnecting = false;
    } catch (error) {
      this.logger.error(
        `Failed connection attempt ${this.reconnectAttempts + 1} to RabbitMQ: ${(error as Error).message}`,
      );
      this.channel = null;
      this.connection = null; // Ensure connection is null on failure
      this.isConnecting = false;
      this.reconnectAttempts++; // Increment attempts *after* failure
      this.scheduleReconnect();
    }
  }

  private handleDisconnect() {
    // Prevent multiple concurrent disconnect handlers
    if (!this.isConnecting && (this.channel || this.connection)) {
      this.channel = null; // Mark as disconnected
      this.connection = null; // Mark as disconnected
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isConnecting || this.reconnectTimeout) {
      this.logger.debug('Reconnect already scheduled or in progress.');
      return; // Don't schedule multiple reconnects
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY *
        Math.pow(RECONNECT_FACTOR, this.reconnectAttempts),
      MAX_RECONNECT_DELAY,
    );

    this.logger.log(
      `Scheduling RabbitMQ reconnection attempt ${this.reconnectAttempts + 1} in ${delay / 1000} seconds...`,
    );
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null; // Clear the handle *before* attempting connect
      // No need to increment attempts here, connect() handles it on failure
      void this.connect(); // Use void to explicitly ignore the promise return here
    }, delay);
  }

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private async close(): Promise<void> {
    this.isConnecting = false; // Prevent reconnect attempts on manual close
    this.clearReconnectTimeout(); // Stop any scheduled reconnects
    this.reconnectAttempts = 0; // Reset attempts on manual close

    try {
      if (this.channel) {
        await this.channel.close();
        this.logger.log('RabbitMQ channel closed');
      }
      if (this.connection) {
        await this.connection.close();
        this.logger.log('RabbitMQ connection closed');
      }
    } catch (error) {
      this.logger.error('Error closing RabbitMQ connection', error);
    } finally {
      this.channel = null;
      this.connection = null;
    }
  }

  async assertQueue(
    queue: string,
    options?: amqp.Options.AssertQueue,
  ): Promise<amqp.Replies.AssertQueue> {
    const ch = this.getChannel(); // Throws if channel not available
    return ch.assertQueue(queue, { durable: true, ...options });
  }
}
