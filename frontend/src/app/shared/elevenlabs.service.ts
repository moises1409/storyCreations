import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ElevenLabsService {
  private readonly backendUrl = 'http://localhost:5000/api/elevenlabs';

  constructor(private http: HttpClient) {}

  generateSpeech(text: string): Observable<{ audio: string }> {
    return this.http.post<{ audio: string }>(`${this.backendUrl}/speech`, {
      text: text
    });
  }
}
