import type { NextFunction, Request, Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError } from '../../common/utils/globalErrorHandling.js';
import { UserRepository } from '../../DB/repositories/user.repository.js';
import type { IUser } from '../../DB/models/user.model.js';
import { ProviderEnum } from '../../common/enums/user.enums.js';
import { compareHash, hash } from '../../common/utils/security/hash.js';
import { generateTokens, revokeAccessToken, revokeAllRefreshTokens } from '../../common/utils/security/token.js';
import { pictureUrl, toOwnUser, toPublicUser } from '../../common/utils/user.mapper.js';
import { s3Service } from '../../common/services/s3.service.js';
import {
  searchQuerySchema,
  type ChangePasswordDTO,
  type DeleteAccountDTO,
  type PrivacyDTO,
  type UpdateProfileDTO,
} from './user.validation.js';

type UserDoc = HydratedDocument<IUser>;

const LIST_FIELDS = 'firstName lastName profilePicture bio isPrivate';
const POPULATE_USER = { select: 'firstName lastName profilePicture' };
const MAX_COVER_IMAGES = 5;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const includesId = (list: UserDoc['followers'], id: unknown) => list.some((x) => x.equals(id as string));
const isStoredKey = (value?: string): value is string => !!value && !value.startsWith('http');

class UserService {
  private readonly _userRepo = new UserRepository();

  constructor() {}

  private findActiveUser = async (id: string): Promise<UserDoc> => {
    const user = await this._userRepo.findById({ id });
    if (!user || !user.confirmedAt) throw new AppError('User not found', 404);
    return user;
  };

  // ---------- Profile retrieval & updates ----------
  getMyProfile = async (req: Request, res: Response, _next: NextFunction) => {
    return res.status(200).json({ success: true, data: toOwnUser(req.user!) });
  };

  getUserProfile = async (req: Request, res: Response, _next: NextFunction) => {
    const me = req.user!;
    const target = await this.findActiveUser(req.params.id as string);

    const isSelf = target._id.equals(me._id);
    const isFollowing = includesId(target.followers, me._id);
    const requested = includesId(target.followRequests, me._id);

    // private profile: only name/picture/counters for non-followers
    const restricted = target.isPrivate && !isSelf && !isFollowing;
    const base = toPublicUser(target);
    const data = restricted
      ? { id: base.id, firstName: base.firstName, lastName: base.lastName, profilePicture: base.profilePicture, isPrivate: true, followersCount: base.followersCount }
      : base;

    return res.status(200).json({ success: true, data: { ...data, isSelf, isFollowing, requested, restricted } });
  };

  updateProfile = async (req: Request, res: Response, _next: NextFunction) => {
    const user = req.user!;
    Object.assign(user, req.body as UpdateProfileDTO);
    await user.save();
    return res.status(200).json({ success: true, data: toOwnUser(user) });
  };

  // ---------- Account settings & privacy control ----------
  updatePrivacy = async (req: Request, res: Response, _next: NextFunction) => {
    const me = req.user!;
    const { isPrivate } = req.body as PrivacyDTO;
    if (!isPrivate && me.followRequests.length) {
      const requesters = me.followRequests;
      await this._userRepo.updateMany({ filter: { _id: { $in: requesters } }, update: { $addToSet: { following: me._id } } });
      me.followers.push(...requesters.filter((r) => !includesId(me.followers, r)));
      me.followRequests.splice(0, me.followRequests.length);
    }

    me.isPrivate = isPrivate;
    await me.save();

    return res.status(200).json({ success: true, message: `Account is now ${isPrivate ? 'private' : 'public'}`, data: toOwnUser(me) });
  };

  changePassword = async (req: Request, res: Response, _next: NextFunction) => {
    const { oldPassword, password } = req.body as ChangePasswordDTO;

    const user = await this._userRepo.findByEmailWithPassword(req.user!.email);
    if (!user || user.provider !== ProviderEnum.system || !user.password) {
      throw new AppError('This account has no password (Google account)', 400);
    }
    if (!(await compareHash(oldPassword, user.password))) throw new AppError('Old password is incorrect', 400);

    user.password = await hash(password);
    user.credentialsChangedAt = new Date(); // logs out every other device
    await user.save();
    await revokeAllRefreshTokens(String(user._id));

    // keep the current device logged in with fresh tokens
    const tokens = await generateTokens(user._id, user.role);
    return res.status(200).json({ success: true, message: 'Password changed', data: tokens });
  };

  // ---------- Follow / Unfollow ----------
  follow = async (req: Request, res: Response, _next: NextFunction) => {
    const me = req.user!;
    const targetId = req.params.id as string;

    if (me._id.equals(targetId)) throw new AppError('You cannot follow yourself', 400);
    const target = await this.findActiveUser(targetId);

    if (includesId(target.followers, me._id)) throw new AppError('Already following this user', 409);

    if (target.isPrivate) {
      if (includesId(target.followRequests, me._id)) throw new AppError('Follow request already sent', 409);
      await this._userRepo.updateOne({ filter: { _id: target._id }, update: { $addToSet: { followRequests: me._id } } });
      return res.status(202).json({ success: true, message: 'Follow request sent' });
    }

    await Promise.all([
      this._userRepo.updateOne({ filter: { _id: target._id }, update: { $addToSet: { followers: me._id } } }),
      this._userRepo.updateOne({ filter: { _id: me._id }, update: { $addToSet: { following: target._id } } }),
    ]);
    return res.status(200).json({ success: true, message: 'Followed successfully' });
  };

  unfollow = async (req: Request, res: Response, _next: NextFunction) => {
    const me = req.user!;
    const targetId = req.params.id as string;
    if (me._id.equals(targetId)) throw new AppError('Invalid operation', 400);

    const target = await this.findActiveUser(targetId);

    await Promise.all([
      this._userRepo.updateOne({
        filter: { _id: target._id },
        update: { $pull: { followers: me._id, followRequests: me._id } },
      }),
      this._userRepo.updateOne({ filter: { _id: me._id }, update: { $pull: { following: target._id } } }),
    ]);
    return res.status(200).json({ success: true, message: 'Unfollowed successfully' });
  };

  getFollowRequests = async (req: Request, res: Response, _next: NextFunction) => {
    const me = await this._userRepo.findById({
      id: String(req.user!._id),
      options: { populate: { path: 'followRequests', ...POPULATE_USER } },
    });
    return res.status(200).json({ success: true, data: me?.followRequests ?? [] });
  };

  acceptFollowRequest = async (req: Request, res: Response, _next: NextFunction) => {
    const me = req.user!;
    const requesterId = req.params.id as string;
    if (!includesId(me.followRequests, requesterId)) throw new AppError('No follow request from this user', 404);

    await Promise.all([
      this._userRepo.updateOne({
        filter: { _id: me._id },
        update: { $pull: { followRequests: requesterId }, $addToSet: { followers: requesterId } },
      }),
      this._userRepo.updateOne({ filter: { _id: requesterId }, update: { $addToSet: { following: me._id } } }),
    ]);
    return res.status(200).json({ success: true, message: 'Follow request accepted' });
  };

  rejectFollowRequest = async (req: Request, res: Response, _next: NextFunction) => {
    const me = req.user!;
    await this._userRepo.updateOne({ filter: { _id: me._id }, update: { $pull: { followRequests: req.params.id } } });
    return res.status(200).json({ success: true, message: 'Follow request rejected' });
  };

  private getList = (field: 'followers' | 'following') => async (req: Request, res: Response, _next: NextFunction) => {
    const me = req.user!;
    const target = await this.findActiveUser(req.params.id as string);

    const allowed = !target.isPrivate || target._id.equals(me._id) || includesId(target.followers, me._id);
    if (!allowed) throw new AppError('This account is private', 403);

    const populated = await this._userRepo.findById({
      id: String(target._id),
      options: { populate: { path: field, ...POPULATE_USER } },
    });
    return res.status(200).json({ success: true, data: populated?.[field] ?? [] });
  };

  getFollowers = this.getList('followers');
  getFollowing = this.getList('following');

  // ---------- Search & suggestions ----------
  searchUsers = async (req: Request, res: Response, _next: NextFunction) => {
    const { q, page, limit } = searchQuerySchema.parse(req.query);

    const terms = q.split(/\s+/).map((t) => new RegExp(escapeRegex(t), 'i'));
    const filter = {
      _id: { $ne: req.user!._id },
      confirmedAt: { $exists: true },
      $and: terms.map((r) => ({ $or: [{ firstName: r }, { lastName: r }] })),
    };

    const [users, total] = await Promise.all([
      this._userRepo.find({ filter, projection: LIST_FIELDS, options: { skip: (page - 1) * limit, limit, sort: { firstName: 1 } } }),
      this._userRepo.countDocuments(filter),
    ]);

    return res.status(200).json({ success: true, data: { page, limit, total, users } });
  };

  getSuggestions = async (req: Request, res: Response, _next: NextFunction) => {
    const me = req.user!;
    const LIMIT = 10;
    const excluded = [me._id, ...me.following];

    const mutual = await this._userRepo.find({
      filter: { _id: { $nin: excluded }, confirmedAt: { $exists: true }, followers: { $in: me.following } },
      projection: LIST_FIELDS,
      options: { limit: LIMIT },
    });

    let suggestions = mutual;
    if (mutual.length < LIMIT) {
      const filler = await this._userRepo.find({
        filter: { _id: { $nin: [...excluded, ...mutual.map((u) => u._id)] }, confirmedAt: { $exists: true } },
        projection: LIST_FIELDS,
        options: { limit: LIMIT - mutual.length, sort: { createdAt: -1 } },
      });
      suggestions = [...mutual, ...filler];
    }

    return res.status(200).json({ success: true, data: suggestions });
  };

  uploadProfilePicture = async (req: Request, res: Response, _next: NextFunction) => {
    const file = req.file;
    if (!file) throw new AppError('Image is required (field name: image)', 400);

    const user = req.user!;
    const previous = user.profilePicture;

    user.profilePicture = await s3Service.upload(file, `users/${user._id}/profile`);
    await user.save();

    if (isStoredKey(previous)) await s3Service.delete(previous).catch(() => undefined);

    return res.status(200).json({ success: true, data: { profilePicture: pictureUrl(user) } });
  };

  getProfilePicture = async (req: Request, res: Response, _next: NextFunction) => {
    const target = await this.findActiveUser(req.params.id as string);
    const key = target.profilePicture;
    if (!key) throw new AppError('No profile picture', 404);

    if (!isStoredKey(key)) return res.redirect(key);

    const object = await s3Service.getObject(key);

    res.setHeader('Content-Type', object.ContentType ?? 'application/octet-stream');
    if (object.ContentLength) res.setHeader('Content-Length', String(object.ContentLength));
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (req.query.download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${target._id}${path.extname(key)}"`);
    }

    await pipeline(object.Body as Readable, res);
  };

  uploadCoverImages = async (req: Request, res: Response, _next: NextFunction) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw new AppError('At least one image is required (field name: images)', 400);

    const user = req.user!;
    if (user.coverImages.length + files.length > MAX_COVER_IMAGES) {
      await s3Service.discard(files);
      throw new AppError(`You can have at most ${MAX_COVER_IMAGES} cover images`, 400);
    }

    const keys = await s3Service.uploadMany(files, `users/${user._id}/covers`);
    user.coverImages.push(...keys);
    await user.save();

    const urls = await Promise.all(keys.map((key) => s3Service.presignedUrl(key)));
    return res.status(201).json({ success: true, data: urls });
  };

  getCoverImages = async (req: Request, res: Response, _next: NextFunction) => {
    const download = req.query.download === 'true';

    const urls = await Promise.all(
      req.user!.coverImages.map((key) => s3Service.presignedUrl(key, 300, download ? path.basename(key) : undefined)),
    );
    return res.status(200).json({ success: true, data: urls });
  };

  deleteAccount = async (req: Request, res: Response, _next: NextFunction) => {
    const { password } = req.body as DeleteAccountDTO;

    const user = await this._userRepo.findByEmailWithPassword(req.user!.email);
    if (!user) throw new AppError('User not found', 404);

    if (user.provider === ProviderEnum.system) {
      if (!password || !user.password || !(await compareHash(password, user.password))) {
        throw new AppError('Password is incorrect', 400);
      }
    }

    user.deletedAt = new Date();
    await user.save();

    await Promise.all([revokeAccessToken(req.tokenPayload!), revokeAllRefreshTokens(String(user._id))]);

    return res.status(200).json({ success: true, message: 'Account deleted' });
  };

  restoreUser = async (req: Request, res: Response, _next: NextFunction) => {
    const user = await this._userRepo.findOne({ filter: { _id: req.params.id }, options: { paranoid: false } });
    if (!user) throw new AppError('User not found', 404);
    if (!user.deletedAt) throw new AppError('Account is not deleted', 400);

    await this._userRepo.updateOne({
      filter: { _id: user._id },
      update: { $unset: { deletedAt: 1 } },
      options: { paranoid: false },
    });

    return res.status(200).json({ success: true, message: 'Account restored' });
  };
}

export default new UserService();
