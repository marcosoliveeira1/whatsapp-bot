import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnectionService } from './amqp-connection.service';
import { IMessagePublisher } from '../common/interfaces/message-publisher.interface';

@Injectable()
export class AmqpProducerService implements IMessagePublisher {
  private readonly logger = new Logger(AmqpProducerService.name);

  constructor(private readonly connectionService: AmqpConnectionService) {}

  async publish(queue: string, message: any): Promise<void> {
    if (!this.connectionService.isConnected()) {
      this.logger.error(`Cannot publish to ${queue}. AMQP not connected.`);
      // Decide strategy: throw error, queue locally, etc.
      throw new Error('AMQP connection not available');
    }
    try {
      const channel = this.connectionService.getChannel();
      // Ensure queue exists before publishing (optional, but safer)
      await this.connectionService.assertQueue(queue);

      channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
        persistent: true,
      });
      this.logger.log(`Message published to queue ${queue}`);
    } catch (error) {
      this.logger.error(`Failed to publish message to queue ${queue}`, error);
      // Consider retry logic or dead-lettering
      throw error; // Re-throw to indicate failure
    }
  }
}
