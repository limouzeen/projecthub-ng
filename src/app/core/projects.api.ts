import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** === DTOs ฝั่งหลังบ้าน (เดา/อิงจาก Handler) === */
export type ProjectResponseDto = {
  projectId: number;
  name: string;
  updatedAt: string;    // ISO
  tableCount: number;   // จำนวนตาราง
  isFavorite: boolean;
  lastOpenedAt?: string;
};

export type CreateProjectRequest = { userId: number; name: string };
export type UpdateProjectRequest = { newName: string };

@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/Projects`;

  private auth(): { headers: HttpHeaders } {
    const token = localStorage.getItem('access_token');
    return { headers: new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {}) };
  }

  /** GET /api/projects  (ดึงของ user ปัจจุบันจาก claims) */
  async getAll(): Promise<ProjectResponseDto[]> {
    return await firstValueFrom(this.http.get<ProjectResponseDto[]>(this.base, this.auth()));
  }

  /** POST /api/projects */
  async create(userId: number, name: string): Promise<ProjectResponseDto> {
    const body: CreateProjectRequest = { userId, name };
    return await firstValueFrom(this.http.post<ProjectResponseDto>(this.base, body, this.auth()));
  }

  /** PUT /api/projects/{id}  (rename) */
  async rename(id: number, newName: string): Promise<ProjectResponseDto> {
    const body: UpdateProjectRequest = { newName };
    return await firstValueFrom(this.http.put<ProjectResponseDto>(`${this.base}/${id}`, body, this.auth()));
  }

  /** DELETE /api/projects/{id} */
  async delete(id: number): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.base}/${id}`, this.auth()));
  }

  /** PUT /api/projects/{id}/toggle-favorite */
  async toggleFavorite(id: number): Promise<ProjectResponseDto> {
    return await firstValueFrom(
      this.http.put<ProjectResponseDto>(`${this.base}/${id}/toggle-favorite`, null, this.auth())
    );
  }
}
