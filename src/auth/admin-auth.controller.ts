import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto, AdminLoginResponseDto } from './dto/admin-login.dto';
import { Auth, Public, Roles } from './auth.decorator';
import { CurrentUser } from './current-user.decorator';
import { AuthUser } from './auth.types';

@ApiTags('Auth (backoffice)')
@Controller('auth/admin')
export class AdminAuthController {
  constructor(private readonly adminAuth: AdminAuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login backoffice — retourne un JWT' })
  @ApiResponse({ status: 200, type: AdminLoginResponseDto })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuth.login(dto.email, dto.password);
  }

  @Auth('admin')
  // Endpoint d'IDENTITÉ : il doit accepter TOUS les rôles backoffice, y compris les externes.
  // Sans ce @Roles explicite, le défaut deny-by-default (admin/support) renvoie 403 à un
  // organisateur — qui se retrouve déconnecté à chaque rafraîchissement, puisque le front
  // réhydrate sa session via cette route.
  @Roles('admin', 'support', 'club')
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Profil du compte authentifié (vérifie la validité du JWT)' })
  me(@CurrentUser() user: AuthUser) {
    return {
      backofficeuserid: user.adminId,
      email: user.email,
      role: user.role,
      // Nécessaire au front pour distinguer un organisateur du personnel interne.
      organizerId: user.organizerId ?? null,
    };
  }
}
