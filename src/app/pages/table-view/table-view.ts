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
  //สลับโหมด
  private static readonly USE_REMOTE = false; // true = remote, false = local

  private readonly api = inject(TableViewService);
  private readonly route = inject(ActivatedRoute);

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
  private lastColSig = '';

  /** ใช้ในโหมด remote */
  private _lastPageFromServer = 1;

  async ngOnInit() {
    this.tableId = Number(this.route.snapshot.paramMap.get('id'));
    await this.refresh();
  }

  ngAfterViewInit() {
    this.viewReady = true;
    this.ensureGridAndSync();
  }

  // ---------------- utils ----------------
  private hasImageColumn(): boolean {
    return this.columns().some((c) => (c.dataType || '').toUpperCase() === 'IMAGE');
  }

  private colSignature(): string {
    return this.columns()
      .map((c) => `${c.name}:${(c.dataType || '').toUpperCase()}:${c.isPrimary ? 1 : 0}`)
      .join('|');
  }

  // ---------------- data ops ----------------
  async refresh() {
    const cols = await firstValueFrom(this.api.listColumns(this.tableId));
    this.columns.set(cols);
    this.rows.set([]);
    this.ensureGridAndSync();
  }

  parseData(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
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
    const pk = this.columns().find((c) => c.isPrimary)?.name;
    if (pk) {
      firstValueFrom(this.api.nextRunningId(this.tableId, pk)).then((next) => {
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
      if (TableView.USE_REMOTE) this.reloadRemoteCurrentPage();
      else this.reloadLocalCurrentPage();
    } else {
      await firstValueFrom(this.api.createRow(this.tableId, newObj));
      if (TableView.USE_REMOTE) await this.reloadRemoteToLastPage();
      else await this.reloadLocalToLastPage();
    }
  }

  async onDeleteRow(r: RowDto) {
    if (!confirm('Delete this row?')) return;
    await firstValueFrom(this.api.deleteRow(r.rowId));
    if (TableView.USE_REMOTE) this.reloadRemoteCurrentPage(true);
    else this.reloadLocalCurrentPage(true);
  }

  private async saveRowByRecord(record: any) {
    const rowId = record.__rowId as number;
    const payload: Record<string, any> = {};
    for (const c of this.columns()) payload[c.name] = record[c.name];
    await firstValueFrom(this.api.updateRow(rowId, payload));
    if (TableView.USE_REMOTE) this.reloadRemoteCurrentPage();
    else this.reloadLocalCurrentPage();
  }

  private async deleteRowByRecord(record: any) {
    const rowId = record.__rowId as number;
    if (!confirm('Delete this row?')) return;
    await firstValueFrom(this.api.deleteRow(rowId));
    if (TableView.USE_REMOTE) this.reloadRemoteCurrentPage(true);
    else this.reloadLocalCurrentPage(true);
  }

  private onImagePicked(record: any, fieldName: string, file: File) {
    this.api
      .uploadImage(file, { tableId: this.tableId, rowId: record.__rowId })
      .then(async (url) => {
        try {
          if (typeof (this.api as any).updateRowField === 'function') {
            await firstValueFrom(this.api.updateRowField(record.__rowId, fieldName, url as any));
          } else {
            await firstValueFrom(this.api.updateRow(record.__rowId, { ...record, [fieldName]: url }));
          }
        } catch {}
        try { record[fieldName] = url; } catch {}
        if (TableView.USE_REMOTE) this.reloadRemoteCurrentPage();
        else this.reloadLocalCurrentPage();
      })
      .catch((err) => console.error('upload failed', err));
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

        case 'IMAGE': {
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
                  height:100%;
                  width:auto; max-width:100%;
                  object-fit:cover; display:block; border-radius:8px;
                `;
                img.onload = () => { try { cell.getRow().normalizeHeight(); } catch {} };
                wrap.appendChild(img);
              } else {
                const ph = document.createElement('div');
                ph.style.cssText = `
                  width: clamp(72px, 15%, 260px);
                  height: calc(100% - 10px);
                  border: 2px dashed rgba(0,0,0,.20);
                  border-radius: 10px;
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
                const record = cell.getRow().getData() as any;
                const fieldName = cell.getField() as string;
                this.onImagePicked(record, fieldName, file);
              };
              fileInput.click();
            },
          };
        }

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

  /** แปลง RowDto[] -> records ที่ Tabulator ใช้ได้ */
private buildDataForGridFromRows(rows: RowDto[]): any[] {
  const cols = this.columns();
  return rows.map(r => {
    let obj: any = {};
    try { obj = JSON.parse(r.data ?? '{}'); } catch {}
    const rec: any = { __rowId: r.rowId };
    for (const c of cols) {
      rec[c.name] = obj?.[c.name] ?? null;
    }
    return rec;
  });
}


  // ---------- Local helpers ----------
  private async loadLocalData(goLast = false) {
    const rows = await firstValueFrom(this.api.listRows(this.tableId));
    const data = this.buildDataForGridFromRows(rows);
    await this.grid.setData(data);
    if (goLast) {
      let max = 1;
      try { max = Number(this.grid.getPageMax?.() || 1); } catch {}
      try { if (max > 1) this.grid.setPage(max); } catch {}
    }
    try { this.grid.redraw(true); } catch {}
  }

  private reloadLocalCurrentPage(goFirst = false) {
    const cur = goFirst ? 1 : (this.grid?.getPage?.() || 1);
    this.loadLocalData().then(() => {
      try { this.grid.setPage(cur); } catch {}
    });
  }

  private async reloadLocalToLastPage() {
    await this.loadLocalData(true);
  }

  // ---------- Remote helpers ----------
  private reloadRemoteCurrentPage(goFirst = false) {
    const cur = goFirst ? 1 : (this.grid?.getPage?.() || 1);
    // สำคัญ: ห้ามส่ง URL (จะไป 404) ให้เรียก setData() เปล่า ๆ
    this.grid.setData().then(() => {
      try { this.grid.setPage(cur); } catch {}
      try { this.grid.redraw(true); } catch {}
    });
  }

  private async reloadRemoteToLastPage() {
    await this.grid.setData(); // ให้ ajaxRequestFunc ยิงใหม่ก่อน
    const max = Math.max(1, this._lastPageFromServer || 1);
    if (max > 1) { try { await this.grid.setPage(max); } catch {} }
    try { this.grid.redraw(true); } catch {}
  }

  // =====================================================
  //                 BUILD TABULATOR
  // =====================================================
  private buildTabulator() {
    const hasImageCol = this.hasImageColumn();
    this.lastHasImageCol = hasImageCol;
    this.lastColSig = this.colSignature();

    const baseRowHeight = hasImageCol ? 80 : 44;

    const baseOptions: any = {
      columns: this.buildColumnsForGrid(),
      layout: 'fitColumns',
      rowHeight: baseRowHeight,
      variableHeight: true,
      resizableRows: true,

      paginationSize: 10,
      paginationSizeSelector: [10, 20, 50, 100],
      paginationCounter: 'pages',

      height: '100%',
      reactiveData: false,
      columnDefaults: { hozAlign: 'center', vertAlign: 'middle', widthGrow: 1, resizable: true },
      placeholder: 'No rows yet.',

      columnResized: () => { try { this.grid.redraw(true); } catch {} },
      tableBuilt:    () => { try { this.grid.redraw(true); } catch {} },
      layoutChanged: () => { try { this.grid.redraw(true); } catch {} },

      cellEdited: (cell: any) => {
        const field = cell.getField();
        const rec   = cell.getRow().getData() as any;
        rec[field]  = cell.getValue();
      },
    };

    if (TableView.USE_REMOTE) {
      // ---------- Remote ----------
      this.grid = new Tabulator(this.tabGridEl.nativeElement, {
        ...baseOptions,
        pagination: 'remote',
        // ใส่ ajaxURL อะไรก็ได้เพื่อ “เปิดโหมด ajax”; Tabulator จะเรียก ajaxRequestFunc แทนการ fetch จริง
        ajaxURL: 'about:blank',
        paginationDataReceived: { last_page: 'last_page', data: 'data' },
        paginationDataSent: { page: 'page', size: 'size', sorters: 'sorters', filters: 'filters' },

        ajaxRequestFunc: (_url: string, _config: any, params: any) => {
          const page = Number(params?.page ?? 1);
          const size = Number(params?.size ?? 10);
          return firstValueFrom(this.api.listRowsPaged(this.tableId, page, size)).then((res) => {
            const total = Number(res.total ?? 0);
            const last_page = Math.max(1, Math.ceil(total / size));
            const data = this.buildDataForGridFromRows(res.rows as RowDto[]);
            this._lastPageFromServer = last_page;
            console.log('[remote] total=', total, 'size=', size, 'page/last=', page, last_page);
            return { last_page, data };
          });
        },

        ajaxResponse: (_url: string, _params: any, response: any) => {
          return response?.data ?? [];
        },

        pageLoaded: () => {
          try {
            const lp = Math.max(1, this._lastPageFromServer || 1);
            if (this.grid?.modules?.page) {
              this.grid.modules.page.max = lp;
              const cur = Number(this.grid?.getPage?.() || 1);
              try { this.grid.setPage(cur); } catch {}
            }
            this.grid.redraw(true);
          } catch {}
        },
      });
    } else {
      // ---------- Local ----------
      this.grid = new Tabulator(this.tabGridEl.nativeElement, {
        ...baseOptions,
        pagination: 'local',
      });
    }
  }

  /** สร้าง/รีบิลด์กริด แล้วโหลดข้อมูลตามโหมด */
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

    if (recreated) {
      setTimeout(() => {
        if (TableView.USE_REMOTE) { try { this.grid.setData(); } catch {} } // ← ห้ามส่ง URL
        else { this.loadLocalData(); }
      }, 0);
    } else {
      if (TableView.USE_REMOTE) { try { this.grid.setData(); } catch {} }
      else { this.loadLocalData(); }
    }
  }
}
