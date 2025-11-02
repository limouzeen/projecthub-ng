// src/app/core/users.service.ts
import { Injectable /*, inject*/ } from '@angular/core';
// import { HttpClient, HttpHeaders } from '@angular/common/http'; // TODO(WIRE-BACKEND): เปิดเมื่อผูก API จริง
// import { firstValueFrom } from 'rxjs';                          // TODO(WIRE-BACKEND): เปิดเมื่อผูก API จริง
import { HttpHeaders } from '@angular/common/http'; // ใช้เฉพาะสร้าง header ให้ตัวอย่าง mock

/* ============================
 * DTOs ที่ใช้ข้ามชั้น
 * ============================ */
export type MeDto = {
  sub?: string | null;
  email?: string | null;
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

@Injectable({ providedIn: 'root' })
export class UsersService {
  // ===== ต่อ API จริง (คอมเมนต์ไว้ก่อน) =====
  // private readonly http = inject(HttpClient);     // TODO(WIRE-BACKEND)
  // private readonly base = '/api/users';           // TODO(WIRE-BACKEND)  [Route("api/[controller]")]

  /* ============================
   * MOCK CONFIG
   * ============================ */
  // TODO(REMOVE-MOCK): ลบ mock เมื่อผูก API จริง
  private readonly USE_MOCK = true;

  // TODO(REMOVE-MOCK): mock data ใช้ทดสอบหน้าฟอร์มเท่านั้น
  private mockMe: MeDto = {
    sub: '9',
    email: 's65524100xx@sau.ac.th',
    name: 'Phakin Kamwilaisak',
    avatarUrl: '/assets/ph_profile.png',
  };
  private mockPassword = '12345678';

  /* ============================
   * Helpers
   * ============================ */
  // TODO(REMOVE-HARDCODE): เปลี่ยนการเก็บ token ให้ปลอดภัย
  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token');
    return new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
  }

  /** ใช้เป็น fallback ให้ TypeScript เห็นว่าเมธอดมี return ทุกเส้นทาง */
  private notWired<T>(what: string): Promise<T> {
    return Promise.reject(new Error(`TODO(WIRE-BACKEND): ${what} not implemented`));
  }

  /* ============================
   * GET /api/users/me
   * ============================ */
  async getMe(): Promise<MeDto> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 250)); // mock delay
      return { ...this.mockMe };
    }

    // ===== REAL API (คอมเมนต์ไว้) =====
    // return await firstValueFrom(
    //   this.http.get<MeDto>(`${this.base}/me`, { headers: this.authHeaders() })
    // );

    return this.notWired<MeDto>('GET /api/users/me');
  }

  /* ============================
   * PUT /api/users/me (แก้ไขข้อมูลผู้ใช้)
   * ============================ */
  async updateProfile(dto: UpdateProfileDto): Promise<MeDto> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 350));
      this.mockMe = { ...this.mockMe, name: dto.username, email: dto.email };
      return { ...this.mockMe };
    }

    // ===== REAL API (คอมเมนต์ไว้) =====
    // return await firstValueFrom(
    //   this.http.put<MeDto>(`${this.base}/me`, dto, { headers: this.authHeaders() })
    // );

    return this.notWired<MeDto>('PUT /api/users/me');
  }

  /* ============================
   * PUT /api/users/me/password (เปลี่ยนรหัสผ่าน)
   * ============================ */
  async changePassword(dto: ChangePasswordDto): Promise<{ ok: true }> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 300));
      if (dto.currentPassword !== this.mockPassword) {
        throw new Error('Current password is incorrect.');
      }
      this.mockPassword = dto.newPassword;
      return { ok: true };
    }

    // ===== REAL API (คอมเมนต์ไว้) =====
    // return await firstValueFrom(
    //   this.http.put<{ ok: true }>(`${this.base}/me/password`, dto, {
    //     headers: this.authHeaders(),
    //   })
    // );

    return this.notWired<{ ok: true }>('PUT /api/users/me/password');
  }

  /* ============================
   * POST /api/users/me/avatar (อัปโหลดรูป)
   * ============================ */
  async uploadAvatar(file: File): Promise<{ url: string }> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 300));
      const url = URL.createObjectURL(file);
      this.mockMe = { ...this.mockMe, avatarUrl: url };
      return { url };
    }

    // ===== REAL API (คอมเมนต์ไว้) =====
    // const form = new FormData();
    // form.append('file', file);
    // return await firstValueFrom(
    //   this.http.post<{ url: string }>(`${this.base}/me/avatar`, form, {
    //     headers: this.authHeaders(),
    //   })
    // );

    return this.notWired<{ url: string }>('POST /api/users/me/avatar');
  }

  /* ============================
   * DELETE /api/users/{id}
   * ============================ */
  async deleteUser(userId: number): Promise<void> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 200));
      return;
    }

    // ===== REAL API (คอมเมนต์ไว้) =====
    // await firstValueFrom(
    //   this.http.delete<void>(`${this.base}/${userId}`, { headers: this.authHeaders() })
    // );

    return this.notWired<void>('DELETE /api/users/{id}');
  }
}
