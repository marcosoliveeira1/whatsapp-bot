import { Module } from '@nestjs/common';
import { WhatsappConnectionService } from './whatsapp-connection.service';
import { WhatsappSenderService } from './whatsapp-sender.service';
import { IMessageSender } from '../common/interfaces/message-sender.interface';
import {
  IWhatsAppEventHandler,
  WHATSAPP_EVENT_HANDLER,
} from './interfaces/whatsapp-event-handler.interface';
import { MessagesUpsertHandler } from './handlers/messages-upsert.handler';
import { ConnectionUpdateHandler } from './handlers/connection-update.handler';
import { WhatsappEventRegistryService } from './whatsapp-event-registry.service';

@Module({
  imports: [], // Keep imports minimal unless handlers need services from other modules
  providers: [
    // Core Services
    WhatsappConnectionService,
    {
      provide: IMessageSender,
      useClass: WhatsappSenderService,
    },

    // Event Handlers (provided individually for their own injection)
    MessagesUpsertHandler,
    ConnectionUpdateHandler,
    // Add other handler classes here...

    // Register all handlers with the multi-provider token
    {
      provide: WHATSAPP_EVENT_HANDLER as symbol,
      useFactory: (
        messagesHandler: MessagesUpsertHandler,
        connectionHandler: ConnectionUpdateHandler,
      ): IWhatsAppEventHandler[] => [messagesHandler, connectionHandler],
      inject: [MessagesUpsertHandler, ConnectionUpdateHandler], // Inject the handlers into the factory
    },

    // The Registry Service
    WhatsappEventRegistryService,
  ],
  exports: [IMessageSender, WhatsappConnectionService],
})
export class WhatsappModule {}
