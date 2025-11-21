import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export class ForgotPassword {
  private readonly http = inject(HttpClient);

  readonly email = signal('');
  readonly loading = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  async submit() {
    const value = this.email().trim();
    if (!value) {
      this.error.set('กรุณากรอกอีเมล');
      this.message.set('');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.message.set('');

    try {
      await this.http
        .post(`${environment.apiBase}/api/users/forgot-password`, {
          email: value,
        })
        .toPromise();

      this.message.set(
        'ถ้ามีบัญชีนี้ในระบบ เราได้ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลของคุณแล้ว'
      );
    } catch (err) {
      console.error(err);
      // เพื่อความปลอดภัย เราไม่บอกว่ามีอีเมลนี้ในระบบหรือไม่
      this.message.set(
        'ถ้ามีบัญชีนี้ในระบบ เราได้ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลของคุณแล้ว'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
