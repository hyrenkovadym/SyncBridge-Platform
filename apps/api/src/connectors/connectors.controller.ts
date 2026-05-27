import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConnectorsService } from './connectors.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorStatusDto } from './dto/update-connector-status.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

@ApiTags('connectors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('connectors')
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  @Post()
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new connector' })
  create(@Body() dto: CreateConnectorDto, @CurrentUser() user: AuthenticatedUser) {
    return this.connectorsService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List connectors (scope depends on role)' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.connectorsService.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get connector by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.connectorsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update connector by id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateConnectorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.connectorsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update connector status' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateConnectorStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.connectorsService.updateStatus(id, dto.status, user);
  }
}
