// src/app/pages/project-detail/project-detail.service.ts
// -------------------------------------------------------------------
// ⚠️ MOCK REGION IN THIS FILE
// ใช้ mock data เพื่อให้พัฒนา UI ได้ก่อน เมื่อจะผูกกับ ASP.NET Core จริง
// ให้ลบ REGION MOCK ทั้งหมด และปลดคอมเมนต์ส่วน real API ด้านล่าง
// -------------------------------------------------------------------

import { Injectable, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';

// ===== DTOs (ให้ชื่อ field ตรงกับฝั่ง .NET Dto ที่คุณมี) =====
export type ProjectDto = {
  projectId: number;
  name: string;
  createdAt: string;   // ISO string
  tables: number;      // จำนวนตารางในโปรเจกต์
};

export type TableDto = {
  tableId: number;
  projectId: number;
  name: string;
  createdAt: string;   // ISO string
};

export type ColumnDto = {
  columnId: number;
  tableId: number;
  name: string;
  dataType: string;    // "text" | "number" | "int" | "date" | "bool" | "lookup" | "formula" ...
  isPrimary: boolean;
  isNullable: boolean;
};

export type RowDto = {
  rowId: number;
  tableId: number;
  data: string;        // JSON string (ตามหลังบ้านเก็บ JSON)
  createdAt: string;   // ISO string
};

@Injectable({ providedIn: 'root' })
export class ProjectDetailService {
  private readonly base = '/api';

  // ใส่ @Optional เพื่อให้รันได้แม้ยังไม่ได้ provide HttpClient
  // (ใน app.config.ts ของคุณมี provideHttpClient() แล้วจึงพร้อมใช้ real API ได้)
  constructor(@Optional() private http: HttpClient) {}

  // ===================================================================
  // ================ MOCK DATA (ลบเมื่อผูก API จริง) ===================
  // ===================================================================

  private MOCK_PROJECT: ProjectDto = {
    projectId: 1,
    name: 'Sales Analytics',
    createdAt: new Date().toISOString(),
    tables: 2,
  };

  private MOCK_TABLES: TableDto[] = [
    { tableId: 101, projectId: 1, name: 'Products', createdAt: new Date().toISOString() },
    { tableId: 102, projectId: 1, name: 'Orders',   createdAt: new Date().toISOString() },
  ];

  private MOCK_COLUMNS_BY_TABLE: Record<number, ColumnDto[]> = {
    101: [
      { columnId: 1, tableId: 101, name: 'ProductId', dataType: 'int',    isPrimary: true,  isNullable: false },
      { columnId: 2, tableId: 101, name: 'Name',      dataType: 'text',   isPrimary: false, isNullable: false },
      { columnId: 3, tableId: 101, name: 'Price',     dataType: 'number', isPrimary: false, isNullable: false },
    ],
    102: [
      { columnId: 4, tableId: 102, name: 'OrderId',   dataType: 'int',    isPrimary: true,  isNullable: false },
      { columnId: 5, tableId: 102, name: 'ProductId', dataType: 'int',    isPrimary: false, isNullable: false },
      { columnId: 6, tableId: 102, name: 'Qty',       dataType: 'number', isPrimary: false, isNullable: false },
    ],
  };

  private MOCK_ROWS_BY_TABLE: Record<number, RowDto[]> = {
    101: [
      { rowId: 11, tableId: 101, data: JSON.stringify({ ProductId: 1, Name: 'Pen',  Price: 15 }), createdAt: new Date().toISOString() },
      { rowId: 12, tableId: 101, data: JSON.stringify({ ProductId: 2, Name: 'Book', Price: 80 }), createdAt: new Date().toISOString() },
    ],
    102: [
      { rowId: 21, tableId: 102, data: JSON.stringify({ OrderId: 9001, ProductId: 1, Qty: 2 }), createdAt: new Date().toISOString() },
    ],
  };
  // ===================================================================

  // ------------------------- PROJECTS -------------------------

  /** ดึงข้อมูลโปรเจกต์ */
  getProject(projectId: number): Observable<ProjectDto> {
    // TODO(WIRE_BACKEND): enable and delete mock
    // return this.http!.get<ProjectDto>(`${this.base}/projects/${projectId}`);

    // mock
    return of(this.MOCK_PROJECT).pipe(delay(150));
  }

  // -------------------------- TABLES --------------------------

  /**
   * รายการตารางของโปรเจกต์
   * หมายเหตุฝั่ง .NET ตอนนี้ยังไม่มี endpoint list tables by project ที่ชัดเจน
   * ตัวอย่างจริงอาจเป็น:
   *   GET /api/projects/{projectId}/tables   (แนะนำ)
   * หรือใช้ query:
   *   GET /api/tables?projectId=...
   */
  listTables(projectId: number): Observable<TableDto[]> {
    // TODO(WIRE_BACKEND): choose one style and delete mock
    // return this.http!.get<TableDto[]>(`${this.base}/projects/${projectId}/tables`);
    // หรือ
    // return this.http!.get<TableDto[]>(`${this.base}/tables`, { params: { projectId } as any });

    // mock
    const data = this.MOCK_TABLES.filter(t => t.projectId === projectId);
    return of(data).pipe(delay(150));
  }

  /** สร้างตารางใหม่ */
  createTable(projectId: number, name: string): Observable<TableDto> {
    // TODO(WIRE_BACKEND): enable and delete mock
    // return this.http!.post<TableDto>(`${this.base}/tables`, { projectId, name });

    // mock
    const dto: TableDto = {
      tableId: Math.floor(Math.random() * 1e9),
      projectId,
      name,
      createdAt: new Date().toISOString(),
    };
    this.MOCK_TABLES = [dto, ...this.MOCK_TABLES];
    this.MOCK_COLUMNS_BY_TABLE[dto.tableId] = [];
    this.MOCK_ROWS_BY_TABLE[dto.tableId] = [];
    // อัปเดต count ใน project mock
    this.MOCK_PROJECT = { ...this.MOCK_PROJECT, tables: this.MOCK_TABLES.filter(t => t.projectId === projectId).length };
    return of(dto).pipe(delay(200));
  }

  /** เปลี่ยนชื่อ table */
  renameTable(tableId: number, name: string): Observable<TableDto> {
    // TODO(WIRE_BACKEND): enable and delete mock
    // return this.http!.put<TableDto>(`${this.base}/tables/${tableId}`, { name });

    // mock
    const idx = this.MOCK_TABLES.findIndex(t => t.tableId === tableId);
    if (idx >= 0) this.MOCK_TABLES[idx] = { ...this.MOCK_TABLES[idx], name };
    const dto = this.MOCK_TABLES[idx];
    return of(dto).pipe(delay(150));
  }

  /** ลบ table */
  deleteTable(tableId: number): Observable<void> {
    // TODO(WIRE_BACKEND): enable and delete mock
    // return this.http!.delete<void>(`${this.base}/tables/${tableId}`);

    // mock
    const tab = this.MOCK_TABLES.find(t => t.tableId === tableId);
    this.MOCK_TABLES = this.MOCK_TABLES.filter(t => t.tableId !== tableId);
    delete this.MOCK_COLUMNS_BY_TABLE[tableId];
    delete this.MOCK_ROWS_BY_TABLE[tableId];
    if (tab) {
      this.MOCK_PROJECT = { ...this.MOCK_PROJECT, tables: this.MOCK_TABLES.filter(t => t.projectId === tab.projectId).length };
    }
    return of(void 0).pipe(delay(150));
  }

  // ------------------------- COLUMNS --------------------------

  /** รายการคอลัมน์ใน table */
  listColumns(tableId: number): Observable<ColumnDto[]> {
    // TODO(WIRE_BACKEND): enable and delete mock
    // return this.http!.get<ColumnDto[]>(`${this.base}/tables/${tableId}/columns`);

    // mock
    return of(this.MOCK_COLUMNS_BY_TABLE[tableId] ?? []).pipe(delay(120));
  }

  // --------------------------- ROWS ---------------------------

  /** ดึงแถว (เช่น top 5) */
  listRows(tableId: number, top = 5): Observable<RowDto[]> {
    // TODO(WIRE_BACKEND): enable and delete mock
    // return this.http!.get<RowDto[]>(`${this.base}/tables/${tableId}/rows`, { params: { take: top } as any });

    // mock
    const rows = (this.MOCK_ROWS_BY_TABLE[tableId] ?? []).slice(0, top);
    return of(rows).pipe(delay(120));
  }
}
