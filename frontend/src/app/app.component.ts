import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})

export class AppComponent implements OnInit {
  constructor(private auth: AuthService) {}
  
  ngOnInit(): void {
    this.detectAndSetApiBase();
  }
  
  getApiUrl(endpoint: string): string {
    const apiUrl_local = 'http://localhost:4000';
    const apiUrl_prod = 'https://mi-backend-api-fdgqgqf5eqbne2fk.westeurope-01.azurewebsites.net';
    const baseUrl = this.isProduction() ? apiUrl_prod : apiUrl_local;
    return `${baseUrl}${endpoint}`;
  }

  private isProduction(): boolean {
    return window.location.hostname !== 'localhost';
  }

  private async detectAndSetApiBase() {
    // Production: use fixed URL
    if (this.isProduction()) {
      this.auth.baseUrl = 'https://mi-backend-api-fdgqgqf5eqbne2fk.westeurope-01.azurewebsites.net';
      return;
    }
    // Local: map frontend port to backend port
    const port = window.location.port;
    if (port === '3000') {
      this.auth.baseUrl = 'http://localhost:4000';
      return;
    }
    if (port === '4200') {
      this.auth.baseUrl = 'http://localhost:5000';
      return;
    }
    // Fallback to previous auto-detect if running on a different port
    const cached = sessionStorage.getItem('api_base_detected');
    if (cached) { this.auth.baseUrl = cached; return; }
    const tryUrl = async (url: string) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1200);
        const res = await fetch(`${url}/test`, { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);
        return res.ok;
      } catch { return false; }
    };
    const c4000 = 'http://localhost:4000';
    const c5000 = 'http://localhost:5000';
    const ok4000 = await tryUrl(c4000);
    const base = ok4000 ? c4000 : (await tryUrl(c5000)) ? c5000 : c4000;
    this.auth.baseUrl = base;
    sessionStorage.setItem('api_base_detected', base);
  }
}
