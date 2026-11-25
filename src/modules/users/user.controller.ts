import { Router } from 'express';
import userService from './user.service.js';
import { authentication, authorization } from '../../common/middleware/auth.middleware.js';
import { validation } from '../../common/middleware/validation.middleware.js';
import { uploadFile } from '../../common/middleware/multer.middleware.js';
import { RoleEnum } from '../../common/enums/user.enums.js';
import {
  changePasswordSchema,
  deleteAccountSchema,
  idParamsSchema,
  privacySchema,
  searchQuerySchema,
  updateProfileSchema,
} from './user.validation.js';

const router = Router();

router.use(authentication); 

router.get('/me', userService.getMyProfile);
router.patch('/me', validation({ body: updateProfileSchema }), userService.updateProfile);
router.patch('/me/privacy', validation({ body: privacySchema }), userService.updatePrivacy);
router.patch('/me/password', validation({ body: changePasswordSchema }), userService.changePassword);
router.delete('/me', validation({ body: deleteAccountSchema }), userService.deleteAccount);

router.patch('/me/profile-picture', uploadFile({ maxSizeMB: 5 }).single('image'), userService.uploadProfilePicture);
router.post('/me/cover-images', uploadFile({ maxSizeMB: 10 }).array('images', 5), userService.uploadCoverImages);
router.get('/me/cover-images', userService.getCoverImages);

router.get('/me/follow-requests', userService.getFollowRequests);
router.post('/me/follow-requests/:id/accept', validation({ params: idParamsSchema }), userService.acceptFollowRequest);
router.delete('/me/follow-requests/:id', validation({ params: idParamsSchema }), userService.rejectFollowRequest);

router.get('/search', validation({ query: searchQuerySchema }), userService.searchUsers);
router.get('/suggestions', userService.getSuggestions);

router.get('/:id', validation({ params: idParamsSchema }), userService.getUserProfile);
router.get('/:id/profile-picture', validation({ params: idParamsSchema }), userService.getProfilePicture);
router.get('/:id/followers', validation({ params: idParamsSchema }), userService.getFollowers);
router.get('/:id/following', validation({ params: idParamsSchema }), userService.getFollowing);
router.post('/:id/follow', validation({ params: idParamsSchema }), userService.follow);
router.delete('/:id/follow', validation({ params: idParamsSchema }), userService.unfollow);
router.patch(
  '/:id/restore',
  authorization(RoleEnum.admin),
  validation({ params: idParamsSchema }),
  userService.restoreUser,
);

export default router;
