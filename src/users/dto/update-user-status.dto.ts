import { IsIn } from 'class-validator';

import { USER_STATUS } from '../user-status.constants.js';

export class UpdateUserStatusDto {
  @IsIn([USER_STATUS.ACTIVE, USER_STATUS.BLOCKED, USER_STATUS.DISABLED])
  status!: (typeof USER_STATUS)[keyof typeof USER_STATUS];
}
