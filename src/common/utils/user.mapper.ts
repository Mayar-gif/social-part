import type { HydratedDocument } from 'mongoose';
import type { IUser } from '../../DB/models/user.model.js';

export const pictureUrl = (u: { _id: unknown; profilePicture?: string }) => {
  if (!u.profilePicture) return undefined;
  return u.profilePicture.startsWith('http') ? u.profilePicture : `/users/${String(u._id)}/profile-picture`;
};

export const toPublicUser = (u: HydratedDocument<IUser>) => ({
  id: u._id,
  firstName: u.firstName,
  lastName: u.lastName,
  profilePicture: pictureUrl(u),
  bio: u.bio,
  isPrivate: u.isPrivate,
  followersCount: u.followers.length,
  followingCount: u.following.length,
});

export const toOwnUser = (u: HydratedDocument<IUser>) => ({
  ...toPublicUser(u),
  email: u.email,
  phone: u.phone,
  gender: u.gender,
  role: u.role,
  provider: u.provider,
  createdAt: u.createdAt,
});
