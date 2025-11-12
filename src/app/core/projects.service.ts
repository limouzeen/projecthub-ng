// src/app/core/projects.service.ts
import { Injectable, signal, computed, inject } from '@angular/core';
import { ProjectsApi, ProjectResponseDto } from './projects.api'; 

export type Project = {
  id: number;
  name: string;
  updatedAt: string;   // ISO
  tables: number;
  favorite?: boolean;
};

function mapDto(d: ProjectResponseDto): Project {
  return {
    id: d.projectId,
    name: d.name,
    updatedAt: d.updatedAt,
    tables: d.tableCount,
    favorite: d.isFavorite,
  };
}

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly api = inject(ProjectsApi);

  private readonly _list = signal<Project[]>([]);
  readonly list = computed(() => this._list());

  /** โหลดรายการโปรเจกต์ของ user จาก backend */
  async refresh(): Promise<void> {
    const rows = await this.api.getAll();
    this._list.set(rows.map(mapDto));
  }

  /** ===== API actions ===== */
  async add(name: string, userId: number): Promise<void> {
    const dto = await this.api.create(userId, name);
    const p = mapDto(dto);
    this._list.update(arr => [p, ...arr]);
  }

  async rename(id: number, name: string): Promise<void> {
    const dto = await this.api.rename(id, name);
    const p = mapDto(dto);
    this._list.update(arr => arr.map(x => (x.id === id ? p : x)));
  }

  async remove(id: number): Promise<void> {
    await this.api.delete(id);
    this._list.update(arr => arr.filter(p => p.id !== id));
  }

  async removeMany(ids: number[]): Promise<void> {
    for (const id of ids) await this.api.delete(id);
    const set = new Set(ids);
    this._list.update(arr => arr.filter(p => !set.has(p.id)));
  }

  async toggleFavorite(id: number): Promise<void> {
    const dto = await this.api.toggleFavorite(id);
    const p = mapDto(dto);
    this._list.update(arr => arr.map(x => (x.id === id ? p : x)));
  }

  /** CSV เดิม */
  downloadCSV(rows: Project[]) {
    const header = ['id','name','updatedAt','tables','favorite'];
    const csv = [
      header.join(','),
      ...rows.map(r => [r.id, this.escape(r.name), r.updatedAt, String(r.tables), String(!!r.favorite)].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'projects.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  private escape(s: string) {
    const needs = /[" ,\n]/.test(s);
    return needs ? `"${s.replace(/"/g, '""')}"` : s;
  }
}
