import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FrontService } from './front.service';
import { FrontAddressDto } from './dto/front-address.dto';
import { LobbyConnectionDto } from './dto/lobby-connection.dto';
import { GeneralParametersDto, GeneralParameters2Dto } from './dto/general-parameters.dto';

@ApiTags('Front')
@Controller('front')
export class FrontController {
  constructor(private readonly front: FrontService) {}

  @ApiOperation({ summary: 'Vérifie si au moins un serveur front est disponible' })
  @ApiResponse({ status: 200, schema: { example: { available: true } } })
  @Get('available')
  isFrontAvailable() {
    return this.front.isFrontAvailable();
  }

  @ApiOperation({ summary: 'Adresses des serveurs front disponibles (Front.java → getFrontConnectionAdresses)' })
  @ApiResponse({ status: 200, type: [FrontAddressDto] })
  @Get('addresses')
  getFrontConnectionAddresses() {
    return this.front.getFrontConnectionAddresses();
  }

  @ApiOperation({ summary: 'Load balancer : fqdn d\'un front à utiliser pour la WebSocket client (pondéré par weight, fronts endts=0 non pleins)' })
  @ApiResponse({ status: 200, schema: { example: { fqdn: 'host:8080' } } })
  @Get('connect')
  getConnectFqdn() {
    return this.front.getConnectFqdn();
  }

  @ApiOperation({ summary: 'Connexions lobby disponibles (Front.java → getLobbyConnection)' })
  @ApiResponse({ status: 200, type: [LobbyConnectionDto] })
  @Get('lobby')
  getLobby() {
    return this.front.getLobby();
  }

  @ApiOperation({ summary: 'Paramètres généraux (Front.java → getGeneralParameters)' })
  @ApiResponse({ status: 200, type: GeneralParametersDto })
  @Get('parameters')
  getGeneralParameters() {
    return this.front.getGeneralParameters();
  }

  @ApiOperation({ summary: 'Paramètres généraux étendus (Front.java → getGeneralParameters2)' })
  @ApiResponse({ status: 200, type: GeneralParameters2Dto })
  @Get('parameters2')
  getGeneralParameters2() {
    return this.front.getGeneralParameters2();
  }
}
