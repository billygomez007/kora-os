import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class WalkInCustomerDto {
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

/** Staff-assisted booking command (docs task Phase 20). Exactly one of
 * `customerProfileId` (an existing Kora customer) or `newCustomer` (a
 * customer with no Kora account — a walk-in-style entry) must be
 * supplied — validated in AppointmentBookingService. */
export class CreateStaffAppointmentDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  serviceIds!: string[];

  @IsUUID()
  staffProfileId!: string;

  @IsISO8601()
  startAt!: string;

  @IsOptional()
  @IsUUID()
  customerProfileId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WalkInCustomerDto)
  newCustomer?: WalkInCustomerDto;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
