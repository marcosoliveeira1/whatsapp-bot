import { Injectable, Logger } from '@nestjs/common';
import { WhatsappConnectionService } from './whatsapp-connection.service';
import { IMessageSender } from '../common/interfaces/message-sender.interface';
// Import types from baileys
import {
  WASocket,
  proto, // Example import, adjust based on actual usage elsewhere
} from 'baileys'; // Adjust package name if necessary

@Injectable()
export class WhatsappSenderService implements IMessageSender {
  private readonly logger = new Logger(WhatsappSenderService.name);

  constructor(private readonly connectionService: WhatsappConnectionService) {}

  isConnected(): boolean {
    return this.connectionService.isConnected();
  }

  async sendMessage(to: string, text: string): Promise<boolean> {
    const sock: WASocket | null = this.connectionService.getSocket(); // Type sock
    if (!sock || !this.isConnected()) {
      this.logger.error('WhatsApp not connected. Cannot send message.');
      return false;
    }

    try {
      this.logger.log(`Attempting to send message via SenderService to ${to}`);
      // Type the result if needed, though it's not used directly here
      const result: proto.WebMessageInfo | undefined = await sock.sendMessage(
        to,
        { text },
      );
      this.logger.log(`Message sent successfully via SenderService to ${to}`);
      this.logger.log(
        `Message result: ${JSON.stringify(result)}`, // Careful logging full result, might be large
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send message via SenderService to ${to}`,
        error,
      );
      return false;
    }
  }

  getFormattedJid(to: string): string {
    if (to.includes('@')) {
      return to;
    }
    this.logger.debug(`to: ${to}, length: ${to.length}`);
    // Consider using a more robust phone number validation/formatting library
    if (to.length < 14) {
      // Assuming E.164 format without '+' or country code less than 3 digits might be needed
      return `${to}@s.whatsapp.net`;
    }
    // Assuming longer numbers are group IDs
    return `${to}@g.us`;
  }
}
