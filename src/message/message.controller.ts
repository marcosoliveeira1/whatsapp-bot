// ./src/message/message.controller.ts

import {
  Controller,
  Post,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
  Logger,
  // ValidationPipe removed as it's global
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IMessagePublisher,
  IMessagePublisher as IMessagePublisherToken,
} from '../common/interfaces/message-publisher.interface';
import { SendMessageDto } from './dto/send-message.dto';
import { v4 as uuidv4 } from 'uuid'; // Import uuid

@Controller('message')
export class MessageController {
  private readonly logger = new Logger(MessageController.name);
  private readonly outgoingQueue: string;

  constructor(
    @Inject(IMessagePublisherToken)
    private readonly messagePublisher: IMessagePublisher,
    private readonly configService: ConfigService,
  ) {
    this.outgoingQueue = this.configService.get<string>(
      'amqp.queues.outgoing',
    )!;
  }

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted is suitable for async tasks
  async sendMessage(
    @Body() sendMessageDto: SendMessageDto, // Use global validation pipe
  ) {
    const correlationId = uuidv4(); // Generate unique ID for this request
    const logPrefix = `[${correlationId}] `;

    this.logger.log(
      `${logPrefix}Received request to send message to ${sendMessageDto.to}`,
    );

    // Construct the payload expected by the WhatsappSendCommandConsumer
    const payload = {
      correlationId, // Include the ID in the message payload
      to: sendMessageDto.to,
      text: sendMessageDto.text,
    };

    try {
      await this.messagePublisher.publish(this.outgoingQueue, payload);
      this.logger.log(
        `${logPrefix}Message for ${sendMessageDto.to} published to queue ${this.outgoingQueue}`,
      );
      return {
        message: 'Message accepted for processing.',
        correlationId: correlationId, // Return ID to the caller if useful
        recipient: sendMessageDto.to,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `${logPrefix}Failed to publish message for ${sendMessageDto.to} to queue ${this.outgoingQueue}. Error: ${errorMessage}`,
        errorStack,
      );
      // Rethrow or return a specific error response. Let NestJS handle for now.
      // Consider throwing HttpException for client feedback.
      throw error;
    }
  }
}
