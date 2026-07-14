import { Request } from 'express';

export type AccessTokenPayload = {
  sub: string;
  sid: string;
  email: string;
  role: string;
};

export type AuthenticatedRequest = Request & {
  auth?: AccessTokenPayload;
};
