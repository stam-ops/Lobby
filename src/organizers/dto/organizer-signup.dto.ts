import { ApiProperty } from '@nestjs/swagger';

export class OrganizerSignupDto {
  @ApiProperty({ description: "Nom de l'association ou du club" })
  organizationName: string;

  @ApiProperty({ description: 'Adresse de contact — sert aussi d\'identifiant de connexion' })
  email: string;

  @ApiProperty({ description: '10 caractères minimum' })
  password: string;

  @ApiProperty({ required: false, description: 'Jeton Turnstile/hCaptcha du formulaire' })
  captchaToken?: string;
}
