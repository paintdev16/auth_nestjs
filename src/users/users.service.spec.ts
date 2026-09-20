import { UsersService } from './users.service.js';

describe('UsersService', () => {
  it('can be instantiated', () => {
    expect(new UsersService()).toBeInstanceOf(UsersService);
  });
});
