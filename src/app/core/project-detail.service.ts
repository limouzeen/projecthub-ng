// src/app/core/project-detail.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type TableDto = {
  tableId: number;
  name: string;
  rowCount?: number;
  updatedAt?: string;
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
  private readonly baseTables = `${environment.apiBase}/api/Tables`;

  private auth(): { headers: HttpHeaders } {
    const token = localStorage.getItem('access_token');
    return { headers: new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {}) };
  }

  /** GET /api/tables/project/{projectId} */
  listTables(projectId: number): Observable<TableDto[]> {
    return this.http.get<TableDto[]>(
      `${this.baseTables}/project/${projectId}`,
      this.auth()
    );
  }

  /** POST /api/tables */
  createTable(projectId: number, name: string, useAutoIncrement: boolean)
  : Observable<CreateTableResponse> {
    const body: CreateTableRequest = { projectId, name, useAutoIncrement };
    return this.http.post<CreateTableResponse>(
      `${this.baseTables}`,
      body,
      this.auth()
    );
  }

  /** PUT /api/tables/{tableId} */
  renameTable(tableId: number, newName: string): Observable<void> {
    const body: RenameTableRequest = { newName };
    return this.http.put<void>(`${this.baseTables}/${tableId}`, body, this.auth());
  }

  /** DELETE /api/tables/{tableId} */
  deleteTable(tableId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseTables}/${tableId}`, this.auth());
  }
}
