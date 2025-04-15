// ./src/message/message.module.ts

import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { AmqpModule } from '../amqp/amqp.module';
import { ConfigModule } from '@nestjs/config';
// import { WhatsappModule } from '../whatsapp/whatsapp.module'; // Import WhatsappModule

@Module({
  imports: [
    // WhatsappModule, // Provides IMessageSender via WhatsappSenderService
    AmqpModule, // Remove if no longer needed
    ConfigModule, // Remove if no longer needed
  ],
  controllers: [MessageController],
  providers: [],
})
export class MessageModule {}
