import { WASocket } from 'baileys';

// Define known Baileys event names explicitly for better type safety
// Add more event names from Baileys.WASocket['ev'] as needed
export type BaileysEvent =
  | 'connection.update'
  | 'creds.update'
  | 'messages.upsert';

export interface IWhatsAppEventHandler<T = any> {
  /**
   * The specific Baileys event name this handler listens to.
   */
  get eventName(): BaileysEvent;

  /**
   * The logic to execute when the event is triggered.
   * @param payload The data emitted by the Baileys event.
   * @param socket The WASocket instance (optional, passed by registry)
   */
  handle(payload: T, socket?: WASocket): Promise<void> | void;
}

// Injection token for event handlers
export const WHATSAPP_EVENT_HANDLER = Symbol('WHATSAPP_EVENT_HANDLER');
