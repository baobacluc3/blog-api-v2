import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isObservable, lastValueFrom } from 'rxjs';
import { AuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const result = super.canActivate(context);
      if (isObservable(result)) {
        await lastValueFrom(result);
      } else {
        await result;
      }
    } catch {
      // Missing or invalid JWT should not block public routes.
    }

    return true;
  }

  handleRequest<TUser = AuthUser>(err: unknown, user: TUser): TUser | null {
    if (err || !user) {
      return null;
    }
    return user;
  }
}
