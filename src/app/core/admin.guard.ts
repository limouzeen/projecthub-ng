import { CanMatchFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { UsersService } from './users.service';

export const adminGuard: CanMatchFn = () => {
  const users = inject(UsersService);
  const router = inject(Router);

  if (users.isAdmin()) {
    return true;
  }

  // ไม่ใช่ admin → เด้งกลับ 
  router.navigateByUrl('/dashboard');
  return false;
};