import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@campok.fr' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'motdepasse' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class AdminLoginResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: { backofficeuserid: 1, email: 'admin@campok.fr', firstname: 'Jean', lastname: 'Dupont', role: 'admin' } })
  user: {
    backofficeuserid: number;
    email: string;
    firstname: string;
    lastname: string;
    role: string;
  };
}
