// src/app/pages/table-view/table-view.ts
import {
  Component, inject, signal, OnInit, AfterViewInit, ViewChild, ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
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

  /** ความสูงรูปในคอลัมน์ IMAGE เมื่อ rowHeight = 80 */
  private readonly THUMB_H = 70;

  tableId = 0;
  columns = signal<ColumnDto[]>([]);
  rows = signal<RowDto[]>([]);

  fieldOpen = signal(false);
  rowOpen = signal(false);
  editingRow: RowDto | null = null;

  rowInitData: Record<string, any> | null = null;

  @ViewChild('tabGrid', { static: true }) tabGridEl!: ElementRef<HTMLDivElement>;
  private grid!: any;

  @ViewChild(FieldDialog) fieldDialog!: FieldDialog;

  private viewReady = false;
  private lastHasImageCol = false;
  private lastColSig = ''; // ลายเซ็น schema คอลัมน์ (ไว้ตรวจว่าเปลี่ยนไหม)

  async ngOnInit() {
    this.tableId = Number(this.route.snapshot.paramMap.get('id'));
    await this.refresh();
  }

  ngAfterViewInit() {
    this.viewReady = true;
    this.ensureGridAndSync();
  }

  // ---------------- data ops ----------------
  private hasImageColumn(): boolean {
    return this.columns().some(c => (c.dataType || '').toUpperCase() === 'IMAGE');
  }

  private colSignature(): string {
    return this.columns()
      .map(c => `${c.name}:${(c.dataType || '').toUpperCase()}:${c.isPrimary ? 1 : 0}`)
      .join('|');
  }

  async refresh() {
    const cols = await firstValueFrom(this.api.listColumns(this.tableId));
    this.columns.set(cols);

    const list = await firstValueFrom(this.api.listRows(this.tableId));
    this.rows.set(list);

    this.ensureGridAndSync();
  }

  parseData(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  setCell(r: RowDto, c: ColumnDto, val: any) {
    const obj = this.parseData(r.data);
    obj[c.name] = val === '__NULL__' ? null : val;
    r.data = JSON.stringify(obj);
  }

  // ---------- Field ----------
  onAddField() { this.fieldOpen.set(true); }

  async onSaveField(model: any) {
    this.fieldOpen.set(false);
    await firstValueFrom(this.api.createColumn(this.tableId, model));
    await this.refresh();
    try { this.fieldDialog?.resetForm(); } catch {}
  }

  async onDeleteField(c: ColumnDto) {
    if (!confirm(`Delete field "${c.name}"?`)) return;
    await firstValueFrom(this.api.deleteColumn(c.columnId));
    await this.refresh();
  }
  onEditField(_c: ColumnDto) {}

  // ---------- Row ----------
  onAddRow() {
    this.editingRow = null;
    if ((this.columns()?.length ?? 0) === 0) {
      alert('Please add at least 1 field before adding a row.');
      return;
    }
    const pk = this.columns().find(c => c.isPrimary)?.name;
    if (pk) {
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
    this.rowInitData = null;
    if (this.editingRow) {
      await firstValueFrom(this.api.updateRow(this.editingRow.rowId, newObj));
    } else {
      await firstValueFrom(this.api.createRow(this.tableId, newObj));
    }
    await this.refresh();
  }

  async onDeleteRow(r: RowDto) {
    if (!confirm('Delete this row?')) return;
    await firstValueFrom(this.api.deleteRow(r.rowId));
    await this.refresh();
  }

  private async saveRowByRecord(record: any) {
    const rowId = record.__rowId as number;
    const payload: Record<string, any> = {};
    for (const c of this.columns()) payload[c.name] = record[c.name];
    await firstValueFrom(this.api.updateRow(rowId, payload));
    await this.refresh();
  }

  private async deleteRowByRecord(record: any) {
    const rowId = record.__rowId as number;
    if (!confirm('Delete this row?')) return;
    await firstValueFrom(this.api.deleteRow(rowId));
    await this.refresh();
  }

  onImagePicked(r: RowDto, c: ColumnDto, file: File) {
    this.api
      .uploadImage(file, { tableId: this.tableId, rowId: r.rowId, columnId: c.columnId })
      .then(url => {
        this.setCell(r, c, url);
        this.ensureGridAndSync();
      })
      .catch(err => console.error('upload failed', err));
  }
  onImageCleared(r: RowDto, c: ColumnDto) {
    this.setCell(r, c, '__NULL__');
    this.ensureGridAndSync();
  }

  // =====================================================
  //                 TABULATOR CONFIG
  // =====================================================
  private buildColumnsForGrid(): any[] {
    const cols = this.columns();

    const defs: any[] = cols.map((c) => {
      const field = c.name;
      const base: any = {
        title: c.name,
        field,
        headerHozAlign: 'center',
        hozAlign: 'center',
        vertAlign: 'middle',
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
            cssClass: 'cell-image',
            formatter: (cell: any) => {
              const url = (cell.getValue() as string) || null;

              const wrap = document.createElement('div');
              wrap.className = 'img-wrap';
              wrap.style.cssText = `
                width:100%;
                height:${this.THUMB_H}px;
                display:flex;align-items:center;justify-content:center;
                overflow:hidden;border-radius:8px;
              `;

              if (url) {
                const img = document.createElement('img');
                img.src = url;
                img.style.cssText = `
                  height:100%; width:auto; max-width:100%;
                  object-fit:cover; display:block; border-radius:8px;
                `;
                wrap.appendChild(img);
              } else {
                const ph = document.createElement('div');
                ph.style.cssText = `
                  width:55%; height:${this.THUMB_H - 10}px;
                  border:2px dashed rgba(0,0,0,.2); border-radius:10px;
                  background: repeating-linear-gradient(
                    45deg, rgba(0,0,0,.04), rgba(0,0,0,.04) 6px, transparent 6px, transparent 12px
                  );
                `;
                wrap.appendChild(ph);
              }
              return wrap;
            },
            cellClick: (_e: any, cell: any) => {
              const fileInput = document.createElement('input');
              fileInput.type = 'file';
              fileInput.accept = 'image/*';
              fileInput.onchange = () => {
                const file = fileInput.files?.[0];
                if (!file) return;
                const data = cell.getRow().getData() as any;
                const row = this.rows().find((r) => r.rowId === data.__rowId)!;
                const col = cols.find((x) => x.name === cell.getField())!;
                this.onImagePicked(row, col, file);
              };
              fileInput.click();
            },
          };

        default:
          return { ...base, editor: c.isPrimary ? false : 'input' };
      }
    });

    // Actions
    defs.push({
      title: 'Actions',
      field: '__actions',
      width: 160,
      headerHozAlign: 'center',
      hozAlign: 'center',
      vertAlign: 'middle',
      widthGrow: 0,
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
        if (action === 'save') await this.saveRowByRecord(record);
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
    const hasImageCol = this.hasImageColumn();
    this.lastHasImageCol = hasImageCol;
    this.lastColSig = this.colSignature();

    const baseRowHeight = hasImageCol ? 80 : 44;

    this.grid = new Tabulator(this.tabGridEl.nativeElement, {
      data: [],
      columns: this.buildColumnsForGrid(), // ส่ง columns ตอนสร้างเสมอ
      layout: 'fitColumns',
      rowHeight: baseRowHeight,
      variableHeight: false,
      resizableRows: true,
      height: '100%',
      reactiveData: false,
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

  /** สร้าง/รีบิลด์กริดตาม schema ปัจจุบัน แล้วอัปเดตเฉพาะ data */
  private ensureGridAndSync() {
    if (!this.viewReady) return;

    const sig = this.colSignature();
    const needImageMode = this.hasImageColumn();

    let recreated = false;
    if (!this.grid) {
      this.buildTabulator();
      recreated = true;
    } else if (needImageMode !== this.lastHasImageCol || sig !== this.lastColSig) {
      try { this.grid.destroy(); } catch {}
      this.buildTabulator();
      recreated = true;
    }

    const data = this.buildDataForGrid();

    // ไม่เรียก setColumns อีก เพื่อเลี่ยง headersElement=null
    if (recreated) {
      setTimeout(() => {
        this.grid.setData(data);
        try { this.grid.redraw(true); } catch {}
      }, 0);
    } else {
      this.grid.setData(data);
      try { this.grid.redraw(true); } catch {}
    }
  }
}
