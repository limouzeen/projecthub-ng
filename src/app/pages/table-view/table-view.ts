import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
  HostListener,
  effect,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TabulatorFull as Tabulator } from 'tabulator-tables/dist/js/tabulator_esm.js';

import { TableViewService, ColumnDto, RowDto } from '../../core/table-view.service';
import { FieldDialog } from './ui/field-dialog/field-dialog';
import { RowDialog } from './ui/row-dialog/row-dialog';
import { ImageDialog } from './ui/image-dialog/image-dialog';
import { UsersService, MeDto } from '../../core/users.service';
import { FooterStateService } from '../../core/footer-state.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '../../shared/toast.service';

@Component({
  selector: 'app-table-view',
  standalone: true,
  imports: [CommonModule, RouterLink, FieldDialog, RowDialog, ImageDialog],
  templateUrl: './table-view.html',
  styleUrl: './table-view.css',
})
export class TableView implements OnInit, OnDestroy, AfterViewInit {
  private static readonly USE_REMOTE = false;

  private readonly api = inject(TableViewService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly users = inject(UsersService);
  private readonly toast = inject(ToastService);

  private readonly THUMB_H = 70;

  // profile (แสดงขวาบน)
  readonly me = signal<MeDto | null>(null);

  tableId = 0;
  columns = signal<ColumnDto[]>([]);
  rows = signal<RowDto[]>([]);

  // สำหรับ back pill
  projectId: number | null = null;
  projectName: string | null = null;

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

  // --- edit field (rename only) ---
  editFieldOpen = signal(false);
  editFieldName = signal('');
  editingColumn: ColumnDto | null = null;

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

  constructor(private footer: FooterStateService) {
    effect(() => {
      const q = this.keyword().trim().toLowerCase();
      if (!this.grid) return;

      // ล้าง filter ถ้าไม่มีคำค้น
      if (!q) {
        try {
          this.grid.clearFilter();
        } catch {}
        return;
      }

      try {
        // ใช้ custom filter ให้เข้ากับ Tabulator:
        // param = row data object ไม่ใช่ RowComponent
        this.grid.setFilter((data: any) => {
          if (!data) return false;

          return Object.keys(data).some((key) => {
            // ไม่ต้องค้นใน meta fields
            if (key === '__rowId' || key === '__actions') return false;

            const value = data[key];

            // ข้าม null/undefined
            if (value === null || value === undefined) return false;

            return String(value).toLowerCase().includes(q);
          });
        });
      } catch {}
    });
  }

  async ngOnInit() {
    try {
      const me = await this.users.getMe();
      this.me.set(me);
    } catch (e) {
      this.showHttpError(e, 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
      this.router.navigateByUrl('/login');
      return;
    }
    // Footer
    this.footer.setThreshold(719);
    this.footer.setForceCompact(null); // ให้ทำงานแบบ auto ตาม threshold

    this.tableId = Number(this.route.snapshot.paramMap.get('id'));

    // ดึง projectId จาก query param (รองรับ refresh)
    const fromQuery = this.route.snapshot.queryParamMap.get('projectId');
    this.projectId = fromQuery ? Number(fromQuery) : null;

    await this.refresh();
  }

  ngOnDestroy(): void {
    this.footer.resetAll();
  }

  ngAfterViewInit() {
    this.viewReady = true;
    this.ensureGridAndSync();
  }

  /** ตัวช่วยรวม ๆ แปลง HttpErrorResponse -> ข้อความ read-able */
  private showHttpError(e: unknown, fallback = 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง') {
    const err = e as HttpErrorResponse;
    let msg = fallback;

    // backend ของคุณมักส่ง { Error: "..." }
    const serverMsg = (err?.error && (err.error.Error || err.error.message || err.error)) ?? null;

    switch (err?.status) {
      case 0:
        msg = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต';
        break;
      case 400:
        msg = serverMsg || 'ข้อมูลไม่ถูกต้อง';
        // กรณีชื่อซ้ำจาก CreateTableHandler: message จะบอกชัดเจน
        break;
      case 401:
        msg = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
        break;
      case 403:
        msg = serverMsg || 'คุณไม่มีสิทธิ์ทำรายการนี้';
        break;
      case 404:
        msg = serverMsg || 'ไม่พบข้อมูล';
        break;
      case 409:
        msg = serverMsg || 'ข้อมูลขัดแย้ง (เช่น ชื่อซ้ำ)';
        break;
      default:
        msg = serverMsg || fallback;
    }
    this.toast.error(msg);
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
    // 1) schema
    const cols = await firstValueFrom(this.api.listColumns(this.tableId));
    this.columns.set(cols);

    // 2) หา primary column จาก listColumns แล้วเช็คแค่ primaryKeyType
    const pk = cols.find((c) => c.isPrimary); // ใช้ flag จาก backend

    const isAuto = !!pk && (pk.primaryKeyType ?? '').toUpperCase() === 'AUTO_INCREMENT';

    this.isAutoTable.set(isAuto);

    // 3) โหลด rows ลง grid
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

  // ===== Edit Field========

  onEditField(c: ColumnDto) {
    this.editingColumn = c;
    this.editFieldName.set(c.name);
    this.editFieldOpen.set(true);
  }

  onCancelEditField() {
    this.editFieldOpen.set(false);
    this.editFieldName.set('');
    this.editingColumn = null;
  }

  async onSaveEditField() {
    const col = this.editingColumn;
    const newName = this.editFieldName().trim();

    if (!col) {
      this.onCancelEditField();
      return;
    }

    // ถ้าไม่ได้เปลี่ยนชื่อ ไม่ต้องยิงอะไร
    if (!newName || newName === col.name) {
      this.onCancelEditField();
      return;
    }

    try {
      // ---------- call API from service ----------
      await firstValueFrom(this.api.updateColumn(col, newName));

      // โหลด schema + grid ใหม่ให้ชื่อ field อัปเดตทุกที่
      await this.refresh();
    } catch (err) {
      console.error('update column failed', err);
      alert('Cannot rename field right now.');
    } finally {
      this.onCancelEditField();
    }
  }

  // ---------- Row ----------
  async onAddRow() {
    this.editingRow = null;

    if ((this.columns()?.length ?? 0) === 0) {
      alert('Please add at least 1 field before adding a row.');
      return;
    }

    if (this.isAutoTable()) {
      // const pk = this.columns().find((c) => c.isPrimary)?.name || 'ID';
      // const next = await firstValueFrom(this.api.nextRunningId(this.tableId, pk));
      // this.rowInitData = { [pk]: next };
    } else {
      this.rowInitData = null;
    }

    this.rowOpen.set(true);
  }

  async onSaveRow(newObj: Record<string, any>) {
    this.rowOpen.set(false);
    this.rowInitData = null;

    const isCreate = !this.editingRow;
    const normalized = this.normalizeRowForSave(
      newObj,
      isCreate && this.isAutoTable(), // สำหรับ auto PK
      isCreate // ส่ง flag ว่านี่คือ create
    );

    if (this.editingRow) {
      await firstValueFrom(this.api.updateRow(this.editingRow.rowId, normalized));
      if (TableView.USE_REMOTE) this.reloadRemoteCurrentPage();
      else this.reloadLocalCurrentPage();
    } else {
      await firstValueFrom(this.api.createRow(this.tableId, normalized));
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
    for (const c of this.columns()) {
      payload[c.name] = record[c.name];
    }

    const normalized = this.normalizeRowForSave(payload, false, false); // ส่ง flag ว่านี่คือ update

    await firstValueFrom(this.api.updateRow(rowId, normalized));
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
      .uploadImage(file)
      .then((url) => {
        record[fieldName] = url;

        // อัปเดต row ใน Tabulator ให้รีเฟรช cell
        try {
          const row = this.grid?.getRow?.(record.__rowId);
          row?.update(record);
        } catch {}
      })
      .catch((err) => console.error('upload failed', err));
  }

  private async setImageUrl(record: any, fieldName: string, url: string | null) {
    const rowId = record.__rowId as number;

    try {
      // 1. สร้าง payload ทั้งแถว จากค่าใน grid ปัจจุบัน
      const raw: Record<string, any> = {};
      for (const c of this.columns()) {
        const key = c.name;
        raw[key] = key === fieldName ? url : record[key];
      }

      // 2. แปลงตาม schema ให้เป็น number / boolean ให้ถูกต้อง
      const normalized = this.normalizeRowForSave(raw, false, false);

      // 3. ยิง PUT /api/rows/{id} ด้วยข้อมูลทั้งแถว
      await firstValueFrom(this.api.updateRow(rowId, normalized));

      // 4. update ค่าใน grid ฝั่งหน้าเว็บด้วย
      record[fieldName] = url;

      if (TableView.USE_REMOTE) this.reloadRemoteCurrentPage();
      else this.reloadLocalCurrentPage();
    } catch (err) {
      console.error('set image url failed', err);
    }
  }

  // ---------- Image Dialog (ใช้กับ toolbar ใน cell IMAGE) ----------
  private openImageUrlDialog(record: any, field: string, currentUrl: string) {
    // อนุญาตเฉพาะลิงก์ HTTP(S) จริง ๆ เท่านั้น
    const publicUrl = currentUrl && /^https?:\/\//i.test(currentUrl) ? currentUrl : '';

    this.imageDlgRecord = record;
    this.imageDlgField = field;
    this.imageDlgUrl = publicUrl;
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
      const rec = this.imageDlgRecord;
      rec[this.imageDlgField] = url; // แก้เฉพาะฝั่ง UI

      try {
        const row = this.grid?.getRow?.(rec.__rowId);
        row?.update(rec); // ให้ Tabulator รีเฟรช cell
      } catch {}
    }

    this.resetImageDialogState();
  }

  onImageDialogDelete() {
    this.imageDlgOpen.set(false);

    if (this.imageDlgRecord && this.imageDlgField) {
      const rec = this.imageDlgRecord;
      rec[this.imageDlgField] = null; // หรือ '' ตามที่ชอบ

      try {
        const row = this.grid?.getRow?.(rec.__rowId);
        row?.update(rec);
      } catch {}
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
    return this.columns().some((c) => {
      const t = (c.dataType || '').toUpperCase();
      if (t === 'IMAGE') return true;

      if (t === 'LOOKUP') {
        const name = (c.name || '').toLowerCase();
        const target = (c.lookupTargetColumnName || '').toLowerCase();
        return (
          name.includes('img') ||
          name.includes('image') ||
          target.includes('img') ||
          target.includes('image')
        );
      }

      return false;
    });
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
            minWidth: 160,
            formatter: (cell: any) => {
              const current = (cell.getValue() as string) || null;

              const wrap = document.createElement('div');
              wrap.style.cssText = `
        position:relative;
        width:100%;
        height:${this.THUMB_H}px;
        display:flex;
        align-items:center;
        justify-content:center;
        box-sizing:border-box;
        overflow:hidden;
      `;

              // ---------- content ----------
              if (current) {
                const img = document.createElement('img');
                img.src = current;
                img.style.cssText = `
          max-height:${this.THUMB_H - 10}px;
          max-width:100%;
          object-fit:contain;
          display:block;
          margin:0 auto;
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
                const ph = document.createElement('div');
                ph.textContent = 'Drop / Click to upload';
                ph.style.cssText = `
          padding:6px 12px;
          border-radius:999px;
          border:1px dashed rgba(129,140,248,0.9);
          background:rgba(248,250,252,0.75);
          font-size:9px;
          line-height:1.2;
          color:rgba(99,102,241,0.98);
          display:flex;
          align-items:center;
          justify-content:center;
          max-width:100%;
          box-sizing:border-box;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        `;
                wrap.appendChild(ph);
              }

              // ---------- toolbar: link / delete (vertical) ----------
              const tools = document.createElement('div');
              tools.style.cssText = `
        position:absolute;
        top:50%;
        right:4px;
        transform:translateY(-50%);
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:10px;
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
          color:#6366f1;
          box-shadow:0 1px 2px rgba(15,23,42,0.18);
          display:flex;
          align-items:center;
          justify-content:center;
        `;
                return b;
              };

              const btnUrl = mkBtn('🔗');
              btnUrl.title = 'Set image URL';
              btnUrl.onclick = (ev) => {
                ev.stopPropagation();
                const rec = cell.getRow().getData() as any;
                const f = cell.getField() as string;
                const val = (cell.getValue() as string) || '';

                // dialog ไว้ใส่ URL public เท่านั้น: ถ้าเป็น data: ให้เคลียร์
                const isDataUrl = val.startsWith('data:');
                const clean = isDataUrl ? '' : val;

                this.openImageUrlDialog(rec, f, clean);
              };

              const btnClear = mkBtn('🗑');
              btnClear.title = 'Remove image';
              btnClear.onclick = (ev) => {
                ev.stopPropagation();
                const rec = cell.getRow().getData() as any;
                const f = cell.getField() as string;
                const val = (cell.getValue() as string) || '';
                if (!val) return;
                this.openImageDeleteDialog(rec, f, val);
              };

              tools.appendChild(btnUrl);
              tools.appendChild(btnClear);
              wrap.appendChild(tools);

              // ---------- drag & drop upload ----------
              const setDragVisual = (on: boolean) => {
                wrap.style.boxShadow = on
                  ? '0 0 0 1px rgba(129,140,248,0.85), 0 8px 24px rgba(79,70,229,0.25)'
                  : 'none';
                wrap.style.background = on && !current ? 'rgba(239,246,255,0.9)' : 'transparent';
              };

              const handleFiles = (files: FileList | null) => {
                const file = files?.[0];
                if (!file) return;
                const record = cell.getRow().getData() as any;
                const fieldName = cell.getField() as string;
                this.onImagePicked(record, fieldName, file);
              };

              wrap.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragVisual(true);
              });

              wrap.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragVisual(true);
              });

              wrap.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragVisual(false);
              });

              wrap.addEventListener('drop', (e: DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setDragVisual(false);

                const dt = e.dataTransfer;
                if (!dt) return;
                if (dt.files && dt.files.length) {
                  handleFiles(dt.files);
                }
              });

              return wrap;
            },

            // click พื้นที่ cell (ไม่ใช่ปุ่ม) = เลือกไฟล์
            cellClick: (e: any, cell: any) => {
              // กันไม่ให้คลิกปุ่มแล้วเด้ง input
              const target = e.target as HTMLElement;
              if (target.closest('button')) return;

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

        // DATE type
        case 'DATE': {
          return {
            ...base,

            // ใช้ custom editor เป็น <input type="date">
            editor: (cell: any, onRendered: any, success: (v: any) => void, cancel: () => void) => {
              const input = document.createElement('input');
              input.type = 'date';
              input.className = 'ph-date-editor-input'; // ใช้ class เดิม/ธีมเดิมได้ตามใจ

              const raw = cell.getValue();
              input.value = this.toInputDateValue(raw);

              onRendered(() => {
                input.focus();
                input.select?.();
              });

              const commit = () => success(input.value);

              input.addEventListener('change', commit);
              input.addEventListener('blur', commit);
              input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancel();
                }
              });

              return input;
            },

            // formatter: แสดงเป็น dd-MM-yyyy เสมอ
            formatter: (cell: any) => {
              const raw = cell.getValue();
              const text = this.formatDateDdMmYyyy(raw);
              return `<span>${text}</span>`;
            },
          };
        }

        case 'LOOKUP': {
          // เดาว่าเป็น lookup รูป:
          //  - ชื่อ column มีคำว่า img / image
          //  - หรือ lookupTargetColumnName มีคำว่า img / image
          const name = (c.name || '').toLowerCase();
          const targetName = (c.lookupTargetColumnName || '').toLowerCase();
          const isImageLookup =
            name.includes('img') ||
            name.includes('image') ||
            targetName.includes('img') ||
            targetName.includes('image');

          // 1) lookup ปกติ → แสดง text จาก __display, แต่เก็บ PK ใน field หลัก
          if (!isImageLookup) {
            return {
              ...base,
              editor: false, // read-only
              formatter: (cell: any) => {
                const data = cell.getRow().getData();
                const field = cell.getField(); // เช่น "PriceLkup"
                const disp = data[`${field}__display`];
                return disp ?? '';
              },
            };
          }

          //  lookup ที่เอาไว้โชว์รูป → แสดงเป็น cell รูป (read-only)
          return {
            ...base,
            cssClass: 'cell-image',
            minWidth: 160,
            editor: false, // read-only

            formatter: (cell: any) => {
              const url = (cell.getValue() as string) || '';

              const wrap = document.createElement('div');
              wrap.style.cssText = `
            position:relative;
            width:100%; 
            height:${this.THUMB_H}px;
            display:flex;
            align-items:center;
            justify-content:center;
            box-sizing:border-box;
            overflow:hidden;
          `;

              // ถ้า value ดูเหมือนเป็น URL รูป → แสดงรูป
              if (url && (/^https?:\/\//i.test(url) || url.startsWith('data:'))) {
                const img = document.createElement('img');
                img.src = url;
                img.style.cssText = `
              max-height:${this.THUMB_H - 10}px;
              max-width:100%;
              height:88px
              object-fit:contain;
              display:block;
              margin:0 auto;
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
                // ถ้าไม่ใช่ URL ก็แสดงเป็น text ปกติ
                const span = document.createElement('span');
                span.textContent = url;
                span.style.cssText = `
              font-size:11px;
              color:rgba(71,85,105,0.9);
              word-break:break-all;
            `;
                wrap.appendChild(span);
              }

              return wrap;
            },
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
      const anyRow = r as any;

      for (const c of cols) {
        const name = c.name;
        const t = (c.dataType || '').toUpperCase();

        if (t === 'LOOKUP') {
          // PK จริงที่เก็บใน JSON (ใช้ส่งกลับ backend เสมอ)
          const fk = obj?.[name] ?? null;

          // display value จาก backend join หรือ fallback เป็น fk เฉย ๆ
          const display = anyRow[name] ?? fk;

          rec[name] = fk; // ใช้เก็บ PK
          rec[`${name}__display`] = display ?? null; // ใช้โชว์ใน grid
          continue;
        }

        if (t === 'LOOKUP') {
          // (กรณี image lookup ถ้าคุณอยากทำพิเศษค่อยแยกอีกชั้นได้)
        }

        // 2) กรณีธรรมดา หรือไม่มีค่า JOIN
        rec[name] = obj?.[name] ?? null;
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

      index: '__rowId',

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
          return firstValueFrom(this.api.listRowsPaged(this.tableId, page, size)).then(
            (res: { rows: RowDto[]; total: number }) => {
              const total = Number(res.total ?? 0);
              const last_page = Math.max(1, Math.ceil(total / size));
              const data = this.buildDataForGridFromRows(res.rows as RowDto[]);
              this._lastPageFromServer = last_page;
              return { last_page, data };
            }
          );
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

  // ====== BACK 2 Project ==========
  onBackToProject() {
    const projectId = this.projectId; // ตัวที่คุณอ่านมาจาก queryParams หรือ route ตอนโหลดหน้า

    if (projectId) {
      this.router.navigate(
        ['/projects', projectId],
        { queryParams: { from: 'table' } } //  flag ว่ามาจาก table-view
      );
    } else {
      // กันเคสไม่มี projectId จริง ๆ
      this.router.navigate(['/dashboard']);
    }
  }

  /** แปลงชนิดข้อมูลตาม schema columns ก่อนส่งให้ backend */
  private normalizeRowForSave(
    raw: Record<string, any>,
    skipAutoPkForCreate = false,
    isCreate = false
  ): Record<string, any> {
    const out: Record<string, any> = {};

    for (const c of this.columns()) {
      const key = c.name;
      const t = (c.dataType || '').toUpperCase();
      const v = raw[key];

      // 1) FORMULA = ห้ามส่งทุกกรณี
      if (t === 'FORMULA') {
        continue;
      }

      // 2) LOOKUP = ใช้ PK จาก field หลัก (ไม่ใช้ display)
    if (t === 'LOOKUP') {
      // พยายามอ่านจาก hidden field ก่อน (เผื่อคุณอยากเก็บไว้)
      const fkRaw = raw[key]; // ตอนนี้ raw[key] = PK แน่นอนแล้ว จากข้อ 1
      if (fkRaw === '' || fkRaw === undefined) {
        out[key] = null;
      } else {
        out[key] = Number.parseInt(fkRaw as any, 10);
      }
      continue;
    }

      // 3) ถ้าเป็น create + auto-table + เป็น PK → ไม่ต้องส่ง
      if (skipAutoPkForCreate && this.isAutoTable() && c.isPrimary) {
        continue;
      }

      if (v === '' || v === undefined) {
        out[key] = null;
        continue;
      }

      switch (t) {
        case 'INTEGER':
        case 'INT':
          out[key] = v === null ? null : Number.parseInt(v as any, 10);
          break;

        case 'REAL':
        case 'NUMBER':
        case 'FLOAT':
          out[key] = v === null ? null : Number.parseFloat(v as any);
          break;

        case 'BOOLEAN':
          out[key] = v === true || v === 'true' || v === 1 || v === '1';
          break;

        default:
          out[key] = v;
      }
    }

    return out;
  }

  // แปลง string วันที่จาก backend → แสดงเป็น dd-MM-yyyy
  private formatDateDdMmYyyy(raw: any): string {
    if (!raw) return '';

    if (typeof raw !== 'string') {
      return String(raw);
    }

    // รองรับทั้ง "yyyy-MM-dd", "yyyy/MM/dd", "dd-MM-yyyy" เผื่อไว้
    let y: string, m: string, d: string;

    if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(raw)) {
      // yyyy-MM-dd หรือ yyyy/MM/dd
      const parts = raw.split(/[-/]/);
      [y, m, d] = parts;
    } else if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
      // dd-MM-yyyy อยู่แล้ว
      return raw;
    } else {
      return raw; // format แปลก ๆ ไม่แปลง
    }

    return `${d}-${m}-${y}`;
  }

  // ใช้ตอน editor (input type="date") ต้องการค่าแบบ yyyy-MM-dd
  private toInputDateValue(raw: any): string {
    if (!raw) return '';

    if (typeof raw !== 'string') return '';

    // ถ้าเป็น dd-MM-yyyy ให้สลับกลับเป็น yyyy-MM-dd
    if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
      const [d, m, y] = raw.split('-');
      return `${y}-${m}-${d}`;
    }

    // ถ้าเป็น yyyy/MM/dd ให้เปลี่ยน / → -
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) {
      return raw.replace(/\//g, '-');
    }

    // ถ้าเป็น yyyy-MM-dd อยู่แล้ว
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    return '';
  }
}
