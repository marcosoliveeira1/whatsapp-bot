import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { WhatsappConnectionService } from './whatsapp-connection.service';
import {
  IWhatsAppEventHandler,
  WHATSAPP_EVENT_HANDLER,
} from './interfaces/whatsapp-event-handler.interface';

@Injectable()
export class WhatsappEventRegistryService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappEventRegistryService.name);

  constructor(
    private readonly connectionService: WhatsappConnectionService,
    @Inject(WHATSAPP_EVENT_HANDLER) // Inject all providers bound to the token
    private readonly handlers: IWhatsAppEventHandler[],
  ) {
    this.logger.log(
      `Discovered ${this.handlers.length} WhatsApp event handlers.`,
    );
  }

  onModuleInit() {
    this.registerHandlers();

    // Re-register handlers if the connection service emits a 'connected' or 'reconnected' event
    // (Assuming WhatsappConnectionService emits such custom events)
    this.connectionService.eventEmitter.on('connection.open', () => {
      this.logger.log('Connection opened, ensuring handlers are registered.');
      // Re-registering might not be strictly necessary if Baileys preserves listeners,
      // but can be a safety measure. Be careful not to double-register without clearing first.
      // For now, we rely on initial registration. A more robust solution might clear
      // listeners on disconnect and re-add on connect.
      setTimeout(() => this.registerHandlers(), 100); // Small delay if needed
    });
    this.connectionService.eventEmitter.on('pre-disconnect', () => {
      this.logger.log('Connection closing, unregistering handlers...');
      this.unregisterHandlers(); // Unregister from the old socket instance
    });
  }

  private registerHandlers() {
    const socket = this.connectionService.getSocket(); // Get the socket instance

    if (!socket) {
      this.logger.warn(
        'Socket not available during initial registration. Handlers will be attached once connection is established via connectionService internal logic.',
      );
      // The connection service itself needs to ensure events are piped correctly once the socket exists.
      // Let's modify connection service slightly.
      return;
    }

    this.logger.log('Registering WhatsApp event handlers...');

    this.handlers.forEach((handler) => {
      const eventName = handler.eventName;

      try {
        // Pass socket instance to handler if needed
        socket.ev.on(eventName, (payload: any) => {
          try {
            Promise.resolve(handler.handle(payload, socket)).catch((err) =>
              this.logger.error(
                `Error in handler ${handler.constructor.name} for event ${eventName}:`,
                err,
              ),
            );
          } catch (error) {
            this.logger.error(
              `Synchronous error in handler ${handler.constructor.name} for event ${eventName}:`,
              error,
            );
          }
        });
        this.logger.log(
          `Registered handler ${handler.constructor.name} for event [${eventName}]`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to register handler ${handler.constructor.name} for event [${eventName}]`,
          error,
        );
      }
    });
  }

  // Optional: Method to unregister if needed during reconnects
  private unregisterHandlers() {
    const socket = this.connectionService.getSocket();
    if (!socket) return;

    this.logger.log('Unregistering WhatsApp event handlers...');
    this.handlers.forEach((handler) => {
      try {
        // Using `off` or `removeListener` - check Baileys documentation
        // socket.ev.off(handler.eventName, handler.handle); // This might not work directly if the function ref is different
        // It's often safer to use removeAllListeners for specific events if cleaning up fully
        socket.ev.removeAllListeners(handler.eventName);
        this.logger.log(
          `Unregistered handlers for event [${handler.eventName}]`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to unregister handler for event [${handler.eventName}]`,
          error,
        );
      }
    });
  }
}
