import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendEmailVerification(email: string, token: string): Promise<void> {
    const url = `${this.getAppUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;
    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      this.logger.debug(`Development email verification link for ${email}: ${url}`);
    }
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const url = `${this.getAppUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      this.logger.debug(`Development password reset link for ${email}: ${url}`);
    }
  }

  private getAppUrl(): string {
    return this.configService.get<string>('APP_URL', 'http://localhost:3000');
  }
}
