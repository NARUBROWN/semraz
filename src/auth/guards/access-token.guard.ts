import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { AuthenticatedRequest } from '../auth.types';

/**
 * Requires a valid access token for LLM-consuming endpoints.
 *
 * Accepts the token from the `Authorization: Bearer` header (normal fetch calls)
 * or from a `token` query parameter (EventSource/SSE, which cannot set headers).
 * Blocked accounts are rejected before any work is done.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Login is required.');
    }

    try {
      request.auth = this.authService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    await this.authService.assertActiveUser(request.auth.sub);
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length);
    }

    const queryToken = request.query?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }

    return null;
  }
}
