// src/app/core/table-view.service.ts
import { Injectable, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

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
  primaryKeyType?: string | null; // 'AUTO_INCREMENT' เมื่อเป็น auto
};

export type RowDto = {
  rowId: number;
  tableId: number;
  data: string;
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

export type ColumnListItem = { columnId: number; name: string };

export type TableListItem  = { tableId: number; name: string };

@Injectable({ providedIn: 'root' })
export class TableViewService {
  private readonly base = '/api';
  constructor(@Optional() private http: HttpClient) {}

  // ---------- Columns ----------
  listColumns(tableId: number): Observable<ColumnDto[]> {
    return this.http.get<ColumnDto[]>(`${this.base}/columns/table/${tableId}`);
  }

  getPrimary(tableId: number): Observable<ColumnDto | null> {
    return this.http.get<ColumnDto | null>(`${this.base}/columns/table/${tableId}/primary`);
  }

  createColumn(tableId: number, dto: Partial<FieldDialogModel | ColumnDto>): Observable<ColumnDto> {
    const payload: any = {
      tableId,
      name: (dto as any).name,
      dataType: ((dto as any).dataType ?? 'TEXT').toUpperCase(),
      isNullable: (dto as any).isNullable ?? true,
      isPrimary: !!(dto as any).isPrimary,
      targetTableId: (dto as any).targetTableId ?? null,
      targetColumnId: (dto as any).targetColumnId ?? null,
      formulaDefinition: (dto as any).formulaDefinition ?? null,
      // หากเป็น LOOKUP และหลังบ้านต้องการความสัมพันธ์ใหม่:
      newRelationship: (dto as any).dataType === 'LOOKUP'
        ? { sourceTableId: tableId, targetTableId: (dto as any).targetTableId, targetColumnId: (dto as any).targetColumnId }
        : null,
    };
    return this.http.post<ColumnDto>(`${this.base}/columns`, payload);
  }

  updateColumn(columnId: number, patch: Partial<ColumnDto>): Observable<ColumnDto> {
    if (patch.name) {
      return this.http.put<ColumnDto>(`${this.base}/columns/${columnId}`, { newName: patch.name });
    }
    return this.http.put<ColumnDto>(`${this.base}/columns/${columnId}`, patch);
  }

  deleteColumn(columnId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/columns/${columnId}`);
  }

  // ---------- Rows ----------
  listRows(tableId: number): Observable<RowDto[]> {
    return this.http.get<RowDto[]>(`${this.base}/rows/table/${tableId}`);
  }

  createRow(tableId: number, data: Record<string, any>): Observable<RowDto> {
    return this.http.post<RowDto>(`${this.base}/rows`, { tableId, data });
  }

  updateRow(rowId: number, newData: Record<string, any>): Observable<RowDto> {
    return this.http.put<RowDto>(`${this.base}/rows/${rowId}`, { newData });
  }

  deleteRow(rowId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/rows/${rowId}`);
  }

  updateRowField(rowId: number, field: string, value: any): Observable<RowDto> {
    return this.http.put<RowDto>(`${this.base}/rows/${rowId}`, { newData: { [field]: value } });
  }

  nextRunningId(tableId: number, pkName: string) {
    return this.listRows(tableId).pipe(
      map(rows => {
        let max = 0;
        for (const r of rows) {
          try {
            const obj = JSON.parse(r.data || '{}');
            const v = Number(obj[pkName]);
            if (!Number.isNaN(v)) max = Math.max(max, v);
          } catch {}
        }
        return max + 1;
      })
    );
  }

  // เพจจิ้ง (ใช้ได้ทันที; ถ้ามี endpoint เพจจิ้งจริงค่อยสลับไปเรียกของหลังบ้าน)
  listRowsPaged(tableId: number, page: number, size: number): Observable<{ rows: RowDto[]; total: number }> {
    return this.listRows(tableId).pipe(
      map(all => {
        const total = all.length;
        const start = Math.max(0, (page - 1) * size);
        return { rows: all.slice(start, start + size), total };
      })
    );
  }

  // ---------- Tables สำหรับ dropdown ใน FieldDialog ----------
  listTablesByProject(projectId: number): Observable<TableListItem[]> {
    return this.http.get<TableListItem[]>(`${this.base}/tables/project/${projectId}`);
  }

  // อัปโหลดรูป (ยังใช้ dataURL ไปก่อน)
  uploadImage(file: File): Promise<string> {
    return new Promise((resolve) => {
      const rd = new FileReader();
      rd.onload = () => resolve(rd.result as string);
      rd.readAsDataURL(file);
    });
  }

  // ภายในคลาส TableViewService
listColumnsLite(tableId: number): Observable<ColumnListItem[]> {
  return this.listColumns(tableId).pipe(
    map(cols => cols.map(c => ({ columnId: c.columnId, name: c.name })))
  );
}

// โหลดรายชื่อตาราง (กรณี generic ทั้งระบบ)
listTables(): Observable<TableListItem[]> {
  return this.http.get<TableListItem[]>(`${this.base}/tables`);
}



}
