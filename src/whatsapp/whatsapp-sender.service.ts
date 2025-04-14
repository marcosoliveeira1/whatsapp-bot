import { Injectable, Logger } from '@nestjs/common';
import { WhatsappConnectionService } from './whatsapp-connection.service';
import { IMessageSender } from '../common/interfaces/message-sender.interface';

@Injectable()
export class WhatsappSenderService implements IMessageSender {
  private readonly logger = new Logger(WhatsappSenderService.name);

  // Inject connection service to get the socket
  constructor(private readonly connectionService: WhatsappConnectionService) {}

  isConnected(): boolean {
    return this.connectionService.isConnected();
  }

  async sendMessage(to: string, text: string): Promise<boolean> {
    const sock = this.connectionService.getSocket();
    if (!sock || !this.isConnected()) {
      this.logger.error('WhatsApp not connected. Cannot send message.');
      return false;
    }

    try {
      this.logger.log(`Attempting to send message via SenderService to ${to}`);
      await sock.sendMessage(to, { text: text });
      this.logger.log(`Message sent successfully via SenderService to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send message via SenderService to ${to}`,
        error,
      );
      // Check for specific errors (e.g., recipient not found) if needed
      return false;
    }
  }
}
