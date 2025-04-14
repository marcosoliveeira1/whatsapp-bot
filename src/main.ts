// ./src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { Logger, ValidationPipe, LogLevel } from '@nestjs/common'; // Import ValidationPipe & LogLevel
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Logger config can be handled later if needed
  });

  // Get config service instance AFTER app creation
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Configure logger level (example - adjust as needed)
  const logLevel = configService.get<string>('logging.level');
  const nestLogLevels: LogLevel[] = ['error', 'warn', 'log']; // Default
  if (logLevel === 'debug') nestLogLevels.push('debug');
  if (logLevel === 'verbose') nestLogLevels.push('debug', 'verbose');
  app.useLogger(nestLogLevels);

  // Enable global validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Allows basic type coercion (e.g., string -> number for @Param)
      },
    }),
  );

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  const appPort = configService.get<number>('app.port')!; // Use the health port as the main app port

  await app.listen(appPort);
  logger.log(`Application listening on port ${appPort}`);
  logger.log(
    `Health checks available at http://localhost:${appPort}/health`, // Health endpoint is now on the main port
  );
  logger.log(
    `Send message endpoint available at POST http://localhost:${appPort}/message/send`,
  );
  logger.log(
    `Application started successfully. Mode: ${configService.get('NODE_ENV')}`,
  );

  // Log info about queues being used
  logger.log(
    `Consuming from AMQP queue: ${configService.get('amqp.queues.outgoing')}`,
  );
  logger.log(
    `Publishing to AMQP queue: ${configService.get('amqp.queues.incoming')}`,
  );
}
bootstrap().catch((err) => {
  console.error('Application bootstrap failed:', err);
  process.exit(1);
});

// Define LogLevel type if needed (NestJS 5+) - Already present in your code
// type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';
