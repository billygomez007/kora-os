import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeactivateCommissionRuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}
