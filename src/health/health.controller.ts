// ./src/health/health.controller.ts

import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  HealthIndicatorResult,
  //   MemoryHealthIndicator, // Example: Check memory usage
  // DiskHealthIndicator, // Example: Check disk space
} from '@nestjs/terminus';
import { AmqpHealthIndicator } from './amqp.health';
import { WhatsappHealthIndicator } from './whatsapp.health';
// import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    // private memory: MemoryHealthIndicator,
    // private disk: DiskHealthIndicator,
    private amqp: AmqpHealthIndicator,
    private whatsapp: WhatsappHealthIndicator,
    // private configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  async check() {
    // You can add more checks like disk space or memory
    const result = await this.health.check([
      () => this.amqp.isHealthy('amqp'),
      () => this.whatsapp.isHealthy('whatsapp'),
    ]);

    return {
      status: result.status,
      services: Object.entries(result.details).map(
        ([key, value]: [string, HealthIndicatorResult]) => ({
          name: key,
          status: value.status,
        }),
      ),
    };
  }
}
