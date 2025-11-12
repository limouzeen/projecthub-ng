// src/app/pages/project-detail/project-detail.ts
import {
  Component, OnInit, OnDestroy, signal, computed, inject, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ProjectDetailService, TableDto } from '../../core/project-detail.service';
import { CreateTableDialog } from './ui/create-table-dialog';
import { FooterStateService } from '../../core/footer-state.service';
import { UsersService, MeDto } from '../../core/users.service'; // << เพิ่ม

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

  constructor(private footerSvc: FooterStateService) {}

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
    } catch {
      // ถ้า token ไม่ถูก ส่งไป login
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
    } finally {
      this.creating.set(false);
      this.dialogOpen.set(false);
    }
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
    } finally {
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
    } finally {
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
