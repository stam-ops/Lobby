import { ApiProperty } from '@nestjs/swagger';

export class GeneralParametersDto {
  @ApiProperty({ example: 30, description: 'generalparameters.friendswsperiod' })
  friendWsPeriod: number;

  @ApiProperty({ example: 5, description: 'generalparameters.gamewsperiod' })
  gameWsPeriod: number;

  @ApiProperty({ example: false, description: 'true si nb connexions >= maxconnections' })
  maintenance: boolean;

  @ApiProperty({ example: 500 })
  maxPlayer: number;

  @ApiProperty({ example: 50 })
  maxFriends: number;

  @ApiProperty({ example: 20 })
  maxSponsored: number;

  @ApiProperty({ example: 100 })
  maxNotif: number;

  @ApiProperty({ example: 10 })
  maxTrResult: number;
}

export class GeneralParameters2Dto extends GeneralParametersDto {
  @ApiProperty({ example: 30 })
  maxNetworkFriends: number;

  @ApiProperty({ example: 20 })
  maxClubTournaments: number;
}
