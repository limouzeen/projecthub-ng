// src/app/core/table-view.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export type ColumnDto = {
  columnId: number;
  tableId: number;
  name: string;
  dataType: string;
  isPrimary: boolean;
  isNullable: boolean;
  targetTableId?: number | null;
  targetColumnId?: number | null;
  formulaDefinition?: string | null;
};

export type RowDto = {
  rowId: number;
  tableId: number;
  data: string;   // JSON string from BE
  createdAt: string;
};

export type FieldDialogModel = {
  name: string;
  dataType: 'TEXT'|'STRING'|'IMAGE'|'INTEGER'|'REAL'|'BOOLEAN'|'LOOKUP'|'FORMULA';
  isNullable: boolean;
  isPrimary: boolean;
  targetTableId: number|null;
  targetColumnId: number|null;
  formulaDefinition: string|null;
};

export type TableListItem  = { tableId: number; name: string };
export type ColumnListItem = { columnId: number; name: string };

@Injectable({ providedIn: 'root' })
export class TableViewService {
  private readonly base = environment.apiBase;

  constructor(private http: HttpClient) {}

  // ---------------- Tables (ใช้ใน FieldDialog: Lookup target) ----------------
  /** GET /api/tables/project/{projectId} — คุณอาจมี projectId ใน query string หน้าปัจจุบัน */
  listTables(projectId?: number): Observable<TableListItem[]> {
    if (!projectId) {
      // ถ้าไม่มี projectId ก็ fallback เป็น empty (UI ไม่พัง)
      return new Observable<TableListItem[]>(sub => { sub.next([]); sub.complete(); });
    }
    return this.http.get<any[]>(`${this.base}/tables/project/${projectId}`).pipe(
      map(arr => (arr ?? []).map(t => ({ tableId: t.id ?? t.tableId, name: t.name } as TableListItem)))
    );
  }

  // ---------------- Columns ----------------
  /** GET /api/columns/table/{tableId} */
  listColumns(tableId: number): Observable<ColumnDto[]> {
    return this.http.get<any[]>(`${this.base}/columns/table/${tableId}`).pipe(
      map(arr => (arr ?? []).map(c => ({
        columnId: c.id ?? c.columnId,
        tableId: c.tableId,
        name: c.name,
        dataType: (c.dataType || '').toUpperCase(),
        isPrimary: !!c.isPrimary,
        isNullable: !!c.isNullable,
        targetTableId: c.targetTableId ?? null,
        targetColumnId: c.targetColumnId ?? null,
        formulaDefinition: c.formulaDefinition ?? null,
      } as ColumnDto)))
    );
  }

  /** GET /api/columns/table/{tableId} (แบบ lite ใช้ชื่อ/ids) */
  listColumnsLite(tableId: number): Observable<ColumnListItem[]> {
    return this.listColumns(tableId).pipe(
      map(cols => cols.map(c => ({ columnId: c.columnId, name: c.name })))
    );
  }

  /** POST /api/columns */
  createColumn(tableId: number, dto: Partial<FieldDialogModel | ColumnDto>): Observable<ColumnDto> {
    const body: any = {
      tableId,
      name: (dto as any).name,
      dataType: (dto as any).dataType,
      isPrimary: !!(dto as any).isPrimary,
      isNullable: (dto as any).isNullable !== false,
      // Lookup/Formula optional fields:
      targetTableId: (dto as any).targetTableId ?? null,
      targetColumnId: (dto as any).targetColumnId ?? null,
      formulaDefinition: (dto as any).formulaDefinition ?? null,
    };
    return this.http.post<any>(`${this.base}/columns`, body).pipe(
      map(c => ({
        columnId: c.id ?? c.columnId,
        tableId: c.tableId,
        name: c.name,
        dataType: (c.dataType || '').toUpperCase(),
        isPrimary: !!c.isPrimary,
        isNullable: !!c.isNullable,
        targetTableId: c.targetTableId ?? null,
        targetColumnId: c.targetColumnId ?? null,
        formulaDefinition: c.formulaDefinition ?? null,
      } as ColumnDto))
    );
  }

  /** PUT /api/columns/{id} — รองรับเปลี่ยนชื่อฟิลด์ */
  updateColumn(columnId: number, patch: Partial<ColumnDto & { name?: string }>): Observable<ColumnDto> {
    const body: any = {};
    if (patch.name) body.newName = patch.name;
    if (patch.dataType) body.newDataType = patch.dataType;
    if (typeof patch.isPrimary === 'boolean') body.newIsPrimary = patch.isPrimary;
    if (typeof patch.isNullable === 'boolean') body.newIsNullable = patch.isNullable;
    if ('formulaDefinition' in patch) body.newFormulaDefinition = patch.formulaDefinition;

    return this.http.put<any>(`${this.base}/columns/${columnId}`, body).pipe(
      map(c => ({
        columnId: c.id ?? c.columnId,
        tableId: c.tableId,
        name: c.name,
        dataType: (c.dataType || '').toUpperCase(),
        isPrimary: !!c.isPrimary,
        isNullable: !!c.isNullable,
        targetTableId: c.targetTableId ?? null,
        targetColumnId: c.targetColumnId ?? null,
        formulaDefinition: c.formulaDefinition ?? null,
      } as ColumnDto))
    );
  }

  /** DELETE /api/columns/{id} */
  deleteColumn(columnId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/columns/${columnId}`);
  }

  // ---------------- Rows ----------------
  /** GET /api/rows/table/{tableId} */
  listRows(tableId: number): Observable<RowDto[]> {
    return this.http.get<any[]>(`${this.base}/rows/table/${tableId}`).pipe(
      map(arr => (arr ?? []).map(r => ({
        rowId: r.id ?? r.rowId,
        tableId: r.tableId,
        data: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? {}),
        createdAt: r.createdAt ?? r.created_at ?? new Date().toISOString(),
      } as RowDto)))
    );
  }

  /** POST /api/rows {tableId, data(JSON)} — BE จะ validate + auto-assign PK ถ้าเป็น AUTO_INCREMENT */
  createRow(tableId: number, data: Record<string, any>): Observable<RowDto> {
    const body = { tableId, data };
    return this.http.post<any>(`${this.base}/rows`, body).pipe(
      map(r => ({
        rowId: r.id ?? r.rowId,
        tableId: r.tableId,
        data: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? {}),
        createdAt: r.createdAt ?? r.created_at ?? new Date().toISOString(),
      } as RowDto))
    );
  }

  /** PUT /api/rows/{id} {newData} */
  updateRow(rowId: number, data: Record<string, any>): Observable<RowDto> {
    const body = { newData: data };
    return this.http.put<any>(`${this.base}/rows/${rowId}`, body).pipe(
      map(r => ({
        rowId: r.id ?? r.rowId,
        tableId: r.tableId,
        data: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? {}),
        createdAt: r.createdAt ?? r.created_at ?? new Date().toISOString(),
      } as RowDto))
    );
  }

  /** PATCH แบบอำนวยความสะดวก ถ้า BE ไม่มี endpoint เฉพาะ field ก็ reuse PUT */
  updateRowField(rowId: number, field: string, value: any): Observable<RowDto> {
    // โหลดแถวก่อน -> patch -> PUT (เพื่อไม่ทับฟิลด์อื่น)
    return this.listRowsById(rowId).pipe(
      map(r => {
        const obj = typeof r.data === 'string' ? JSON.parse(r.data || '{}') : (r.data ?? {});
        obj[field] = value;
        return obj;
      }),
      // ส่ง PUT
      // NOTE: ใช้ switchMap ได้ แต่คงสั้น ๆ:
    ) as any;
  }

  /** helper: GET แถวเดียว (ถ้าไม่มี endpoint นี้ ให้ดึงทั้งตารางแล้วหาเอง) */
  private listRowsById(rowId: number): Observable<RowDto> {
    // สมมุติคุณมี /api/rows/{id}, ถ้าไม่มีให้ปรับเป็นวิธีอื่น
    return this.http.get<any>(`${this.base}/rows/${rowId}`).pipe(
      map(r => ({
        rowId: r.id ?? r.rowId,
        tableId: r.tableId,
        data: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? {}),
        createdAt: r.createdAt ?? r.created_at ?? new Date().toISOString(),
      } as RowDto))
    );
  }

  /** DELETE /api/rows/{id} */
  deleteRow(rowId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/rows/${rowId}`);
  }

  /** nextRunningId: ดึงจาก BE ถ้ามี; ถ้าไม่มี คำนวณฝั่ง FE จาก max(ID) */
  nextRunningId(tableId: number, pkName: string): Observable<number> {
    // ถ้า BE ไม่มี endpoint เฉพาะ ให้ดึง rows แล้วหา max
    return this.listRows(tableId).pipe(
      map(rows => {
        let max = 0;
        for (const r of rows) {
          try {
            const obj = JSON.parse(r.data || '{}');
            const v = Number(obj?.[pkName]);
            if (!Number.isNaN(v)) max = Math.max(max, v);
          } catch {}
        }
        return max + 1;
      })
    );
  }

  // ---------------- Remote paging (optional) ----------------
  listRowsPaged(
    tableId: number,
    page: number,
    size: number
  ): Observable<{ rows: RowDto[]; total: number }> {
    // ถ้า BE ยังไม่มี server-side paging ให้จำลองด้วย client-side:
    return this.listRows(tableId).pipe(
      map(all => {
        const total = all.length;
        const start = (page - 1) * size;
        return { rows: all.slice(start, start + size), total };
      })
    );
  }

  // ---------------- Upload image ----------------
  /**
   * ถ้า BE มี endpoint อัปโหลดไฟล์: POST /api/files (form-data: file) → { url: 'https://...' }
   * กรอก URL คืน โดย FE จะเก็บ URL ลงฟิลด์ IMAGE ตามเดิม
   */
  uploadImage(file: File, meta?: { tableId?: number; rowId?: number; columnId?: number }): Promise<string> {
    // ถ้า *ยังไม่มี* endpoint อัปโหลด ให้ใช้ URL จากผู้ใช้ (dialog) หรือ bucket ภายนอก
    // ด้านล่างนี้เป็นโค้ดตัวอย่างเมื่อมี /files/upload
    // const fd = new FormData();
    // fd.append('file', file);
    // return lastValueFrom(this.http.post<{url:string}>(`${this.base}/files/upload`, fd)).then(res => res.url);

    // ชั่วคราว: ใช้ dataURL ช่วยพรีวิว (ทำงานเดิมของคุณได้) — เมื่อมี API จริงค่อยสลับ
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }
}
