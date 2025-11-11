import { Component, OnInit, OnDestroy, signal, computed, inject, HostListener, } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ProjectDetailService, TableDto } from '../../core/project-detail.service';
import { CreateTableDialog } from './ui/create-table-dialog';
import { FooterStateService } from '../../core/footer-state.service';
@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, CreateTableDialog, RouterLink],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css',
})
export class ProjectDetail implements OnInit {
  private readonly api    = inject(ProjectDetailService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

  projectId = 1;

  // state
  readonly tables     = signal<TableDto[]>([]);
  readonly q          = signal('');
  readonly loading    = signal(false);
  readonly creating   = signal(false);
  readonly renamingId = signal<number | null>(null);
  readonly deletingId = signal<number | null>(null);

  // dialog
  readonly dialogOpen = signal(false);

  // filter
  readonly filtered = computed(() => {
    const keyword = this.q().toLowerCase().trim();
    return !keyword ? this.tables() : this.tables().filter(t => t.name.toLowerCase().includes(keyword));
  });


    // layout / nav
  asideOpen = signal(false);
  profileOpen = signal(false);



  //======== Constructor ==========

  constructor(
    private footer: FooterStateService
  ) {}



  async ngOnInit() {


    //  ตั้ง threshold เฉพาะหน้า Login: ย่อเมื่อสูง < 719px
    this.footer.setThreshold(719);
    this.footer.setForceCompact(null); // ให้ทำงานแบบ auto ตาม threshold


    const fromRoute = Number(this.route.snapshot.paramMap.get('projectId') ?? this.route.snapshot.paramMap.get('id') ?? '0');
    if (!Number.isNaN(fromRoute) && fromRoute > 0) this.projectId = fromRoute;
    await this.refresh();
  }



  // ออกจากหน้านี้ให้คืนค่ากลับปกติ
  ngOnDestroy(): void {
    this.footer.resetAll();
  }


  async refresh() {
  this.loading.set(true);
  try {
    this.tables.set(await firstValueFrom(this.api.listTables(this.projectId)));
    this.normalizePage();
  } finally {
    this.loading.set(false);
  }
}


  openCreateDialog() {
    this.dialogOpen.set(true);
  }

 async onCreateTable(payload: { name: string; useAutoIncrement: boolean }) {
  this.creating.set(true);
  try {
    const created = await firstValueFrom(
      this.api.createTable(this.projectId, payload.name, payload.useAutoIncrement)
    );

    // เก็บ flag จำว่า table นี้เป็น auto-increment (ใช้ตอนเปิด Table-view)
    if (payload.useAutoIncrement) {
      localStorage.setItem('ph:auto:' + created.tableId, '1');
    } else {
      localStorage.removeItem('ph:auto:' + created.tableId);
    }

    await this.refresh();
    // ไปหน้า table-view ก็ได้ ถ้าต้องการ
    // this.router.navigate(['/table', created.tableId]);
  } finally {
    this.creating.set(false);
    this.dialogOpen.set(false);
  }
}


  async renameTable(t: TableDto) {
    const next = window.prompt('Rename table:', t.name);
    if (!next || next === t.name) return;

    this.renamingId.set(t.tableId);
    try {
      await firstValueFrom(this.api.renameTable(t.tableId, next));
      await this.refresh();
    } finally {
      this.renamingId.set(null);
    }
  }

  async deleteTable(t: TableDto) {
  if (!window.confirm(`Delete table "${t.name}"?`)) return;
  this.deletingId.set(t.tableId);
  try {
    await firstValueFrom(this.api.deleteTable(t.tableId));
    localStorage.removeItem(`ph:auto:${t.tableId}`); // ล้าง flag
    await this.refresh();
  } finally {
    this.deletingId.set(null);
  }
}

  open(t: TableDto) {
  this.router.navigate(
    ['/table', t.tableId],
    { queryParams: { projectId: this.projectId } }
  );
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


  //===============Paging ========================
  readonly page     = signal(1);
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

private normalizePage() {
  const total = this.filtered().length;
  const maxPage = total > 0 ? Math.ceil(total / this.pageSize) : 1;
  if (this.page() > maxPage) {
    this.page.set(maxPage);
  }
  if (this.page() < 1) {
    this.page.set(1);
  }
}

onSearch(value: string) {
  this.q.set(value);
  this.page.set(1);      // รีหน้าเมื่อ filter เปลี่ยน
  this.normalizePage();
}


nextPage() {
  if (this.page() < this.totalPages()) {
    this.page.update(p => p + 1);
  }
}

prevPage() {
  if (this.page() > 1) {
    this.page.update(p => p - 1);
  }
}


onBackToDashboard() {
  this.router.navigate(['/dashboard']);
}



}
