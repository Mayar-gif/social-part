import { Schema, model, models, type Model, type Types } from 'mongoose';
import { GenderEnum, ProviderEnum, RoleEnum } from '../../common/enums/user.enums.js';

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  gender?: GenderEnum;
  phone?: string;
  bio?: string;
  profilePicture?: string;
  coverImages: string[];
  role: RoleEnum;
  provider: ProviderEnum;
  confirmedAt?: Date;
  credentialsChangedAt?: Date;
  deletedAt?: Date;
  isPrivate: boolean;
  followers: Types.ObjectId[];
  following: Types.ObjectId[];
  followRequests: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}

const phoneRegex = /^01[0125]\d{8}$/;

const userSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true, trim: true, minlength: 2, maxlength: 25 },
    lastName: { type: String, required: true, trim: true, minlength: 2, maxlength: 25 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: {
      type: String,
      select: false,
      required: function (this: IUser) {
        return this.provider === ProviderEnum.system;
      },
    },
    gender: { type: String, enum: Object.values(GenderEnum) },
    phone: {
      type: String,
      validate: { validator: (value: string) => phoneRegex.test(value), message: 'Invalid Egyptian phone number' },
    },
    bio: { type: String, maxlength: 200 },
    profilePicture: { type: String },
    coverImages: { type: [String], default: [] },
    role: { type: String, enum: Object.values(RoleEnum), default: RoleEnum.user },
    provider: { type: String, enum: Object.values(ProviderEnum), default: ProviderEnum.system },
    confirmedAt: { type: Date },
    credentialsChangedAt: { type: Date },
    deletedAt: { type: Date },
    isPrivate: { type: Boolean, default: false },
    followers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    followRequests: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

userSchema.index({ firstName: 1, lastName: 1 });

userSchema.pre('save', function () {
  if (!this.isNew && this.isModified('password')) this.credentialsChangedAt = new Date();
});

userSchema.pre(['find', 'findOne', 'findOneAndUpdate', 'updateOne', 'updateMany', 'countDocuments'], function () {
  const { paranoid = true } = this.getOptions() as { paranoid?: boolean };
  if (paranoid) this.setQuery({ ...this.getQuery(), deletedAt: { $exists: false } });
});

export const UserModel = (models.User as Model<IUser>) || model<IUser>('User', userSchema);
