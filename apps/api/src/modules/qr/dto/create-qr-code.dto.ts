import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { QrCodeType } from '../../../generated/prisma/client.js';

export class CreateQrCodeDto {
  @IsEnum(QrCodeType)
  type!: QrCodeType;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsString()
  @MaxLength(160)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  resourceKey?: string;
}
