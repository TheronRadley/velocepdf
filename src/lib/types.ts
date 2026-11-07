export type ViewMode = 'continuous' | 'single' | 'two-page' | 'two-page-cover';
export type SidebarTab = 'thumbnails' | 'outline' | 'search' | 'attachments' | 'annots';

export interface PdfOutlineItem {
  title: string;
  dest: unknown;
  url?: string | null;
  items: PdfOutlineItem[];
  pageNumber?: number;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
  pageCount: number;
  pageSize?: { width: number; height: number };
  encrypted?: boolean;
  linearized?: boolean;
  version?: string;
  fileSize?: number;
}

export interface SearchResult {
  page: number;
  index: number;
  snippet: string;
  matchIdx: number;
  totalInPage?: number;
}

export type AnnotationKind = 'highlight' | 'underline' | 'strikeout' | 'note' | 'ink';

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  page: number;
  color: string;
  opacity: number;
  rect: { x: number; y: number; w: number; h: number } | null; // normalized 0-1 relative to page
  points?: { x: number; y: number }[]; // for ink normalized
  content?: string;
  author?: string;
  createdAt: string;
  quads?: { x: number; y: number; w: number; h: number }[];
}

export interface TabState {
  id: string;
  fileName: string;
  fileSize?: number;
  fileHandle?: File | null;
  arrayBuffer?: ArrayBuffer | null;
  pdfDoc: unknown | null; // pdfjs PDFDocumentProxy
  pageCount: number;
  currentPage: number;
  zoom: number; // scale factor
  zoomMode: 'custom' | 'fit-width' | 'fit-page' | 'fit-actual';
  rotation: 0 | 90 | 180 | 270;
  viewMode: ViewMode;
  outline: PdfOutlineItem[] | null;
  metadata: PdfMetadata | null;
  searchQuery: string;
  searchResults: SearchResult[];
  searchIndex: number;
  annotations: Annotation[];
  undoStack: Annotation[][];
  redoStack: Annotation[][];
  isModified: boolean;
  lastSavedHash?: string;
  passwordRequired?: boolean;
  error?: string | null;
}

export interface RecentEntry {
  name: string;
  lastOpened: string;
  page: number;
  fileSize?: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  sidebarTab: SidebarTab;
  defaultZoomMode: TabState['zoomMode'];
  defaultViewMode: ViewMode;
  showThumbnails: boolean;
  rememberHistory: boolean;
  spellcheck?: boolean;
}
