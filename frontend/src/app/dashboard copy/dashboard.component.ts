import { Component, HostListener, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../auth/auth.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { NavComponent } from '../shared/nav.component';
import { HeaderComponent } from '../shared/header.component';
import { AddCreditsModalComponent } from '../shared/add-credits-modal.component';
import { StoryCardsComponent } from '../shared/story-cards.component';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-dashboard',
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, RouterModule, NavComponent, HeaderComponent, AddCreditsModalComponent, StoryCardsComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  router = inject(Router);
  user = this.auth.user$.value;

  // Co-creator state (English)
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
  // Toggle to test placeholder image without calling backend
  useApiImages = false;
  showAddCredits = false;


  // Seed and user continuation (legacy continuation kept for convenience)
  seedForm = this.fb.group({
    seed: ['', Validators.required]
  });
  userContinuation = this.fb.control<string>('');
  selectedChoice: string | null = null;

  // (Modal removed)

  // Mis historias (local)
  myStories: Array<{ id: string; title: string; createdAt: Date; scenesCount: number }> = [];
  userStories: Array<{ id: number; title: string; chapters_count: number; status?: 'in_progress'|'finished' }> = [];

  // UI filtering
  filter: 'all' | 'in_progress' | 'finished' = 'all';
  get filteredStories() {
    if (this.filter === 'all') return this.userStories;
    return this.userStories.filter(s => (s.status || 'in_progress') === this.filter);
  }

  ngOnInit(): void {
    // Restore user if needed
    if (!this.user && this.auth.token) {
      this.auth.fetchMe().subscribe({ next: u => this.user = u });
    }
    this.loadStories();
  }

  // Generate story from seed on dashboard and navigate to story page
  startFromSeed() {
    if (this.seedForm.invalid) { this.seedForm.markAllAsTouched(); return; }
    const seed = (this.seedForm.value.seed ?? '').trim();
    if (!seed) return;
    // Navigate first to the story page, passing the seed so it can start generation there
    this.router.navigate(['/story/new'], { queryParams: { seed } });
  }

  setFilter(f: 'all'|'in_progress'|'finished') { this.filter = f; }

  // Start with seed → create Chapter 1
  startWithSeed() {
    if (this.seedForm.invalid) { this.seedForm.markAllAsTouched(); return; }
    this.loading = true; this.error = '';
    const seed = this.seedForm.value.seed!.trim();
    this.historyTitle = seed.slice(0, 60) || 'New story';
    // Show chapter view immediately with placeholders
    this.phase = 'chapter';
    const first = this.buildChapter(1, seed);
    first.text = '';
    first.collapsed = false;
    this.chapters = [first];
    this.currentIndex = 0;
    this.loadingTextIndex = 0;
    this.loadingImageIndex = 0;
    this.selectedChoice = null;
    this.userContinuation.setValue('');

    // Fetch chapter text and then image prompt
    this.fetchSeed(seed).subscribe({
      next: (res) => {
        const chapters = [...this.chapters];
        if (chapters[0]) {
          chapters[0] = { ...chapters[0], text: res?.text || chapters[0].text, choices: (res as any)?.choices || [] };
          this.chapters = chapters;
        }
        // Remember story/chapter ids
        (this as any)._storyId = (res as any)?.story_id;
        (this as any)._chapterId = (res as any)?.chapter_id;
        this.loadingTextIndex = null;
        const promptForImage = res?.image_prompt || seed;
        this.fetchChapterImage(promptForImage, 0, (this as any)._storyId, (this as any)._chapterId);
      },
      error: (err) => {
        // Fallback: keep placeholder text spinner off and show placeholder image
        this.loadingTextIndex = null;
        if (err && err.status === 402) {
          this.error = "You're out of credits. Please upgrade your plan to continue.";
        } else {
          if (!this.useApiImages) this.fetchChapterImage(seed, 0);
        }
        this.loading = false;
      },
      complete: () => { this.loading = false; }
    });
  }

  // Navigation
  onBack() { if (this.currentIndex > 0) this.currentIndex--; }
  onNext() {}

  // Play narration (demo using speechSynthesis if available)
  playAudio(scene: { text: string; audioUrl?: string }) {
    try {
      if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(scene.text);
        utter.rate = 1; utter.pitch = 1; utter.lang = 'en-US';
        window.speechSynthesis.speak(utter);
      } else if (scene.audioUrl) {
        const a = new Audio(scene.audioUrl);
        a.play();
      }
    } catch {}
  }

  // Finalize story
  finishStory() {
    this.phase = 'final';
  }

  exportPdf() { alert('📖 Generate PDF (demo)'); }
  exportVideo() { alert('🎬 Generate animated video (demo)'); }
  saveStory() {
    const id = Math.random().toString(36).slice(2);
    this.myStories.unshift({ id, title: this.historyTitle || 'Story', createdAt: new Date(), scenesCount: this.chapters.length });
    alert('💾 Story saved (demo)');
  }

  loadStories() {
    const url = `${this.auth.baseUrl}/stories`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.get<Array<{ id: number; title: string; chapters_count: number; status?: 'in_progress'|'finished' }>>(url, { headers })
      .subscribe({ next: (res) => this.userStories = res || [] });
  }

  openStory(s: { id: number; title: string; chapters_count: number }) {
    const url = `${this.auth.baseUrl}/stories/${s.id}/chapters`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.get<Array<{ id: number; index: number; title: string; text: string; image_url?: string }>>(url, { headers })
      .subscribe({
        next: (chapters) => {
          // Map backend chapters to UI model
          this.historyTitle = s.title;
          this.phase = 'chapter';
          this.chapters = chapters.map(ch => ({
            id: String(ch.id),
            title: ch.title,
            text: ch.text,
            imageUrl: ch.image_url || undefined,
            choices: [],
            collapsed: true
          }));
          if (this.chapters.length) this.chapters[this.chapters.length - 1].collapsed = false;
          this.currentIndex = this.chapters.length ? this.chapters.length - 1 : 0;
          (this as any)._storyId = s.id;
          (this as any)._chapterId = chapters.length ? chapters[chapters.length - 1].id : undefined;
          this.selectedChoice = null;
          this.userContinuation.setValue('');
        }
      });
  }

  // (Modal handlers removed)

  // New: generate next chapter using a choice or free text
  generateNextChapter() {
    this.error = '';
    if (!this.hasText()) return;
    document.body.style.overflow = '';
    const t = (this.userContinuation.value ?? '').trim();
    // If we already have 4 chapters, the next must be the final (5th)
    if (this.chapters.length >= this.maxChapters - 1) {
      this.finalizeStory();
      return;
    }
    this.loading = true;
    const chapterNum = this.chapters.length + 1;
    // Collapse previous last chapter
    if (this.chapters.length > 0) {
      const prev = [...this.chapters];
      prev[prev.length - 1] = { ...prev[prev.length - 1], collapsed: true };
      this.chapters = prev;
    }
    // Create UI chapter immediately
    const nextCard = this.buildChapter(chapterNum, t);
    nextCard.text = '';
    nextCard.collapsed = false;
    this.chapters = [...this.chapters, nextCard];
    this.currentIndex = this.chapters.length - 1;
    this.loadingTextIndex = this.currentIndex;
    this.loadingImageIndex = this.currentIndex;
    // reset inputs for next interaction
    this.userContinuation.setValue('');
    this.selectedChoice = null;
    this.fetchChapter(t, 'continue').subscribe({
      next: (res) => {
        const chapters = [...this.chapters];
        const idx = this.currentIndex;
        if (chapters[idx]) {
          chapters[idx] = { ...chapters[idx], text: res?.text || chapters[idx].text, choices: (res as any)?.choices || [] };
          this.chapters = chapters;
        }
        (this as any)._chapterId = (res as any)?.chapter_id || (this as any)._chapterId;
        this.loadingTextIndex = null;
        const promptForImage = res?.image_prompt || t;
        this.fetchChapterImage(promptForImage, this.currentIndex, (this as any)._storyId, (this as any)._chapterId);
        if (this.chapters.length >= this.maxChapters) this.finishStory();
      },
      error: (err) => {
        this.loadingTextIndex = null; this.loadingImageIndex = null;
        if (err && err.status === 402) {
          this.error = "You're out of credits. Please upgrade your plan to continue.";
          this.showAddCredits = true;
          // Remove just-added chapter and restore previous expanded
          const removed = this.chapters.slice(0, -1);
          this.chapters = removed;
          this.currentIndex = this.chapters.length ? this.chapters.length - 1 : 0;
          if (this.chapters.length) {
            const last = [...this.chapters];
            last[last.length - 1] = { ...last[last.length - 1], collapsed: false };
            this.chapters = last;
          }
        }
        this.loading = false;
      },
      complete: () => { this.loading = false; }
    });
  }

  generateNextChapterFromChoice(opt: string) {
    // Now clicking a choice writes it to the textarea only
    this.onChoice(opt);
  }

  // Generate the final chapter, then show export actions
  finalizeStory(topic?: string) {
    this.error = '';
    if (!this.hasText()) return;
    document.body.style.overflow = '';
    this.loading = true;
    const t = (this.userContinuation.value ?? '').trim();
    const idea = t || 'Final chapter';
    const chapterNum = this.chapters.length + 1;
    // Collapse all previous chapters
    if (this.chapters.length > 0) {
      const prev = this.chapters.map(ch => ({ ...ch, collapsed: true }));
      this.chapters = prev;
    }
    // Create final chapter card immediately
    const nextCard = this.buildChapter(chapterNum, idea);
    nextCard.text = '';
    nextCard.collapsed = false; // final chapter should start expanded
    this.chapters = [...this.chapters, nextCard];
    this.currentIndex = this.chapters.length - 1;
    this.loadingTextIndex = this.currentIndex;
    this.loadingImageIndex = this.currentIndex;
    this.finalReadyForIndex = this.currentIndex;
    // reset inputs
    this.userContinuation.setValue('');
    this.selectedChoice = null;
    this.fetchChapter(idea, 'final').subscribe({
      next: (res) => {
        const chapters = [...this.chapters];
        const idx = this.currentIndex;
        if (chapters[idx]) {
          chapters[idx] = { ...chapters[idx], text: res?.text || chapters[idx].text, choices: [] };
          this.chapters = chapters;
        }
        (this as any)._chapterId = (res as any)?.chapter_id || (this as any)._chapterId;
        this.loadingTextIndex = null;
        const promptForImage = res?.image_prompt || idea;
        this.fetchChapterImage(promptForImage, this.currentIndex, (this as any)._storyId, (this as any)._chapterId);
      },
      error: (err) => {
        this.loadingTextIndex = null; this.loadingImageIndex = null; this.finalReadyForIndex = null;
        if (err && err.status === 402) {
          this.error = "You're out of credits. Please upgrade your plan to continue.";
          this.showAddCredits = true;
          // Remove just-added chapter and restore previous expanded
          const removed = this.chapters.slice(0, -1);
          this.chapters = removed;
          this.currentIndex = this.chapters.length ? this.chapters.length - 1 : 0;
          if (this.chapters.length) {
            const last = [...this.chapters];
            last[last.length - 1] = { ...last[last.length - 1], collapsed: false };
            this.chapters = last;
          }
        }
        this.loading = false;
      },
      complete: () => { this.loading = false; }
    });
  }

  onAddCredits(plan: 'starter'|'pro'|'max') {
    this.auth.addCredits(plan).subscribe({ next: () => { this.showAddCredits = false; this.error = ''; }, error: () => {} });
  }

  closeAddCreditsModal() {
    this.showAddCredits = false;
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

  onChoice(opt: string) {
    this.userContinuation.setValue(opt);
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

  hasText(): boolean {
    return ((this.userContinuation.value ?? '').trim().length > 0);
  }

  toggleChapter(index: number) {
    const chapters = [...this.chapters];
    if (!chapters[index]) return;
    const current = chapters[index];
    chapters[index] = { ...current, collapsed: !current.collapsed };
    this.chapters = chapters;
  }

  private buildChapter(num: number, idea: string) {
    const img = '/assets/test.jpeg';
    return {
      id: Math.random().toString(36).slice(2),
      title: `${idea.slice(0, 60)}`,
      text: `On the morning the clouds looked like friendly ships, Luna found a small silver bell tangled in the apple tree. It chimed even when the wind was still, like a giggle in a teacup. Luna slipped it into her pocket and the pocket warmed, as if the bell had caught a sunbeam. She walked down the garden path, where daisies tilted to listen. A blue moth landed on her shoulder and blinked kindly, once, twice. “If you can hear the bell, you can follow it,” the moth seemed to say without words. The bell chimed again, soft as a secret, pointing toward the old wooden gate. Luna pushed, and the gate opened onto a lane she had never seen before. The stones glittered like sprinkled sugar, and the air smelled of cinnamon and rain. Far ahead, a tiny cart rolled by itself, drawn by a puff of cloud shaped like a lamb. Luna waved, and the cloud-lamb bobbed hello, leaving a trail of sparkly dew. The bell hummed in her pocket, braver now, and her steps matched its merry beat. As she walked, the hedges stitched themselves into shapes—an owl, a key, a little door. When she blinked, the shapes were gone, but the feeling of being welcomed stayed. At the bend, she found a letter tied to a dandelion stem with a ribbon of sky. The letter was addressed to “The First Finder of the Silver Bell,” in twirly handwriting. Luna opened it and read that a story was waiting for her at the end of the lane. “Bring your best question,” the letter added, “and the story will bring its best answer.” The bell chimed a third time, bright and clear, and the blue moth fluttered ahead. Luna tucked the letter close to her heart and stepped forward, ready to ask her very first question.`,
      imageUrl: img,
      choices: [],
      collapsed: false
    };
  }

  private fetchChapterImage(prompt: string, index: number, storyId?: number, chapterId?: number) {
    if (!this.useApiImages) {
      // Immediately use placeholder and stop spinner
      const chapters = [...this.chapters];
      if (chapters[index]) {
        chapters[index] = { ...chapters[index], imageUrl: '/assets/test.jpeg' };
        this.chapters = chapters;
      }
      this.loadingImageIndex = null;
      return;
    }

    const url = `${this.auth.baseUrl}/ai/generate-image`;
    this.loadingImageIndex = index;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.post<{ imageUrl?: string; text?: string }>(url, { prompt, story_id: storyId, chapter_id: chapterId }, { headers })
      .subscribe({
        next: (res) => {
          if (res?.imageUrl) {
            const chapters = [...this.chapters];
            if (chapters[index]) {
              chapters[index] = { ...chapters[index], imageUrl: res.imageUrl };
              this.chapters = chapters;
            }
          }
        },
        error: () => {
          // keep placeholder image on error
        },
        complete: () => { this.loadingImageIndex = null; }
      });
  }

  private fetchSeed(prompt: string) {
    const url = `${this.auth.baseUrl}/ai/generate-seed`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    return this.http.post<{ text?: string; image_prompt?: string; story_id?: number; chapter_id?: number }>(url, { prompt }, { headers });
  }

  private fetchChapter(prompt: string, mode: 'continue' | 'final' = 'continue') {
    const url = `${this.auth.baseUrl}/ai/generate-chapter`;
    const history = this.chapters.map(c => c.text).filter(Boolean);
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    return this.http.post<{ text?: string; image_prompt?: string; choices?: string[]; story_id?: number; chapter_id?: number }>(url, { prompt, history, mode, story_id: (this as any)._storyId }, { headers });
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Keyboard navigation
  @HostListener('window:keydown', ['$event'])
  handleKey(e: KeyboardEvent) {
    if (this.phase !== 'chapter') return;
    if (e.key === 'ArrowLeft') this.onBack();
    if (e.key === 'ArrowRight') this.onNext();
  }
}

