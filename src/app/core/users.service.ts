// src/app/core/users.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/* ============================
 * DTOs (Frontend)
 * ============================ */
export type MeDto = {
  userId?: number;           
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

export type ChangePasswordDto = { currentPassword: string; newPassword: string; };
export type LoginRequestDto   = { email: string; password: string; };

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
  private readonly http  = inject(HttpClient);
  private readonly base  = `${environment.apiBase}/api/Users`;
  private readonly USE_MOCK = false;

  /** รูป default ของระบบ (ใช้ทั้งตอน register และ fallback กรณีค่ามาเพี้ยน) */
  private static readonly DEFAULT_AVATAR = '/assets/ph_profile.png';

  private mockMe: MeDto = {
    sub: '9',
    email: 's65524100xx@sau.ac.th',
    username: 'Phakin Kamwilaisak',
    profilePictureUrl: UsersService.DEFAULT_AVATAR,
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
  setLocalMePatch(patch: Partial<MeDto>) { this.mePatch = { ...(this.mePatch ?? {}), ...patch }; }
  clearLocalMePatch() { this.mePatch = null; }

  /** ทำให้ avatar ใช้ได้เสมอ (data:, http(s), หรือ path /assets/…) + กรองค่าขยะ */
  private normalizeAvatar(src?: string | null): string | null {
    if (!src) return UsersService.DEFAULT_AVATAR;
    const s = src.trim();
    if (!s) return UsersService.DEFAULT_AVATAR;

    // กันค่าขยะจาก DB เช่น "string" / "null" / "undefined"
    const junk = /^(string|null|undefined)$/i;
    if (junk.test(s)) return UsersService.DEFAULT_AVATAR;

    if (s.startsWith('data:')) return s;                               // data URL พร้อมใช้
    if (s.startsWith('http://') || s.startsWith('https://')) return s; // URL ตรง
    if (s.startsWith('/')) return s;                                   // path ภายในแอป เช่น /assets/...

    // กรณี backend ส่ง base64 ล้วนๆ
    return `data:image/png;base64,${s}`;
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
      this.clearLocalMePatch();
      return token;
    }

    const res = await firstValueFrom(this.http.post<TokenResponseDto>(`${this.base}/login`, dto));
    localStorage.setItem('access_token', res.accessToken);
    this.clearLocalMePatch();
    return res;
  }

  /* ============================
   * GET /api/users/me
   * ============================ */
  async getMe(): Promise<MeDto> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 200));
      return this.applyPatch({
        ...this.mockMe,
        profilePictureUrl: this.normalizeAvatar(this.mockMe.profilePictureUrl),
      });
    }

    const me = await firstValueFrom(
      this.http.get<MeDto>(`${this.base}/me`, { headers: this.authHeaders() })
    );

    const normalized: MeDto = {
      ...me,
      profilePictureUrl: this.normalizeAvatar(me.profilePictureUrl),
    };
    return this.applyPatch(normalized);
  }

  /* ============================
   * PUT /api/users/me (Profile)
   * ============================ */
  async updateProfile(dto: UpdateProfileDto): Promise<UserResponseDto> {
    const res = await firstValueFrom(
      this.http.put<UserResponseDto>(`${this.base}/me`, dto, { headers: this.authHeaders() })
    );

    // อัปเดต cache สำหรับรอบถัดไป
    this.setLocalMePatch({
      email: res.email,
      username: res.username,
      profilePictureUrl: this.normalizeAvatar(res.profilePictureUrl ?? null),
    });

    // คืนค่าที่ normalize แล้ว
    return {
      ...res,
      profilePictureUrl: this.normalizeAvatar(res.profilePictureUrl ?? null),
    };
  }

  /* ============================
   * PUT /api/users/me/password
   * ============================ */
  async changePassword(dto: ChangePasswordDto): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${this.base}/change-password`, dto, { headers: this.authHeaders() })
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
    if (this.USE_MOCK) { await new Promise(r => setTimeout(r, 150)); return; }
    await firstValueFrom(this.http.delete<void>(`${this.base}/${userId}`, { headers: this.authHeaders() }));
    this.clearLocalMePatch();
    localStorage.removeItem('access_token');
  }

  /* ============================
   * POST /api/users/register
   * ============================ */
  async register(input: { email: string; username: string; password: string; }): Promise<UserResponseDto> {
    const payload: RegisterRequestDto = {
      email: input.email.trim(),
      username: input.username.trim(),
      password: input.password,
      profilePictureUrl: UsersService.DEFAULT_AVATAR,
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

    const res = await firstValueFrom(this.http.post<UserResponseDto>(`${this.base}/register`, payload));

    this.clearLocalMePatch();
    localStorage.removeItem('access_token');

    return {
      ...res,
      profilePictureUrl: this.normalizeAvatar(res.profilePictureUrl ?? null),
    };
  }


  /* Helpers*/
  
  // ============================
  // 🔐 JWT Role Helpers (Frontend เท่านั้น)
  // ============================
  private decodeJwt(token: string | null): any | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  /** คืน array ของ role จาก token เช่น ["Admin"] หรือ [] */
  getRolesFromToken(): string[] {
    const token = localStorage.getItem('access_token');
    const payload = this.decodeJwt(token);
    if (!payload) return [];

    // ASP.NET Core ชอบใช้ claim แบบนี้:
    //  - "role": "Admin" หรือ ["Admin","User"]
    //  - "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
    const raw =
      payload['role'] ??
      payload['roles'] ??
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];

    if (!raw) return [];

    if (Array.isArray(raw)) return raw.map((r) => String(r));
    return [String(raw)];
  }

  /** true ถ้า token ตอนนี้มี role = "Admin" */
  isAdmin(): boolean {
    return this.getRolesFromToken().includes('Admin');
  }
}
