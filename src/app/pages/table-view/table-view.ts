import { Component, inject, signal, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

// ใช้ ESM ของ Tabulator
import { TabulatorFull as Tabulator } from 'tabulator-tables/dist/js/tabulator_esm.js';

import { TableViewService, ColumnDto, RowDto } from './table-view.service';
import { FieldDialog } from './ui/field-dialog';
import { RowDialog } from './ui/row-dialog';

@Component({
  selector: 'app-table-view',
  standalone: true,
  imports: [CommonModule, FieldDialog, RowDialog],
  templateUrl: './table-view.html',
  styleUrl: './table-view.css',
})
export class TableView implements OnInit, AfterViewInit {
  private readonly api = inject(TableViewService);
  private readonly route = inject(ActivatedRoute);

  tableId = 0;

  columns = signal<ColumnDto[]>([]);
  rows = signal<RowDto[]>([]);
  fieldOpen = signal(false);
  rowOpen = signal(false);
  editingRow: RowDto | null = null;

  // ค่า seed สําหรับ RowDialog
  rowInitData: Record<string, any> | null = null;

    //ใช้เติมค่าเริ่มต้นเข้า RowDialog ตอนกด Add Row (เช่น PK auto)
  newRowSeed: Record<string, any> | null = null; 

    //หา column ที่เป็น Primary Key
  private getPkCol(): ColumnDto | null {
    return this.columns().find(c => !!c.isPrimary) ?? null;
  }

  placeholderImg =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nNjQnIGhlaWdodD0nNjQnIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHJlY3Qgd2lkdGg9JzY0JyBoZWlnaHQ9JzY0JyByeD0nOCcgZmlsbD0nI2YzZjRmNScvPjxwYXRoIGQ9J000OCA0NEgyMEwzMCAzMCAzNiAzNyA0MCAzMyA0OCA0NScgZmlsbD0nI2M2YzljYScvPjwvc3ZnPg==';

  @ViewChild('tabGrid', { static: true }) tabGridEl!: ElementRef<HTMLDivElement>;
  private grid!: any;
  
  @ViewChild(FieldDialog) fieldDialog!: FieldDialog;

  async ngOnInit() {
    this.tableId = Number(this.route.snapshot.paramMap.get('id'));
    await this.refresh();
  }

  ngAfterViewInit() {
    this.buildTabulator();
    this.syncDataToGrid();
  }

  async refresh() {
    // ================================
    // MOCK ONLY: ใช้ service mock ฝั่ง FE
    // TODO(REAL API): เรียก GET /api/rows/table/{tableId}
    // ================================
    this.columns.set(await firstValueFrom(this.api.listColumns(this.tableId)));
    this.rows.set(await firstValueFrom(this.api.listRows(this.tableId)));
    this.syncDataToGrid();
  }

  parseData(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  setCell(r: RowDto, c: ColumnDto, val: any) {
    const obj = this.parseData(r.data);
    obj[c.name] = (val === '__NULL__') ? null : val;
    r.data = JSON.stringify(obj);
  }

  // ---------- Field ----------
  onAddField() { this.fieldOpen.set(true); }
  async onSaveField(model: any) {
    // ================================
    // MOCK ONLY
    // TODO(REAL API): POST /api/columns
    // ================================
    this.fieldOpen.set(false);
    await firstValueFrom(this.api.createColumn(this.tableId, model));
    await this.refresh();

     // รีเซ็ตฟอร์มจากพาเรนต์ด้วย (เผื่อเคส state ค้าง)
    try { this.fieldDialog?.resetForm(); } catch {}
  }
  async onDeleteField(c: ColumnDto) {
    // ================================
    // MOCK ONLY
    // TODO(REAL API): DELETE /api/columns/{id}
    // ================================
    if (!confirm(`Delete field "${c.name}"?`)) return;
    await firstValueFrom(this.api.deleteColumn(c.columnId));
    await this.refresh();
  }
  onEditField(_c: ColumnDto) {}

  // ---------- Row ----------
onAddRow() {
  this.editingRow = null;

  // ⛔ ถ้ายังไม่มีคอลัมน์เลย ให้บังคับผู้ใช้สร้าง Field ก่อน
  if ((this.columns()?.length ?? 0) === 0) {
    alert('Please add at least 1 field before adding a row.');
    return;
  }


  const pk = this.columns().find(c => c.isPrimary)?.name;
  if (pk) {
    //ขอเลขรันถัดไปจาก service แล้ว seed ให้ dialog
    firstValueFrom(this.api.nextRunningId(this.tableId, pk)).then(next => {
      this.rowInitData = { [pk]: next };
      this.rowOpen.set(true);
    });
  } else {
    this.rowInitData = null;
    this.rowOpen.set(true);
  }
}




  async onSaveRow(newObj: Record<string, any>) {
  this.rowOpen.set(false);
  this.rowInitData = null;              //เคลียร์ seed

  if (this.editingRow) {
    await firstValueFrom(this.api.updateRow(this.editingRow.rowId, newObj));
  } else {
    await firstValueFrom(this.api.createRow(this.tableId, newObj));
  }
  await this.refresh();
}



  async onDeleteRow(r: RowDto) {
    if (!confirm('Delete this row?')) return;
    // TODO(REAL API): DELETE /api/rows/{id}
    await firstValueFrom(this.api.deleteRow(r.rowId));
    await this.refresh();
  }
  

  private async saveRowByRecord(record: any) {
    const rowId = record.__rowId as number;
    const row = this.rows().find(r => r.rowId === rowId);
    if (!row) return;

    const cols = this.columns();
    const payload: Record<string, any> = {};
    for (const c of cols) payload[c.name] = record[c.name];

    // ================================
    // MOCK ONLY
    // TODO(REAL API): PUT /api/rows/{rowId}
    // ================================
    await firstValueFrom(this.api.updateRow(rowId, payload));
    await this.refresh();
  }

  private async deleteRowByRecord(record: any) {
    const rowId = record.__rowId as number;
    if (!confirm('Delete this row?')) return;

    // ================================
    // MOCK ONLY
    // TODO(REAL API): DELETE /api/rows/{rowId}
    // ================================
    await firstValueFrom(this.api.deleteRow(rowId));
    await this.refresh();
  }

  onImagePicked(r: RowDto, c: ColumnDto, file: File) {
    // ================================
    // MOCK ONLY (แปลงเป็น dataURL)
    // TODO(REAL API): อัปโหลด → ได้ URL แล้ว setCell
    // ================================
    this.api.uploadImage(file, { tableId: this.tableId, rowId: r.rowId, columnId: c.columnId })
      .then(url => { this.setCell(r, c, url); this.syncDataToGrid(); })
      .catch(err => console.error('upload failed', err));
  }
  onImageCleared(r: RowDto, c: ColumnDto) { this.setCell(r, c, '__NULL__'); this.syncDataToGrid(); }

  // =====================================================
  //                 TABULATOR CONFIG
  // =====================================================
  private buildColumnsForGrid(): any[] {
    const cols = this.columns();

    const defs: any[] = cols.map((c) => {
      const field = c.name;

      // ✅ จัดกลางเป็นค่าพื้นฐานที่คอลัมน์ (อย่า override ด้วย left/right)
      const base: any = {
        title: c.name,
        field,
        headerHozAlign: 'center',
        hozAlign: 'center',     // <— จัดกลาง
        vertAlign: 'middle',    // <— กลางแนวตั้ง
        resizable: true,
        editor: false,
      };

      switch ((c.dataType || '').toUpperCase()) {
        case 'INTEGER':
        case 'REAL':
          return { ...base, editor: c.isPrimary ? false : 'number' };

        case 'BOOLEAN':
          return { ...base, formatter: 'tickCross', editor: c.isPrimary ? false : 'tickCross' };

        case 'IMAGE':
  return {
    ...base,
    formatter: (cell: any) => {
      const url = cell.getValue() as string | null;
      const src = url || this.placeholderImg;
      // 👇 ใช้ height:100% + min-height เพื่อให้รูปยืดตามความสูงแถว
      return `
        <div style="
          display:grid;place-items:center;
          width:100%; height:100%;
          min-height:84px;            /* แถวเตี้ยสุดเท่านี้ เพื่อให้มีที่วางรูป */
        ">
          <img src="${src}" style="
            max-width:100%;
            max-height:100%;
            width:auto; height:auto;
            object-fit:cover;
            border-radius:8px;
            border:1px dashed rgba(0,0,0,.15);
          "/>
        </div>`;
    },
    cellClick: (_e: any, cell: any) => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.onchange = () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const data = cell.getRow().getData() as any;
        const row = this.rows().find(r => r.rowId === data.__rowId)!;
        const col = cols.find(x => x.name === cell.getField())!;
        this.onImagePicked(row, col, file);
      };
      fileInput.click();
    }
  };

        default:
          return { ...base, editor: c.isPrimary ? false : 'input' };
      }
    });

    // ✅ Actions (ไม่ frozen อีกต่อไป → จะไม่มีช่องว่าง/คอลัมน์ด้านหลัง)
    defs.push({
      title: 'Actions',
      
      field: '__actions',
      width: 160,
      headerHozAlign: 'center',
      hozAlign: 'center',
      vertAlign: 'middle',
      widthGrow: 0,          // ไม่ให้คอลัมน์นี้ยืด
      
      
      formatter: () => `
        <div style="display:flex;gap:8px;justify-content:center">
          <button data-action="save"   class="underline text-emerald-600">Save</button>
          <button data-action="delete" class="underline text-red-600">Delete</button>
        </div>
      `,
      cellClick: async (e: any, cell: any) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const record = cell.getRow().getData() as any;
        if (action === 'save')   await this.saveRowByRecord(record);
        if (action === 'delete') await this.deleteRowByRecord(record);
      },
      resizable: false,
    });

    return defs;
  }

  private buildDataForGrid(): any[] {
    const cols = this.columns();
    return this.rows().map(r => {
      const obj = this.parseData(r.data);
      const record: any = { __rowId: r.rowId };
      for (const c of cols) record[c.name] = obj?.[c.name] ?? null;
      return record;
    });
  }

  private buildTabulator() {
    this.grid = new Tabulator(this.tabGridEl.nativeElement, {
      data: [],
      columns: this.buildColumnsForGrid(),

      // layout: 'fitColumns',   // ยืดให้เต็มกว้าง → ไม่มีพื้นที่ว่างขวา
      layout: 'fitColumns',
      rowHeight: 200,        // ความสูงแถวตั้งต้น (ปรับได้ตามใจ)
      variableHeight: true,  // ให้แถว “โตตามเนื้อหา” ได้อัตโนมัติ
    

      height: '100%',
      resizableRows: true,
      reactiveData: false,

      // ✅ ค่าพื้นฐานให้ center ทั้งหมด
      columnDefaults: {
        hozAlign: 'center',
        vertAlign: 'middle',
        widthGrow: 1,
        resizable: true,
      },

      placeholder: 'No rows yet.',

      cellEdited: (cell: any) => {
        const field = cell.getField();
        const data = cell.getRow().getData() as any;
        const row = this.rows().find(r => r.rowId === data.__rowId);
        const col = this.columns().find(c => c.name === field);
        if (!row || !col) return;
        this.setCell(row, col, cell.getValue());
      },
    });
  }

  private syncDataToGrid() {
    if (!this.grid) return;
    this.grid.setColumns(this.buildColumnsForGrid());
    this.grid.replaceData(this.buildDataForGrid());
  }
}
