import {
  Component,
  inject,
  signal,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
  HostListener,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TabulatorFull as Tabulator } from 'tabulator-tables/dist/js/tabulator_esm.js';

import { TableViewService, ColumnDto, RowDto } from '../../core/table-view.service';
import { FieldDialog } from './ui/field-dialog/field-dialog';
import { RowDialog } from './ui/row-dialog/row-dialog';
import { ImageDialog } from './ui/image-dialog/image-dialog';

@Component({
  selector: 'app-table-view',
  standalone: true,
  imports: [CommonModule, RouterLink, FieldDialog, RowDialog, ImageDialog],
  templateUrl: './table-view.html',
  styleUrl: './table-view.css',
})
export class TableView implements OnInit, AfterViewInit {
  private static readonly USE_REMOTE = false;

  private readonly api = inject(TableViewService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly THUMB_H = 70;

  tableId = 0;
  columns = signal<ColumnDto[]>([]);
  rows = signal<RowDto[]>([]);

  // layout / nav
  asideOpen = signal(false);
  profileOpen = signal(false);
  keyword = signal(''); // search text

  /** auto-increment flag */
  isAutoTable = signal<boolean>(false);

  fieldOpen = signal(false);
  rowOpen = signal(false);
  editingRow: RowDto | null = null;
  rowInitData: Record<string, any> | null = null;

  // image dialog state
  imageDlgOpen = signal(false);
  imageDlgMode: 'url' | 'delete' = 'url';
  imageDlgField = '';
  imageDlgRecord: any = null;
  imageDlgUrl = '';

  @ViewChild('tabGrid', { static: true }) tabGridEl!: ElementRef<HTMLDivElement>;
  private grid!: any;

  @ViewChild(FieldDialog) fieldDialog!: FieldDialog;

  private viewReady = false;
  private lastHasImageCol = false;
  private lastColSig = '';
  private _lastPageFromServer = 1;

  constructor() {
    // เมื่อ keyword เปลี่ยน → filter ใน Tabulator ให้ทันที
    effect(() => {
      const q = this.keyword().trim().toLowerCase();
      if (!this.grid) return;

      if (!q) {
        try {
          this.grid.clearFilter(true);
        } catch {}
        return;
      }

      try {
        this.grid.setFilter((row: any) => {
          const data = row.getData?.() || {};
          return Object.keys(data).some((k) => {
            if (k === '__rowId') return false;
            const v = data[k];
            return v != null && String(v).toLowerCase().includes(q);
          });
        });
      } catch {}
    });
  }

  async ngOnInit() {
    this.tableId = Number(this.route.snapshot.paramMap.get('id'));
    await this.refresh();
  }

  ngAfterViewInit() {
    this.viewReady = true;
    this.ensureGridAndSync();
  }

  // ================= Layout / Nav =================

  toggleAside() {
    const next = !this.asideOpen();
    this.asideOpen.set(next);
    if (typeof document !== 'undefined') {
      document.body.style.overflow = next ? 'hidden' : '';
    }
  }

  toggleProfileMenu() {
    this.profileOpen.update((v) => !v);
  }

  onEditProfile() {
    this.profileOpen.set(false);
    this.router.navigateByUrl('/profile/edit');
  }

  onLogout() {
    this.profileOpen.set(false);
    this.router.navigateByUrl('/login');
  }

  @HostListener('document:click')
  onDocClick() {
    if (this.profileOpen()) this.profileOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.profileOpen()) {
      this.profileOpen.set(false);
      return;
    }
    if (this.asideOpen()) {
      this.asideOpen.set(false);
      if (typeof document !== 'undefined') document.body.style.overflow = '';
    }
  }

  // ================= data ops =================

  async refresh() {
    const cols = await firstValueFrom(this.api.listColumns(this.tableId));
    this.columns.set(cols);

    try {
      this.isAutoTable.set(localStorage.getItem('ph:auto:' + this.tableId) === '1');
    } catch {
      this.isAutoTable.set(false);
    }

    this.rows.set([]);
    this.ensureGridAndSync();
  }

  parseData(json: string | null | undefined): any {
    if (!json) return {};
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }

  // ---------- Field ----------
  onAddField() {
    this.fieldOpen.set(true);
  }

  async onSaveField(model: any) {
    this.fieldOpen.set(false);
    await firstValueFrom(this.api.createColumn(this.tableId, model));
    await this.refresh();
    try {
      this.fieldDialog?.resetForm();
    } catch {}
  }

  async onDeleteField(c: ColumnDto) {
    if (!confirm(`Delete field "${c.name}"?`)) return;
    await firstValueFrom(this.api.deleteColumn(c.columnId));
    await this.refresh();
  }
  onEditField(_c: ColumnDto) {}

  // ---------- Row ----------
  async onAddRow() {
    this.editingRow = null;

    if ((this.columns()?.length ?? 0) === 0) {
      alert('Please add at least 1 field before adding a row.');
      return;
    }

    if (this.isAutoTable()) {
      const pk = this.columns().find((c) => c.isPrimary)?.name || 'ID';
      const next = await firstValueFrom(this.api.nextRunningId(this.tableId, pk));
      this.rowInitData = { [pk]: next };
    } else {
      this.rowInitData = null;
    }

    this.rowOpen.set(true);
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

  // ---------- Image helpers ----------
  private onImagePicked(record: any, fieldName: string, file: File) {
    this.api
      .uploadImage(file, { tableId: this.tableId, rowId: record.__rowId })
      .then(async (url) => {
        await this.setImageUrl(record, fieldName, url as any);
      })
      .catch((err) => console.error('upload failed', err));
  }

  private async setImageUrl(record: any, fieldName: string, url: string | null) {
    const rowId = record.__rowId as number;
    try {
      if (typeof (this.api as any).updateRowField === 'function') {
        await firstValueFrom(this.api.updateRowField(rowId, fieldName, url));
      } else {
        const payload: Record<string, any> = {};
        for (const c of this.columns()) payload[c.name] = record[c.name];
        payload[fieldName] = url;
        await firstValueFrom(this.api.updateRow(rowId, payload));
      }
      record[fieldName] = url;

      if (TableView.USE_REMOTE) this.reloadRemoteCurrentPage();
      else this.reloadLocalCurrentPage();
    } catch (err) {
      console.error('set image url failed', err);
    }
  }

  // ---------- Image Dialog (ใช้กับ toolbar ใน cell IMAGE) ----------
  private openImageUrlDialog(record: any, field: string, currentUrl: string) {
    this.imageDlgRecord = record;
    this.imageDlgField = field;
    this.imageDlgUrl = currentUrl || '';
    this.imageDlgMode = 'url';
    this.imageDlgOpen.set(true);
  }

  private openImageDeleteDialog(record: any, field: string, currentUrl: string) {
    this.imageDlgRecord = record;
    this.imageDlgField = field;
    this.imageDlgUrl = currentUrl || '';
    this.imageDlgMode = 'delete';
    this.imageDlgOpen.set(true);
  }

  onImageDialogSave(url: string) {
    this.imageDlgOpen.set(false);
    if (this.imageDlgRecord && this.imageDlgField) {
      this.setImageUrl(this.imageDlgRecord, this.imageDlgField, url);
    }
    this.resetImageDialogState();
  }

  onImageDialogDelete() {
    this.imageDlgOpen.set(false);
    if (this.imageDlgRecord && this.imageDlgField) {
      this.setImageUrl(this.imageDlgRecord, this.imageDlgField, null);
    }
    this.resetImageDialogState();
  }

  onImageDialogCancel() {
    this.imageDlgOpen.set(false);
    this.resetImageDialogState();
  }

  private resetImageDialogState() {
    this.imageDlgRecord = null;
    this.imageDlgField = '';
    this.imageDlgUrl = '';
    this.imageDlgMode = 'url';
  }

  // =====================================================
  //                 TABULATOR CONFIG
  // =====================================================
  private hasImageColumn(): boolean {
    return this.columns().some((c) => (c.dataType || '').toUpperCase() === 'IMAGE');
  }

  private colSignature(): string {
    return this.columns()
      .map((c) => `${c.name}:${(c.dataType || '').toUpperCase()}:${c.isPrimary ? 1 : 0}`)
      .join('|');
  }

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

      const lock = c.isPrimary && this.isAutoTable();

      switch ((c.dataType || '').toUpperCase()) {
        case 'INTEGER':
        case 'REAL':
          return { ...base, editor: lock ? false : 'number' };

        case 'BOOLEAN':
          return {
            ...base,
            formatter: 'tickCross',
            editor: lock ? false : 'tickCross',
          };

        case 'IMAGE': {
          return {
            ...base,
            cssClass: 'cell-image',
            formatter: (cell: any) => {
              const url = (cell.getValue() as string) || null;

              const wrap = document.createElement('div');
              wrap.style.cssText = `
        position:relative;
        width:100%;
        height:${this.THUMB_H}px;
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:visible;
      `;

              if (url) {
                const img = document.createElement('img');
                img.src = url;
                img.style.cssText = `
          max-height:${this.THUMB_H - 8}px;
          max-width:100%;
          object-fit:contain;
          display:block;
          border-radius:10px;
          box-shadow:0 4px 14px rgba(15,23,42,0.12);
        `;
                img.onload = () => {
                  try {
                    cell.getRow().normalizeHeight();
                  } catch {}
                };
                wrap.appendChild(img);
              } else {
                // placeholder แบบบาง ๆ ไม่มีกล่องขาวหนา
                const ph = document.createElement('div');
                ph.textContent = 'Drop / Click to upload';
                ph.style.cssText = `
          padding:7px 14px;
          border-radius:999px;
          border:1px dashed rgba(129,140,248,0.9);
          background:rgba(248,250,252,0.55);
          font-size:10px;
          color:rgba(99,102,241,0.9);
          display:flex;
          align-items:center;
          justify-content:center;
          backdrop-filter:blur(4px);
        `;
                wrap.appendChild(ph);
              }

              // toolbar ปุ่ม 🔗 / 🗑 เล็ก ๆ มุมขวา
              const tools = document.createElement('div');
              tools.style.cssText = `
        position:absolute;
        top:4px;
        right:4px;
        display:flex;
        gap:4px;
        z-index:10;
      `;

              const mkBtn = (label: string) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.innerText = label;
                b.style.cssText = `
    width:20px;height:20px;
    border:none;
    border-radius:999px;
    font-size:11px;
    line-height:20px;
    padding:0;
    cursor:pointer;
    background:rgba(255,255,255,0.98);
    color:#6366f1; /* 🔗 และ 🗑 ใช้สีเดียวกัน */
    box-shadow:0 2px 6px rgba(15,23,42,0.18);
    display:flex;
    align-items:center;
    justify-content:center;
  `;
                return b;
              };

              const btnUrl = mkBtn('🔗');
              btnUrl.title = 'Set image URL';

              const btnClear = mkBtn('🗑');
              btnClear.title = 'Remove image';
              btnClear.onclick = (ev) => {
                ev.stopPropagation();
                const rec = cell.getRow().getData() as any;
                const f = cell.getField() as string;
                const current = (cell.getValue() as string) || '';
                if (!current) return;
                this.openImageDeleteDialog(rec, f, current);
              };

              tools.appendChild(btnUrl);
              tools.appendChild(btnClear);
              wrap.appendChild(tools);

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

        case 'FORMULA': {
          let formulaFn: ((record: any) => any) | null = null;
          try {
            const raw: any = (c as any).formulaDefinition || '';
            if (raw) {
              const def = JSON.parse(raw);
              if (def.type === 'operator' && def.value && def.left && def.right) {
                const op = def.value;
                const left = def.left;
                const right = def.right;

                formulaFn = (rec: any) => {
                  const leftVal =
                    left.type === 'column' ? Number(rec[left.name] ?? 0) : Number(left.value ?? 0);
                  const rightVal =
                    right.type === 'column'
                      ? Number(rec[right.name] ?? 0)
                      : Number(right.value ?? 0);

                  switch (op) {
                    case '+':
                      return leftVal + rightVal;
                    case '-':
                      return leftVal - rightVal;
                    case '*':
                      return leftVal * rightVal;
                    case '/':
                      return rightVal !== 0 ? leftVal / rightVal : null;
                    default:
                      return null;
                  }
                };
              }
            }
          } catch (err) {
            console.warn('Formula parse error for column', c.name, err);
          }

          return {
            ...base,
            editor: false,
            formatter: (cell: any) => {
              const rec = cell.getRow().getData();
              const v = formulaFn ? formulaFn(rec) : '';
              return `<div>${v ?? ''}</div>`;
            },
            tooltip: (c as any).formulaDefinition ? `Formula: ${(c as any).formulaDefinition}` : '',
          };
        }

        default:
          return { ...base, editor: lock ? false : 'input' };
      }
    });

    // Actions column
    defs.push({
      title: 'Actions',
      field: '__actions',
      width: 140,
      headerHozAlign: 'center',
      hozAlign: 'center',
      vertAlign: 'middle',
      widthGrow: 0,
      formatter: () => `
        <div class="ph-actions-cell">
          <button data-action="save"   class="ph-link ph-link-save">Save</button>
          <button data-action="delete" class="ph-link ph-link-del">Delete</button>
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

  private buildDataForGridFromRows(rows: RowDto[]): any[] {
    const cols = this.columns();
    return rows.map((r) => {
      let obj: any = {};
      try {
        obj = JSON.parse(r.data ?? '{}');
      } catch {}
      const rec: any = { __rowId: r.rowId };
      for (const c of cols) rec[c.name] = obj?.[c.name] ?? null;
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
      try {
        max = Number(this.grid.getPageMax?.() || 1);
      } catch {}
      try {
        if (max > 1) this.grid.setPage(max);
      } catch {}
    }
    try {
      this.grid.redraw(true);
    } catch {}
  }

  private reloadLocalCurrentPage(goFirst = false) {
    const cur = goFirst ? 1 : this.grid?.getPage?.() || 1;
    this.loadLocalData().then(() => {
      try {
        this.grid.setPage(cur);
      } catch {}
    });
  }

  private async reloadLocalToLastPage() {
    await this.loadLocalData(true);
  }

  // ---------- Remote helpers (mock) ----------
  private reloadRemoteCurrentPage(goFirst = false) {
    const cur = goFirst ? 1 : this.grid?.getPage?.() || 1;
    this.grid.setData().then(() => {
      try {
        this.grid.setPage(cur);
      } catch {}
      try {
        this.grid.redraw(true);
      } catch {}
    });
  }

  private async reloadRemoteToLastPage() {
    await this.grid.setData();
    const max = Math.max(1, this._lastPageFromServer || 1);
    if (max > 1) {
      try {
        await this.grid.setPage(max);
      } catch {}
    }
    try {
      this.grid.redraw(true);
    } catch {}
  }

  // =====================================================
  //                 BUILD TABULATOR
  // =====================================================
  private buildTabulator() {
    const hasImageCol = this.hasImageColumn();
    this.lastHasImageCol = hasImageCol;
    this.lastColSig = this.colSignature();

    const baseRowHeight = hasImageCol ? 90 : 46;

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
      columnDefaults: {
        hozAlign: 'center',
        vertAlign: 'middle',
        widthGrow: 1,
        resizable: true,
      },
      placeholder: 'No rows yet.',

      columnResized: () => {
        try {
          this.grid.redraw(true);
        } catch {}
      },
      tableBuilt: () => {
        try {
          this.grid.redraw(true);
        } catch {}
      },
      layoutChanged: () => {
        try {
          this.grid.redraw(true);
        } catch {}
      },

      cellEdited: (cell: any) => {
        const field = cell.getField();
        const rec = cell.getRow().getData() as any;
        rec[field] = cell.getValue();
      },
    };

    if (TableView.USE_REMOTE) {
      this.grid = new Tabulator(this.tabGridEl.nativeElement, {
        ...baseOptions,
        pagination: 'remote',
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
            return { last_page, data };
          });
        },
        ajaxResponse: (_url: string, _params: any, response: any) => response?.data ?? [],
        pageLoaded: () => {
          try {
            const lp = Math.max(1, this._lastPageFromServer || 1);
            if (this.grid?.modules?.page) {
              this.grid.modules.page.max = lp;
              const cur = Number(this.grid?.getPage?.() || 1);
              try {
                this.grid.setPage(cur);
              } catch {}
            }
            this.grid.redraw(true);
          } catch {}
        },
      });
    } else {
      this.grid = new Tabulator(this.tabGridEl.nativeElement, {
        ...baseOptions,
        pagination: 'local',
      });
    }
  }

  private ensureGridAndSync() {
    if (!this.viewReady) return;

    const sig = this.colSignature();
    const needImageMode = this.hasImageColumn();

    let recreated = false;
    if (!this.grid) {
      this.buildTabulator();
      recreated = true;
    } else if (needImageMode !== this.lastHasImageCol || sig !== this.lastColSig) {
      try {
        this.grid.destroy();
      } catch {}
      this.buildTabulator();
      recreated = true;
    }

    if (recreated) {
      setTimeout(() => {
        if (TableView.USE_REMOTE) {
          try {
            this.grid.setData();
          } catch {}
        } else {
          this.loadLocalData();
        }
      }, 0);
    } else {
      if (TableView.USE_REMOTE) {
        try {
          this.grid.setData();
        } catch {}
      } else {
        this.loadLocalData();
      }
    }
  }
}
