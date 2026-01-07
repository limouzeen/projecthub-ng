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
  computed,
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

  //ตัวช่วยตรวจให้ img ไม่จะเป็นต้องชื่อ "img" ก็โชว์เป็นรูปอย่างเหมาะสม
  private hasLookupImageData = false;

  // profile (แสดงขวาบน)
  readonly me = signal<MeDto | null>(null);

  // เก็บ Data Formula ไว้สำหรับ search
  private formulaFns = new Map<string, (rec: any) => any>();

  tableId = 0;
  columns = signal<ColumnDto[]>([]);
  rows = signal<RowDto[]>([]);
  name: string | null = null;

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

  // --- delete field confirm ---
  deleteFieldOpen = signal(false);
  deleteFieldTarget = signal<ColumnDto | null>(null);

  // --- row confirm (Actions: Save / Delete) ---
  rowConfirmOpen = signal(false);
  rowConfirmMode = signal<'save' | 'delete'>('save');
  rowConfirmRecord = signal<any | null>(null);

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

  // --- Quick calc (ทดลองคำนวณเลขหน้าตารางเฉย ๆ) ---

  quickCalcActive = signal(false);
  quickCalcValues = signal<number[]>([]);

  // จำว่า cell ไหนถูกเลือกเข้ามาคิด quick calc แล้วบ้าง (rowId::field)
  private quickCalcCellKeys = new Set<string>();

  quickCalcCount = computed(() => this.quickCalcValues().length);

  quickCalcSum = computed(() => {
    return this.quickCalcValues().reduce((acc, v) => acc + v, 0);
  });

  quickCalcAvg = computed(() => {
    const n = this.quickCalcCount();
    return n > 0 ? this.quickCalcSum() / n : 0;
  });

  quickCalcMin = computed(() => {
    const arr = this.quickCalcValues();
    return arr.length ? Math.min(...arr) : 0;
  });

  quickCalcMax = computed(() => {
    const arr = this.quickCalcValues();
    return arr.length ? Math.max(...arr) : 0;
  });

  toggleQuickCalc() {
    const next = !this.quickCalcActive();
    this.quickCalcActive.set(next);

    // ปิดโหมดเมื่อไหร่ เคลียร์ค่าทิ้งหมด
    if (!next) {
      this.quickCalcValues.set([]);
      this.quickCalcCellKeys.clear();
    }
  }

  clearQuickCalc() {
    this.quickCalcValues.set([]);
    this.quickCalcCellKeys.clear();
  }

  //===================================================================

  constructor(private footer: FooterStateService) {
    effect(() => {
      const q = this.keyword().trim().toLowerCase();
      if (!this.grid) return;

      if (!q) {
        try {
          this.grid.clearFilter();
        } catch {}
        return;
      }

      try {
        const cols = this.columns();
        const colNames = cols.map((c) => c.name);

        this.grid.setFilter((data: any) => {
          if (!data) return false;

          // ---------- วิ่งตาม schema column ก่อน ----------
          for (const c of cols) {
            const name = c.name;
            const t = (c.dataType || '').toUpperCase();

            const valuesToCheck: any[] = [];

            if (t === 'FORMULA') {
              // ใช้ค่าเลขที่คำนวณแล้วจาก formulaFn
              const fn = this.formulaFns.get(name);
              if (fn) {
                const v = fn(data);
                valuesToCheck.push(v);
              }
            } else if (t === 'LOOKUP') {
              const fk = data[name];
              const disp = data[`${name}__display`];

              // เอาทั้ง display + FK มาใช้ค้น
              valuesToCheck.push(disp, fk);

              // ถ้า display เป็นวันที่ → แปลงเป็น dd-MM-yyyy ด้วย
              if (typeof disp === 'string') {
                const raw10 = disp.substring(0, 10);
                if (
                  /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(raw10) || // yyyy-MM-dd / yyyy/MM/dd
                  /^\d{2}-\d{2}-\d{4}$/.test(raw10) // dd-MM-yyyy
                ) {
                  valuesToCheck.push(this.formatDateDdMmYyyy(raw10));
                }
              }
            } else if (t === 'DATE') {
              const raw = data[name];
              valuesToCheck.push(raw); // raw จาก backend
              valuesToCheck.push(this.formatDateDdMmYyyy(raw)); // รูปแบบ dd-MM-yyyy ที่แสดง
            } else {
              // type ปกติ
              valuesToCheck.push(data[name]);
            }

            for (const v of valuesToCheck) {
              if (v === null || v === undefined) continue;
              const s = String(v).toLowerCase();
              if (!s) continue;
              if (s.includes(q)) return true;
            }
          }

          // ---------- กันเคส field อื่น ๆ ที่ไม่อยู่ใน schema เช่น xxx__display ----------
          for (const key of Object.keys(data)) {
            if (key === '__rowId' || key === '__actions') continue;
            if (colNames.includes(key)) continue; // เช็คไปแล้วด้านบน

            const value = data[key];
            if (value === null || value === undefined) continue;
            const s = String(value).toLowerCase();
            if (!s) continue;
            if (s.includes(q)) return true;
          }

          return false;
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
    this.name = String(this.route.snapshot.paramMap.get('name'));

    // ดึง projectId จาก query param (รองรับ refresh)
    const fromQuery = this.route.snapshot.queryParamMap.get('projectId');
    this.projectId = fromQuery ? Number(fromQuery) : null;

    await this.refresh();
  }

  ngOnDestroy(): void {
    try {
      this.saveColumnLayoutFromGrid();
    } catch {}
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
    if (!this.tableId || this.tableId <= 0) {
      console.warn('refresh() called with invalid tableId:', this.tableId);
      return;
    }
    
    //ดึงชื่อตาราง
    if (this.projectId) {
        try {
            const tableInfo = await firstValueFrom(this.api.getTable(this.tableId, this.projectId));
            if (tableInfo) {
                this.name = tableInfo.name;
            }
        } catch (err) {
            console.warn('Load table info failed', err);
        }
    }
    
    // 1) schema
    const colsFromApi = await firstValueFrom(this.api.listColumns(this.tableId));
    console.log('[TABLE COLS]', this.tableId, colsFromApi);
    //  บังคับเรียงคอลัมน์ตาม columnId จากน้อยไปมาก
    const cols = [...colsFromApi].sort((a, b) => {
      const aid = a.columnId ?? 0;
      const bid = b.columnId ?? 0;
      return aid - bid;
    });

    this.columns.set(cols);

    // 2) หา primary column จาก listColumns แล้วเช็คแค่ primaryKeyType
    const pk = cols.find((c) => c.isPrimary);
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

 
  // ==== Delete Field ========



async onDeleteField(c: ColumnDto) {
  // กัน primary key 
  if (c.isPrimary) return;

 
  this.deleteFieldTarget.set(c);
  this.deleteFieldOpen.set(true);
}



  // ====== Handler for Delete Field ========

  onCancelDeleteField() {
    this.deleteFieldOpen.set(false);
    this.deleteFieldTarget.set(null);
  }

  async onConfirmDeleteField() {
  const target = this.deleteFieldTarget();
  if (!target) {
    this.onCancelDeleteField();
    return;
  }

  const cols = this.columns();

  // 1) เตรียม set columnId ที่จะลบ
  const idsToDelete = new Set<number>();

  const targetId = target.columnId ?? null;
  const targetName = (target.name || '').trim();
  const targetNameLower = targetName.toLowerCase();

  if (targetId != null) {
    idsToDelete.add(targetId);
  }

  // 2) หา LOOKUP ใน "ตารางเดียวกัน" ที่ target เป็นปลายทาง → ลบไปด้วย
  for (const col of cols) {
    if (!col || col.columnId == null) continue;

    const t = (col.dataType || '').toString().trim().toUpperCase();
    if (t !== 'LOOKUP') continue;

    const lkTargetId = col.lookupTargetColumnId ?? null;
    const lkTargetName = (col.lookupTargetColumnName || '').trim().toLowerCase();

    const idMatches =
      !!targetId && !!lkTargetId && lkTargetId === targetId;

    const nameMatches =
      !!targetNameLower && !!lkTargetName && lkTargetName === targetNameLower;

    if (idMatches || nameMatches) {
      idsToDelete.add(col.columnId);
    }
  }

  // 3) หา FORMULA ที่ใช้ column เป้าหมาย → ลบไปด้วย
  for (const col of cols) {
    if (!col || col.columnId == null) continue;

    const t = (col.dataType || '').toString().trim().toUpperCase();
    if (t !== 'FORMULA') continue;

    const def = (col as any).formulaDefinition as string | null | undefined;
    if (!def) continue;

    if (this.formulaUsesColumn(def, targetName)) {
      idsToDelete.add(col.columnId);
    }
  }

  try {
    // 4) ไล่ลบทีละ columnId
    for (const id of idsToDelete) {
      await firstValueFrom(this.api.deleteColumn(id));
    }

    // 5) refresh schema + grid
    await this.refresh();
  } catch (e) {
    this.showHttpError(e, 'ไม่สามารถลบฟิลด์ได้');
  } finally {
    this.onCancelDeleteField();
  }
}

/** ตรวจว่า formulaDefinition นี้ใช้ column ชื่อ targetName หรือไม่ */
private formulaUsesColumn(formulaJson: string | null | undefined, targetName: string): boolean {
  if (!formulaJson || !targetName) return false;

  try {
    const def = JSON.parse(formulaJson);

    const visit = (node: any): boolean => {
      if (!node || typeof node !== 'object') return false;

      if (node.type === 'column' && typeof node.name === 'string') {
        // เทียบแบบตรง ๆ ก่อน
        if (node.name === targetName) return true;

        // กันเคสต่างกันเรื่องตัวพิมพ์ใหญ่/เล็ก
        if (node.name.trim().toLowerCase() === targetName.trim().toLowerCase()) {
          return true;
        }
      }

      // เดินซ้าย/ขวา ถ้าเป็น operator node
      if (node.left && visit(node.left)) return true;
      if (node.right && visit(node.right)) return true;

      return false;
    };

    return visit(def);
  } catch {
    return false;
  }
}



  // ===== Edit Field ========

  onEditField(c: ColumnDto) {
    if (c.isPrimary) {
      return; // เผื่อไว้จะทำแจ้งเตือนก็ได้ เช่น this.toast.info('Cannot edit primary key field');
    }

    this.editingColumn = c;
    this.editFieldName.set(c.name);
    this.editFieldOpen.set(true);
  }

  onCancelEditField() {
    this.editFieldOpen.set(false);
    this.editFieldName.set('');
    this.editingColumn = null;
  }

  // ============ Save Edit Field========

  async onSaveEditField() {
  const col = this.editingColumn;
  const newName = this.editFieldName().trim();

  if (!col) {
    this.onCancelEditField();
    return;
  }

  const oldName = col.name;

  if (!newName || newName === oldName) {
    this.onCancelEditField();
    return;
  }

  // 🔹 1) เช็คก่อนว่า column นี้ถูกใช้ใน Formula ไหนบ้างหรือเปล่า
  const usedByFormula = this.columns().some((c) => {
    if ((c.dataType || '').toUpperCase() !== 'FORMULA') return false;
    const raw = (c as any).formulaDefinition;
    if (!raw) return false;

    try {
      const def = JSON.parse(raw);
      const usesCol = (node: any): boolean =>
        !!node && node.type === 'column' && node.name === oldName;

      return usesCol(def.left) || usesCol(def.right);
    } catch {
      return false;
    }
  });

  if (usedByFormula) {
    this.toast.error(
      `ฟิลด์ "${oldName}" ถูกใช้ใน Formula อยู่ กรุณาแก้ Formula หรือคอลัมน์นั้นก่อนค่อย rename`
    );
    return;
  }

  // 🔹 2) ถ้าไม่ได้ถูกใช้ใน formula ค่อยเดิน flow เดิม
  try {
    await firstValueFrom(this.api.updateColumn(col, newName));
    await this.refresh();
    await this.migrateColumnDataAfterRename(oldName, newName);

    if (TableView.USE_REMOTE) {
      this.reloadRemoteCurrentPage();
    } else {
      this.reloadLocalCurrentPage();
    }
  } catch (err) {
    console.error('update column failed', err);
    alert('Cannot rename field right now.');
  } finally {
    this.onCancelEditField();
  }
}



  //=============  Helper for Edit Field ===========

  /**
   * เวลา rename column แล้ว อยากให้ข้อมูลเก่าไม่หาย:
   * ย้ายค่าใน JSON ของแต่ละ row จาก oldName -> newName แล้วยิง updateRow
   */
  private async migrateColumnDataAfterRename(oldName: string, newName: string) {
    try {
      const rows = await firstValueFrom(this.api.listRows(this.tableId));
      if (!rows || !rows.length) return;

      // เตรียม payload สำหรับ update แต่ละ row
      const updates: { rowId: number; raw: Record<string, any> }[] = [];

      for (const r of rows) {
        let obj: any;
        try {
          obj = JSON.parse(r.data ?? '{}');
        } catch {
          obj = {};
        }

        const hasOld = Object.prototype.hasOwnProperty.call(obj, oldName);
        const hasNew = Object.prototype.hasOwnProperty.call(obj, newName);

        // ถ้า row นี้ไม่มี field ชื่อเก่า ก็ข้าม
        if (!hasOld) continue;

        // ถ้า field ใหม่มีอยู่แล้ว (เช่น เคย migrate ไปแล้ว) ก็ไม่ไปยุ่ง
        if (hasNew) continue;

        const raw: Record<string, any> = {};

        // ใช้ schema ปัจจุบัน (this.columns()) ซึ่งตอนนี้ชื่อ field เป็น newName แล้ว
        for (const c of this.columns()) {
          const key = c.name;

          if (key === newName) {
            // ถ้าชื่อใหม่ → ใช้ค่าจากชื่อเก่า
            raw[key] = obj[oldName];
          } else {
            // ฟิลด์อื่น ๆ ใช้ค่าตามชื่อเดิมใน JSON
            raw[key] = obj[key];
          }
        }

        updates.push({ rowId: r.rowId, raw });
      }

      // ยิง updateRow ตามลำดับ
      for (const { rowId, raw } of updates) {
        const normalized = this.normalizeRowForSave(raw, false, false);
        await firstValueFrom(this.api.updateRow(rowId, normalized));
      }
    } catch (err) {
      console.error('migrateColumnDataAfterRename failed', err);
    }
  }

  // ---------- Row ----------
  /**
 * เวลา rename column แล้ว อยากให้ข้อมูลเก่าไม่หาย:
 * ย้าย key ใน JSON ของแต่ละ row จาก oldName -> newName แล้วยิง updateRow
 */




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
    const isCreate = !this.editingRow;

    // ตรวจ PK ซ้ำสำหรับตารางที่ไม่ใช่ auto-increment
    if (!this.isAutoTable()) {
      const pkCol = this.columns().find((c) => c.isPrimary);
      if (pkCol) {
        const pkName = pkCol.name;
        const pkVal = newObj[pkName];

        // ไม่ให้ PK ว่าง (กรณี manual PK ส่วนใหญ่จะ require อยู่แล้ว)
        if (pkVal === null || pkVal === undefined || pkVal === '') {
          this.toast.error(`ฟิลด์ ${pkName} ห้ามว่าง (ต้องระบุค่า Primary Key)`);
          return;
        }

        const currentRowId = this.editingRow?.rowId ?? null;
        const dup = this.hasDuplicatePk(pkName, pkVal, currentRowId);

        if (dup) {
          this.toast.error(`ค่าในฟิลด์ ${pkName} ห้ามซ้ำกับแถวอื่น`);
          return;
        }
      }
    }

    // ผ่าน validation แล้วค่อยปิด dialog + ส่งเข้า backend
    this.rowOpen.set(false);
    this.rowInitData = null;

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

    // ตรวจ PK ซ้ำสำหรับตารางที่ไม่ใช่ auto-increment (กรณี edit ใน grid)
    if (!this.isAutoTable()) {
      const pkCol = this.columns().find((c) => c.isPrimary);
      if (pkCol) {
        const pkName = pkCol.name;
        const pkVal = payload[pkName];

        if (pkVal === null || pkVal === undefined || pkVal === '') {
          this.toast.error(`ฟิลด์ ${pkName} ห้ามว่าง (ต้องระบุค่า Primary Key)`);
          return;
        }

        const dup = this.hasDuplicatePk(pkName, pkVal, rowId);
        if (dup) {
          this.toast.error(`ค่าในฟิลด์ ${pkName} ห้ามซ้ำกับแถวอื่น`);
          return;
        }
      }
    }

    const normalized = this.normalizeRowForSave(payload, false, false);

    await firstValueFrom(this.api.updateRow(rowId, normalized));
    if (TableView.USE_REMOTE) this.reloadRemoteCurrentPage();
    else this.reloadLocalCurrentPage();
  }

  private async deleteRowByRecord(record: any) {
    const rowId = record.__rowId as number;

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

    async onImageDialogSave(url: string) {
    this.imageDlgOpen.set(false);

    // ถ้าไม่มี URL ก็ถือว่าไม่ได้แก้อะไร
    if (!url) {
      this.resetImageDialogState();
      return;
    }

    try {
      //  เช็คว่ารูปโหลดได้จริง (cross-site / path ผิด → จะ throw)
      await this.validateImageUrl(url);

      if (this.imageDlgRecord && this.imageDlgField) {
        const rec = this.imageDlgRecord;
        rec[this.imageDlgField] = url; // แก้เฉพาะฝั่ง UI

        try {
          const row = this.grid?.getRow?.(rec.__rowId);
          row?.update(rec); // ให้ Tabulator รีเฟรช cell
        } catch {}
      }
    } catch (err) {
      console.error('image url invalid', err);
      // เตือนด้วย toast + ไม่เซฟ URL ลง cell
      this.toast.error(
        'ไม่สามารถใช้รูปจาก URL นี้ได้\nกรุณาตรวจสอบว่า path ถูกต้อง และอนุญาตให้เข้าถึงรูปจากเว็บไซต์นั้น'
      );
    } finally {
      this.resetImageDialogState();
    }
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
    const cols = this.columns();

    // 1) IMAGE ตรง ๆ จาก schema
    if (cols.some((c) => (c.dataType || '').toUpperCase() === 'IMAGE')) {
      return true;
    }

    // 2) LOOKUP ที่ตั้งชื่อมี img/image (force เป็นรูป)
    const hasLookupImageByName = cols.some((c) => {
      const t = (c.dataType || '').toUpperCase();
      if (t !== 'LOOKUP') return false;

      const name = (c.name || '').toLowerCase();
      const target = (c.lookupTargetColumnName || '').toLowerCase();
      return (
        name.includes('img') ||
        name.includes('image') ||
        target.includes('img') ||
        target.includes('image')
      );
    });
    if (hasLookupImageByName) return true;

    // 3) LOOKUP ไหนก็ได้ที่ "มีข้อมูลเป็นรูป" จริง ๆ
    if (this.hasLookupImageData) return true;

    return false;
  }

  private colSignature(): string {
    return this.columns()
      .map((c) => `${c.name}:${(c.dataType || '').toUpperCase()}:${c.isPrimary ? 1 : 0}`)
      .join('|');
  }

  private buildColumnsForGrid(): any[] {
    // ----- 1) เริ่มจาก schema ปกติ -----
    const colsBase = this.columns();
    let cols = [...colsBase];

    // ----- 3) เคลียร์ formulaFns แล้วใช้กับ cols ที่เรียงแล้ว -----
    this.formulaFns.clear(); // เคลียร์ทุกครั้งที่สร้าง column ใหม่

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
        case 'NUMBER':
        case 'FLOAT': {
          const numericEditor = lock ? false : 'number';

          return {
            ...base,
            editor: numericEditor,

            cellClick: (_e: any, cell: any) => {
              // ยังไม่ได้เปิดโหมด Quick Calc ก็ไม่ต้องทำอะไร
              if (!this.quickCalcActive()) return;

              const raw = cell.getValue();
              const num = Number(raw);
              if (!Number.isFinite(num)) return;

              // สร้าง key ของ cell นี้จาก rowId + field
              const rec = cell.getRow().getData() as any;
              const fieldName = cell.getField() as string;
              const key = `${rec.__rowId ?? ''}::${fieldName}`;

              // ถ้าเคยเก็บ cell นี้แล้ว → ไม่ต้องเก็บซ้ำ (กันเบิ้ล)
              if (this.quickCalcCellKeys.has(key)) return;

              this.quickCalcCellKeys.add(key);

              // เพิ่มค่าเข้า array ตามปกติ
              const current = this.quickCalcValues();
              this.quickCalcValues.set([...current, num]);
            },
          };
        }

        case 'BOOLEAN': {
          return {
            ...base,
            // แสดงผลด้วย ✓ / ✗ สีเขียว-แดง เหมือน lookup bool
            formatter: (cell: any) => {
              const v = cell.getValue();
              const isTrue = v === true || v === 'true' || v === 1 || v === '1';

              const symbol = isTrue ? '✓' : '✗';
              const color = isTrue ? '#22c55e' : '#ef4444';

              return `<span style="
        font-size:16px;
        font-weight:700;
        color:${color};
        line-height:1;
        display:inline-block;
      ">${symbol}</span>`;
            },

            // ไม่ใช้ editor tickCross แล้ว
            editor: false,

            // ให้คลิกเซลล์เพื่อ toggle true/false แทน (เหมือนปุ่ม)
            cellClick: (e: any, cell: any) => {
              const v = cell.getValue();
              const isTrue = v === true || v === 'true' || v === 1 || v === '1';

              const next = !isTrue;
              cell.setValue(next);

              // อัปเดต rec ใน grid ด้วย เพื่อให้ไป save ตอนกดปุ่ม Save row
              const rec = cell.getRow().getData() as any;
              const field = cell.getField() as string;
              rec[field] = next;
            },
          };
        }

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
            cellClick: (e: any, cell: any) => {
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

                this.formulaFns.set(field, formulaFn);
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

            // >>> ตรงนี้ <<<  ใช้ค่า formula มาคิด quick calc ได้
            cellClick: (_e: any, cell: any) => {
              if (!this.quickCalcActive()) return;
              if (!formulaFn) return;

              const rec = cell.getRow().getData();
              const v = formulaFn(rec);

              const num = Number(v);
              if (!Number.isFinite(num)) return;

              const fieldName = cell.getField() as string;
              const key = `${rec.__rowId ?? ''}::${fieldName}::formula`;
              if (this.quickCalcCellKeys.has(key)) return;

              this.quickCalcCellKeys.add(key);

              const current = this.quickCalcValues();
              this.quickCalcValues.set([...current, num]);
            },
          };
        }

        case 'DATE': {
          return {
            ...base,
            editor: (cell: any, onRendered: any, success: (v: any) => void, cancel: () => void) => {
              const input = document.createElement('input');
              input.type = 'date';
              input.className = 'ph-date-editor-input';

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
            formatter: (cell: any) => {
              const raw = cell.getValue();
              const text = this.formatDateDdMmYyyy(raw);
              return `<span>${text}</span>`;
            },
          };
        }

        case 'LOOKUP': {
          const colName = (c.name || '').toLowerCase();
          const targetName = (c.lookupTargetColumnName || '').toLowerCase();

          // ยังเก็บ isImageLookup แบบเดิมไว้ เผื่ออยาก force เป็นรูปด้วยชื่อ
          const isImageLookupByName =
            colName.includes('img') ||
            colName.includes('image') ||
            targetName.includes('img') ||
            targetName.includes('image');

          // helper: ตรวจว่าค่านี้ "ดูเหมือน" image url/base64 หรือไม่
          const detectImageUrl = (raw: any): string | null => {
            if (!raw || typeof raw !== 'string') return null;
            const s = raw.trim();
            if (!s) return null;

            // base64 data URL
            if (/^data:image\//i.test(s)) return s;

            // http/https/blob ที่ลงท้ายเป็นนามสกุลรูป
            if (/^(https?:\/\/|blob:)/i.test(s) && /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(s)) {
              return s;
            }

            return null;
          };

          // ใช้ formatter สำหรับ "โหมดรูป" เผื่อ reuse
          const imageFormatter = (cell: any) => {
            const rowData = cell.getRow().getData();
            const field = cell.getField();

            // พยายามใช้ display ก่อน ถ้าไม่มีค่อยไปดูค่า FK
            const rawDisplay = rowData[`${field}__display`];
            const rawValue = rowData[field];

            const url = detectImageUrl(rawDisplay) || detectImageUrl(rawValue);

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

            if (url) {
              const img = document.createElement('img');
              img.src = url;
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
            }

            return wrap;
          };

          // ถ้าอยาก force ทั้ง column ให้เป็น image ด้วยชื่อเดิม ก็ยังใช้ branch นี้ได้
          if (isImageLookupByName) {
            return {
              ...base,
              cssClass: 'cell-image',
              minWidth: 160,
              editor: false,
              formatter: imageFormatter,
            };
          }

          // ค่า default: ตรวจจาก data ถ้าเป็นรูป → แสดงรูป ไม่งั้นก็ text/bool/date เหมือนเดิม
          return {
            ...base,
            editor: false,
            formatter: (cell: any) => {
              const rowData = cell.getRow().getData();
              const field = cell.getField();
              const disp = rowData[`${field}__display`];

              // ถ้า data ดูเป็นรูป → render รูปทันที
              const imgUrl = detectImageUrl(disp) || detectImageUrl(rowData[field]);

              if (imgUrl) {
                // ใช้ formatter แบบเดียวกับ imageFormatter แต่ไม่ต้อง detect อีกแล้ว
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

                const img = document.createElement('img');
                img.src = imgUrl;
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
                return wrap;
              }

              // ไม่ใช่รูป → ใช้ logic เดิม: bool ✓✗ / date / text
              const isBoolLike =
                disp === true ||
                disp === false ||
                disp === 'true' ||
                disp === 'false' ||
                disp === 1 ||
                disp === 0 ||
                disp === '1' ||
                disp === '0';

              if (isBoolLike) {
                const v = disp === true || disp === 'true' || disp === 1 || disp === '1';
                const symbol = v ? '✓' : '✗';
                const color = v ? '#22c55e' : '#ef4444';
                return `<span style="
          font-size:16px;
          font-weight:700;
          color:${color};
          line-height:1;
          display:inline-block;
        ">${symbol}</span>`;
              }

              if (typeof disp === 'string') {
                const raw10 = disp.substring(0, 10);
                if (
                  /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(raw10) || // yyyy-MM-dd / yyyy/MM/dd
                  /^\d{2}-\d{2}-\d{4}$/.test(raw10) // dd-MM-yyyy
                ) {
                  const text = this.formatDateDdMmYyyy(raw10);
                  return `<span>${text}</span>`;
                }
              }

              return disp ?? '';
            },

            // quick calc logic เดิมยังใช้ได้
            cellClick: (_e: any, cell: any) => {
              if (!this.quickCalcActive()) return;

              const rowData = cell.getRow().getData();
              const field = cell.getField();

              const disp = rowData[`${field}__display`];
              const fk = rowData[field];

              const isBoolLike =
                disp === true ||
                disp === false ||
                disp === 'true' ||
                disp === 'false' ||
                disp === 1 ||
                disp === 0 ||
                disp === '1' ||
                disp === '0';

              if (isBoolLike) return;

              const source = disp ?? fk;
              const num = Number(source);

              if (!Number.isFinite(num)) return;

              const key = `${rowData.__rowId ?? ''}::${field}::lookup`;
              if (this.quickCalcCellKeys.has(key)) return;

              this.quickCalcCellKeys.add(key);

              const current = this.quickCalcValues();
              this.quickCalcValues.set([...current, num]);
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
      width: 150,
      headerHozAlign: 'center',
      hozAlign: 'center',
      vertAlign: 'middle',
      widthGrow: 0,
      formatter: () => `
    <div
      style="
        display:flex;
        align-items:center;
        justify-content:center;
        gap:6px;
      "
    >
      <button
        type="button"
        data-action="save"
        style="
          padding:4px 12px;
          border-radius:999px;
          border:1px solid rgba(16,185,129,0.55);
          background:linear-gradient(
            135deg,
            rgba(209,250,229,0.96),
            rgba(224,242,254,0.95)
          );
          font-size:11px;
          line-height:1;
          color:#047857;
          cursor:pointer;
          box-shadow:
            0 1px 2px rgba(15,23,42,0.15),
            0 0 0 1px rgba(148,163,184,0.15);
          backdrop-filter:blur(6px);
          -webkit-backdrop-filter:blur(6px);
          transition:
            background-color 120ms ease,
            box-shadow 120ms ease,
            transform 80ms ease,
            border-color 120ms ease,
            color 120ms ease;
        "
        onmouseover="
          this.style.boxShadow='0 4px 10px rgba(15,23,42,0.18),0 0 0 1px rgba(16,185,129,0.65)';
          this.style.transform='translateY(-0.5px)';
        "
        onmouseout="
          this.style.boxShadow='0 1px 2px rgba(15,23,42,0.15),0 0 0 1px rgba(148,163,184,0.15)';
          this.style.transform='translateY(0)';
        "
      >
        Save
      </button>

      <button
        type="button"
        data-action="delete"
        style="
          padding:4px 12px;
          border-radius:999px;
          border:1px solid rgba(248,113,113,0.6);
          background:linear-gradient(
            135deg,
            rgba(254,242,242,0.96),
            rgba(255,247,237,0.95)
          );
          font-size:11px;
          line-height:1;
          color:#b91c1c;
          cursor:pointer;
          box-shadow:
            0 1px 2px rgba(15,23,42,0.15),
            0 0 0 1px rgba(248,113,113,0.25);
          backdrop-filter:blur(6px);
          -webkit-backdrop-filter:blur(6px);
          transition:
            background-color 120ms ease,
            box-shadow 120ms ease,
            transform 80ms ease,
            border-color 120ms ease,
            color 120ms ease;
        "
        onmouseover="
          this.style.boxShadow='0 4px 10px rgba(15,23,42,0.20),0 0 0 1px rgba(248,113,113,0.7)';
          this.style.transform='translateY(-0.5px)';
        "
        onmouseout="
          this.style.boxShadow='0 1px 2px rgba(15,23,42,0.15),0 0 0 1px rgba(248,113,113,0.25)';
          this.style.transform='translateY(0)';
        "
      >
        Delete
      </button>
    </div>
  `,
      cellClick: async (e: any, cell: any) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const record = cell.getRow().getData() as any;
        if (action === 'save') {
          this.openRowConfirm('save', record);
        }
        if (action === 'delete') {
          this.openRowConfirm('delete', record);
        }
      },
      resizable: false,
    });

    // ===== ใช้ field order ที่เคยเซฟไว้ (ไม่สน Actions) =====
    const savedOrder = this.loadSavedColumnLayout();
    if (savedOrder && savedOrder.length) {
      const indexOf = (field: string) => {
        const i = savedOrder.indexOf(field);
        // field ที่ไม่เคยอยู่ใน savedOrder ให้ไปอยู่ท้าย ๆ
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };

      defs.sort((a, b) => {
        const fa = a.field as string;
        const fb = b.field as string;
        return indexOf(fa) - indexOf(fb);
      });
    }

    return defs;
  }

  private buildDataForGridFromRows(rows: RowDto[]): any[] {
    const cols = this.columns();

    // รีเซ็ตค่า ก่อน map rows รอบใหม่
    this.hasLookupImageData = false;

    // 1) map row จาก backend → rec ที่ใช้ใน Tabulator
    const data = rows.map((r) => {
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
          const fk = obj?.[name] ?? null;
          const display = anyRow[name] ?? fk;

          rec[name] = fk;
          rec[`${name}__display`] = display ?? null;

          // ตรวจว่าค่า LOOKUP อันนี้ "ดูเหมือนรูป" หรือไม่
          if (this.looksLikeImage(display) || this.looksLikeImage(fk)) {
            this.hasLookupImageData = true;
          }

          continue;
        }

        rec[name] = obj?.[name] ?? null;
      }

      return rec;
    });

    //ส่วนของการ sort ด้วย PK

    // 2) หา primary key column (ถ้ามี) เช่น ID
    const pkCol = cols.find((c) => c.isPrimary) || null;
    const pkName = pkCol?.name;

    // 3) sort data ก่อนส่งเข้า Tabulator
    if (pkName) {
      // ถ้ามี PK → เรียงตามค่าในคอลัมน์ PK แบบเลข จากน้อยไปมาก
      data.sort((a, b) => {
        const av = Number(a[pkName] ?? 0);
        const bv = Number(b[pkName] ?? 0);

        if (Number.isNaN(av) || Number.isNaN(bv)) {
          // ถ้า PK ไม่ใช่เลข / แปลงไม่ได้ → fallback มาใช้ rowId
          return (a.__rowId ?? 0) - (b.__rowId ?? 0);
        }
        return av - bv;
      });
    } else {
      // ถ้าโต๊ะนี้ไม่มี PK flag → เรียงตาม rowId แทน (ลำดับสร้างใน DB)
      data.sort((a, b) => (a.__rowId ?? 0) - (b.__rowId ?? 0));
    }

    return data;
  }

  // ---------- Local helpers ----------
  private async loadLocalData(goLast = false) {
    // จำค่า mode เดิมก่อนโหลดข้อมูล (ตอนนี้ยังใช้ hasLookupImageData เก่าอยู่)
    const beforeHasImage = this.hasImageColumn();

    const rows = await firstValueFrom(this.api.listRows(this.tableId));
    const data = this.buildDataForGridFromRows(rows); //  ในนี้จะเซ็ต this.hasLookupImageData = true ถ้าเจอรูป
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

    // หลังจาก buildDataForGridFromRows แล้ว ตรวจใหม่ว่าตอนนี้มี image column หรือยัง
    const afterHasImage = this.hasImageColumn();

    // ถ้า state เปลี่ยน (เช่น จากไม่มีรูป → มีรูป lookup จริง ๆ)
    // ให้ rebuild grid ใหม่ด้วย rowHeight แบบ image mode
    if (afterHasImage !== beforeHasImage) {
      this.ensureGridAndSync();
    }
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
      persistence: false,
      persistenceMode: false,
      paginationSizeSelector: [10, 20, 50, 100],
      paginationCounter: 'pages',
      height: '100%',
      reactiveData: false,
      movableColumns: true,
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
          this.saveColumnLayoutFromGrid();
        } catch {}
      },

      tableBuilt: () => {
        try {
          this.grid.redraw(true);
          this.saveColumnLayoutFromGrid();
        } catch {}
      },

      layoutChanged: () => {
        try {
          this.grid.redraw(true);
        } catch {}
      },

      columnMoved: () => {
        try {
          this.saveColumnLayoutFromGrid();
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

    try {
      // ยิงทุกครั้งที่ "ลากย้ายคอลัมน์"
      this.grid.on('columnMoved', (_col: any, _cols: any[]) => {
        console.log('[event] columnMoved');
        this.saveColumnLayoutFromGrid();
      });

      // ยิงตอน resize คอลัมน์ (เผื่ออยากจำลำดับ+layoutรวม ๆ)
      this.grid.on('columnResized', () => {
        console.log('[event] columnResized');
        this.saveColumnLayoutFromGrid();
      });
    } catch (err) {
      console.warn('bind tabulator events failed', err);
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

  /** เช็คว่า PK ซ้ำกับ row อื่นใน grid หรือไม่ (ใช้กับตารางที่ไม่ auto-increment) */
  private hasDuplicatePk(pkName: string, value: any, excludeRowId?: number | null): boolean {
    if (value === null || value === undefined || value === '') return false;
    if (!this.grid || typeof this.grid.getData !== 'function') return false;

    const target = String(value);
    const all = this.grid.getData() || [];

    for (const rec of all) {
      const rowId = rec.__rowId as number | undefined;

      // ถ้ามี rowId ที่ต้องไม่เช็ค (เช่น แก้ไข row เดิม) ให้ข้าม
      if (excludeRowId != null && rowId === excludeRowId) continue;

      const v = rec[pkName];
      if (v === null || v === undefined || v === '') continue;

      if (String(v) === target) {
        return true;
      }
    }

    return false;
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

  // ================ Helper For Column Layout =========================

  private getColLayoutStorageKey(): string {
    // แยกต่อ table
    return `ph_col_layout_t${this.tableId}`;
  }

  /** อ่านลำดับ field ของคอลัมน์ที่เคยเซฟไว้ */
  private loadSavedColumnLayout(): string[] | null {
    try {
      const key = this.getColLayoutStorageKey();
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const arr = JSON.parse(raw);

      // รูปแบบใหม่: ['ID','Name','Price']
      if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
        return arr;
      }

      // กันเคสถ้าเคยเซฟเป็น layout object แบบเดิม
      if (Array.isArray(arr) && arr.length && typeof arr[0] === 'object') {
        const fields = arr.map((x: any) => x.field).filter((f: any) => typeof f === 'string');
        return fields.length ? fields : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  /** เซฟ “ลำดับ field ปัจจุบัน” ลง localStorage */
  private saveColumnLayoutFromGrid() {
    try {
      if (!this.grid) return;

      const cols = this.grid.getColumns(); // Tabulator ColumnComponent[]
      const fields: string[] = cols
        .map((col: any) => col.getField && col.getField())
        .filter((f: any) => typeof f === 'string' && f !== '__actions');

      const key = this.getColLayoutStorageKey();
      localStorage.setItem(key, JSON.stringify(fields));
    } catch {}
  }

  // ==================================================================================

  // ===== Row confirm dialog (for Actions column) =====
  openRowConfirm(mode: 'save' | 'delete', record: any) {
    this.rowConfirmMode.set(mode);
    this.rowConfirmRecord.set(record);
    this.rowConfirmOpen.set(true);
  }

  onCancelRowConfirm() {
    this.rowConfirmOpen.set(false);
    this.rowConfirmRecord.set(null);
  }

  async onConfirmRowAction() {
    const mode = this.rowConfirmMode();
    const rec = this.rowConfirmRecord();

    if (!rec) {
      this.onCancelRowConfirm();
      return;
    }

    try {
      if (mode === 'save') {
        await this.saveRowByRecord(rec);
      } else {
        await this.deleteRowByRecord(rec);
      }
    } finally {
      this.onCancelRowConfirm();
    }
  }

  // ================== helper ใช้ตรวจว่า string หน้าตาเหมือน image url/base64 หรือไม่ =========
  private looksLikeImage(raw: any): boolean {
    if (!raw || typeof raw !== 'string') return false;
    const s = raw.trim();
    if (!s) return false;

    // base64 data URL
    if (/^data:image\//i.test(s)) return true;

    // http/https/blob ลงท้ายเป็นนามสกุลรูป
    if (/^(https?:\/\/|blob:)/i.test(s) && /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(s)) {
      return true;
    }

    return false;
  }

  /** โหลดรูปจาก URL แล้วเช็คว่ารูปใช้ได้จริงไหม (404 / block / path ผิดจะ error) */
  private validateImageUrl(url: string, timeoutMs = 8000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!url || typeof url !== 'string') {
        return reject(new Error('URL ว่าง'));
      }

      const img = new Image();
      let done = false;

      const cleanup = () => {
        if (done) return;
        done = true;
        img.onload = null;
        img.onerror = null;
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('timeout'));
      }, timeoutMs);

      img.onload = () => {
        clearTimeout(timer);
        cleanup();
        resolve();
      };

      img.onerror = () => {
        clearTimeout(timer);
        cleanup();
        reject(new Error('load-error'));
      };

      // เพิ่ม cache-buster กันเคสเบราเซอร์แคช error เก่า ๆ
      const sep = url.includes('?') ? '&' : '?';
      img.src = `${url}${sep}_ph_chk_=${Date.now()}`;
    });
  }
}
