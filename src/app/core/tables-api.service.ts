// ============================
// TablesApiService (MOCK FIRST)
// ============================
// NOTE(REMOVE-MOCK): ส่วน MOCK ทั้งไฟล์นี้ให้ลบทิ้งเมื่อผูก API จริง
// และ uncomment ส่วนที่คอมเมนต์ไว้ใต้แท็ก // REAL API
//
// บริการนี้รวบรวมการเรียกข้อมูลที่หน้า table-view & modal สร้างฟิลด์จำเป็นต้องใช้:
// - listTablesByProject(projectId)
// - listColumnsByTableId(tableId)
// - listRowsByTableId(tableId)         <-- ใช้ GetRowsByTableIdHandler ฝั่งหลังบ้าน
// - createField(dto)                    <-- เมื่อเป็น Lookup จะส่ง Relationship config ไปด้วย
//
// สอดคล้องกับหลังบ้านของคุณ (Controllers: Tables/Columns/Rows/Relationships)

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
// import { firstValueFrom } from 'rxjs'; // REAL API

export type UiTable = { tableId: number; projectId: number; name: string };
export type UiField = {
  columnId: number;
  tableId: number;
  name: string;
  dataType: 'Text' | 'Number' | 'YesNo' | 'Date' | 'Lookup' | 'Formula';
  isPrimary?: boolean;
  isNullable?: boolean;
  // สำหรับ Lookup
  lookupRelationshipId?: number | null;
  lookupTargetColumnId?: number | null;
  // สำหรับ Formula
  formulaDefinition?: string | null; // เก็บ JSON string ตามหลังบ้านคุณ
};
export type UiRow = {
  rowId: number;
  tableId: number;
  createdAt?: string;
  cells: Record<string, any>;
};

export type CreateFieldDto = {
  tableId: number;
  name: string;
  dataType: UiField['dataType'];
  isPrimary?: boolean;
  isNullable?: boolean;
  // Lookup settings
  primaryTableId?: number;     // ตารางปลายทาง (PK อยู่ที่นี่)
  primaryColumnId?: number;    // คอลัมน์ปลายทาง (PK/target)
  foreignTableId?: number;     // ตารางต้นทาง = tableId เดียวกับ dto.tableId
  foreignColumnId?: number;    // คอลัมน์ฝั่งนี้ (FK)
  targetColumnId?: number;     // คอลัมน์ที่จะดึงมาแสดง (ใช้ตั้ง lookupTargetColumnId)
  // Formula
  formulaDefinition?: string | null;
};

@Injectable({ providedIn: 'root' })
export class TablesApiService {
  // private readonly http = inject(HttpClient);
  // private readonly base = '/api'; // => /api/tables | /api/columns | /api/rows | /api/relationships

  // TODO(REMOVE-HARDCODE): เปลี่ยนเป็นวิธีเก็บ token ที่ปลอดภัยขึ้น
  private auth() {
    const token = localStorage.getItem('access_token');
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
    return { headers };
  }

  // ===== MOCK SWITCH =====
  private readonly USE_MOCK = true;

  // ===== MOCK DATA =====
  private _mockTables: UiTable[] = [
    { tableId: 101, projectId: 1, name: 'Products' },
    { tableId: 102, projectId: 1, name: 'Orders' },
    { tableId: 103, projectId: 1, name: 'Beverage' },
  ];

  private _mockFields: UiField[] = [
    // Products
    { columnId: 11, tableId: 101, name: 'Id', dataType: 'Number', isPrimary: true, isNullable: false },
    { columnId: 12, tableId: 101, name: 'Name', dataType: 'Text' },
    { columnId: 13, tableId: 101, name: 'Price', dataType: 'Number' },

    // Orders
    { columnId: 21, tableId: 102, name: 'Id', dataType: 'Number', isPrimary: true, isNullable: false },
    { columnId: 22, tableId: 102, name: 'ProductId', dataType: 'Number' },
    // Lookup field แสดงชื่อสินค้าจาก Products.Name
    { columnId: 23, tableId: 102, name: 'ProductName', dataType: 'Lookup', lookupRelationshipId: 1, lookupTargetColumnId: 12 },
    // Formula = Price * Qty
    { columnId: 24, tableId: 102, name: 'Qty', dataType: 'Number' },
    { columnId: 25, tableId: 102, name: 'Amount', dataType: 'Formula', formulaDefinition: '{"type":"binary","+":[{"ref":"Price"},{"ref":"Qty"}]}' }, // demo
    // Beverage
    { columnId: 31, tableId: 103, name: 'Id', dataType: 'Number', isPrimary: true },
    { columnId: 32, tableId: 103, name: 'Name', dataType: 'Text' },
  ];

  private _mockRows: UiRow[] = [
    // Products
    { rowId: 1001, tableId: 101, cells: { Id: 1, Name: 'Coffee', Price: 80 } },
    { rowId: 1002, tableId: 101, cells: { Id: 2, Name: 'Tea',    Price: 65 } },

    // Orders (ProductName จาก Lookup, Amount จาก Formula ให้ mock แบบตรง ๆ)
    { rowId: 2001, tableId: 102, cells: { Id: 1, ProductId: 1, ProductName: 'Coffee', Qty: 2, Price: 80, Amount: 160 } },
    { rowId: 2002, tableId: 102, cells: { Id: 2, ProductId: 2, ProductName: 'Tea',    Qty: 1, Price: 65, Amount: 65 } },

    // Beverage
    { rowId: 3001, tableId: 103, cells: { Id: 1, Name: 'Cola' } },
  ];

  // ========= Tables =========
  async listTablesByProject(projectId: number): Promise<UiTable[]> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 200));
      return this._mockTables.filter(t => t.projectId === projectId);
    }

    // ===== REAL API =====
    // return await firstValueFrom(this.http.get<UiTable[]>(`${this.base}/tables?projectId=${projectId}`, this.auth()));
    return [];
  }

  // ========= Columns =========
  async listColumnsByTableId(tableId: number): Promise<UiField[]> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 150));
      return this._mockFields.filter(f => f.tableId === tableId);
    }

    // ===== REAL API =====
    // return await firstValueFrom(this.http.get<UiField[]>(`${this.base}/columns/table/${tableId}`, this.auth()));
    return [];
  }

  async createField(dto: CreateFieldDto): Promise<UiField> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 300));
      const newId = Math.max(0, ...this._mockFields.map(f => f.columnId)) + 1;
      const f: UiField = {
        columnId: newId,
        tableId: dto.tableId,
        name: dto.name,
        dataType: dto.dataType,
        isPrimary: !!dto.isPrimary,
        isNullable: dto.isNullable ?? true,
      };

      if (dto.dataType === 'Lookup') {
        // mock: สมมุติ relationshipId = auto, targetColumnId มาจาก dto
        f.lookupRelationshipId = Math.floor(Math.random() * 1000) + 1;
        f.lookupTargetColumnId  = dto.targetColumnId ?? null;
      }
      if (dto.dataType === 'Formula') {
        f.formulaDefinition = dto.formulaDefinition ?? null;
      }

      this._mockFields.push(f);
      return f;
    }

    // ===== REAL API =====
    // 1) POST /api/columns  (CreateColumnRequest)
    // 2) ถ้า dataType === 'Lookup' ให้ POST /api/relationships  (CreateRelationshipRequest)
    // 3) PUT /api/columns/{id} อัปเดต lookupRelationshipId/lookupTargetColumnId (ถ้าหลังบ้านออกแบบให้ทำ 2 จังหวะ)
    // const created = await firstValueFrom(this.http.post<UiField>(`${this.base}/columns`, dto, this.auth()));
    // return created;
    return {} as any;
  }

  // ========= Rows =========
  async listRowsByTableId(tableId: number): Promise<UiRow[]> {
    if (this.USE_MOCK) {
      await new Promise(r => setTimeout(r, 200));
      return this._mockRows.filter(r => r.tableId === tableId);
    }

    // ===== REAL API =====
    // NOTE: สอดคล้องกับ GetRowsByTableIdHandler ในหลังบ้านคุณ
    // return await firstValueFrom(this.http.get<UiRow[]>(`${this.base}/rows/table/${tableId}`, this.auth()));
    return [];
  }
}
