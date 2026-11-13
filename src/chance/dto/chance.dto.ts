import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { VIP_PLAN_KEYS, type VipPlan } from '../vip-web.service';
import { ANALYSE_PLAN_KEYS, type AnalysePlan } from '../analyse-web.service';
import { CAMPOK_HANDS_MAX } from '../campok-hands';

/** Lien reçu par e-mail : 32 octets aléatoires en base64url. */
const TOKEN_RE = /^[\w-]{43}$/;

/** Campok VIP acheté sur le Chance-o-mètre : pass 1, 3 ou 6 mois, ou abonnement mensuel. */
export class ChanceVipCheckoutDto {
  @ApiProperty({ enum: VIP_PLAN_KEYS })
  @IsIn(VIP_PLAN_KEYS)
  plan: VipPlan;
}

/** Offre Analyse du Chance-o-mètre : abonnement mensuel ou pack de 12 mois. */
export class ChanceAnalyseCheckoutDto {
  @ApiProperty({ enum: ANALYSE_PLAN_KEYS })
  @IsIn(ANALYSE_PLAN_KEYS)
  plan: AnalysePlan;
}

export class ChanceLoginRequestDto {
  @ApiProperty({ example: 'joueur@exemple.fr' })
  @IsEmail()
  @MaxLength(190)
  email: string;

  @ApiProperty({ description: 'Adresse IP du visiteur, vue par le serveur du Chance-o-mètre (limites)' })
  @IsString()
  @MaxLength(45)
  ip: string;

  @ApiProperty({ required: false, description: 'Jeton Turnstile du formulaire' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;

  @ApiProperty({ required: false, description: 'Création de compte (sinon : connexion)' })
  @IsOptional()
  @IsBoolean()
  signup?: boolean;

  @ApiProperty({ required: false, description: '« J’ai 18 ans ou plus », obligatoire à la création' })
  @IsOptional()
  @IsBoolean()
  adult?: boolean;

  @ApiProperty({ required: false, description: 'Case « nouvelles », facultative' })
  @IsOptional()
  @IsBoolean()
  newsletter?: boolean;
}

export class ChanceLoginConfirmDto {
  @ApiProperty({ required: false, description: 'Jeton du lien reçu par e-mail' })
  @IsOptional()
  @Matches(TOKEN_RE)
  token?: string;

  @ApiProperty({ required: false, description: 'Adresse, avec le code (autre appareil)' })
  @IsOptional()
  @IsEmail()
  @MaxLength(190)
  email?: string;

  @ApiProperty({ required: false, description: 'Code à 6 chiffres reçu par e-mail' })
  @IsOptional()
  @Matches(/^\d{6}$/)
  code?: string;
}

export class ChanceUpdateDto {
  @ApiProperty({ description: 'Inscription à la liste de nouvelles' })
  @IsBoolean()
  newsletter: boolean;
}

export class ChanceIpDto {
  @ApiProperty({ description: 'Adresse IP du visiteur' })
  @IsString()
  @MaxLength(45)
  ip: string;
}

export class ChanceTokenDto {
  @ApiProperty({ description: 'Jeton du lien reçu par e-mail' })
  @Matches(TOKEN_RE)
  token: string;
}

export class ChanceCampokRequestDto {
  @ApiProperty({ example: 'Joueur42', description: 'Pseudo du compte Campok à relier' })
  @IsString()
  @MaxLength(50)
  pseudo: string;

  @ApiProperty({ description: 'Adresse IP du visiteur' })
  @IsString()
  @MaxLength(45)
  ip: string;
}

export class ChanceCampokConfirmDto {
  @ApiProperty({ example: '123456', description: 'Code à 6 chiffres affiché dans les notifications de l’app Campok' })
  @Matches(/^\d{6}$/)
  code: string;
}

export class ChanceCampokHandsDto {
  @ApiProperty({ required: false, description: 'Dernière main déjà reçue (tablehandid) ; absent : les plus récentes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  after?: number;

  @ApiProperty({ required: false, description: `Nombre de mains (${CAMPOK_HANDS_MAX} au plus)` })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(CAMPOK_HANDS_MAX)
  limit?: number;
}
