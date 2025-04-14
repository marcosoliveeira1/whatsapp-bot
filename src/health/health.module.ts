// ./src/health/health.module.ts

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios'; // Often needed for Terminus checks, include for good measure
import { HealthController } from './health.controller';
import { AmqpHealthIndicator } from './amqp.health';
import { WhatsappHealthIndicator } from './whatsapp.health';
import { AmqpModule } from '../amqp/amqp.module'; // Import to provide AmqpConnectionService
import { WhatsappModule } from '../whatsapp/whatsapp.module'; // Import to provide WhatsappConnectionService

@Module({
  imports: [
    TerminusModule,
    HttpModule, // Terminus often uses Http internally or for checks
    AmqpModule, // Make AmqpConnectionService available for injection
    WhatsappModule, // Make WhatsappConnectionService available for injection
  ],
  controllers: [HealthController],
  providers: [
    // Register our custom health indicators
    AmqpHealthIndicator,
    WhatsappHealthIndicator,
    // Terminus provides MemoryHealthIndicator etc. automatically if TerminusModule is imported
  ],
})
export class HealthModule {}
