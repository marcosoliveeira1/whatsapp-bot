// ./src/health/whatsapp.health.ts

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorStatus } from '@nestjs/terminus';
import { WhatsappConnectionService } from '../whatsapp/whatsapp-connection.service';

@Injectable()
export class WhatsappHealthIndicator {
  constructor(
    private readonly whatsappConnectionService: WhatsappConnectionService,
  ) {}

  isHealthy(key: string): HealthIndicatorResult {
    // Use the connection service's method
    const isConnected = this.whatsappConnectionService.isConnected();
    const status: HealthIndicatorStatus = isConnected ? 'up' : 'down';

    const result: HealthIndicatorResult = {
      [key]: {
        status,
      },
    };

    if (isConnected) {
      return result;
    }

    throw new ServiceUnavailableException('WhatsApp check failed', result);
  }
}
