import { IsBooleanString, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListCustomersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsBooleanString()
  includeArchived?: string;
}
