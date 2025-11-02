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
import { CharacterPickerModalComponent } from '../shared/character-picker-modal.component';
import { CreditHintComponent } from '../shared/credit-hint.component';

@Component({
  standalone: true,
  selector: 'app-story',
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, NavComponent, HeaderComponent, AddCreditsModalComponent, EbookViewerComponent, CharacterPickerModalComponent, CreditHintComponent],
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
  shouldNavigateAfterCredits = false;
  shouldRestoreTopicAfterCredits = false;
  pendingChapterTopic: string = '';
  // Credits purchase feedback
  creditsPurchased = false;
  purchasedCredits = 0;
  totalCredits = 0;
  // Restore edit prompt after credits (edit chapter flow)
  shouldRestoreEditAfterCredits = false;
  pendingEditPrompt: string = '';
  pendingEditChapterIndex: number | null = null;
  // Restore regenerate image modal after credits (chapter image regenerate)
  shouldRestoreRegenImageAfterCredits = false;
  pendingRegenImagePrompt: string = '';
  pendingRegenImageChapterIndex: number | null = null;
  // Optional selected character IDs passed from dashboard
  initialCharacterIds: number[] = [];
  initialCharacters: Array<{ id: number; name?: string | null }> = [];
  initialCharacterImages: string[] = [];
  
  // Per-chapter character selection
  pickerOpen = false;
  chapterCharacterIds: number[] = [];
  chapterCharacterImages: string[] = [];
  chapterCharacters: Array<{ id:number; image:string; name?: string | null }> = [];
  
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
  // Small cost modal state
  showCostModal = false;
  costText = '';
  costTop = 0;
  costLeft = 0;
  creditChapterCost = 2;
  openCost(msg: string, ev?: MouseEvent) {
    this.costText = msg;
    try {
      const target = (ev?.currentTarget || ev?.target) as HTMLElement | undefined;
      if (target) {
        const rect = target.getBoundingClientRect();
        this.costTop = Math.min(window.innerHeight - 40, rect.bottom + 8);
        this.costLeft = Math.min(window.innerWidth - 220, Math.max(8, rect.left));
      } else {
        this.costTop = 80; this.costLeft = 80;
      }
    } catch { this.costTop = 80; this.costLeft = 80; }
    this.showCostModal = true;
  }
  closeCostModal() { this.showCostModal = false; this.costText = ''; }

  // Toggle open/close when icon is clicked again
  toggleCredit(msg: string, ev: MouseEvent) {
    const target = (ev?.currentTarget || ev?.target) as HTMLElement | undefined;
    let samePos = false;
    try {
      if (target) {
        const rect = target.getBoundingClientRect();
        const top = Math.min(window.innerHeight - 40, rect.bottom + 8);
        const left = Math.min(window.innerWidth - 220, Math.max(8, rect.left));
        samePos = Math.abs(top - this.costTop) < 2 && Math.abs(left - this.costLeft) < 2;
        this.costTop = top; this.costLeft = left;
      }
    } catch {}
    if (this.showCostModal && samePos && this.costText === msg) {
      this.closeCostModal();
    } else {
      this.openCost(msg, ev);
    }
  }

  onAnyModalClick(event: MouseEvent) {
    event.stopPropagation();
    if (this.showCostModal) this.closeCostModal();
  }
  

  seedForm = this.fb.group({ 
    seed: ['', Validators.required],
    language: ['']
  });
  userContinuation = this.fb.control<string>('');
  selectedChoice: string | null = null;

  ngOnInit(): void {
    // Fetch credit costs for tooltips
    try {
      const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
      this.http.get<{ chapter:number; audio:number; image?: number }>(`${this.auth.baseUrl}/billing/credit-costs`, { headers })
        .subscribe({ next: (res) => { this.creditChapterCost = Number(res?.chapter) || 2; }, error: () => {} });
    } catch {}
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
      // Initialize per-chapter selection from initial
      this.chapterCharacterIds = [...this.initialCharacterIds];
      this.chapterCharacterImages = [...this.initialCharacterImages];
      // Initialize chips for new story flow as well
      this.populateChapterCharacterChips();
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
    this.http.get<{ id:number; title:string; status:'in_progress'|'finished'; language?: string; character_ids?: number[]; character_images?: string[] }>(`${base}/stories/${id}`, { headers })
      .subscribe({ next: (meta) => { 
        this.storyStatus = meta?.status || 'in_progress'; 
        this.historyTitle = meta?.title || this.historyTitle; 
        // Seed per-chapter selection from story-level selection
        if (Array.isArray(meta?.character_ids)) {
          this.chapterCharacterIds = (meta!.character_ids as any[]).map(x => Number(x)).filter(n => Number.isFinite(n));
        } else {
          this.chapterCharacterIds = [];
        }
        if (Array.isArray(meta?.character_images)) {
          this.chapterCharacterImages = (meta!.character_images as any[]).filter((s: any) => typeof s === 'string');
        } else {
          this.chapterCharacterImages = [];
        }
        // Populate chips
        this.populateChapterCharacterChips();
      } });
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

  private populateChapterCharacterChips() {
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    // Reset current chips
    this.chapterCharacters = [];
    // If we have IDs, try to map via /characters
    if (this.chapterCharacterIds && this.chapterCharacterIds.length) {
      this.http.get<{ items?: { id:number; image:string; name?: string | null }[]; images?: string[] }>(`${this.auth.baseUrl}/characters`, { headers })
        .subscribe({
          next: (res) => {
            const items = Array.isArray(res?.items) ? res!.items! : [];
            const byId = new Map<number, { image:string; name?:string|null }>();
            for (const it of items) {
              if (it && Number.isFinite(it.id) && typeof it.image === 'string') {
                byId.set(Number(it.id), { image: it.image, name: (it.name ?? null) || null });
              }
            }
            const chips: Array<{ id:number; image:string; name?: string | null }> = [];
            for (const id of this.chapterCharacterIds) {
              if (byId.has(id)) {
                const info = byId.get(id)!;
                chips.push({ id, image: info.image, name: info.name ?? null });
              }
            }
            // Fallback: add images that are not already represented (normalize URL to ignore SAS)
            const represented = new Set(chips.map(c => this.normalizeImageUrl(c.image)));
            for (const img of (this.chapterCharacterImages || [])) {
              if (typeof img !== 'string') continue;
              const norm = this.normalizeImageUrl(img);
              if (!represented.has(norm)) {
                represented.add(norm);
                chips.push({ id: 0, image: img, name: null });
              }
            }
            this.chapterCharacters = chips;
            this.syncImagesFromChips();
          },
          error: () => {
            // Fallback to images only
            this.chapterCharacters = (this.chapterCharacterImages || []).filter((s:any) => typeof s === 'string').map(img => ({ id: 0, image: img, name: null }));
            this.syncImagesFromChips();
          }
        });
    } else if (this.chapterCharacterImages && this.chapterCharacterImages.length) {
      // Only images available
      this.chapterCharacters = this.chapterCharacterImages.filter((s:any) => typeof s === 'string').map(img => ({ id: 0, image: img, name: null }));
      this.syncImagesFromChips();
    }
  }

  private syncImagesFromChips() {
    // Deduplicate by normalized URL (drop query params)
    const seen = new Set<string>();
    const imgs: string[] = [];
    for (const c of (this.chapterCharacters || [])) {
      if (!c || typeof c.image !== 'string') continue;
      const norm = this.normalizeImageUrl(c.image);
      if (!seen.has(norm)) {
        seen.add(norm);
        imgs.push(c.image);
      }
    }
    this.chapterCharacterImages = imgs as string[];
  }

  private normalizeImageUrl(url: string | null | undefined): string {
    if (!url || typeof url !== 'string') return '';
    const q = url.indexOf('?');
    return q >= 0 ? url.slice(0, q) : url;
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
        // Force thumbnail generation for seed
        this.fetchChapterImageWithCharactersPersist(promptForImage, 0, undefined, 1, this.initialCharacterImages, this.initialCharacterIds, false, (imageUrls) => {
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
          // Defer navigation until credits modal is closed
          this.shouldNavigateAfterCredits = true;
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
    // Save topic to restore if credits are insufficient, then reset inputs when generation starts
    this.pendingChapterTopic = t;
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
        // For next chapters, never request thumbnail/cover (omit chapter_id)
        this.fetchChapterImageWithCharactersPersist(promptForImage, this.currentIndex, this.storyId, undefined, this.chapterCharacterImages, this.chapterCharacterIds, false, (imgRes) => {
          const body = {
            story_id: this.storyId,
            text: this.chapters[this.currentIndex]?.text || res?.text || '',
            title_chapter: this.chapters[this.currentIndex]?.title || res?.title_chapter || '',
            prompt: t,
            is_final: false,
            image_url: imgRes?.imageUrl,
            thumbnail_url: imgRes?.thumbnailUrl,
            character_ids: this.chapterCharacterIds,
            character_images: this.chapterCharacterImages
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
          // After closing the modal, restore the topic to the input
          this.shouldRestoreTopicAfterCredits = true;
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
    // Save topic to restore if credits are insufficient
    this.pendingChapterTopic = t;
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
        this.fetchChapterImageWithCharactersPersist(promptForImage, this.currentIndex, undefined, undefined, this.chapterCharacterImages, this.chapterCharacterIds, false, (imgRes) => {
          const body = {
            story_id: this.storyId,
            text: this.chapters[this.currentIndex]?.text || res?.text || '',
            title_chapter: this.chapters[this.currentIndex]?.title || res?.title_chapter || '',
            prompt: idea,
            is_final: true,
            image_url: imgRes?.imageUrl,
            thumbnail_url: imgRes?.thumbnailUrl,
            character_ids: this.chapterCharacterIds,
            character_images: this.chapterCharacterImages
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
          // After closing the modal, restore the topic to the input
          this.shouldRestoreTopicAfterCredits = true;
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
      next: (res) => {
        this.error = ''; document.body.style.overflow = '';
        // Show success message in modal; do not auto-close
        this.purchasedCredits = Number((res as any)?.added) || 0;
        this.totalCredits = Number((res as any)?.credits) || Number(this.auth.user$.value?.credits) || 0;
        this.creditsPurchased = true;
      },
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
    // Save prompt/index in case we need to restore after credits, then close modal
    this.pendingRegenImagePrompt = prompt;
    this.pendingRegenImageChapterIndex = idx;
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
      .subscribe({ 
        next: (res) => {
          if (res?.imageUrl) {
            const chs = [...this.chapters];
            if (chs[idx]) { chs[idx] = { ...chs[idx], imageUrl: res.imageUrl }; this.chapters = chs; }
          }
        },
        error: (err) => {
          this.loadingImageIndex = null;
          if (err && err.status === 402) {
            this.error = "You're out of credits. Please upgrade your plan to continue.";
            this.showAddCredits = true;
            // After closing modal, return to regenerate image modal with previous prompt
            this.shouldRestoreRegenImageAfterCredits = true;
          }
        },
        complete: () => { this.loadingImageIndex = null; }
      });
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
    // Save edit prompt to restore if credits are insufficient
    this.pendingEditPrompt = newPrompt;
    this.pendingEditChapterIndex = chapterIndex;
    
    console.log('Edit chapter - chapter.id:', chapter.id, 'newPrompt:', newPrompt);
    
    // Validate chapter ID
    const chapterId = Number(chapter.id);
    if (isNaN(chapterId)) {
      console.error('Invalid chapter ID:', chapter.id);
      this.error = "Invalid chapter ID. Please try again.";
      return;
    }
    
    // Close modal immediately on regenerate
    this.closeEditModal();
    
    // Set loading states like when generating a new chapter
    this.loadingTextIndex = chapterIndex;
    this.loadingImageIndex = chapterIndex;
    
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    const base = this.auth.baseUrl;
    
    // Request edit in deferred mode (no persistence yet)
    this.http.post<{ text?: string; title_chapter?: string; image_prompt?: string; chapter_id?: number; audio_url?: string }>(`${base}/ai/edit-chapter`, 
      { chapter_id: chapterId, prompt: newPrompt, persist: false }, 
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
          
          // Regenerate image for the edited chapter (deferred)
          const promptForImage = res?.image_prompt || newPrompt;
          this.fetchChapterImageWithCharactersPersist(promptForImage, chapterIndex, this.storyId, res?.chapter_id, this.chapterCharacterImages, this.chapterCharacterIds, false, (imgRes) => {
            // Commit edited chapter via dedicated endpoint
            const url = `${this.auth.baseUrl}/ai/commit-edited-chapter`;
            const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
            const body = {
              chapter_id: res?.chapter_id || Number(this.chapters[chapterIndex]?.id),
              text: this.chapters[chapterIndex]?.text || res?.text || '',
              title_chapter: this.chapters[chapterIndex]?.title || res?.title_chapter || '',
              prompt: newPrompt,
              is_final: !!this.chapters[chapterIndex]?.isFinal,
              image_url: imgRes?.imageUrl,
              thumbnail_url: undefined,
              character_ids: this.chapterCharacterIds,
              character_images: this.chapterCharacterImages
            };
            this.http.post<{ chapter_id?: number }>(url, body, { headers }).subscribe({
              next: () => {},
              error: () => {},
              complete: () => { this.loadingImageIndex = null; }
            });
          });
        },
        error: (err) => {
          this.loadingTextIndex = null;
          this.loadingImageIndex = null;
          if (err && err.status === 402) {
            this.error = "You're out of credits. Please upgrade your plan to continue.";
            this.showAddCredits = true;
            // After closing the modal, restore the edit modal and prompt
            this.shouldRestoreEditAfterCredits = true;
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
    console.log('fetchChapterImageWithCharactersPersist', prompt, index, storyId, chapterId, images, character_ids, persist);
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

  // Character picker handlers
  openCharacterPicker() {
    if (this.chapterCharacterIds.length >= 3) return;
    this.pickerOpen = true;
  }
  onPickerClose() {
    this.pickerOpen = false;
  }
  onPicked(item: { id:number; image:string; name?: string | null }) {
    // Ensure unique by id
    if (!this.chapterCharacterIds.includes(item.id)) {
      this.chapterCharacterIds = [...this.chapterCharacterIds, item.id];
      this.chapterCharacters = [...this.chapterCharacters, { id: item.id, image: item.image, name: item.name ?? null }];
    }
    // Track image references for generation
    if (item.image && !this.chapterCharacterImages.includes(item.image)) {
      this.chapterCharacterImages = [...this.chapterCharacterImages, item.image];
    }
    // Keep images in sync with chips
    this.syncImagesFromChips();
    // Close picker after selection
    this.pickerOpen = false;
  }
  removeCharacter(id: number) {
    this.chapterCharacterIds = this.chapterCharacterIds.filter(x => x !== id);
    this.chapterCharacters = this.chapterCharacters.filter(c => c.id !== id);
    // Rebuild image list from remaining chips
    this.syncImagesFromChips();
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
            // Defer navigation until credits modal is closed
            this.shouldNavigateAfterCredits = true;
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

  onCreditsClosed() {
    this.showAddCredits = false;
    // Reset success state
    this.creditsPurchased = false; this.purchasedCredits = 0; this.totalCredits = 0;
    if (this.shouldNavigateAfterCredits) {
      this.shouldNavigateAfterCredits = false;
      this.router.navigate(['/dashboard'], { state: this.getDashboardPrefillState() });
    } else if (this.shouldRestoreTopicAfterCredits) {
      this.shouldRestoreTopicAfterCredits = false;
      const toRestore = (this.pendingChapterTopic || '').trim();
      if (toRestore) this.userContinuation.setValue(toRestore);
      this.pendingChapterTopic = '';
    } else if (this.shouldRestoreEditAfterCredits) {
      this.shouldRestoreEditAfterCredits = false;
      const idx = this.pendingEditChapterIndex;
      const prompt = this.pendingEditPrompt;
      this.pendingEditChapterIndex = null; this.pendingEditPrompt = '';
      if (idx !== null) {
        this.openEditModal(idx);
        if ((prompt || '').trim()) this.editPrompt.setValue(prompt);
      }
    } else if (this.shouldRestoreRegenImageAfterCredits) {
      this.shouldRestoreRegenImageAfterCredits = false;
      const idx = this.pendingRegenImageChapterIndex;
      const prompt = this.pendingRegenImagePrompt;
      this.pendingRegenImageChapterIndex = null; this.pendingRegenImagePrompt = '';
      if (idx !== null) {
        this.openRegenImageModal(idx);
        if ((prompt || '').trim()) this.imageEditPrompt.setValue(prompt);
      }
    }
  }

  private getDashboardPrefillState() {
    const seed = (this.seedForm.value.seed ?? '').trim();
    const language = (this.seedForm.value.language || '') as string;
    const character_ids = (this.initialCharacterIds || []).filter((n) => Number.isFinite(n));
    const character_images = (this.initialCharacterImages || []).filter((s) => typeof s === 'string');
    const characters = (this.initialCharacters || []).filter(Boolean);
    return { seed, language, character_ids, character_images, characters };
  }
}


