import { Injectable, Logger } from '@nestjs/common';
import { ConnectionState } from 'baileys';
import {
  IWhatsAppEventHandler,
  BaileysEvent,
} from '../interfaces/whatsapp-event-handler.interface';
import * as qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { DisconnectReason } from 'baileys';

@Injectable()
export class ConnectionUpdateHandler
  implements IWhatsAppEventHandler<Partial<ConnectionState>>
{
  private readonly logger = new Logger(ConnectionUpdateHandler.name);

  constructor() {
    this.logger.log('ConnectionUpdateHandler initialized.');
  } // Inject other services if needed (e.g., notification service)

  get eventName(): BaileysEvent {
    return 'connection.update';
  }

  handle(payload: Partial<ConnectionState>) {
    const { connection, lastDisconnect, qr } = payload;
    this.logger.debug(
      `Connection update: ${connection}, QR: ${!!qr}, Disconnect: ${lastDisconnect?.error}`,
    );

    if (qr) {
      this.logger.log('QR code received by handler. Scan please!');
      qrcode.generate(qr, { small: true });
      // You could potentially send this QR code elsewhere (e.g., WebSocket to frontend)
    }

    if (connection === 'open') {
      this.logger.log(
        'WhatsApp connection opened (handled by ConnectionUpdateHandler).',
      );
      // Notify other parts of the system if needed
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || `Unknown (${statusCode})`;
      this.logger.warn(
        `WhatsApp connection closed (handled by ConnectionUpdateHandler). Reason: ${reason}`,
      );
      // Trigger alerts or specific actions based on the disconnect reason
      if (statusCode === (DisconnectReason.loggedOut as number)) {
        this.logger.error(
          'Device logged out. Manual intervention required (delete session, restart).',
        );
        // Maybe trigger a critical alert
      }
    }
  }
}
