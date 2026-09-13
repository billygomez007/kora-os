import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  /** Browser-cookie transport supplies the credential in HttpOnly Cookie. */
  @IsOptional()
  @IsString()
  refreshToken!: string;
}
