// src/lib/faq/types.ts

export interface FAQItem {
  id: string;
  slug: string;
  question: string; // Default or English
  answer: string;   // Default or English
  translations?: {
    en?: { question: string; answer: string };
    lv?: { question: string; answer: string };
    ru?: { question: string; answer: string };
  };
  category: string;
  tags: string[];
  orderIndex: number;
  relatedFaqs?: Array<{
    id: string;
    slug: string;
    question: string;
  }>;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface FAQListResponse {
  items: FAQItem[];
  categories: string[];
  tags: string[];
  total: number;
}
