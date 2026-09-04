import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelCorrectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  cancellationReason!: string;
}
