// ./src/message/dto/send-message.dto.ts

import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'Phone number must contain only digits' })
  @Length(10, 20, { message: 'Phone number length is invalid' }) // Adjust length as needed
  to: string; // Expecting phone number without '@s.whatsapp.net'

  @IsString()
  @IsNotEmpty()
  text: string;
}
