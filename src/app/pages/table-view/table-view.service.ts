import { Injectable, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';

export type ColumnDto = {
  columnId: number;
  tableId: number;
  name: string;
  dataType: string;
  isPrimary: boolean;
  isNullable: boolean;
};

export type RowDto = {
  rowId: number;
  tableId: number;
  data: string;   // JSON string
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
  // private readonly base = '/api';
  // constructor(@Optional() private http: HttpClient) {}

  // ---------------- MOCK ----------------
  private MOCK_TABLES: TableListItem[] = [
    { tableId: 101, name: 'Products' },
    { tableId: 102, name: 'Orders'   },
  ];

  private MOCK_COLUMNS: Record<number, ColumnDto[]> = {
    101: [
      { columnId: 1, tableId: 101, name: 'ProductId', dataType: 'INTEGER', isPrimary: true,  isNullable: false },
      { columnId: 2, tableId: 101, name: 'Name',      dataType: 'TEXT',    isPrimary: false, isNullable: false },
      { columnId: 3, tableId: 101, name: 'Image',     dataType: 'IMAGE',   isPrimary: false, isNullable: true  },
      { columnId: 4, tableId: 101, name: 'Price',     dataType: 'REAL',    isPrimary: false, isNullable: false },
    ],
    102: [
      { columnId: 5, tableId: 102, name: 'OrderId',   dataType: 'INTEGER', isPrimary: true,  isNullable: false },
      { columnId: 6, tableId: 102, name: 'ProductId', dataType: 'INTEGER', isPrimary: false, isNullable: false },
      { columnId: 7, tableId: 102, name: 'Qty',       dataType: 'REAL',    isPrimary: false, isNullable: false },
    ],
  };

  private MOCK_ROWS: Record<number, RowDto[]> = {
    101: [
      { rowId: 11, tableId: 101, data: JSON.stringify({ ProductId: 1, Name: 'Pen',  Image: '', Price: 10 }), createdAt: new Date().toISOString() },
      { rowId: 12, tableId: 101, data: JSON.stringify({ ProductId: 2, Name: 'Book', Image: '', Price: 50 }), createdAt: new Date().toISOString() },
    ],
    102: [
      { rowId: 21, tableId: 102, data: JSON.stringify({ OrderId: 9001, ProductId: 1, Qty: 2 }), createdAt: new Date().toISOString() },
    ],
  };
  // --------------------------------------

  listTables(): Observable<TableListItem[]> {
    return of(this.MOCK_TABLES).pipe(delay(100));
  }

  listColumnsLite(tableId: number): Observable<ColumnListItem[]> {
    const items = (this.MOCK_COLUMNS[tableId] ?? []).map(c => ({ columnId: c.columnId, name: c.name }));
    return of(items).pipe(delay(100));
  }

  listColumns(tableId: number): Observable<ColumnDto[]> {
    return of(this.MOCK_COLUMNS[tableId] ?? []).pipe(delay(100));
  }

  createColumn(tableId: number, dto: Partial<ColumnDto>): Observable<ColumnDto> {
    const col: ColumnDto = {
      columnId: Math.floor(Math.random() * 1e6),
      tableId,
      name: dto.name ?? 'NewField',
      dataType: (dto.dataType ?? 'TEXT').toUpperCase(),
      isPrimary: dto.isPrimary ?? false,
      isNullable: dto.isNullable ?? true,
    };
    this.MOCK_COLUMNS[tableId] = [...(this.MOCK_COLUMNS[tableId] ?? []), col];
    return of(col).pipe(delay(120));
  }

  updateColumn(columnId: number, patch: Partial<ColumnDto>): Observable<ColumnDto> {
    for (const tableId in this.MOCK_COLUMNS) {
      const cols = this.MOCK_COLUMNS[tableId];
      const i = cols.findIndex(c => c.columnId === columnId);
      if (i >= 0) {
        cols[i] = { ...cols[i], ...patch };
        return of(cols[i]).pipe(delay(120));
      }
    }
    return of(null as any).pipe(delay(120));
  }

  deleteColumn(columnId: number): Observable<void> {
    for (const tableId in this.MOCK_COLUMNS) {
      this.MOCK_COLUMNS[tableId] = this.MOCK_COLUMNS[tableId].filter(c => c.columnId !== columnId);
    }
    return of(void 0).pipe(delay(120));
  }

  // ---------- Rows ----------
  listRows(tableId: number): Observable<RowDto[]> {
    return of(this.MOCK_ROWS[tableId] ?? []).pipe(delay(120));
  }

  createRow(tableId: number, data: Record<string, any>): Observable<RowDto> {
    const row: RowDto = {
      rowId: Math.floor(Math.random() * 1e9),
      tableId,
      data: JSON.stringify(data),
      createdAt: new Date().toISOString(),
    };
    this.MOCK_ROWS[tableId] = [...(this.MOCK_ROWS[tableId] ?? []), row];
    return of(row).pipe(delay(120));
  }

  updateRow(rowId: number, data: Record<string, any>): Observable<RowDto> {
    for (const tableId in this.MOCK_ROWS) {
      const list = this.MOCK_ROWS[tableId];
      const idx = list.findIndex(r => r.rowId === rowId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], data: JSON.stringify(data) };
        return of(list[idx]).pipe(delay(120));
      }
    }
    return of(null as any).pipe(delay(120));
  }

  /** ✅ อัปเดต ‘ฟิลด์เดียว’ ของแถว — ใช้กับอัปโหลดรูป */
  updateRowField(rowId: number, field: string, value: any): Observable<RowDto> {
    for (const tableId in this.MOCK_ROWS) {
      const list = this.MOCK_ROWS[tableId];
      const idx = list.findIndex(r => r.rowId === rowId);
      if (idx >= 0) {
        const obj = JSON.parse(list[idx].data || '{}');
        obj[field] = value;
        list[idx] = { ...list[idx], data: JSON.stringify(obj) };
        return of(list[idx]).pipe(delay(100));
      }
    }
    return of(null as any).pipe(delay(100));
  }

  deleteRow(rowId: number): Observable<void> {
    for (const tableId in this.MOCK_ROWS) {
      this.MOCK_ROWS[tableId] = this.MOCK_ROWS[tableId].filter(r => r.rowId !== rowId);
    }
    return of(void 0).pipe(delay(100));
  }

  nextRunningId(tableId: number, pkName: string): Observable<number> {
    const rows = this.MOCK_ROWS[tableId] ?? [];
    let max = 0;
    for (const r of rows) {
      const obj = JSON.parse(r.data || '{}');
      const v = Number(obj[pkName]);
      if (!Number.isNaN(v)) max = Math.max(max, v);
    }
    return of(max + 1).pipe(delay(60));
  }

  // ------- Upload (mock: DataURL) -------
  uploadImage(file: File, meta?: { tableId?: number; rowId?: number; columnId?: number }): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const fakeUrl = reader.result as string;
        setTimeout(() => resolve(fakeUrl), 500);
      };
      reader.readAsDataURL(file);
    });
  }

  // ------- Remote paging -------
  listRowsPaged(
    tableId: number,
    page: number,    // 1-based
    size: number
  ): Observable<{ rows: RowDto[]; total: number }> {
    const all = this.MOCK_ROWS[tableId] ?? [];
    const total = all.length;
    const start = (page - 1) * size;
    const rows  = all.slice(start, start + size);
    return of({ rows, total }).pipe(delay(120));

  }


}
