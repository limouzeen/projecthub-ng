// src/app/pages/project-detail/project-detail.ts
import {
  Component, OnInit, OnDestroy, signal, computed, inject, HostListener,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ProjectDetailService, TableDto } from '../../core/project-detail.service';
import { CreateTableDialog } from './ui/create-table-dialog';
import { FooterStateService } from '../../core/footer-state.service';
import { UsersService, MeDto } from '../../core/users.service'; 
import { ToastService } from '../../shared/toast.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, CreateTableDialog, RouterLink],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css',
})
export class ProjectDetail implements OnInit, OnDestroy {
  private readonly api = inject(ProjectDetailService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly users = inject(UsersService);            // << เพิ่ม
  private readonly footer = inject(FooterStateService);


  private readonly toast = inject(ToastService);

  projectId = 1;

  // profile (แสดงขวาบน)
  readonly me = signal<MeDto | null>(null);                 // << เพิ่ม

  // state
  readonly tables = signal<TableDto[]>([]);
  readonly q = signal('');
  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly renamingId = signal<number | null>(null);
  readonly deletingId = signal<number | null>(null);

  // dialog
  readonly dialogOpen = signal(false);
  readonly renameDlgOpen = signal(false);
  readonly deleteDlgOpen = signal(false);
  readonly renameName = signal('');
  readonly targetTable = signal<TableDto | null>(null);

  // filter
  readonly filtered = computed(() => {
    const keyword = this.q().toLowerCase().trim();
    return !keyword
      ? this.tables()
      : this.tables().filter((t) => (t.name ?? '').toLowerCase().includes(keyword));
  });

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

  // layout / nav
  asideOpen = signal(false);
  profileOpen = signal(false);

  //===============Paging ========================
  readonly page = signal(1);
  readonly pageSize = 5;

  readonly totalPages = computed(() => {
    const total = this.filtered().length;
    return total > 0 ? Math.ceil(total / this.pageSize) : 1;
  });

  readonly paged = computed(() => {
    const list = this.filtered();
    const start = (this.page() - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  });

  constructor(private footerSvc: FooterStateService, private location: Location) {}

  async ngOnInit() {
    // footer behavior
    this.footerSvc.setThreshold(719);
    this.footerSvc.setForceCompact(null);

    // projectId from route
    const fromRoute = Number(
      this.route.snapshot.paramMap.get('projectId') ?? this.route.snapshot.paramMap.get('id') ?? '0'
    );
    if (!Number.isNaN(fromRoute) && fromRoute > 0) this.projectId = fromRoute;

    // โหลดข้อมูลผู้ใช้สำหรับโปรไฟล์ขวาบน
    try {
      const me = await this.users.getMe();
      this.me.set(me);
    } catch (e) {
    this.showHttpError(e, 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
    this.router.navigateByUrl('/login');
    return;
  }

    await this.refresh();
  }

  ngOnDestroy(): void {
    this.footerSvc.resetAll();
  }



  async refresh() {
    this.loading.set(true);
    try {
      // ใช้ endpoint ใหม่ /api/tables/project/{projectId}
      const list = await firstValueFrom(this.api.listTables(this.projectId));
      this.tables.set(list);
      this.normalizePage();
    } catch (e) {
    this.showHttpError(e, 'โหลดรายการตารางไม่สำเร็จ');
  } finally {
      this.loading.set(false);
    }
  }

  openCreateDialog() { this.dialogOpen.set(true); }

  async onCreateTable(payload: { name: string; useAutoIncrement: boolean }) {
    this.creating.set(true);
    try {
      const created = await firstValueFrom(
        this.api.createTable(this.projectId, payload.name, payload.useAutoIncrement)
      );

      // จำว่า table นี้เปิด auto-increment (ใช้กับหน้า table-view)
      if (payload.useAutoIncrement) {
        localStorage.setItem('ph:auto:' + created.tableId, '1');
      } else {
        localStorage.removeItem('ph:auto:' + created.tableId);
      }

      await this.refresh();
    } 
    catch (e) {
    this.showHttpError(e, 'สร้างตารางไม่สำเร็จ');
  }
    finally {
      this.creating.set(false);
      this.dialogOpen.set(false);
    }
  }

  // ----- UI helpers -----
  onBack() {
    this.location.back();
  }

  // ===== Rename & Delete =====
  renameTable(t: TableDto) {
    this.targetTable.set(t);
    this.renameName.set(t.name);
    this.renameDlgOpen.set(true);
  }

  deleteTable(t: TableDto) {
    this.targetTable.set(t);
    this.deleteDlgOpen.set(true);
  }

  closeRenameDialog() {
    this.renameDlgOpen.set(false);
    this.renameName.set('');
    this.targetTable.set(null);
  }

  async confirmRenameTable() {
    const t = this.targetTable();
    const next = this.renameName().trim();
    if (!t || !next || next === t.name) return this.closeRenameDialog();

    this.renamingId.set(t.tableId);
    try {
      await firstValueFrom(this.api.renameTable(t.tableId, next));
      await this.refresh();
    } catch (e) {
    this.showHttpError(e, 'แก้ไขชื่อไม่สำเร็จ');
  }finally {
      this.renamingId.set(null);
      this.closeRenameDialog();
    }
  }

  closeDeleteDialog() {
    this.deleteDlgOpen.set(false);
    this.targetTable.set(null);
  }

  async confirmDeleteTable() {
    const t = this.targetTable();
    if (!t) return this.closeDeleteDialog();

    this.deletingId.set(t.tableId);
    try {
      await firstValueFrom(this.api.deleteTable(t.tableId));
      localStorage.removeItem(`ph:auto:${t.tableId}`);
      await this.refresh();
    } catch (e) {
    this.showHttpError(e, 'ลบตารางไม่สำเร็จ');
  }finally {
      this.deletingId.set(null);
      this.closeDeleteDialog();
    }
  }

  open(t: TableDto) {
    this.router.navigate(['/table', t.tableId], { queryParams: { projectId: this.projectId } });
  }

  // ===== UI helpers =====
  toggleAside() {
    const next = !this.asideOpen();
    this.asideOpen.set(next);
    if (typeof document !== 'undefined') document.body.style.overflow = next ? 'hidden' : '';
  }
  toggleProfileMenu() { this.profileOpen.update(v => !v); }
  onEditProfile() { this.profileOpen.set(false); this.router.navigateByUrl('/profile/edit'); }
  onLogout() { this.profileOpen.set(false); this.router.navigateByUrl('/login'); }

  @HostListener('document:click') onDocClick() {
    if (this.profileOpen()) this.profileOpen.set(false);
  }
  @HostListener('document:keydown.escape') onEsc() {
    if (this.profileOpen()) { this.profileOpen.set(false); return; }
    if (this.asideOpen()) {
      this.asideOpen.set(false);
      if (typeof document !== 'undefined') document.body.style.overflow = '';
    }
  }

  private normalizePage() {
    const total = this.filtered().length;
    const maxPage = total > 0 ? Math.ceil(total / this.pageSize) : 1;
    if (this.page() > maxPage) this.page.set(maxPage);
    if (this.page() < 1) this.page.set(1);
  }
  onSearch(value: string) { this.q.set(value); this.page.set(1); this.normalizePage(); }
  nextPage() { if (this.page() < this.totalPages()) this.page.update(p => p + 1); }
  prevPage() { if (this.page() > 1) this.page.update(p => p - 1); }
  onBackToDashboard() { this.router.navigate(['/dashboard']); }
}
