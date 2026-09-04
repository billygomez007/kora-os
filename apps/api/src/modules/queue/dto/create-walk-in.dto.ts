import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { QueueEntryPriority } from '../../../generated/prisma/client.js';

class NewWalkInCustomerDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phoneE164 must be a valid E.164 phone number' })
  phoneE164?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

/** Walk-in intake command (docs task Phase 2). Exactly one of
 * `customerRecordId` (an existing organization customer) or
 * `newCustomer` (a brand-new one) must be supplied — validated in
 * QueueIntakeService. A newly entered email/phone is never used to
 * search for or link an existing global CustomerProfile — only a plain
 * CustomerRecord is created. */
export class CreateWalkInDto {
  @IsOptional()
  @IsUUID()
  customerRecordId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewWalkInCustomerDto)
  newCustomer?: NewWalkInCustomerDto;

  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  serviceIds!: string[];

  @IsOptional()
  @IsEnum(QueueEntryPriority)
  priority?: QueueEntryPriority;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
