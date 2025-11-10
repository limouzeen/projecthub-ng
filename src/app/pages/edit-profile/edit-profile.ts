import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FooterStateService } from '../../core/footer-state.service';
import { UsersService, MeDto } from '../../core/users.service';

/** ฟอร์มฝั่งโปรไฟล์ + เปลี่ยนรหัส */
type ProfileForm = {
  avatarFile: File | null;
  avatarPreview: string | null;
  displayName: string; // -> username ใน backend
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
  // --- DI ---
  private readonly footer = inject(FooterStateService);
  private readonly users = inject(UsersService);

  // --- Form state ---
  readonly model = signal<ProfileForm>({
    avatarFile: null,
    avatarPreview: null,

    // TODO(REMOVE-HARDCODE): ค่านี้จะถูกแทนที่ด้วยผลลัพธ์จาก GET /api/users/me
    displayName: 'Your name',  // <- backend ใช้ชื่อ field ว่า username
    email: 'you@example.com',

    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });

  // --- UI states ---
  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);

  readonly statusProfile = signal<UpdateStatus>('idle');
  readonly statusProfileMsg = signal('');
  readonly statusPassword = signal<UpdateStatus>('idle');
  readonly statusPasswordMsg = signal('');

  // toggle eyes
  readonly showCurrent = signal(false);
  readonly showNew = signal(false);

  // password strength
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
  readonly strengthLabel = computed(() =>
    ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][this.strength()]
  );


  // ----- constructor -----
   constructor(private location: Location) {}

  // ----- lifecycle -----
  async ngOnInit() {
    // ย่อ footer อัตโนมัติถ้าจอเตี้ย
    this.footer.setThreshold(735);
    this.footer.setForceCompact(null);

    // ✅ โหลดข้อมูลผู้ใช้จาก API จริง
    try {
      const me = await this.users.getMe(); // GET /api/users/me
      this.patchFromMe(me);
      // ถ้า backend ส่งรูป avatarUrl มา ให้พรีวิวไว้ด้วย
      if ((me as any).avatarUrl) {
        this.model.update(m => ({ ...m, avatarPreview: (me as any).avatarUrl }));
      }
    } catch (e) {
      // ปล่อยไว้เฉย ๆ หรือจะแจ้งเตือนได้
      console.warn('Failed to load profile', e);
    }
  }

  ngOnDestroy(): void {
    const prev = this.model().avatarPreview;
    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
    this.footer.resetAll();
  }

  // ----- UI helpers -----
  onBack() {
    this.location.back();
  }

  toggleShowCurrent() { this.showCurrent.update(v => !v); }
  toggleShowNew()     { this.showNew.update(v => !v); }

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

  // ----- Actions (PROFILE) -----
  async saveProfile() {
    this.clearProfileStatus();

    const { displayName, email, avatarFile } = this.model();
    if (!displayName.trim()) return this.setStatusProfile('error', 'Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return this.setStatusProfile('error', 'Invalid email.');
    }

    this.savingProfile.set(true);
    try {
      // ✅ เรียก API จริงแก้ไขโปรไฟล์ (ไม่รวมรหัสผ่าน)
      // PUT /api/users/me  body: { username, email }
      await this.users.updateProfile({ username: displayName.trim(), email: email.trim() });

      // อัปโหลดรูป (ถ้ารองรับ) — ใช้ endpoint แยกแบบ multipart
      if (avatarFile) {
       
        await this.users.uploadAvatar(avatarFile);
      }

      this.setStatusProfile('success', '✓ Profile updated.');
    } catch (e: any) {
      this.setStatusProfile('error', e?.error?.error || e?.message || '✗ Update failed.');
    } finally {
      this.savingProfile.set(false);
    }
  }

  // ----- Actions (PASSWORD) -----
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
      // ✅ เรียก API จริงเปลี่ยนรหัสผ่าน
      // ตัวอย่าง: PUT /api/users/me/password  body: { currentPassword, newPassword }
      // (หากฝั่งหลังบ้านของคุณยังไม่มี endpoint นี้ ให้สร้างตามแผนที่คุยไว้)
      await this.users.changePassword({ currentPassword, newPassword });

      // เคลียร์ฟิลด์รหัส
      this.model.update(m => ({ ...m, currentPassword: '', newPassword: '', confirmNewPassword: '' }));
      this.setStatusPassword('success', '✓ Password updated.');
    } catch (e: any) {
      this.setStatusPassword('error', e?.error?.error || e?.message || '✗ Update failed.');
    } finally {
      this.savingPassword.set(false);
    }
  }

  // ----- status helpers -----
  private setStatusProfile(kind: UpdateStatus, msg: string, ms = 4000) {
    this.statusProfile.set(kind);
    this.statusProfileMsg.set(msg);
    if (ms > 0) setTimeout(() => { this.clearProfileStatus(); }, ms);
  }
  private clearProfileStatus() { this.statusProfile.set('idle'); this.statusProfileMsg.set(''); }

  private setStatusPassword(kind: UpdateStatus, msg: string, ms = 4000) {
    this.statusPassword.set(kind);
    this.statusPasswordMsg.set(msg);
    if (ms > 0) setTimeout(() => { this.clearPasswordStatus(); }, ms);
  }
  private clearPasswordStatus() { this.statusPassword.set('idle'); this.statusPasswordMsg.set(''); }

  // ----- map from API -----
  private patchFromMe(me: MeDto) {
    // backend /me คืน sub/email/name (ตาม controller ที่คุณให้)
    // name อาจเป็น null → ใช้ email แทนชั่วคราว
    this.model.update(m => ({
      ...m,
      displayName: (me.name ?? '').trim() || (me.email ?? ''),
      email: me.email ?? m.email,
    }));
  }


  // เคลียร์ค่าถ้าเบราว์เซอร์แอบ autofill มา
wipeCurrentIfPrefilled(ev: Event) {
  const el = ev.target as HTMLInputElement;
  // ถ้า value โผล่โดยเราไม่ได้พิมพ์เอง ให้ล้าง
  if (el && el.value && this.model().currentPassword === '') {
    el.value = '';
  }
}

// หลังเปลี่ยนรหัสผ่านสำเร็จ ให้ล้างช่องทั้งหมด
private clearPasswordFields() {
  this.model.update(m => ({ ...m, currentPassword: '', newPassword: '', confirmNewPassword: '' }));
}

}
