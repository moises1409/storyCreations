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
  chapters: Array<{ id: string; title: string; text: string; imageUrl?: string; audioUrl?: string; choices?: string[]; collapsed?: boolean; userPrompt?: string; isFinal?: boolean }> = [];
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
  initialCharacters: Array<{ id: number; name?: string | null }> = [];
  initialCharacterImages: string[] = [];
  
  // Edit chapter functionality
  showEditModal = false;
  editingChapterIndex: number | null = null;
  editPrompt = this.fb.control<string>('');
  loadingEdit = false;
  
  // Regenerate image functionality
  showRegenImageModal = false;
  regenImageIndex: number | null = null;
  imageEditPrompt = this.fb.control<string>('');
  loadingImageEdit = false;
  
  // eBook properties
  showEbook = false;
  

  seedForm = this.fb.group({ 
    seed: ['', Validators.required],
    language: ['']
  });
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
      const languageFromQuery = this.route.snapshot.queryParamMap.get('language') || '';
      // Capture optional character IDs from navigation state once
      const state: any = (history && history.state) || {};
      this.initialCharacterIds = Array.isArray(state.character_ids) ? (state.character_ids as any[]).map(x => Number(x)).filter(n => Number.isFinite(n)) : [];
      this.initialCharacters = Array.isArray(state.characters) ? (state.characters as any[]).map((c: any) => ({ id: Number(c?.id), name: (typeof c?.name === 'string' ? c.name : null) })) : [];
      this.initialCharacterImages = Array.isArray(state.character_images) ? (state.character_images as any[]).filter((s: any) => typeof s === 'string') : [];
      console.log('OnInit -- initialCharacterIds', this.initialCharacterIds);
      if (seedFromQuery) {
        this.seedForm.setValue({ seed: seedFromQuery, language: languageFromQuery });
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
    this.http.get<{ id:number; title:string; status:'in_progress'|'finished'; language?: string }>(`${base}/stories/${id}`, { headers })
      .subscribe({ next: (meta) => { this.storyStatus = meta?.status || 'in_progress'; this.historyTitle = meta?.title || this.historyTitle; } });
    // Then load chapters
    this.http.get<Array<{ id: number; index: number; title: string; text: string; image_url?: string; audio_url?: string; user_prompt?: string; is_final?: boolean }>>(`${base}/stories/${id}/chapters`, { headers })
      .subscribe({
        next: (chapters) => {
          this.phase = 'chapter';
          this.chapters = chapters.map(ch => ({ id: String(ch.id), title: ch.title, text: ch.text, imageUrl: ch.image_url || undefined, audioUrl: ch.audio_url || undefined, userPrompt: ch.user_prompt || undefined, isFinal: ch.is_final || false, choices: [], collapsed: true }));
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
    const language = this.seedForm.value.language || '';
    // The title will be set from the LLM response in fetchSeed
    this.historyTitle = 'New story';
    // Create the first chapter card immediately for responsive UX
    this.phase = 'chapter';
    const first = this.buildChapter(1, seed); first.text = ''; first.collapsed = false;
    this.chapters = [first]; this.currentIndex = 0;
    this.loadingTextIndex = 0; this.loadingImageIndex = 0;
    this.selectedChoice = null; this.userContinuation.setValue('');

    this.fetchSeed(seed, this.initialCharacterIds, language, this.initialCharacters, this.initialCharacterImages, false).subscribe({
      next: (res) => {
        const ch = [...this.chapters];
        if (ch[0]) { 
          ch[0] = { 
            ...ch[0], 
            text: res?.text || ch[0].text, 
            title: res?.title_chapter || ch[0].title, // Use LLM chapter title
            audioUrl: res?.audio_url || ch[0].audioUrl, 
            userPrompt: seed, // Set the user prompt
            choices: (res as any)?.choices || [] 
          }; 
          this.chapters = ch; 
        }
        // Update story title from LLM response
        if (res?.title_story) {
          this.historyTitle = res.title_story;
        }
        (this as any)._storyId = (res as any)?.story_id; this.storyId = (res as any)?.story_id;
        (this as any)._chapterId = (res as any)?.chapter_id;
        this.loadingTextIndex = null;
        
        // Update the chapter with the real ID from the database
        if ((res as any)?.chapter_id) {
          const updatedChapters = [...this.chapters];
          if (updatedChapters[0]) {
            updatedChapters[0] = { ...updatedChapters[0], id: String((res as any).chapter_id) };
            this.chapters = updatedChapters;
          }
        }
        
        const promptForImage = res?.image_prompt || seed;
        // Generate image without persistence; we'll commit both later
        this.fetchChapterImageWithCharactersPersist(promptForImage, 0, undefined, undefined, this.initialCharacterImages, this.initialCharacterIds, false, (imageUrls) => {
          // After both text and image are ready, commit
          const commitBody = {
            text: ch[0]?.text || res?.text || '',
            title_story: res?.title_story || this.historyTitle,
            title_chapter: ch[0]?.title || res?.title_chapter || '',
            language,
            prompt: seed,
            image_url: imageUrls?.imageUrl,
            thumbnail_url: imageUrls?.thumbnailUrl,
            character_ids: this.initialCharacterIds,
            character_images: this.initialCharacterImages
          };
          this.commitSeed(commitBody);
        });
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
    // Generate text without persisting
    this.fetchChapterDeferred(t, 'continue').subscribe({
      next: (res) => {
        const chs = [...this.chapters]; const idx = this.currentIndex;
        if (chs[idx]) { 
          chs[idx] = { 
            ...chs[idx], 
            text: res?.text || chs[idx].text, 
            title: res?.title_chapter || chs[idx].title, // Use LLM chapter title
            audioUrl: (res as any)?.audio_url || chs[idx].audioUrl, 
            userPrompt: t, // Set the user prompt
            choices: (res as any)?.choices || [] 
          }; 
          this.chapters = chs; 
        }
        (this as any)._chapterId = (res as any)?.chapter_id || (this as any)._chapterId;
        this.loadingTextIndex = null;
        // Generate image without persisting, then commit chapter
        const promptForImage = res?.image_prompt || t;
        this.fetchChapterImageWithCharactersPersist(promptForImage, this.currentIndex, undefined, undefined, this.initialCharacterImages, this.initialCharacterIds, false, (imgRes) => {
          const body = {
            story_id: this.storyId,
            text: this.chapters[this.currentIndex]?.text || res?.text || '',
            title_chapter: this.chapters[this.currentIndex]?.title || res?.title_chapter || '',
            prompt: t,
            is_final: false,
            image_url: imgRes?.imageUrl,
            thumbnail_url: imgRes?.thumbnailUrl
          };
          this.commitChapter(body, this.currentIndex);
        });
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
    // Generate text without persisting
    this.fetchChapterDeferred(idea, 'final').subscribe({
      next: (res) => {
        const chs = [...this.chapters]; const idx = this.currentIndex;
        if (chs[idx]) { 
          chs[idx] = { 
            ...chs[idx], 
            text: res?.text || chs[idx].text, 
            title: res?.title_chapter || chs[idx].title, // Use LLM chapter title
            audioUrl: (res as any)?.audio_url || chs[idx].audioUrl, 
            userPrompt: idea, // Set the user prompt
            choices: [] 
          }; 
          this.chapters = chs; 
        }
        (this as any)._chapterId = (res as any)?.chapter_id || (this as any)._chapterId;
        this.loadingTextIndex = null;
        const promptForImage = res?.image_prompt || idea;
        // Generate image without persisting, then commit chapter (final)
        this.fetchChapterImageWithCharactersPersist(promptForImage, this.currentIndex, undefined, undefined, this.initialCharacterImages, this.initialCharacterIds, false, (imgRes) => {
          const body = {
            story_id: this.storyId,
            text: this.chapters[this.currentIndex]?.text || res?.text || '',
            title_chapter: this.chapters[this.currentIndex]?.title || res?.title_chapter || '',
            prompt: idea,
            is_final: true,
            image_url: imgRes?.imageUrl,
            thumbnail_url: imgRes?.thumbnailUrl
          };
          this.commitChapter(body, this.currentIndex);
        });
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
  
  // Edit chapter methods
  openEditModal(chapterIndex: number) {
    this.editingChapterIndex = chapterIndex;
    const chapter = this.chapters[chapterIndex];
    
    // Expand the chapter if it's collapsed
    if (chapter.collapsed) {
      chapter.collapsed = false;
    }
    
    this.editPrompt.setValue(chapter.userPrompt || '');
    this.showEditModal = true;
  }

  // Placeholder for regenerate image action
  regenerateImage(chapterIndex: number) {
    this.openRegenImageModal(chapterIndex);
  }

  openRegenImageModal(chapterIndex: number) {
    this.regenImageIndex = chapterIndex;
    const chapter = this.chapters[chapterIndex];
    if (chapter && chapter.collapsed) {
      chapter.collapsed = false;
    }
    // Pre-fill prompt with empty or a hint could be added here if desired
    this.imageEditPrompt.setValue('');
    this.showRegenImageModal = true;
  }

  closeRegenImageModal() {
    this.showRegenImageModal = false;
    this.regenImageIndex = null;
    this.imageEditPrompt.setValue('');
    this.loadingImageEdit = false;
  }

  submitRegenImage() {
    if (this.regenImageIndex === null) return;
    const idx = this.regenImageIndex;
    const prompt = (this.imageEditPrompt.value || '').trim();
    if (!prompt) return;
    const chapter = this.chapters[idx];
    // Close modal
    this.closeRegenImageModal();
    // Start loading spinner for image
    this.loadingImageIndex = idx;
    // Use existing chapter image as context; fallback to character images if none
    const images: string[] = [];
    if (chapter?.imageUrl && typeof chapter.imageUrl === 'string') {
      images.push(chapter.imageUrl);
    } else if (this.initialCharacterImages && this.initialCharacterImages.length) {
      images.push(...this.initialCharacterImages);
    }
    // Prefer passing chapter/story ids if available
    const chapterIdNum = Number(chapter?.id);
    const chapterId = Number.isFinite(chapterIdNum) ? chapterIdNum : undefined;
    // Call backend with regenerate mode to enforce credit deduction
    const url = `${this.auth.baseUrl}/ai/generate-image`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.post<{ imageUrl?: string }>(url, { prompt, story_id: this.storyId, chapter_id: chapterId, images, character_ids: this.initialCharacterIds, mode: 'regenerate' }, { headers })
      .subscribe({ next: (res) => {
        if (res?.imageUrl) {
          const chs = [...this.chapters];
          if (chs[idx]) { chs[idx] = { ...chs[idx], imageUrl: res.imageUrl }; this.chapters = chs; }
        }
      }, complete: () => { this.loadingImageIndex = null; } });
  }
  
  closeEditModal() {
    this.showEditModal = false;
    this.editingChapterIndex = null;
    this.editPrompt.setValue('');
    this.loadingEdit = false;
  }
  
  saveEditedChapter() {
    if (this.editingChapterIndex === null || !this.editPrompt.value?.trim()) return;
    
    const chapter = this.chapters[this.editingChapterIndex];
    const newPrompt = this.editPrompt.value.trim();
    const chapterIndex = this.editingChapterIndex; // Store the index before closing modal
    
    console.log('Edit chapter - chapter.id:', chapter.id, 'newPrompt:', newPrompt);
    
    // Validate chapter ID
    const chapterId = Number(chapter.id);
    if (isNaN(chapterId)) {
      console.error('Invalid chapter ID:', chapter.id);
      this.error = "Invalid chapter ID. Please try again.";
      return;
    }
    
    // Close modal immediately
    this.closeEditModal();
    
    // Set loading states like when generating a new chapter
    this.loadingTextIndex = chapterIndex;
    this.loadingImageIndex = chapterIndex;
    
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    const base = this.auth.baseUrl;
    
    this.http.post<{ text?: string; title_chapter?: string; image_prompt?: string; chapter_id?: number; audio_url?: string }>(`${base}/ai/edit-chapter`, 
      { chapter_id: chapterId, prompt: newPrompt }, 
      { headers })
      .subscribe({
        next: (res) => {
          // Update the chapter with new content
          const updatedChapters = [...this.chapters];
          if (updatedChapters[chapterIndex]) {
            updatedChapters[chapterIndex] = {
              ...updatedChapters[chapterIndex],
              text: res?.text || updatedChapters[chapterIndex].text,
              title: res?.title_chapter || updatedChapters[chapterIndex].title,
              audioUrl: res?.audio_url || updatedChapters[chapterIndex].audioUrl,
              userPrompt: newPrompt,
              choices: (res as any)?.choices || [], // Add choices for continuation
              imageUrl: undefined // Reset image to be regenerated
            };
            this.chapters = updatedChapters;
          }
          
          // Clear text loading
          this.loadingTextIndex = null;
          
          // If this is not the final chapter and has choices, show continuation options
          if (!updatedChapters[chapterIndex].isFinal && (res as any)?.choices && (res as any).choices.length > 0) {
            // Make this chapter the current one to show continuation options
            this.currentIndex = chapterIndex;
          }
          
          // Regenerate image for the edited chapter
          const promptForImage = res?.image_prompt || newPrompt;
          this.fetchChapterImage(promptForImage, chapterIndex, this.storyId, res?.chapter_id);
        },
        error: (err) => {
          this.loadingTextIndex = null;
          this.loadingImageIndex = null;
          if (err && err.status === 402) {
            this.error = "You're out of credits. Please upgrade your plan to continue.";
            this.showAddCredits = true;
          } else {
            this.error = "Failed to edit chapter. Please try again.";
          }
        }
      });
  }
  
  

  private buildChapter(num: number, idea: string) {
    return { id: Math.random().toString(36).slice(2), title: '', text: '', imageUrl: undefined, choices: [], collapsed: false };
  }

  private fetchChapterImage(prompt: string, index: number, storyId?: number, chapterId?: number) {
    if (!this.useApiImages) { const ch = [...this.chapters]; if (ch[index]) { ch[index] = { ...ch[index], imageUrl: '/assets/test.jpeg' }; this.chapters = ch; } this.loadingImageIndex = null; return; }
    const url = `${this.auth.baseUrl}/ai/generate-image`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.post<{ imageUrl?: string }>(url, { prompt, story_id: storyId, chapter_id: chapterId }, { headers })
      .subscribe({ next: (res) => { if (res?.imageUrl) { const chs = [...this.chapters]; if (chs[index]) { chs[index] = { ...chs[index], imageUrl: res.imageUrl }; this.chapters = chs; } } }, complete: () => { this.loadingImageIndex = null; } });
  }

  private fetchChapterImageWithCharacters(prompt: string, index: number, storyId?: number, chapterId?: number, images: string[] = [], character_ids: number[] = []) {
    if (!this.useApiImages) { const ch = [...this.chapters]; if (ch[index]) { ch[index] = { ...ch[index], imageUrl: '/assets/test.jpeg' }; this.chapters = ch; } this.loadingImageIndex = null; return; }
    const url = `${this.auth.baseUrl}/ai/generate-image`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.post<{ imageUrl?: string }>(url, { prompt, story_id: storyId, chapter_id: chapterId, images, character_ids }, { headers })
      .subscribe({ next: (res) => { if (res?.imageUrl) { const chs = [...this.chapters]; if (chs[index]) { chs[index] = { ...chs[index], imageUrl: res.imageUrl }; this.chapters = chs; } } }, complete: () => { this.loadingImageIndex = null; } });
  }

  private fetchChapterImageWithCharactersPersist(prompt: string, index: number, storyId?: number, chapterId?: number, images: string[] = [], character_ids: number[] = [], persist: boolean = true, onDone?: (res?: { imageUrl?: string; thumbnailUrl?: string }) => void) {
    if (!this.useApiImages) { const ch = [...this.chapters]; if (ch[index]) { ch[index] = { ...ch[index], imageUrl: '/assets/test.jpeg' }; this.chapters = ch; } this.loadingImageIndex = null; onDone?.({ imageUrl: '/assets/test.jpeg' }); return; }
    const url = `${this.auth.baseUrl}/ai/generate-image`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.post<{ imageUrl?: string; thumbnailUrl?: string }>(url, { prompt, story_id: storyId, chapter_id: chapterId, images, character_ids, persist }, { headers })
      .subscribe({ next: (res) => { if (res?.imageUrl) { const chs = [...this.chapters]; if (chs[index]) { chs[index] = { ...chs[index], imageUrl: res.imageUrl }; this.chapters = chs; } } onDone?.(res); }, complete: () => { this.loadingImageIndex = null; } });
  }

  private fetchSeed(prompt: string, character_ids: number[] = [], language: string = '', characters: Array<{ id: number; name?: string | null }> = [], character_images: string[] = [], persist: boolean = true) {
    const url = `${this.auth.baseUrl}/ai/generate-seed`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    return this.http.post<{ text?: string; title_story?: string; title_chapter?: string; image_prompt?: string; story_id?: number; chapter_id?: number; audio_url?: string }>(url, { prompt, character_ids, language, characters, character_images, persist }, { headers });
  }

  private commitSeed(body: { text: string; title_story: string; title_chapter: string; language?: string; prompt: string; image_url?: string; thumbnail_url?: string; character_ids?: number[]; character_images?: string[] }) {
    const url = `${this.auth.baseUrl}/ai/commit-seed`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.post<{ story_id?: number; chapter_id?: number; audio_url?: string }>(url, body, { headers })
      .subscribe({
        next: (res) => {
          (this as any)._storyId = res?.story_id; this.storyId = res?.story_id;
          (this as any)._chapterId = res?.chapter_id;
          // Update the chapter with real IDs
          const updated = [...this.chapters];
          if (updated[0] && res?.chapter_id) { updated[0] = { ...updated[0], id: String(res.chapter_id) }; this.chapters = updated; }
        },
        error: (err) => {
          if (err && err.status === 402) {
            this.error = "You're out of credits. Please upgrade your plan to continue.";
            this.showAddCredits = true;
          }
        }
      });
  }

  private fetchChapter(prompt: string, mode: 'continue' | 'final' = 'continue') {
    const url = `${this.auth.baseUrl}/ai/generate-chapter`;
    const history = this.chapters.map(c => c.text).filter(Boolean);
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    return this.http.post<{ text?: string; title_chapter?: string; image_prompt?: string; choices?: string[]; story_id?: number; chapter_id?: number; audio_url?: string }>(url, { prompt, history, mode, story_id: this.storyId }, { headers });
  }

  private fetchChapterDeferred(prompt: string, mode: 'continue' | 'final' = 'continue') {
    const url = `${this.auth.baseUrl}/ai/generate-chapter`;
    const history = this.chapters.map(c => c.text).filter(Boolean);
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    return this.http.post<{ text?: string; title_chapter?: string; image_prompt?: string; choices?: string[] }>(url, { prompt, history, mode, story_id: this.storyId, persist: false }, { headers });
  }

  private commitChapter(body: { story_id?: number; text: string; title_chapter: string; prompt: string; is_final?: boolean; image_url?: string; thumbnail_url?: string }, chapterIndex: number) {
    const url = `${this.auth.baseUrl}/ai/commit-chapter`;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.http.post<{ chapter_id?: number; audio_url?: string }>(url, body, { headers })
      .subscribe({
        next: (res) => {
          const updated = [...this.chapters];
          if (updated[chapterIndex] && res?.chapter_id) { updated[chapterIndex] = { ...updated[chapterIndex], id: String(res.chapter_id) }; this.chapters = updated; }
          // Image URL already set from the non-persist generation and persisted by commit; avoid regenerating to prevent mismatched images.
        },
        error: (err) => {
          this.loadingImageIndex = null;
          if (err && err.status === 402) {
            this.error = "You're out of credits. Please upgrade your plan to continue.";
            this.showAddCredits = true;
          }
        }
      });
  }

  @HostListener('window:keydown', ['$event'])
  handleKey(e: KeyboardEvent) {
    if (this.phase !== 'chapter') return;
    if (e.key === 'ArrowLeft') { if (this.currentIndex > 0) this.currentIndex--; }
    if (e.key === 'ArrowRight') { /* reserved */ }
  }
}


