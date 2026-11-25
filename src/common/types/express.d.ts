import type { HydratedDocument } from 'mongoose';
import type { JwtPayload } from 'jsonwebtoken';
import type { IUser } from '../../DB/models/user.model.js';

declare global {
  namespace Express {
    interface Request {
      user?: HydratedDocument<IUser>;
      tokenPayload?: JwtPayload;
    }
  }
}

export {};
