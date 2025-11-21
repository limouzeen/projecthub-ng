// src/app/pages/admin-users/admin-users.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export type AdminUserDto = {
  userId: number;
  email: string;
  username: string;
  profilePictureUrl?: string | null;
  createdAt?: string;
  role?: string | null;
};

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);
  private readonly baseAdmin = `${environment.apiBase}/api/Admin`;
  private readonly baseUsers = `${environment.apiBase}/api/Users`;

  /** GET: list users (เฉพาะ Admin) */
  async getAll(): Promise<AdminUserDto[]> {
    return await firstValueFrom(
      this.http.get<AdminUserDto[]>(`${this.baseAdmin}/users`)
    );
  }

  /** POST: admin สร้าง user ใหม่ (ใช้ endpoint register เดิม) */
  async create(input: {
    email: string;
    username: string;
    password: string;
  }): Promise<AdminUserDto> {
    // backend register ใช้ชื่อ field ตาม RegisterUserRequest
    const payload = {
      email: input.email.trim(),
      username: input.username.trim(),
      password: input.password,
      profilePictureUrl: '/assets/ph_profile.png', // ค่า default
    };

    return await firstValueFrom(
      this.http.post<AdminUserDto>(`${this.baseUsers}/register`, payload)
    );
  }

  /** DELETE: ลบ user ตาม id */
  async delete(userId: number): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${this.baseUsers}/${userId}`)
    );
  }

   // PUT: update (ตัวใหม่)
  async update(
    userId: number,
    input: { email: string; username: string; role?: string | null; profilePictureUrl?: string | null }
  ): Promise<AdminUserDto> {
    const payload = {
      email: input.email.trim(),
      username: input.username.trim(),
      role: input.role ?? '',
      profilePictureUrl: input.profilePictureUrl ?? '/assets/ph_profile.png',
    };

    return await firstValueFrom(
      this.http.put<AdminUserDto>(`${this.baseAdmin}/users/${userId}`, payload)
    );
  }

}
