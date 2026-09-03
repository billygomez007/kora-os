import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateStaffInvitationDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
