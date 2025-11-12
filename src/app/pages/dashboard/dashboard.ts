import {
  Component,
  effect,
  signal,
  computed,
  HostListener,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { DatePipe, NgClass, CommonModule } from '@angular/common';
import { ProjectsService, Project } from '../../core/projects.service';
import { FooterStateService } from '../../core/footer-state.service';
import { UsersService, MeDto } from '../../core/users.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, NgClass, CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements AfterViewInit, OnDestroy {
  @ViewChild('pagerZone', { static: false }) pagerZone?: ElementRef<HTMLElement>;

  me = signal<MeDto | null>(null);

  private updateFooterAvoidOverlap() {
    const pager = this.pagerZone?.nativeElement;
    const pill = document.querySelector<HTMLElement>('.footer-pill');
    if (!pager || !pill) return;


   

    const vpH = window.innerHeight;
    const pr = pager.getBoundingClientRect();
    const pillH = pill.offsetHeight || 48;
    const bottomGap = 16;
    const pillTop = vpH - bottomGap - pillH;
    const pillBottom = pillTop + pillH;

    const pagerInViewport = pr.bottom > 0 && pr.top < vpH;
    const overlap = pagerInViewport ? pillTop < pr.bottom && pillBottom > pr.top : false;

    this.footer.setForceCompact(overlap ? true : null);
  }

  private onScroll = () => this.updateFooterAvoidOverlap();
  private onResize = () => {
    this.updateFooterAvoidOverlap();
    this.pageSize.set(this.calcPageSize(window.innerHeight));
  };


   // ============== Dialog ==============
    newProjectDlgOpen = signal(false);
    newProjectName = signal('');

    renameDlgOpen = signal(false);
    renameProjectId = signal<number | null>(null);
    renameProjectName = signal('');

    deleteDlgOpen = signal(false);
    deleteProjectId = signal<number | null>(null);
    deleteProjectName = signal('');

    // =================================================


    /** เพิ่มสำหรับ Bulk Delete */
deleteManyDlgOpen = signal(false);
selectedNamesPreview = computed(() => {
  const ids = Array.from(this.selected());
  const names = this.projects()
    .filter(p => ids.includes(p.id))
    .map(p => p.name);
  // โชว์แค่ 3 ชื่อพอ ที่เหลือเป็น … เพื่อไม่ให้ล้น
  const shown = names.slice(0, 3);
  const more = Math.max(0, names.length - shown.length);
  return more > 0 ? `${shown.join(', ')} และอีก ${more}` : shown.join(', ');
});
selectedCount = computed(() => this.selected().size);


// =================================================
  async ngAfterViewInit() {
    this.footer.setThreshold(720);
    setTimeout(() => {
      this.updateFooterAvoidOverlap();
      this.pageSize.set(this.calcPageSize(window.innerHeight));
    }, 0);

    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });

     // 👇 โหลดโปรไฟล์ (เพื่อได้ userId/รูป/ชื่อ/อีเมล)
    try {
      const info = await this.users.getMe();
      this.me.set(info);
    } catch {
      // ถ้า 401 ส่งไปหน้า login
      this.router.navigateByUrl('/login');
      return;
    }

    // 👇 โหลดโปรเจกต์ของ user (claims)
    await this.svc.refresh();

    // sync signal ใช้กับส่วนกรอง/เพจ เหมือนเดิม
    effect(() => this.projects.set(this.svc.list()), { allowSignalWrites: true });
    effect(() => { const _q = this.keyword(); const _s = this.pageSize(); this.pageIndex.set(0); }, { allowSignalWrites: true });
    effect(() => { const pc = this.pageCount(); if (this.pageIndex() >= pc) this.pageIndex.set(pc - 1); }, { allowSignalWrites: true });
  }

  ngOnDestroy() {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    this.footer.resetAll();
  }

  readonly Math = Math;
  keyword = signal('');
  selected = signal<Set<number>>(new Set());
  asideOpen = signal(false);
  menuOpenId = signal<number | null>(null);
  profileOpen = signal(false);

  projects = signal<Project[]>([]);
  filtered = computed(() => {
    const q = this.keyword().trim().toLowerCase();
    const list = this.projects();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  });

  private calcPageSize(h: number): number {
    return h < 800 ? 5 : 8;
  }
  pageSize = signal<number>(
    typeof window !== 'undefined' ? this.calcPageSize(window.innerHeight) : 8
  );

  pageIndex = signal(0);
  pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  pages = computed(() => Array.from({ length: this.pageCount() }, (_, i) => i));
  paged = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  constructor(
    private svc: ProjectsService,
    private router: Router,
    private footer: FooterStateService,
    private users: UsersService,  
  ) {
    // sync รายการจาก service ตามเดิม
    effect(() => this.projects.set(this.svc.list()), { allowSignalWrites: true });

    //  รีเซ็ตหน้าเฉพาะเมื่อเงื่อนไขการค้นหา/ขนาดหน้าเปลี่ยน
    effect(
      () => {
        const _q = this.keyword(); // ผูกกับ keyword
        const _s = this.pageSize(); // ผูกกับ pageSize
        this.pageIndex.set(0);
      },
      { allowSignalWrites: true }
    );

    // (เสริม) ถ้าจำนวนหน้าลดลง ให้ clamp หน้าไม่ให้เกิน
    effect(
      () => {
        const pc = this.pageCount();
        if (this.pageIndex() >= pc) this.pageIndex.set(pc - 1);
      },
      { allowSignalWrites: true }
    );
  }

  toggleAside() {
    const next = !this.asideOpen();
    this.asideOpen.set(next);
    if (typeof document !== 'undefined') document.body.style.overflow = next ? 'hidden' : '';
  }

  @HostListener('document:click') onDocClick() {
    if (this.menuOpenId() !== null) this.menuOpenId.set(null);
    if (this.profileOpen()) this.profileOpen.set(false);
  }
  // @HostListener('document:keydown.escape') onEsc() {
  //   if (this.profileOpen()) {
  //     this.profileOpen.set(false);
  //     return;
  //   }
  //   if (this.menuOpenId() !== null) {
  //     this.menuOpenId.set(null);
  //     return;
  //   }
  //   if (this.asideOpen()) {
  //     this.asideOpen.set(false);
  //     if (typeof document !== 'undefined') document.body.style.overflow = '';
  //   }
  // }


  //=============  Close Dialog ================================


  @HostListener('document:keydown.escape')
onEsc() {
  if (this.newProjectDlgOpen()) { this.closeNewProjectDialog(); return; }
  if (this.renameDlgOpen())    { this.closeRenameDialog(); return; }
  if (this.deleteDlgOpen())    { this.closeDeleteDialog(); return; }
  if (this.deleteManyDlgOpen()) { this.closeDeleteManyDialog(); return; } 

  if (this.profileOpen()) { this.profileOpen.set(false); return; }
  if (this.menuOpenId() !== null) { this.menuOpenId.set(null); return; }

  if (this.asideOpen()) {
    this.asideOpen.set(false);
    if (typeof document !== 'undefined') document.body.style.overflow = '';
  }
}

//=============================================================

  toggleMenu(id: number) {
    this.menuOpenId.update((cur) => (cur === id ? null : id));
  }
  closeMenu() {
    this.menuOpenId.set(null);
  }
  openProject(id: number) {
    this.router.navigate(['/projects', id]);
    this.closeMenu();
  }
  // renameProject(id: number, currentName: string) {
  //   const next = window.prompt('Rename project:', currentName?.trim() ?? '');
  //   if (next != null) {
  //     const name = next.trim();
  //     if (name && name !== currentName) this.svc.rename(id, name);
  //   }
  //   this.closeMenu();
  // }

  //================= Dialog ===========================================
  renameProject(id: number, currentName: string) {
  this.closeMenu();
  this.renameProjectId.set(id);
  this.renameProjectName.set(currentName);
  this.renameDlgOpen.set(true);
}

closeRenameDialog() {
  this.renameDlgOpen.set(false);
  this.renameProjectId.set(null);
  this.renameProjectName.set('');
}

// Rename
async confirmRenameProject() {
  const id = this.renameProjectId();
  const name = this.renameProjectName().trim();
  if (!id || !name) { this.closeRenameDialog(); return; }
  await this.svc.rename(id, name);     
  this.closeRenameDialog();
}
//=====================================================

  toggleProfileMenu() {
    if (this.menuOpenId() !== null) this.menuOpenId.set(null);
    this.profileOpen.update((v) => !v);
  }
  onEditProfile() {
    this.router.navigateByUrl('/profile/edit');
  }
  onLogout() {
    this.router.navigateByUrl('/login');
  }

  // addQuick(name: string) {
  //   if (!name.trim()) return;
  //   this.svc.add(name.trim());
  //   this.keyword.set('');
  // }
  isChecked(id: number) {
    return this.selected().has(id);
  }
  toggleCheck(id: number, checked: boolean) {
    this.selected.update((s) => {
      const next = new Set(s);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }
  // removeOne(id: number) {
  //   this.svc.remove(id);
  // }

  //======================================================

  // Delete หนึ่งรายการจาก kebab
async removeOne(id: number) {
  const p = this.projects().find(x => x.id === id);
  if (!p) return;
  this.closeMenu();
  this.deleteProjectId.set(id);
  this.deleteProjectName.set(p.name);
  this.deleteDlgOpen.set(true);
}

closeDeleteDialog() {
  this.deleteDlgOpen.set(false);
  this.deleteProjectId.set(null);
  this.deleteProjectName.set('');
}

async confirmDeleteProject() {
  const id = this.deleteProjectId();
  if (!id) { this.closeDeleteDialog(); return; }
  await this.svc.remove(id);            
  this.closeDeleteDialog();
}

// ========================================================

  // Delete หลายรายการ
async removeManySelected() {
  const ids = Array.from(this.selected());
  if (ids.length) await this.svc.removeMany(ids);   
  this.selected.set(new Set());
}

// Toggle favorite
async toggleFavorite(id: number) {
  await this.svc.toggleFavorite(id);    
}
  exportCSV() {
    this.svc.downloadCSV(this.filtered());
  }

  gotoPage(n: number) {
    if (n >= 0 && n < this.pageCount()) this.pageIndex.set(n);
  }
  nextPage() {
    const n = this.pageIndex() + 1;
    if (n < this.pageCount()) this.pageIndex.set(n);
  }
  prevPage() {
    const n = this.pageIndex() - 1;
    if (n >= 0) this.pageIndex.set(n);
  }



  // ================ Method Dialog =====================
  openNewProjectDialog() {
  this.closeMenu();
  this.newProjectName.set('');
  this.newProjectDlgOpen.set(true);
}

closeNewProjectDialog() {
  this.newProjectDlgOpen.set(false);
  this.newProjectName.set('');
}

// Create project (กดปุ่ม Create ใน dialog)
async confirmCreateProject() {
  const name = this.newProjectName().trim();
  if (!name) { this.closeNewProjectDialog(); return; }

  const uid = this.me()?.userId ?? Number(this.me()?.sub);
  if (!uid) { alert('Missing user id'); return; }

  await this.svc.add(name, uid);        // ⬅️ ตอนนี้ยิง POST
  this.keyword.set('');
  this.closeNewProjectDialog();
}

// ========================================================

// ================= Bulk Delete ================
openDeleteManyDialog() {
  if (this.selected().size === 0) return; // ไม่มีอะไรให้ลบ ก็ไม่ต้องเปิด
  this.deleteManyDlgOpen.set(true);
}

closeDeleteManyDialog() {
  this.deleteManyDlgOpen.set(false);
}

async confirmDeleteMany() {
  const ids = Array.from(this.selected());
  if (!ids.length) { this.closeDeleteManyDialog(); return; }
  await this.svc.removeMany(ids);     // เรียก API ลบหลายรายการ
  this.selected.set(new Set());       // เคลียร์ selection
  this.closeDeleteManyDialog();
}

// ========================================================


}
