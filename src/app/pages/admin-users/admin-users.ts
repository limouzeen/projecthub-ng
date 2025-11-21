// src/app/pages/admin-users/admin-users.ts
import { Component, OnInit, signal, computed, inject , OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminUsersService, AdminUserDto } from '../../core/admin-users.service';
import { FooterStateService } from '../../core/footer-state.service';
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule,  DatePipe, FormsModule],
  templateUrl: './admin-users.html',
})
export class AdminUsers implements OnInit {
  private readonly api = inject(AdminUsersService);
  private readonly footer = inject(FooterStateService);

  readonly users = signal<AdminUserDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly search = signal('');

  // ฟอร์มสร้าง user ใหม่
  readonly createOpen = signal(false);
  readonly createEmail = signal('');
  readonly createUsername = signal('');
  readonly createPassword = signal('');

    // ฟอร์มแก้ไข user
  readonly editOpen = signal(false);
  readonly editTargetId = signal<number | null>(null);
  readonly editEmail = signal('');
  readonly editUsername = signal('');
  readonly editRole = signal('');

  ngOnInit(): void {
    this.reload();
    this.footer.setThreshold(800);
    this.footer.setForceCompact(null);
  }
  ngOnDestroy(): void {
    this.footer.resetAll();
  }

  readonly filteredUsers = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.users();
    return this.users().filter(u =>
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.username ?? '').toLowerCase().includes(q)
    );
  });

  async reload() {
    this.loading.set(true);
    this.error.set('');
    try {
      const list = await this.api.getAll();
      this.users.set(list);
    } catch (e: any) {
      console.error(e);
      this.error.set('โหลดรายชื่อผู้ใช้ไม่สำเร็จ (ต้องเป็น Admin และ token ต้องยังไม่หมดอายุ)');
    } finally {
      this.loading.set(false);
    }
  }

  // ---------- Create ----------
  openCreate() {
    this.createOpen.set(true);
    this.createEmail.set('');
    this.createUsername.set('');
    this.createPassword.set('');
  }

  closeCreate() {
    this.createOpen.set(false);
  }

  async submitCreate() {
    if (!this.createEmail() || !this.createUsername() || !this.createPassword()) {
      this.error.set('กรุณากรอก email / username / password ให้ครบ');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      const created = await this.api.create({
        email: this.createEmail(),
        username: this.createUsername(),
        password: this.createPassword(),
      });

      this.users.update(list => [...list, created]);
      this.createOpen.set(false);
    } catch (e: any) {
      console.error(e);
      this.error.set('สร้างผู้ใช้ใหม่ไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

  // ---------- Delete ----------
  async deleteUser(u: AdminUserDto) {
    const ok = confirm(`ต้องการลบผู้ใช้ "${u.username ?? u.email}" จริงหรือไม่?`);
    if (!ok) return;

    this.loading.set(true);
    this.error.set('');
    try {
      await this.api.delete(u.userId);
      this.users.update(list => list.filter(x => x.userId !== u.userId));
    } catch (e: any) {
      console.error(e);
      this.error.set('ลบผู้ใช้ไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

    // ---------- Edit ----------
  openEdit(u: AdminUserDto) {
    this.editTargetId.set(u.userId);
    this.editEmail.set(u.email ?? '');
    this.editUsername.set(u.username ?? '');
    this.editRole.set(u.role ?? '');
    this.editOpen.set(true);
  }

  closeEdit() {
    this.editOpen.set(false);
    this.editTargetId.set(null);
  }

    async submitEdit() {
    const id = this.editTargetId();
    if (id == null) {
      this.error.set('ไม่พบผู้ใช้ที่จะทำการแก้ไข');
      return;
    }

    if (!this.editEmail() || !this.editUsername()) {
      this.error.set('กรุณากรอก email / username ให้ครบ');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      const updated = await this.api.update(id, {
        email: this.editEmail(),
        username: this.editUsername(),
        role: this.editRole(),
      });

      // อัปเดตใน list
      this.users.update(list =>
        list.map(x => (x.userId === id ? { ...x, ...updated } : x))
      );

      this.editOpen.set(false);
    } catch (e: any) {
      console.error(e);
      this.error.set('แก้ไขผู้ใช้ไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

  
    logout() {
    // TODO: ถ้ามี AuthService ให้เปลี่ยนมาเรียก service ที่ใช้จริง
    localStorage.removeItem('token');        // ลบ JWT ถ้าเก็บชื่อ key แบบนี้
    localStorage.removeItem('user');         // ถ้ามีเก็บ user meta ไว้
    window.location.href = '/login';         // ส่งกลับหน้า login
  }




}
