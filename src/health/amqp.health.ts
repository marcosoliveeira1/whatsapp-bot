import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorStatus } from '@nestjs/terminus';
import { AmqpConnectionService } from '../amqp/amqp-connection.service';

@Injectable()
export class AmqpHealthIndicator {
  constructor(private readonly amqpConnectionService: AmqpConnectionService) {}

  isHealthy(key: string): HealthIndicatorResult {
    const isConnected = this.amqpConnectionService.isConnected();
    const status: HealthIndicatorStatus = isConnected ? 'up' : 'down';

    const result: HealthIndicatorResult = {
      [key]: {
        status,
      },
    };

    if (isConnected) {
      return result;
    }

    throw new ServiceUnavailableException('AMQP check failed', result);
  }
}
