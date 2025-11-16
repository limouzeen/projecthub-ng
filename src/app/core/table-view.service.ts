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

export interface RowDto {
  rowId: number;
  data: string | null;
    [key: string]: any;  
}



// src/app/core/table-view.service.ts
export type FieldDialogModel = {
  name: string;
  dataType: 'TEXT'|'STRING'|'IMAGE'|'INTEGER'|'REAL'|'BOOLEAN'|'LOOKUP'|'FORMULA'|'DATE';
  isNullable: boolean;
  isPrimary: boolean;

 
  targetTableId: number | null;
  targetColumnId: number | null;

 
  

  formulaDefinition: string | null;
};

export type ColumnListItem = { columnId: number; name: string };

export type TableListItem  = { tableId: number; name: string };

@Injectable({ providedIn: 'root' })
export class TableViewService {
  private readonly base = '/api';
  constructor(@Optional() private http: HttpClient) {}

  private mapRow(r: any): RowDto {
  const rowId = r.rowId ?? r.Row_id;
  const data  = r.data  ?? r.Data ?? null;

  // ดึงส่วนที่เหลือ (รวม alias ที่ backend JOIN มาให้ เช่น Product, CustomerName ฯลฯ)
  const { rowId: _, Row_id, data: __, Data, ...rest } = r;

  return {
    rowId,
    data,
    ...rest,  //พก field อื่น ๆ มาด้วย เช่น Product, PriceName ฯลฯ
  };
}


  // ---------- Columns ----------
  listColumns(tableId: number): Observable<ColumnDto[]> {
  return this.http.get<any[]>(`${this.base}/columns/table/${tableId}`).pipe(
    map(cols =>
      (cols ?? []).map((c: any) => ({
        columnId:      c.columnId      ?? c.column_id      ?? c.ColumnId,
        tableId:       c.tableId       ?? c.table_id       ?? c.TableId,
        name:          c.name          ?? c.Name,
        dataType:      c.dataType      ?? c.data_type      ?? c.DataType,
        isPrimary:     c.isPrimary     ?? c.is_primary     ?? c.Is_primary ?? false,
        isNullable:    c.isNullable    ?? c.is_nullable    ?? c.Is_nullable ?? true,
        targetTableId: c.targetTableId ?? c.target_table_id ?? c.TargetTableId ?? null,
        targetColumnId:c.targetColumnId?? c.target_column_id?? c.TargetColumnId ?? null,
        formulaDefinition: c.formulaDefinition ?? c.FormulaDefinition ?? null,
        primaryKeyType:    c.primaryKeyType    ?? c.PrimaryKeyType    ?? null,
      }))
    )
  );
}

    /** บอกว่าเป็น Auto-increment ไหม (ดูจากคอลัมน์ Primary) */
  getPrimary(tableId: number) {
  return this.http.get<any | null>(`${this.base}/columns/table/${tableId}/primary`).pipe(
    map(c =>
      !c
        ? null
        : ({
            columnId:   c.columnId   ?? c.column_id   ?? c.ColumnId,
            tableId:    c.tableId    ?? c.table_id    ?? c.TableId,
            name:       c.name       ?? c.Name,
            dataType:   c.dataType   ?? c.data_type   ?? c.DataType,
            isPrimary:  c.isPrimary  ?? c.is_primary  ?? c.Is_primary ?? false,
            isNullable: c.isNullable ?? c.is_nullable ?? c.Is_nullable ?? true,
            primaryKeyType: c.primaryKeyType ?? c.PrimaryKeyType ?? null,
          } as ColumnDto)
    )
  );
}


// createColumn(tableId: number, dto: Partial<FieldDialogModel | ColumnDto>): Observable<ColumnDto> {
//   const rawType = (((dto as any).dataType ?? 'TEXT') as string).trim().toUpperCase();
//   const dataType = rawType === 'STRING' ? 'TEXT' : rawType;
//   const isLookup = dataType === 'LOOKUP';

//   const payload: any = {
//     tableId,
//     name: (dto as any).name,
//     dataType,
//     isNullable: (dto as any).isNullable ?? true,
//     isPrimary: !!(dto as any).isPrimary,
//     formulaDefinition: (dto as any).formulaDefinition ?? null,

//     // ใช้ column ปลายทางเหมือนเดิม
//     lookupTargetColumnId: isLookup ? (dto as any).targetColumnId ?? null : null,

//     lookupRelationshipId: null,

//     newRelationship: isLookup
//       ? {
//           primaryTableId:  (dto as any).targetTableId,              // ตารางปลายทาง
//           primaryColumnId: (dto as any).targetColumnId,             // PK ปลายทาง
//           foreignTableId:  tableId,                                 // ตารางปัจจุบัน
//           //  column ในตารางปัจจุบันที่เก็บค่า FK (ต้องมาจาก dialog)
//           foreignColumnId:  null,
//         }
//       : null,
//   };

//   return this.http.post<ColumnDto>(`${this.base}/columns`, payload);
// }

createColumn(tableId: number, dto: Partial<FieldDialogModel | ColumnDto>): Observable<ColumnDto> {
  const rawType = (((dto as any).dataType ?? 'TEXT') as string).trim().toUpperCase();
  const dataType = rawType === 'STRING' ? 'TEXT' : rawType;
  const isLookup = dataType === 'LOOKUP';

  const payload: any = {
    tableId,
    name: (dto as any).name,
    dataType,
    isNullable: (dto as any).isNullable ?? true,
    isPrimary: !!(dto as any).isPrimary,
    formulaDefinition: (dto as any).formulaDefinition ?? null,

    // column ของ "ตารางปลายทาง" ที่ใช้เป็น display (เช่น Price)
    lookupTargetColumnId: isLookup ? (dto as any).targetColumnId ?? null : null,

    // ตอนนี้ยังไม่ใช้ reuse relationship เดิม เลยส่ง null ไปก่อน
    lookupRelationshipId: null,

    // ข้อมูลคร่าว ๆ เพื่อบอก "ตารางปลายทาง" ให้ backend รู้
    // backend จะ "หา PK เอง" ไม่ใช้ PrimaryColumnId ที่ส่งมา
    newRelationship: isLookup
      ? {
          primaryTableId:  (dto as any).targetTableId,   // ตารางปลายทาง (เช่น Price / Table 14)
          primaryColumnId: (dto as any).targetColumnId,  // ส่งไปให้ครบตาม contract แต่ backend จะ override
          foreignTableId:  tableId,                      // ตารางปัจจุบัน (เช่น Ji / Table 27)
          foreignColumnId: null                          // backend เติมให้ = Column_id ของ LKUP
        }
      : null,
  };

  return this.http.post<ColumnDto>(`${this.base}/columns`, payload);
}

  updateColumn(col: ColumnDto, newName: string): Observable<ColumnDto> {
  const body = {
    // API รับชื่อว่า ColumnName, DataType, IsPrimary, IsNullable
    // ชื่อ key เป็นตัวเล็ก/ใหญ่ไม่ซีเรียส เพราะ backend ใช้ case-insensitive
    columnName: newName,
    dataType: col.dataType,
    isPrimary: col.isPrimary,
    isNullable: col.isNullable,
  };

  return this.http.put<ColumnDto>(`${this.base}/columns/${col.columnId}`, body);
}

  deleteColumn(columnId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/columns/${columnId}`);
  }

  // ---------- Rows ----------
  listRows(tableId: number): Observable<RowDto[]> {
  return this.http.get<any[]>(`${this.base}/rows/table/${tableId}`).pipe(
    map(rows => rows.map(r => this.mapRow(r)))
  );
}



  /** POST /api/rows */
createRow(tableId: number, data: Record<string, any>): Observable<RowDto> {
  const body = {
    tableId,                     // <- ชื่อเดียวกับ DTO
    data: JSON.stringify(data),  // <- แปลง object → string JSON
  };

  return this.http.post<any>(`${this.base}/rows`, body).pipe(
    map(r => this.mapRow(r))
  );
}

/** PUT /api/rows/{id} สำหรับแก้ทั้ง row */
updateRow(rowId: number, newData: Record<string, any>): Observable<RowDto> {
  const body = {
    newData: JSON.stringify(newData),   // backend ใช้ property ชื่อ NewData
  };

  return this.http.put<any>(`${this.base}/rows/${rowId}`, body).pipe(
    map(r => this.mapRow(r))
  );
}

/** PUT /api/rows/{id} สำหรับแก้ field เดียว (image / cell) */
updateRowField(rowId: number, field: string, value: any): Observable<RowDto> {
  const newData = { [field]: value };

  const body = {
    newData: JSON.stringify(newData),
  };

  return this.http.put<any>(`${this.base}/rows/${rowId}`, body).pipe(
    map(r => this.mapRow(r))
  );
}



  deleteRow(rowId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/rows/${rowId}`);
  }

  

  /** ใช้โชว์ next running id ของ PK 'ID' ถ้าอยากเด้งเลขในฟอร์ม */
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

 // ===== Tables (ใช้ใน FieldDialog – ต้องใส่ projectId) =====
  listTables(projectId: number) {
    return this.http.get<TableListItem[]>(`${this.base}/tables/project/${projectId}`);
  }


}
