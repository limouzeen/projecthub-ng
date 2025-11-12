// src/app/pages/edit-profile/edit-profile.ts
import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FooterStateService } from '../../core/footer-state.service';
import { UsersService, MeDto, UpdateProfileDto } from '../../core/users.service';
import { Router } from '@angular/router';

type ProfileForm = {
  avatarFile: File | null;
  avatarPreview: string | null; // แสดงผล (รองรับทั้ง URL และ data URL)
  displayName: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

type UpdateStatus = 'idle' | 'success' | 'error';

@Component({
  selector: 'app-edit-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './edit-profile.html',
  styleUrl: './edit-profile.css',
})
export class EditProfile implements OnInit, OnDestroy {
  private readonly footer = inject(FooterStateService);
  private readonly users = inject(UsersService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  // เก็บ userId จาก /me เพื่อใช้ลบ
  readonly userId = signal<number | null>(null);

  readonly model = signal<ProfileForm>({
    avatarFile: null,
    avatarPreview: null,
    displayName: 'Your name',
    email: 'you@example.com',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });

  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);

  readonly statusProfile = signal<UpdateStatus>('idle');
  readonly statusProfileMsg = signal('');
  readonly statusPassword = signal<UpdateStatus>('idle');
  readonly statusPasswordMsg = signal('');

  readonly showCurrent = signal(false);
  readonly showNew = signal(false);

  readonly strength = computed(() => {
    const p = this.model().newPassword ?? '';
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[a-z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(s, 5);
  });

  readonly strengthLabel = computed(
    () => ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][this.strength()]
  );

  async ngOnInit() {
    this.footer.setThreshold(735);
    this.footer.setForceCompact(null);

    try {
      const me = await this.users.getMe(); // { sub, email, name }
      // เก็บ userId จาก token
      const sub = (me.sub ?? '').trim();
      if (sub && !isNaN(+sub)) this.userId.set(+sub);

      this.patchFromMe(me);

      // ถ้าหลังบ้าน “ส่ง string ของรูป” มาทาง field อื่น (เช่น avatarUrl) รองรับโชว์ทันที:
      // - ถ้าเป็น data URL (เริ่มต้นด้วย data:) → ใช้ได้เลย
      // - ถ้าเป็น base64 เปล่า → เติม prefix แล้วโชว์
      const maybe = me.profilePictureUrl?.trim();
      if (maybe) {
        const looksDataUrl = maybe.startsWith('data:');
        const preview = looksDataUrl ? maybe : `data:image/png;base64,${maybe}`;
        this.model.update(m => ({ ...m, avatarPreview: preview }));
      }
    } catch (e) {
      console.warn('Failed to load profile', e);
    }
  }

  ngOnDestroy(): void {
    const prev = this.model().avatarPreview;
    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
    this.footer.resetAll();
  }

  onBack() { this.location.back(); }
  toggleShowCurrent() { this.showCurrent.update(v => !v); }
  toggleShowNew() { this.showNew.update(v => !v); }

  onText<K extends keyof ProfileForm>(key: K, ev: Event) {
    const value = (ev.target as HTMLInputElement).value as ProfileForm[K];
    this.model.update(m => ({ ...m, [key]: value }));
  }

  onPickAvatar(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      this.setStatusProfile('error', 'Please choose an image file (PNG, JPG, WEBP, GIF).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.setStatusProfile('error', 'Image is too large. Max 2 MB.');
      return;
    }
    const prev = this.model().avatarPreview;
    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);

    const url = URL.createObjectURL(file);
    this.model.update(m => ({ ...m, avatarFile: file, avatarPreview: url }));
  }

  removeAvatar() {
    const prev = this.model().avatarPreview;
    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
    this.model.update(m => ({ ...m, avatarFile: null, avatarPreview: null }));
  }

  // === SAVE PROFILE ===
  async saveProfile() {
    this.clearProfileStatus();

    const { displayName, email, avatarFile, avatarPreview } = this.model();
    if (!displayName.trim()) return this.setStatusProfile('error', 'Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return this.setStatusProfile('error', 'Invalid email.');
    }

    this.savingProfile.set(true);
    try {
      let profilePictureUrl: string | null | undefined = undefined;

      // ถ้าผู้ใช้เลือกไฟล์ใหม่ → แปลงเป็น data URL string ส่งไปเก็บหลังบ้าน
      if (avatarFile) {
        profilePictureUrl = await this.fileToDataUrl(avatarFile); // data:image/<type>;base64,xxxx
      } else if (avatarPreview?.startsWith('data:')) {
        // ผู้ใช้ไม่ได้เปลี่ยน แต่มีของเดิมเป็น data URL จากหลังบ้าน
        profilePictureUrl = avatarPreview;
      } else if (!avatarPreview) {
        // ผู้ใช้ลบรูป → ตั้งเป็น null (หลังบ้านจะตัดสินใจเก็บ null/รูป default เอง)
        profilePictureUrl = null;
      }

      const dto: UpdateProfileDto = {
        username: displayName.trim(),
        email: email.trim(),
        profilePictureUrl, // ⬅️ ส่ง string ไปตามหลังบ้าน (Required ใน Command ของคุณ)
      };

      const updated = await this.users.updateProfile(dto); // UserResponseDto

      // ถ้าหลังบ้านคืนรูปกลับมาเป็น string → ใส่ลง preview ให้ทันที
      if (updated?.profilePictureUrl) {
        const s = updated.profilePictureUrl.trim();
        const preview = s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
        this.model.update(m => ({ ...m, avatarPreview: preview, avatarFile: null }));
      } else if (profilePictureUrl === null) {
        this.model.update(m => ({ ...m, avatarPreview: null, avatarFile: null }));
      }

      this.setStatusProfile('success', '✓ Profile updated.');
    } catch (e: any) {
      this.setStatusProfile('error', e?.error?.error || e?.message || '✗ Update failed.');
    } finally {
      this.savingProfile.set(false);
    }
  }

  // === CHANGE PASSWORD ===
  async changePassword() {
    this.clearPasswordStatus();
    const { currentPassword, newPassword, confirmNewPassword } = this.model();

    if (!currentPassword) return this.setStatusPassword('error', 'Please enter current password.');
    if (!newPassword) return this.setStatusPassword('error', 'Please enter new password.');
    if (newPassword !== confirmNewPassword) {
      return this.setStatusPassword('error', 'New password and confirm password do not match.');
    }
    if (this.strength() < 3) {
      return this.setStatusPassword('error', 'Please choose a stronger password.');
    }

    this.savingPassword.set(true);
    try {
      await this.users.changePassword({ currentPassword, newPassword }); // PUT /change-password
      this.clearPasswordFields();
      this.setStatusPassword('success', '✓ Password updated.');
    } catch (e: any) {
      this.setStatusPassword('error', e?.error?.error || e?.message || '✗ Update failed.');
    } finally {
      this.savingPassword.set(false);
    }
  }

  // === DELETE ACCOUNT ===
  async deleteAccount() {
    const id = this.userId();
    if (!id) {
      this.setStatusProfile('error', 'User id not found.');
      return;
    }
    const ok = window.confirm('Are you sure you want to delete your account? This cannot be undone.');
    if (!ok) return;

    try {
      await this.users.deleteUser(id); // DELETE /api/Users/{id}
      localStorage.removeItem('access_token');
      // พาไปหน้า register หรือหน้าแรก
      this.router.navigateByUrl('/register');
    } catch (e: any) {
      this.setStatusProfile('error', e?.error?.error || e?.message || 'Delete failed.');
    }
  }

  // === helpers ===
  private setStatusProfile(kind: UpdateStatus, msg: string, ms = 4000) {
    this.statusProfile.set(kind);
    this.statusProfileMsg.set(msg);
    if (ms > 0) setTimeout(() => this.clearProfileStatus(), ms);
  }
  private clearProfileStatus() { this.statusProfile.set('idle'); this.statusProfileMsg.set(''); }

  private setStatusPassword(kind: UpdateStatus, msg: string, ms = 4000) {
    this.statusPassword.set(kind);
    this.statusPasswordMsg.set(msg);
    if (ms > 0) setTimeout(() => this.clearPasswordStatus(), ms);
  }
  private clearPasswordStatus() { this.statusPassword.set('idle'); this.statusPasswordMsg.set(''); }

  private patchFromMe(me: MeDto) {
    const display = (me.username ?? '').trim() || (me.name ?? '').trim() || (me.email ?? '');
    this.model.update(m => ({ ...m, displayName: display || m.displayName, email: me.email ?? m.email }));
  }

  wipeCurrentIfPrefilled(ev: Event) {
    const el = ev.target as HTMLInputElement;
    if (el && el.value && this.model().currentPassword === '') el.value = '';
  }

  private clearPasswordFields() {
    this.model.update(m => ({ ...m, currentPassword: '', newPassword: '', confirmNewPassword: '' }));
  }

  // ⬅️ แปลงไฟล์รูป → string (data URL) เพื่อส่งหลังบ้าน
  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image.'));
      reader.onload = () => resolve(reader.result as string); // "data:image/png;base64,...."
      reader.readAsDataURL(file);
    });
  }
}
