import { DBRepository } from './db.repository.js';
import { UserModel, type IUser } from '../models/user.model.js';

export class UserRepository extends DBRepository<IUser> {
  constructor() {
    super(UserModel);
  }

  findByEmailWithPassword(email: string) {
    return this.findOne({ filter: { email }, projection: '+password' });
  }
}
