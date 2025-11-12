// src/app/core/users.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/* ============================
 * DTOs (Frontend)
 * ============================ */

export type MeDto = {
  sub?: string | null;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  profilePictureUrl?: string | null;
};

export type UpdateProfileDto = {
  username: string;
  email: string;
  profilePictureUrl?: string | null;
};

export type ChangePasswordDto = {
  currentPassword: string;
  newPassword: string;
};

export type LoginRequestDto = {
  email: string;
  password: string;
};

export type TokenResponseDto = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
};

export type RegisterRequestDto = {
  email: string;
  username: string;
  password: string;
  profilePictureUrl: string;
};

export type UserResponseDto = {
  userId: number;
  email: string;
  username: string;
  profilePictureUrl?: string | null;
  createdAt?: string;
};

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/Users`;

  // ===== MOCK CONFIG =====
  private readonly USE_MOCK = false;

  private mockMe: MeDto = {
    sub: '9',
    email: 's65524100xx@sau.ac.th',
    username: 'Phakin Kamwilaisak',
    profilePictureUrl: '/assets/ph_profile.png',
  };
  private mockPassword = '12345678';

  /* ============================
   * Helpers
   * ============================ */

  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token');
    return new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
  }

  private notWired<T>(what: string): Promise<T> {
    return Promise.reject(new Error(`TODO(WIRE-BACKEND): ${what} not implemented`));
  }

  /** โปรไฟล์ล่าสุดที่อัปเดตในฝั่งหน้า (ทับค่า /me ชั่วคราวจนกว่ารีเฟรช/ออกระบบ) */
  private mePatch: Partial<MeDto> | null = null;

  private applyPatch(me: MeDto): MeDto {
    return this.mePatch ? { ...me, ...this.mePatch } : me;
  }
  setLocalMePatch(patch: Partial<MeDto>) {
    this.mePatch = { ...(this.mePatch ?? {}), ...patch };
  }
  clearLocalMePatch() {
    this.mePatch = null;
  }

  /* ============================
   * POST /api/users/login
   * ============================ */
  async login(dto: LoginRequestDto): Promise<TokenResponseDto> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 250));
      if (dto.email !== this.mockMe.email || dto.password !== this.mockPassword) {
        throw new Error('Invalid email or password.');
      }
      const token: TokenResponseDto = { accessToken: 'mock-access-token' };
      localStorage.setItem('access_token', token.accessToken);
      return token;
    }

    const res = await firstValueFrom(
      this.http.post<TokenResponseDto>(`${this.base}/login`, dto)
    );
    localStorage.setItem('access_token', res.accessToken);
    return res;
  }

  /* ============================
   * GET /api/users/me
   * ============================ */
  async getMe(): Promise<MeDto> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 200));
      return this.applyPatch({ ...this.mockMe });
    }

    const me = await firstValueFrom(
      this.http.get<MeDto>(`${this.base}/me`, { headers: this.authHeaders() })
    );
    return this.applyPatch(me);
  }

  /* ============================
   * PUT /api/users/me (Profile)
   * ============================ */
  async updateProfile(dto: UpdateProfileDto): Promise<UserResponseDto> {
    const res = await firstValueFrom(
      this.http.put<UserResponseDto>(`${this.base}/me`, dto, { headers: this.authHeaders() })
    );

    // อัปเดต cache สำหรับรอบถัดไป (จนกว่าจะรีเฟรช/ลบ account/ล็อกเอาต์)
    this.setLocalMePatch({
      email: res.email,
      username: res.username,
      profilePictureUrl: res.profilePictureUrl ?? null,
    });

    return res;
  }

  /* ============================
   * PUT /api/users/me/password
   * ============================ */
  async changePassword(dto: ChangePasswordDto): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${this.base}/change-password`, dto, {
        headers: this.authHeaders(),
      })
    );
  }

  /* ============================
   * POST /api/users/me/avatar
   * ============================ */
  async uploadAvatar(file: File): Promise<{ url: string }> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 250));
      const url = URL.createObjectURL(file);
      this.mockMe = { ...this.mockMe, profilePictureUrl: url };
      return { url };
    }

    return this.notWired<{ url: string }>('POST /api/users/me/avatar');
  }

  /* ============================
   * DELETE /api/users/{id}
   * ============================ */
  async deleteUser(userId: number): Promise<void> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 150));
      return;
    }

    await firstValueFrom(
      this.http.delete<void>(`${this.base}/${userId}`, {
        headers: this.authHeaders(),
      })
    );

    // ล้าง cache เพื่อไม่ให้ค้างข้อมูลหลังลบ
    this.clearLocalMePatch();
  }

  /* ============================
   * POST /api/users/register
   * ============================ */
  async register(input: { email: string; username: string; password: string }): Promise<UserResponseDto> {
    const payload: RegisterRequestDto = {
      email: input.email.trim(),
      username: input.username.trim(),
      password: input.password,
      profilePictureUrl: '/assets/ph_profile.png', // default
    };

    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 250));
      return {
        userId: 999,
        email: payload.email,
        username: payload.username,
        profilePictureUrl: payload.profilePictureUrl,
      };
    }

    const res = await firstValueFrom(
      this.http.post<UserResponseDto>(`${this.base}/register`, payload)
    );

    // หลังสมัครเสร็จ: ล้าง cache และ token เดิม เพื่อให้ login ใหม่ได้
    this.clearLocalMePatch();
    localStorage.removeItem('access_token');

    return res;
  }
}
