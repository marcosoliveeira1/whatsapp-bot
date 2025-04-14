// src/app/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AmqpModule } from '../amqp/amqp.module';
import { validateConfig } from '../config/config.schema'; // Import the validation function
import { HealthModule } from 'src/health/health.module';
import { MessageModule } from 'src/message/message.module';

/**
 * The main application module. This module imports all necessary modules
 * for the app to work, including the `ConfigModule` which is used to load
 * and validate the configuration. The `AmqpModule` is used for the AMQP
 * connection and the `WhatsappModule` is used for the WhatsApp Business API.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      validate: () => validateConfig(),
      // cache: true, // Optional: Cache validated config for performance
      // expandVariables: true, // Optional: Enable variable expansion (e.g., `${DB_HOST}`)
    }),
    AmqpModule,
    WhatsappModule,
    HealthModule, // Add HealthModule here
    MessageModule, // Add MessageModule here
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
