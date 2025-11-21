import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type AdminUserDto = {
  userId: number;
  email: string;
  username: string;
  profilePictureUrl?: string | null;
  createdAt?: string;
  // ถ้า backend มี field อื่น เช่น IsLocked, Roles ฯลฯ ก็เติมได้ทีหลัง
};

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/Admin`;

  getAll() {
    return this.http.get<AdminUserDto[]>(`${this.base}/users`);
  }

  // TODO: ถ้าทำ API เพิ่ม เช่น เปลี่ยน role / ลบ user / lock user
  // ก็มาเติม function ต่อแบบนี้ได้เลย:
  //
  // changeRole(userId: number, role: string) { ... }
  // delete(userId: number) { ... }
}
