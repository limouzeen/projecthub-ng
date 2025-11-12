// src/app/core/users.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/* ============================
 * DTOs (Frontend)
 * ============================ */

/** ตาม /api/users/me — รองรับทั้ง username/name เผื่อฝั่งหลังบ้านใช้ชื่อไหน */
export type MeDto = {
  sub?: string | null;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

export type UpdateProfileDto = {
  username: string;
  email: string;
};

export type ChangePasswordDto = {
  currentPassword: string;
  newPassword: string;
};

export type LoginRequestDto = {
  email: string;
  password: string;
};

/** ต้องเช็คกับ TokenResponseDto ฝั่ง API ให้ตรงชื่อ field */
export type TokenResponseDto = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
};

export type RegisterRequestDto = {
  email: string;
  username: string;
  password: string;
  profilePictureUrl: string; // ฝั่งหลังบ้าน Required
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
  // TODO(REMOVE-MOCK): ปิด mock เมื่อใช้ API จริง
  private readonly USE_MOCK = false;

  private mockMe: MeDto = {
    sub: '9',
    email: 's65524100xx@sau.ac.th',
    username: 'Phakin Kamwilaisak',
    avatarUrl: '/assets/ph_profile.png',
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

    // ===== REAL API (เปิดใช้เมื่อพร้อม) =====
    const res = await firstValueFrom(
      this.http.post<TokenResponseDto>(`${this.base}/login`, dto)
    );
    localStorage.setItem('access_token', res.accessToken);
    return res;

    // return this.notWired<TokenResponseDto>('POST /api/users/login');
  }

  /* ============================
   * GET /api/users/me
   * ============================ */
  async getMe(): Promise<MeDto> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 200));
      return { ...this.mockMe };
    }

    // ===== REAL API =====
    return await firstValueFrom(
      this.http.get<MeDto>(`${this.base}/me`, { headers: this.authHeaders() })
    );

    // return this.notWired<MeDto>('GET /api/users/me');
  }

  /* ============================
   * PUT /api/users/me (Profile)
   * ============================ */
  async updateProfile(dto: UpdateProfileDto): Promise<MeDto> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 250));
      this.mockMe = {
        ...this.mockMe,
        username: dto.username,
        email: dto.email,
      };
      return { ...this.mockMe };
    }

    // ===== REAL API =====
    // return await firstValueFrom(
    //   this.http.put<MeDto>(`${this.base}/me`, dto, { headers: this.authHeaders() })
    // );

    return this.notWired<MeDto>('PUT /api/users/me');
  }

  /* ============================
   * PUT /api/users/me/password
   * ============================ */
  async changePassword(dto: ChangePasswordDto): Promise<{ ok: true }> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 250));
      if (dto.currentPassword !== this.mockPassword) {
        throw new Error('Current password is incorrect.');
      }
      this.mockPassword = dto.newPassword;
      return { ok: true };
    }

    // ===== REAL API =====
    // await firstValueFrom(
    //   this.http.put<void>(`${this.base}/me/password`, dto, {
    //     headers: this.authHeaders(),
    //   })
    // );
    // return { ok: true };

    return this.notWired<{ ok: true }>('PUT /api/users/me/password');
  }

  /* ============================
   * POST /api/users/me/avatar
   * ============================ */
  async uploadAvatar(file: File): Promise<{ url: string }> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 250));
      const url = URL.createObjectURL(file);
      this.mockMe = { ...this.mockMe, avatarUrl: url };
      return { url };
    }

    // ===== REAL API =====
    // const form = new FormData();
    // form.append('file', file);
    // const res = await firstValueFrom(
    //   this.http.post<{ url: string }>(`${this.base}/me/avatar`, form, {
    //     headers: this.authHeaders(),
    //   })
    // );
    // return res;

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

    // ===== REAL API =====
    // await firstValueFrom(
    //   this.http.delete<void>(`${this.base}/${userId}`, {
    //     headers: this.authHeaders(),
    //   })
    // );

    return this.notWired<void>('DELETE /api/users/{id}');
  }


  async register(input: { email: string; username: string; password: string; }): Promise<UserResponseDto> {
  // ส่งรูป default จาก assets โดยผู้ใช้ไม่ต้องอัปโหลด
  const payload: RegisterRequestDto = {
    email: input.email.trim(),
    username: input.username.trim(),
    password: input.password,
    profilePictureUrl: '/assets/ph_profile.png',
  };

  // MOCK? ถ้ายังอยากลองแบบ mock ให้ย้าย logic มาตามสไตล์คุณได้
  if (this.USE_MOCK) {
    await new Promise(r => setTimeout(r, 250));
    return {
      userId: 999,
      email: payload.email,
      username: payload.username,
      profilePictureUrl: payload.profilePictureUrl,
    };
  }

  // ===== REAL API =====
  return await firstValueFrom(
    this.http.post<UserResponseDto>(`${this.base}/register`, payload)
  );
}
}
