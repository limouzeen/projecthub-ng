// src/app/core/favorite-projects.service.ts
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { ProjectsApi, ProjectResponseDto } from './projects.api';

export interface FavoriteProject {
  projectId: number;
  name: string;
  lastUpdated: string; // ISO
  tables: number;
  isPinned: boolean;
}

@Injectable({ providedIn: 'root' })
export class FavoriteProjectsService {
  private readonly api = inject(ProjectsApi);

  private mapDto(d: ProjectResponseDto): FavoriteProject {
    return {
      projectId: d.projectId,
      name: d.name,
      lastUpdated: d.updatedAt,
      tables: d.tableCount,
      isPinned: d.isFavorite,
    };
  }

  /** โหลดเฉพาะรายการที่ favorite จาก /api/projects */
  getFavorites(): Observable<FavoriteProject[]> {
    return from(this.api.getAll()).pipe(
      map(rows => rows.filter(r => r.isFavorite).map(r => this.mapDto(r)))
    );
  }

  /** toggle favorite แล้วคืนข้อมูลฉบับ FavoriteProject */
  async togglePin(projectId: number): Promise<FavoriteProject> {
    const dto = await this.api.toggleFavorite(projectId);
    return this.mapDto(dto);
  }
}
