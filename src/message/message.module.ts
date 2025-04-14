// ./src/message/message.module.ts

import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { AmqpModule } from '../amqp/amqp.module'; // Needed to inject IMessagePublisher
import { ConfigModule } from '@nestjs/config'; // Needed to inject ConfigService

@Module({
  imports: [
    AmqpModule, // Provides IMessagePublisher
    ConfigModule, // Provides ConfigService
  ],
  controllers: [MessageController],
  providers: [], // No specific providers needed here
})
export class MessageModule {}
