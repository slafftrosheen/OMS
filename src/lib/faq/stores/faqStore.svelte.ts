// src/lib/faq/stores/faqStore.svelte.ts
import type { FAQItem, FAQListResponse } from '../types';

class FAQStore {
  items = $state<FAQItem[]>([]);
  categories = $state<import('../types').FAQCategory[]>([]);
  tags = $state<Array<{ slug: string; name: string }>>([]);
  loading = $state<boolean>(false);
  error = $state<string | null>(null);

  async load(params: URLSearchParams = new URLSearchParams()) {
    this.loading = true;
    this.error = null;
    try {
      const response = await fetch(`/api/faq?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load FAQs');
      const data: FAQListResponse = await response.json();
      this.items = data.items;
      this.categories = data.categories;
      this.tags = data.tags;
    } catch (err: any) {
      this.error = err.message;
      console.error('FAQ Load Error:', err);
    } finally {
      this.loading = false;
    }
  }

  async getBySlug(slug: string): Promise<FAQItem | null> {
    const existing = this.items.find(i => i.slug === slug);
    if (existing) return existing;

    try {
      const response = await fetch(`/api/faq/${slug}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.error('FAQ Detail Error:', err);
    }
    return null;
  }
}

export const faqStore = new FAQStore();
