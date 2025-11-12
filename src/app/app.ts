import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './shared/footer/footer';
import { ToastsComponent } from './shared/toasts';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Footer, ToastsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('projecthub-front');
}
