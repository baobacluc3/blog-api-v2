import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EnableTwoFactorDto } from './dto/enable-two-factor.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutAllDto } from './dto/logout-all.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationEmailDto } from './dto/resend-verification-email.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    description:
      'Registers a user, creates a session, issues rotated refresh-token family, and creates a single-use email verification token.',
  })
  @ApiCreatedResponse({
    description: 'User registered successfully. Passwords and token hashes are never returned.',
    type: AuthResponseDto,
  })
  register(@Body() registerDto: RegisterDto, @Req() request: Request) {
    return this.authService.register(registerDto, this.getMetadata(request));
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Logs in with generic failures, creates a user-specific session, and returns rotated refresh tokens. May return requiresTwoFactor.',
  })
  @ApiOkResponse({
    description: 'Access and refresh tokens returned successfully.',
    type: AuthResponseDto,
  })
  login(@Body() loginDto: LoginDto, @Req() request: Request) {
    return this.authService.login(loginDto, this.getMetadata(request));
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Rotates refresh tokens. Reused or mismatched refresh tokens revoke the user refresh-token family and create security events.',
  })
  @ApiOkResponse({
    description: 'Refresh token rotated and new tokens returned.',
    type: AuthResponseDto,
  })
  refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(refreshTokenDto.refreshToken, this.getMetadata(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Refresh token and its session are revoked successfully.' })
  logout(@Body() refreshTokenDto: RefreshTokenDto, @Req() request: Request) {
    return this.authService.logout(refreshTokenDto.refreshToken, this.getMetadata(request));
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ description: 'Verifies a single-use email verification token.' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification-email')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: 'Resends verification email without revealing whether an account exists.',
  })
  resendVerificationEmail(@Body() dto: ResendVerificationEmailDto) {
    return this.authService.resendVerificationEmail(dto);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: 'Creates a single-use password reset token and always returns a generic response.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    return this.authService.forgotPassword(dto, this.getMetadata(request));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Resets password with a single-use token, revokes all sessions, and records a security event.',
  })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    return this.authService.resetPassword(dto, this.getMetadata(request));
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: 'Changes the authenticated user password and revokes active sessions.',
  })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ) {
    return this.authService.changePassword(user, dto, this.getMetadata(request));
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ description: 'Lists only the authenticated user active sessions/devices.' })
  listSessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Session id to revoke.' })
  @ApiOperation({
    description: 'Revokes one of the authenticated user sessions and its refresh tokens.',
  })
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() request: Request) {
    return this.authService.revokeSession(user, id, this.getMetadata(request));
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: 'Revokes all active refresh tokens and sessions for the current user.',
  })
  logoutAll(@CurrentUser() user: AuthUser, @Body() _dto: LogoutAllDto, @Req() request: Request) {
    return this.authService.logoutAll(user, this.getMetadata(request));
  }

  @Get('security-events')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ description: 'Lists recent security events for the authenticated user.' })
  listSecurityEvents(@CurrentUser() user: AuthUser) {
    return this.authService.listSecurityEvents(user);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    description:
      'Creates an encrypted TOTP secret and returns an otpauth URL. Raw secret is returned only outside production.',
  })
  setupTwoFactor(@CurrentUser() user: AuthUser) {
    return this.authService.setupTwoFactor(user);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: 'Enables TOTP two-factor authentication after verifying a current code.',
  })
  enableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body() dto: EnableTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.authService.enableTwoFactor(user, dto, this.getMetadata(request));
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: 'Disables TOTP two-factor authentication after password and TOTP confirmation.',
  })
  disableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.authService.disableTwoFactor(user, dto, this.getMetadata(request));
  }

  @Post('2fa/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ description: 'Completes a partial 2FA login and issues access/refresh tokens.' })
  verifyTwoFactor(@Body() dto: VerifyTwoFactorDto, @Req() request: Request) {
    return this.authService.verifyTwoFactor(dto, this.getMetadata(request));
  }

  private getMetadata(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? null,
    };
  }
}
