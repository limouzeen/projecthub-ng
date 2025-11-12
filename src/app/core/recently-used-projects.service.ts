// src/app/core/recently-used-projects.service.ts
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, delay } from 'rxjs/operators';
import { ProjectsApi, ProjectResponseDto } from './projects.api';

export interface RecentlyUsedProject {
  projectId: number;
  name: string;
  tables: number;
  lastOpened: string;   // ISO datetime
  openCount: number;
}

const STORAGE_KEY = 'ph:recently-used-counts';

@Injectable({ providedIn: 'root' })
export class RecentlyUsedProjectsService {
  private readonly api = inject(ProjectsApi);

  /** โหลดเฉพาะ "จำนวนครั้ง" ที่เปิด (เก็บฝั่งหน้า เพื่อคง UI เดิม) */
  private loadCounts(): Record<number, number> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) as Record<number, number> : {};
    } catch { return {}; }
  }
  private saveCounts(rec: Record<number, number>) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rec)); } catch {}
  }

  /** ดึงรายการ recently used จากหลังบ้าน (ใช้ lastOpenedAt) + รวม openCount จาก local */
  getRecentlyUsed(): Observable<RecentlyUsedProject[]> {
    return from(this.api.getAll()).pipe(
      map((rows: ProjectResponseDto[]) => {
        const counts = this.loadCounts();

        const mapped: RecentlyUsedProject[] = rows.map(r => ({
          projectId: r.projectId,
          name: r.name,
          tables: r.tableCount,
          // ถ้า backend ยังไม่มี lastOpenedAt ให้ fallback เป็น updatedAt
          lastOpened: r.lastOpenedAt ?? r.updatedAt,
          openCount: counts[r.projectId] ?? 0,
        }));

        // เอาเฉพาะที่มี lastOpened (จริง ๆ ควรมี) เรียงล่าสุด -> เก่าสุด
        return mapped
          .filter(x => !!x.lastOpened)
          .sort((a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime());
      }),
      delay(120) // เล็กน้อยเพื่อฟีลโหลด (รักษา UX เดิม)
    );
  }

  /** เรียกทุกครั้งที่ user เข้าโปรเจกต์ — เก็บเฉพาะ openCount ฝั่งหน้า */
  markOpened(projectId: number, name: string, tables: number) {
    const rec = this.loadCounts();
    rec[projectId] = (rec[projectId] ?? 0) + 1;
    this.saveCounts(rec);
    // lastOpenedAt ฝั่งจริง backend จะอัปเดตเองเมื่อคุณเข้า project (ValidateProjectAccessAsync)
  }
}
