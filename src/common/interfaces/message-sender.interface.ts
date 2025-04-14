// ./src/common/interfaces/message-sender.interface.ts
export const IMessageSender = Symbol('IMessageSender');

export interface IMessageSender {
  /**
   * Sends a message.
   * @param to Recipient ID (e.g., '1234567890@s.whatsapp.net')
   * @param text Message content
   * @param correlationId Optional ID for tracing logs
   * @returns Promise resolving to true if sending was initiated successfully, false otherwise.
   */
  sendMessage(
    to: string,
    text: string,
    correlationId?: string,
  ): Promise<boolean>;
  isConnected(): boolean;
}
