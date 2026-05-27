import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';

const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '30d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email,
      fullName: dto.fullName.trim(),
      passwordHash,
      role: UserRole.USER,
    });

    const tokens = await this.issueTokens(user);

    await this.auditService.log({
      action: 'user_registered',
      entityType: 'user',
      entityId: user.id,
      actor: { sub: user.id, role: user.role },
      metadataJson: {
        email: user.email,
      },
    });

    return {
      ...tokens,
      user: this.usersService.sanitize(user),
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);

    await this.auditService.log({
      action: 'user_logged_in',
      entityType: 'user',
      entityId: user.id,
      actor: { sub: user.id, role: user.role },
      metadataJson: {
        email: user.email,
      },
    });

    return {
      ...tokens,
      user: this.usersService.sanitize(user),
    };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.usersService.sanitize(user);
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matchedToken = await this.findMatchingRefreshToken(payload.sub, refreshToken, payload, false);
    if (!matchedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.revokeRefreshToken(matchedToken.id);
    const tokens = await this.issueTokens(user);

    await this.auditService.log({
      action: 'refresh_token_rotated',
      entityType: 'user',
      entityId: user.id,
      actor: { sub: user.id, role: user.role },
      metadataJson: {
        refreshTokenId: matchedToken.id,
      },
    });

    return tokens;
  }

  async logout(refreshToken: string, userId: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    if (payload.sub !== userId) {
      throw new UnauthorizedException('Refresh token does not belong to current user');
    }

    const matchedToken = await this.findMatchingRefreshToken(userId, refreshToken, payload, true);
    if (!matchedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!matchedToken.revokedAt) {
      await this.revokeRefreshToken(matchedToken.id);

      await this.auditService.log({
        action: 'user_logged_out',
        entityType: 'user',
        entityId: userId,
        actor: { sub: userId, role: payload.role },
        metadataJson: {
          refreshTokenId: matchedToken.id,
        },
      });
    }

    return { success: true };
  }

  private async issueTokens(user: User) {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomUUID(),
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });

    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new UnauthorizedException('Refresh secret is not configured');
    }

    const refreshTokenRecord = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'pending_hash',
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomUUID(),
      rtid: refreshTokenRecord.id,
    };

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      secret: refreshSecret,
    });

    await this.prisma.refreshToken.update({
      where: { id: refreshTokenRecord.id },
      data: {
        tokenHash: await bcrypt.hash(refreshToken, 10),
      },
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new UnauthorizedException('Refresh secret is not configured');
    }

    try {
      return await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async findMatchingRefreshToken(
    userId: string,
    rawToken: string,
    payload: JwtPayload,
    includeRevoked: boolean,
  ) {
    if (payload.rtid) {
      const tokenRecord = await this.prisma.refreshToken.findUnique({
        where: { id: payload.rtid },
      });

      if (!tokenRecord) {
        return null;
      }
      if (tokenRecord.userId !== userId) {
        return null;
      }
      if (tokenRecord.expiresAt <= new Date()) {
        return null;
      }
      if (!includeRevoked && tokenRecord.revokedAt) {
        return null;
      }

      const matches = await bcrypt.compare(rawToken, tokenRecord.tokenHash);
      return matches ? tokenRecord : null;
    }

    const candidates = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        ...(includeRevoked ? {} : { revokedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    for (const tokenRecord of candidates) {
      const matches = await bcrypt.compare(rawToken, tokenRecord.tokenHash);
      if (matches) {
        return tokenRecord;
      }
    }

    return null;
  }

  private async revokeRefreshToken(tokenId: string) {
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
  }
}
