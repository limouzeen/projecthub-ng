// src/app/pages/edit-profile/edit-profile.ts
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FooterStateService } from '../../core/footer-state.service';
import { UsersService, MeDto } from '../../core/users.service';

type ProfileForm = {
  avatarFile: File | null;
  avatarPreview: string | null;
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
    () =>
      ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][
        this.strength()
      ]
  );

  async ngOnInit() {
    this.footer.setThreshold(735);
    this.footer.setForceCompact(null);

    try {
      const me = await this.users.getMe();
      this.patchFromMe(me);
      if (me.avatarUrl) {
        this.model.update(m => ({ ...m, avatarPreview: me.avatarUrl! }));
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

  // UI helpers
  onBack() {
    this.location.back();
  }

  toggleShowCurrent() {
    this.showCurrent.update(v => !v);
  }
  toggleShowNew() {
    this.showNew.update(v => !v);
  }

  onText<K extends keyof ProfileForm>(key: K, ev: Event) {
    const value = (ev.target as HTMLInputElement)
      .value as ProfileForm[K];
    this.model.update(m => ({ ...m, [key]: value }));
  }

  onPickAvatar(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      this.setStatusProfile(
        'error',
        'Please choose an image file (PNG, JPG, WEBP, GIF).'
      );
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.setStatusProfile('error', 'Image is too large. Max 2 MB.');
      return;
    }

    const prev = this.model().avatarPreview;
    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);

    const url = URL.createObjectURL(file);
    this.model.update(m => ({
      ...m,
      avatarFile: file,
      avatarPreview: url,
    }));
  }

  removeAvatar() {
    const prev = this.model().avatarPreview;
    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
    this.model.update(m => ({
      ...m,
      avatarFile: null,
      avatarPreview: null,
    }));
  }

  // Actions (Profile)
  async saveProfile() {
    this.clearProfileStatus();

    const { displayName, email, avatarFile } = this.model();
    if (!displayName.trim()) {
      return this.setStatusProfile(
        'error',
        'Please enter your name.'
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return this.setStatusProfile('error', 'Invalid email.');
    }

    this.savingProfile.set(true);
    try {
      await this.users.updateProfile({
        username: displayName.trim(),
        email: email.trim(),
      });

      if (avatarFile) {
        await this.users.uploadAvatar(avatarFile);
      }

      this.setStatusProfile('success', '✓ Profile updated.');
    } catch (e: any) {
      this.setStatusProfile(
        'error',
        e?.error?.error || e?.message || '✗ Update failed.'
      );
    } finally {
      this.savingProfile.set(false);
    }
  }

  // Actions (Password)
  async changePassword() {
    this.clearPasswordStatus();

    const { currentPassword, newPassword, confirmNewPassword } =
      this.model();

    if (!currentPassword) {
      return this.setStatusPassword(
        'error',
        'Please enter current password.'
      );
    }
    if (!newPassword) {
      return this.setStatusPassword(
        'error',
        'Please enter new password.'
      );
    }
    if (newPassword !== confirmNewPassword) {
      return this.setStatusPassword(
        'error',
        'New password and confirm password do not match.'
      );
    }
    if (this.strength() < 3) {
      return this.setStatusPassword(
        'error',
        'Please choose a stronger password.'
      );
    }

    this.savingPassword.set(true);
    try {
      await this.users.changePassword({
        currentPassword,
        newPassword,
      });
      this.clearPasswordFields();
      this.setStatusPassword('success', '✓ Password updated.');
    } catch (e: any) {
      this.setStatusPassword(
        'error',
        e?.error?.error || e?.message || '✗ Update failed.'
      );
    } finally {
      this.savingPassword.set(false);
    }
  }

  // status helpers
  private setStatusProfile(
    kind: UpdateStatus,
    msg: string,
    ms = 4000
  ) {
    this.statusProfile.set(kind);
    this.statusProfileMsg.set(msg);
    if (ms > 0) {
      setTimeout(() => this.clearProfileStatus(), ms);
    }
  }
  private clearProfileStatus() {
    this.statusProfile.set('idle');
    this.statusProfileMsg.set('');
  }

  private setStatusPassword(
    kind: UpdateStatus,
    msg: string,
    ms = 4000
  ) {
    this.statusPassword.set(kind);
    this.statusPasswordMsg.set(msg);
    if (ms > 0) {
      setTimeout(() => this.clearPasswordStatus(), ms);
    }
  }
  private clearPasswordStatus() {
    this.statusPassword.set('idle');
    this.statusPasswordMsg.set('');
  }

  // map /me → Form
  private patchFromMe(me: MeDto) {
    const display =
      (me.username ?? '').trim() ||
      (me.name ?? '').trim() ||
      (me.email ?? '');
    this.model.update(m => ({
      ...m,
      displayName: display || m.displayName,
      email: me.email ?? m.email,
    }));
  }

  // anti-autofill
  wipeCurrentIfPrefilled(ev: Event) {
    const el = ev.target as HTMLInputElement;
    if (el && el.value && this.model().currentPassword === '') {
      el.value = '';
    }
  }

  private clearPasswordFields() {
    this.model.update(m => ({
      ...m,
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    }));
  }
}
