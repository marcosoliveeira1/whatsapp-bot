import { Module, Global } from '@nestjs/common';
import { AmqpConnectionService } from './amqp-connection.service';
import { AmqpProducerService } from './amqp-producer.service';
import { WhatsappSendCommandConsumer } from './consumers/whatsapp-send-command.consumer';
import { IMessagePublisher } from '../common/interfaces/message-publisher.interface';
import { WhatsappModule } from '../whatsapp/whatsapp.module'; // Needed for IMessageSender provider

@Global() // Connection service might be needed globally
@Module({
  imports: [
    WhatsappModule, // Import WhatsappModule to make IMessageSender available for injection here
  ],
  providers: [
    AmqpConnectionService,
    // Provide AmqpProducerService FOR the IMessagePublisher token
    {
      provide: IMessagePublisher,
      useClass: AmqpProducerService,
    },
    // The consumer needs to be registered as a provider to run its lifecycle hooks
    WhatsappSendCommandConsumer,
  ],
  exports: [
    AmqpConnectionService, // Export connection if needed elsewhere directly
    IMessagePublisher, // Export the interface token
  ],
})
export class AmqpModule {}
