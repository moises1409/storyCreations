import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { NavComponent } from '../shared/nav.component';
import { HeaderComponent } from '../shared/header.component';
import { AddCreditsModalComponent } from '../shared/add-credits-modal.component';
import { EbookViewerComponent } from '../shared/ebook-viewer.component';
import { AuthService } from '../auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-story',
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, NavComponent, HeaderComponent, AddCreditsModalComponent, EbookViewerComponent],
  templateUrl: './story.component.html',
  styleUrls: ['./story.component.css', '../dashboard/dashboard.component.css']
})
export class StoryComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  auth = inject(AuthService);

  mode: 'new' | 'existing' = 'new';
  storyId?: number;
  storyStatus: 'in_progress' | 'finished' = 'in_progress';

  phase: 'seed' | 'chapter' | 'final' = 'seed';
  maxChapters = 5;
  chapters: Array<{ id: string; title: string; text: string; imageUrl?: string; choices?: string[]; collapsed?: boolean }> = [];
  currentIndex = 0;
  historyTitle = '';
  loading = false;
  loadingImageIndex: number | null = null;
  loadingTextIndex: number | null = null;
  finalReadyForIndex: number | null = null;
  error = '';
  useApiImages = true;
  showAddCredits = false;
  // Optional selected character IDs passed from dashboard
  initialCharacterIds: number[] = [];
  
  // eBook properties
  showEbook = false;

  seedForm = this.fb.group({ seed: ['', Validators.required] });
  userContinuation = this.fb.control<string>('');
  selectedChoice: string | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.mode = 'existing';
      this.storyId = Number(id);
      this.loadStory(this.storyId);
    } else {
      this.mode = 'new';
      this.phase = 'seed';
      // If a seed is provided via query param, auto-start generation
      const seedFromQuery = (this.route.snapshot.queryParamMap.get('seed') || '').trim();
      // Capture optional character IDs from navigation state once
      const state: any = (history && history.state) || {};
      this.initialCharacterIds = Array.isArray(state.character_ids) ? (state.character_ids as any[]).map(x => Number(x)).filter(n => Number.isFinite(n)) : [];
      if (seedFromQuery) {
        this.seedForm.setValue({ seed: seedFromQuery });
        // Defer to allow initial render
        setTimeout(() => this.startWithSeed(), 0);
      }
    }
  }

  // Load existing story
  private loadStory(id: number) {
    this.loading = true;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    const base = this.auth.baseUrl;
    // Load story meta first
    this.http.get<{ id:number; title:string; status:'in_progress'|'finished' }>(`${base}/stories/${id}`, { headers })
      .subscribe({ next: (meta) => { this.storyStatus = meta?.status || 'in_progress'; this.historyTitle = meta?.title || this.historyTitle; } });
    // Then load chapters
    this.http.get<Array<{ id: number; index: number; title: string; text: string; image_url?: string }>>(`${base}/stories/${id}/chapters`, { headers })
      .subscribe({
        next: (chapters) => {
          this.phase = 'chapter';
          this.chapters = chapters.map(ch => ({ id: String(ch.id), title: ch.title, text: ch.text, imageUrl: ch.image_url || undefined, choices: [], collapsed: true }));
          if (this.chapters.length) this.chapters[this.chapters.length - 1].collapsed = false;
          this.currentIndex = this.chapters.length ? this.chapters.length - 1 : 0;
          this.selectedChoice = null;
          this.userContinuation.setValue('');
          if (this.storyStatus === 'finished') {
            // Do not show continuation block for finished stories
            this.finalReadyForIndex = this.chapters.length ? this.chapters.length - 1 : null;
          }
        },
        error: () => { this.loading = false; },
        complete: () => { this.loading = false; }
      });
  }

  // Start with seed → create Chapter 1 (new story)
  startWithSeed() {
    if (this.seedForm.invalid) { this.seedForm.markAllAsTouched(); return; }
    this.loading = true; this.error = '';
    const seed = this.seedForm.value.seed!.trim();
    this.historyTitle = seed.slice(0, 60) || 'New story';
    // Create the first chapter card immediately for responsive UX
    this.phase = 'chapter';
    const first = this.buildChapter(1, seed); first.text = ''; first.collapsed = false;
    this.chapters = [first]; this.currentIndex = 0;
    this.loadingTextIndex = 0; this.loadingImageIndex = 0;
    this.selectedChoice = null; this.userContinuation.setValue('');

    this.fetchSeed(seed, this.initialCharacterIds).subscribe({
      next: (res) => {
        const ch = [...this.chapters];
        if (ch[0]) { ch[0] = { ...ch[0], text: res?.text || ch[0].text, choices: (res as any)?.choices || [] }; this.chapters = ch; }
        (this as any)._storyId = (res as any)?.story_id; this.storyId = (res as any)?.story_id;
        (this as any)._chapterId = (res as any)?.chapter_id;
        this.loadingTextIndex = null;
        const promptForImage = res?.image_prompt || seed;
        this.fetchChapterImage(promptForImage, 0, this.storyId, (this as any)._chapterId);
      },
      error: (err) => {
        // Stop spinners and rollback UI on insufficient credits
        this.loadingTextIndex = null; this.loadingImageIndex = null;
        if (err && err.status === 402) {
          this.error = "You're out of credits. Please upgrade your plan to continue.";
          this.chapters = []; this.phase = 'seed';
          this.showAddCredits = true;
        }
        this.loading = false;
      },
      complete: () => { this.loading = false; }
    });
  }

  // Continuation
  generateNextChapter() {
    this.error = '';
    if (!this.hasText()) return;
    const t = (this.userContinuation.value ?? '').trim();
    if (this.chapters.length >= this.maxChapters - 1) { this.finalizeStory(); return; }
    const chapterNum = this.chapters.length + 1;
    if (this.chapters.length > 0) { const prev = [...this.chapters]; prev[prev.length - 1] = { ...prev[prev.length - 1], collapsed: true }; this.chapters = prev; }
    // Create chapter card immediately
    const nextCard = this.buildChapter(chapterNum, t); nextCard.text = ''; nextCard.collapsed = false;
    this.chapters = [...this.chapters, nextCard]; this.currentIndex = this.chapters.length - 1;
    this.loadingTextIndex = this.currentIndex; this.loadingImageIndex = this.currentIndex;
    // reset inputs when generation starts
    this.userContinuation.setValue(''); this.selectedChoice = null;
    this.fetchChapter(t, 'continue').subscribe({
      next: (res) => {
        const chs = [...this.chapters]; const idx = this.currentIndex;
        if (chs[idx]) { chs[idx] = { ...chs[idx], text: res?.text || chs[idx].text, choices: (res as any)?.choices || [] }; this.chapters = chs; }
        (this as any)._chapterId = (res as any)?.chapter_id || (this as any)._chapterId;
        this.loadingTextIndex = null;
        const promptForImage = res?.image_prompt || t;
        this.fetchChapterImage(promptForImage, this.currentIndex, this.storyId, (this as any)._chapterId);
      },
      error: (err) => {
        this.loadingTextIndex = null; this.loadingImageIndex = null;
        if (err && err.status === 402) {
          this.error = "You're out of credits. Please upgrade your plan to continue.";
          // Remove the just-added chapter and restore previous collapse state
          const removed = this.chapters.slice(0, -1);
          this.chapters = removed;
          this.currentIndex = this.chapters.length ? this.chapters.length - 1 : 0;
          if (this.chapters.length) {
            const last = [...this.chapters];
            last[last.length - 1] = { ...last[last.length - 1], collapsed: false };
            this.chapters = last;
          } else {
            this.phase = 'seed';
          }
          this.showAddCredits = true;
        }
        // no global loading state for next chapter
      },
      complete: () => { /* no-op */ }
    });
  }

  generateNextChapterFromChoice(opt: string) {
    // Do not auto-generate; only select
    this.selectChoice(opt);
  }

  finalizeStory(topic?: string) {
    this.error = '';
    if (!this.hasText()) return;
    const t = (this.userContinuation.value ?? '').trim();
    const idea = t || 'Final chapter'; const chapterNum = this.chapters.length + 1;
    if (this.chapters.length > 0) { this.chapters = this.chapters.map(ch => ({ ...ch, collapsed: true })); }
    // Create final card immediately
    const nextCard = this.buildChapter(chapterNum, idea); nextCard.text = ''; nextCard.collapsed = false;
    this.chapters = [...this.chapters, nextCard]; this.currentIndex = this.chapters.length - 1;
    this.loadingTextIndex = this.currentIndex; this.loadingImageIndex = this.currentIndex; this.finalReadyForIndex = this.currentIndex;
    // reset inputs when generation starts
    this.userContinuation.setValue(''); this.selectedChoice = null;
    this.fetchChapter(idea, 'final').subscribe({
      next: (res) => {
        const chs = [...this.chapters]; const idx = this.currentIndex;
        if (chs[idx]) { chs[idx] = { ...chs[idx], text: res?.text || chs[idx].text, choices: [] }; this.chapters = chs; }
        (this as any)._chapterId = (res as any)?.chapter_id || (this as any)._chapterId;
        this.loadingTextIndex = null;
        const promptForImage = res?.image_prompt || idea;
        this.fetchChapterImage(promptForImage, this.currentIndex, this.storyId, (this as any)._chapterId);
      },
      error: (err) => {
        this.loadingTextIndex = null; this.loadingImageIndex = null; this.finalReadyForIndex = null;
        if (err && err.status === 402) {
          this.error = "You're out of credits. Please upgrade your plan to continue.";
          // Remove the just-added final chapter and restore previous
          const removed = this.chapters.slice(0, -1);
          this.chapters = removed;
          this.currentIndex = this.chapters.length ? this.chapters.length - 1 : 0;
          if (this.chapters.length) {
            const last = [...this.chapters];
            last[last.length - 1] = { ...last[last.length - 1], collapsed: false };
            this.chapters = last;
          }
          this.showAddCredits = true;
        }
      },
      complete: () => { /* no global loading for final generation */ }
    });
  }

  selectChoice(opt: string) {
    if (this.selectedChoice === opt) {
      this.selectedChoice = null;
    } else {
      this.selectedChoice = opt;
      if ((this.userContinuation.value ?? '').length > 0) {
        this.userContinuation.setValue('');
      }
    }
  }

  onUserTextInput() {
    const v = (this.userContinuation.value ?? '').trim();
    if (v.length > 0 && this.selectedChoice) {
      this.selectedChoice = null;
    }
  }

  hasValidContinuationInput(): boolean {
    const v = (this.userContinuation.value ?? '').trim();
    const hasText = v.length > 0;
    const hasChoice = !!this.selectedChoice;
    return (hasText || hasChoice) && !(hasText && hasChoice);
  }

  onChoice(opt: string) {
    this.userContinuation.setValue(opt);
  }

  hasText(): boolean {
    return ((this.userContinuation.value ?? '').trim().length > 0);
  }

  onAddCredits(plan: 'starter'|'pro'|'max') {
    this.auth.addCredits(plan).subscribe({
      next: (res) => { this.showAddCredits = false; this.error = ''; document.body.style.overflow = ''; },
      error: () => {}
    });
  }


  // Exports
  openEbook() {
    this.showEbook = true;
  }
  
  closeEbook() {
    this.showEbook = false;
  }
  

  private buildChapter(num: number, idea: string) {
    const img = '/assets/test.jpeg';
    return { id: Math.random().toString(36).slice(2), title: `${idea.slice(0, 60)}`, text: ' ', imageUrl: img, choices: [], collapsed: false };
  }

  private fetchChapterImage(prompt: string, index: number, storyId?: number, chapterId?: number) {
    if (!this.useApiImages) { const ch = [...this.chapters]; if (ch[index]) { ch[index] = { ...ch[index], imageUrl: '/assets/test.jpeg' }; this.chapters = ch; } this.loadingImageIndex = null; return; }
    const url = `${this.auth.baseUrl}/ai/generate-image`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.post<{ imageUrl?: string }>(url, { prompt, story_id: storyId, chapter_id: chapterId }, { headers })
      .subscribe({ next: (res) => { if (res?.imageUrl) { const chs = [...this.chapters]; if (chs[index]) { chs[index] = { ...chs[index], imageUrl: res.imageUrl }; this.chapters = chs; } } }, complete: () => { this.loadingImageIndex = null; } });
  }

  private fetchSeed(prompt: string, character_ids: number[] = []) {
    const url = `${this.auth.baseUrl}/ai/generate-seed`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    return this.http.post<{ text?: string; image_prompt?: string; story_id?: number; chapter_id?: number }>(url, { prompt, character_ids }, { headers });
  }

  private fetchChapter(prompt: string, mode: 'continue' | 'final' = 'continue') {
    const url = `${this.auth.baseUrl}/ai/generate-chapter`;
    const history = this.chapters.map(c => c.text).filter(Boolean);
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    return this.http.post<{ text?: string; image_prompt?: string; choices?: string[]; story_id?: number; chapter_id?: number }>(url, { prompt, history, mode, story_id: this.storyId }, { headers });
  }

  @HostListener('window:keydown', ['$event'])
  handleKey(e: KeyboardEvent) {
    if (this.phase !== 'chapter') return;
    if (e.key === 'ArrowLeft') { if (this.currentIndex > 0) this.currentIndex--; }
    if (e.key === 'ArrowRight') { /* reserved */ }
  }
}


