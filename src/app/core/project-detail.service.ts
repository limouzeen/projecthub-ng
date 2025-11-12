// src/app/core/project-detail.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ====== DTOs ที่หน้า ProjectDetail ใช้อยู่ ======
export type TableDto = {
  tableId: number;
  name: string;
  rowCount?: number;
  updatedAt?: string; // ISO
};

type CreateTableRequest = {
  projectId: number;
  name: string;
  useAutoIncrement: boolean;
};
type CreateTableResponse = {
  tableId: number;
  name: string;
};

type RenameTableRequest = { newName: string };

@Injectable({ providedIn: 'root' })
export class ProjectDetailService {
  private readonly http = inject(HttpClient);
  private readonly baseProjects = `${environment.apiBase}/api/Projects`;
  private readonly baseTables = `${environment.apiBase}/api/Tables`;

  private auth(): { headers: HttpHeaders } {
    const token = localStorage.getItem('access_token');
    return { headers: new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {}) };
  }

  /** GET /api/Projects/{projectId}/tables */
  listTables(projectId: number): Observable<TableDto[]> {
    return this.http.get<TableDto[]>(
      `${this.baseProjects}/${projectId}/tables`,
      this.auth()
    );
  }

  /** POST /api/Projects/{projectId}/tables */
  createTable(projectId: number, name: string, useAutoIncrement: boolean)
  : Observable<CreateTableResponse> {
    const body: CreateTableRequest = { projectId, name, useAutoIncrement };
    return this.http.post<CreateTableResponse>(
      `${this.baseProjects}/${projectId}/tables`,
      body,
      this.auth()
    );
  }

  /** PUT /api/Tables/{tableId} (rename) */
  renameTable(tableId: number, newName: string): Observable<void> {
    const body: RenameTableRequest = { newName };
    return this.http.put<void>(`${this.baseTables}/${tableId}`, body, this.auth());
  }

  /** DELETE /api/Tables/{tableId} */
  deleteTable(tableId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseTables}/${tableId}`, this.auth());
  }
}
