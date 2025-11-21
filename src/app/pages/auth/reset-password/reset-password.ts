import {
  Component,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(null);
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly loading = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  constructor() {
    // อ่าน token จาก query string
    this.route.queryParamMap.subscribe((params) => {
      this.token.set(params.get('token'));
    });
  }

  async submit() {
    this.message.set('');
    this.error.set('');

    const token = this.token();
    if (!token) {
      this.error.set('ลิงก์ไม่ถูกต้องหรือหมดอายุ');
      return;
    }

    if (!this.newPassword() || !this.confirmPassword()) {
      this.error.set('กรุณากรอกรหัสผ่านให้ครบ');
      return;
    }

    if (this.newPassword() !== this.confirmPassword()) {
      this.error.set('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }

    this.loading.set(true);
    try {
      await this.http
        .post(`${environment.apiBase}/api/users/reset-password`, {
          token,
          newPassword: this.newPassword(),
        })
        .toPromise();

      this.message.set('ตั้งรหัสผ่านใหม่สำเร็จแล้ว คุณสามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้');
      // จะให้ redirect ไปหน้า login หลังจาก 2–3 วินาทีก็ได้
      setTimeout(() => this.router.navigate(['/login']), 2500);
    } catch (e: any) {
      console.error(e);
      this.error.set('ไม่สามารถตั้งรหัสผ่านใหม่ได้ ลิงก์อาจหมดอายุหรือไม่ถูกต้อง');
    } finally {
      this.loading.set(false);
    }
  }
}
