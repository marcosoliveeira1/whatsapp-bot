export const IMessagePublisher = Symbol('IMessagePublisher'); // Injection Token

export interface IMessagePublisher {
  publish(queue: string, message: any): Promise<void>;
}
